import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { FileStore, sha256 } from "../src/file-store.js";
import { Meetings } from "../src/meetings.js";
import { CaptureDelivery } from "../src/capture-delivery.js";
import {
  captureEventSchema,
  captureStartPayload,
  type CaptureEvent,
} from "../src/capture-contract.js";
import { wav } from "../src/audio.js";
import type { Scope } from "../src/domain.js";

const scope: Scope = {
  tenantId: "tenant",
  organizationId: "org",
  userId: "alice",
  assistantId: "assistant",
};
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "meeting-capture-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new FileStore(root),
    queued: string[] = [];
  let failQueue = false;
  const meetings = new Meetings(store, async (_scope, id) => {
    if (failQueue) throw new Error("queue unavailable");
    queued.push(id);
  });
  const delivery = new CaptureDelivery(meetings),
    captureId = randomUUID(),
    meetingId = randomUUID();
  const context = captureStartPayload(meetingId, "Synthetic meeting").delivery
    .context;
  const created: CaptureEvent = {
    version: 1,
    captureId,
    eventId: `${captureId}:created`,
    event: "created",
    context,
    createdAt: Date.now(),
    tracks: ["microphone", "system"],
  };
  const started: CaptureEvent = {
    version: 1,
    captureId,
    eventId: `${captureId}:started`,
    event: "started",
    context,
    startedAt: Date.now(),
  };
  const stopped: CaptureEvent = {
    version: 1,
    captureId,
    eventId: `${captureId}:stopped`,
    event: "stopped",
    context,
    durationMs: 5000,
    reason: "user",
    chunks: { microphone: 1, system: 1 },
    errorCode: null,
  };
  const bytes = wav(Buffer.alloc(240000));
  const chunk = (track: "microphone" | "system") => ({
    version: 1 as const,
    captureId,
    context,
    track,
    sequence: 0,
    startMs: 0,
    endMs: 5000,
    sha256: sha256(bytes),
  });
  return {
    root,
    store,
    meetings,
    delivery,
    captureId,
    meetingId,
    context,
    created,
    started,
    stopped,
    bytes,
    chunk,
    queued,
    setQueueFailure: (value: boolean) => {
      failQueue = value;
    },
  };
}

test("capture association and event acknowledgements survive restart and duplicate delivery", async (t) => {
  const f = await fixture(t);
  const results = await Promise.all([
    f.delivery.event(scope, f.created),
    f.delivery.event(scope, f.created),
  ]);
  assert.deepEqual(results.map((r) => r.reused).sort(), [false, true]);
  assert.equal((await f.meetings.list(scope)).total, 1);
  const restarted = new CaptureDelivery(
    new Meetings(new FileStore(f.root), f.meetings.enqueue)
  );
  assert.deepEqual(await restarted.lookup(scope, f.captureId), {
    captureId: f.captureId,
    meetingId: f.meetingId,
  });
  await restarted.event(scope, f.started);
  await restarted.chunk(scope, f.chunk("system"), f.bytes);
  await restarted.chunk(scope, f.chunk("microphone"), f.bytes);
  assert.equal(
    (await restarted.chunk(scope, f.chunk("system"), f.bytes)).reused,
    true
  );
  await restarted.event(scope, f.stopped);
  const count = f.queued.length;
  assert.equal((await restarted.event(scope, f.stopped)).reused, true);
  assert.equal(f.queued.length, count);
  assert.equal((await restarted.event(scope, f.started)).reused, true);
  assert.equal((await f.meetings.get(scope, f.meetingId)).capture, "stopped");
});

test("capture rejects remapping, conflicting event IDs, premature chunks and foreign scopes", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.delivery.chunk(scope, f.chunk("microphone"), f.bytes),
    /capture_not_found/
  );
  await f.delivery.event(scope, f.created);
  await assert.rejects(
    f.delivery.chunk(scope, f.chunk("microphone"), f.bytes),
    /capture_event_order/
  );
  await assert.rejects(
    f.delivery.event(scope, {
      ...f.created,
      context: { ...f.context, meetingId: randomUUID() },
    }),
    /capture_conflict/
  );
  assert.equal(
    captureEventSchema.safeParse({ ...f.created, eventId: "another-event" })
      .success,
    false
  );
  if (f.created.event === "created")
    await assert.rejects(
      f.delivery.event(scope, {
        ...f.created,
        createdAt: f.created.createdAt + 1,
      }),
      /capture_event_conflict/
    );
  for (const foreign of [
    { ...scope, userId: "bob" },
    { ...scope, organizationId: "another" },
    { ...scope, assistantId: "another" },
  ]) {
    await assert.rejects(
      f.delivery.lookup(foreign, f.captureId),
      /capture_not_found/
    );
    await assert.rejects(
      f.delivery.event(foreign, f.started),
      /capture_not_found/
    );
  }
});

test("failed final enqueue is retried without sealing a permanently unacknowledged event", async (t) => {
  const f = await fixture(t);
  await f.delivery.event(scope, f.created);
  await f.delivery.event(scope, f.started);
  for (const track of ["microphone", "system"] as const)
    await f.delivery.chunk(scope, f.chunk(track), f.bytes);
  f.setQueueFailure(true);
  await assert.rejects(f.delivery.event(scope, f.stopped), /queue unavailable/);
  const binding = JSON.parse(
    await readFile(
      join(f.store.captureDirectory(scope, f.captureId), "binding.json"),
      "utf8"
    )
  );
  assert.equal(binding.receipts.stopped, undefined);
  f.setQueueFailure(false);
  assert.equal((await f.delivery.event(scope, f.stopped)).reused, false);
  assert.equal((await f.delivery.event(scope, f.stopped)).reused, true);
});

test("startup failure with zero chunks settles without claiming a running recording", async (t) => {
  const f = await fixture(t);
  await f.delivery.event(scope, f.created);
  assert.equal(f.stopped.event, "stopped");
  await f.delivery.event(scope, {
    ...f.stopped,
    durationMs: 0,
    chunks: { microphone: 0, system: 0 },
    reason: "device_lost",
    errorCode: "audio_permission_denied",
  });
  const meeting = await f.meetings.get(scope, f.meetingId);
  assert.equal(meeting.capture, "interrupted");
  assert.equal(meeting.processing, "failed");
  await assert.rejects(
    f.delivery.event(scope, f.started),
    /capture_event_order/
  );
});

test("acknowledged retries cannot resurrect a deleted meeting or permit a new capture binding", async (t) => {
  const f = await fixture(t);
  await f.delivery.event(scope, f.created);
  await f.meetings.remove(scope, f.meetingId);
  assert.equal((await f.delivery.event(scope, f.created)).reused, true);
  await assert.rejects(
    f.delivery.lookup(scope, f.captureId),
    /meeting_not_found/
  );
  const captureId = randomUUID();
  await assert.rejects(
    f.delivery.event(scope, {
      ...f.created,
      captureId,
      eventId: `${captureId}:created`,
    }),
    /idempotency_conflict/
  );
  assert.equal((await f.meetings.list(scope)).total, 0);
});
