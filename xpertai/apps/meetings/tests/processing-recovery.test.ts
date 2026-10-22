import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  MANAGED_QUEUE_SERVICE_TOKEN, SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN,
  SYSTEM_GLOBAL_SCOPE, type ManagedQueueEnqueueInput,
  type ManagedQueueJob, type PluginContext,
} from "@xpert-ai/plugin-sdk";
import { MeetingsBackend, MeetingsProcessor } from "../src/backend.js";
import { configSchema } from "../src/config.js";
import { type MeetingDocuments } from "../src/documents.js";
import { PLUGIN, QUEUE, type Scope } from "../src/domain.js";
import { sha256 } from "../src/file-store.js";
import { saveSummary } from "../src/summary-store.js";
import { wav } from "../src/audio.js";
import { TestFileStore } from "./storage-fixture.js";

const scope: Scope = {
  tenantId: "tenant", organizationId: "org", userId: "alice", assistantId: "assistant",
};
const context = { ...scope, pluginName: PLUGIN, queueName: QUEUE, jobName: "process", scopeKey: SYSTEM_GLOBAL_SCOPE };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "meetings-recovery-"));
  const store = new TestFileStore(root);
  const scheduled = new Map<string, ManagedQueueEnqueueInput>();
  let unavailable = false;
  const config = configSchema.parse({});
  const backend = new MeetingsBackend({
    config,
    resolve: (token: unknown) => {
      if (token === MANAGED_QUEUE_SERVICE_TOKEN) return {
        enqueue: async (input: ManagedQueueEnqueueInput) => {
          if (unavailable) throw new Error("queue_unavailable");
          assert.ok(input.jobId);
          scheduled.set(input.jobId, input);
          return { jobId: input.jobId };
        },
      };
      if (token === SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN) return {
        transcribe: async () => ({ text: "Ship the draft." }),
      };
      throw new Error("unexpected_capability");
    },
  } as unknown as PluginContext<typeof config>, { store, sync: async () => {} } as MeetingDocuments);
  const id = randomUUID(), sessionId = randomUUID();
  await backend.meetings.create(scope, { id, sessionId, title: "Orphan recovery" });
  const processor = new MeetingsProcessor(backend);
  const delivery = (mode: "live" | "final", attemptsMade = 7): ManagedQueueJob => ({
    id: randomUUID(), name: "process", data: { scope, meetingId: id, mode },
    attemptsMade, opts: { attempts: 8 }, updateData: async () => {},
  });
  return { store, scheduled, backend, processor, id, sessionId, delivery,
    unavailable: () => { unavailable = true; },
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}

for (const mode of ["live", "final"] as const) {
  test(`${mode} delivery durably resumes an orphaned claim after its last attempt`, async (t) => {
    const f = await fixture();
    try {
      if (mode === "final") {
        const pcm = Buffer.alloc(240000);
        for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(6000 * Math.sin(i / 10)), i * 2);
        const audio = wav(pcm);
        for (const track of ["microphone", "system"] as const) {
          await f.backend.meetings.upload(scope, {
            meetingId: f.id, sessionId: f.sessionId, track, sequence: 0,
            startMs: 0, endMs: 5000, sha256: sha256(audio),
          }, audio);
        }
        await f.backend.meetings.finish(scope, {
          meetingId: f.id, sessionId: f.sessionId, durationMs: 5000,
          reason: "user", chunks: { microphone: 1, system: 1 },
        });
        t.mock.method(f.backend.assistant, "finish", async (actor, input) => {
          await saveSummary(f.store, actor, input.id, input, {
            overview: "Recovered summary", decisions: [], actions: [], questions: [],
          });
        });
      }
      f.scheduled.clear();
      const orphan = { id: randomUUID(), expiresAt: Date.now() + 900000 };
      await f.store.update(scope, f.id, m => { m.processingClaim = orphan; });
      await f.processor.handle(f.delivery(mode), context);
      await f.processor.handle(f.delivery(mode), context);
      assert.equal(f.scheduled.size, 1, "duplicate busy deliveries coalesce");
      const wakeup = [...f.scheduled.values()][0];
      assert.deepEqual(wakeup.payload, { scope, meetingId: f.id, mode });
      assert.equal(wakeup.tenantId, scope.tenantId);
      assert.equal(wakeup.organizationId, scope.organizationId);
      assert.equal(wakeup.userId, scope.userId);
      assert.equal(wakeup.scopeKey, SYSTEM_GLOBAL_SCOPE);
      assert.ok(wakeup.delayMs! > 895000 && wakeup.delayMs! <= 900000);
      assert.equal(wakeup.attempts, 8);
      assert.deepEqual((await f.store.read(scope, f.id)).processingClaim, orphan);

      const renewed = { ...orphan, expiresAt: orphan.expiresAt + 60000 };
      await f.store.update(scope, f.id, m => { m.processingClaim = renewed; });
      await f.processor.handle(f.delivery(mode, 0), context);
      assert.equal(f.scheduled.size, 2, "renewal leaves a new durable expiry wakeup");
      assert.deepEqual((await f.store.read(scope, f.id)).processingClaim, renewed);

      // Process death leaves the persisted claim behind without running finally.
      await f.store.update(scope, f.id, m => { m.processingClaim = { ...renewed, expiresAt: Date.now() - 1 }; });
      await f.processor.handle(f.delivery(mode, 0), context);
      const completed = await f.store.read(scope, f.id);
      assert.equal(completed.processingClaim, null);
      if (mode === "final") {
        assert.equal(completed.processing, "ready");
        assert.equal(completed.summary?.overview, "Recovered summary");
      } else assert.equal(completed.liveTranscription.status, "listening");
      assert.equal(f.scheduled.size, 2, "recovery stops deferring once the claim expires");
    } finally { await f.dispose(); }
  });
}

test("busy delivery fails visibly when its durable wakeup cannot be queued", async () => {
  const f = await fixture();
  try {
    const claim = { id: randomUUID(), expiresAt: Date.now() + 900000 };
    await f.store.update(scope, f.id, m => { m.processingClaim = claim; });
    f.unavailable();
    await assert.rejects(f.processor.handle(f.delivery("final"), context), /queue_unavailable/);
    assert.equal(f.scheduled.size, 0);
    assert.deepEqual((await f.store.read(scope, f.id)).processingClaim, claim);
  } finally { await f.dispose(); }
});
