// Cross-repository contract test: real Desktop delivery and plugin View, fake native devices.
import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { FileStore } from "../dist/file-store.js";
import { Meetings } from "../dist/meetings.js";
import { CaptureDelivery } from "../dist/capture-delivery.js";
import {
  captureCommands,
  captureStartPayload,
  captureStateSchema,
} from "../dist/capture-contract.js";
import { MeetingsView } from "../dist/view.js";
import { VIEW } from "../dist/domain.js";
import { scopeFromView } from "../dist/view.js";

const platform = process.argv[2];
if (!platform)
  throw new Error("Usage: verify-desktop-capture.mjs <xpert-source-root>");
const require = createRequire(import.meta.url);
const { setup, scope, chunk } = require(resolve(
  platform,
  "apps/desktop/tests/audio-capture/test-fixture.cjs"
));

async function fixture(t) {
  const host = await setup(t);
  const queued = [];
  const meetings = new Meetings(
    new FileStore(join(host.root, "plugin")),
    async (_scope, id, chunk) => {
      queued.push({ id, chunk });
    }
  );
  const captures = new CaptureDelivery(meetings);
  const view = new MeetingsView({ meetings, captures });
  const context = { ...scope, hostType: "agent", hostId: scope.assistantId };
  const manifest = view.getViewManifests(context, "agent.workbench.fixed")[0];
  assert.deepEqual(
    manifest.clientCommands.map(({ key }) => key),
    [...captureCommands, "workbench.navigation.open"]
  );
  const delivered = [];
  const loseAcknowledgement = new Set();
  host.service.request = async (url, options) => {
    if (url.endsWith("/manifest")) return manifest;
    const route = /\/actions\/([^/]+)(\/file)?$/.exec(url);
    assert.ok(route, "unexpected Desktop callback route");
    const key = decodeURIComponent(route[1]);
    let input, result;
    if (route[2]) {
      input = JSON.parse(options.body.get("input"));
      const file = options.body.get("file");
      result = await view.executeViewFileAction(
        context,
        VIEW,
        key,
        { input },
        {
          buffer: Buffer.from(await file.arrayBuffer()),
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
        }
      );
    } else {
      input = options.body.input;
      result = await view.executeViewAction(context, VIEW, key, { input });
    }
    assert.equal(result.success, true, `${key}: ${result.data?.code}`);
    const identity = input.event ?? `${input.track}:${input.sequence}`;
    delivered.push(identity);
    if (loseAcknowledgement.delete(identity))
      throw new Error("synthetic lost acknowledgement");
    return result;
  };
  return {
    ...host,
    meetings,
    captures,
    view,
    context,
    businessScope: scopeFromView(context),
    queued,
    delivered,
    loseAcknowledgement,
  };
}

test("Desktop capture streams through the actual Meetings View and restores its association", async (t) => {
  const f = await fixture(t),
    meetingId = randomUUID();
  const result = await f.command(
    "start",
    captureStartPayload(meetingId, "Synthetic contract test"),
    { userActivated: true }
  );
  assert.equal(result.success, true, result.code);
  const state = captureStateSchema.parse(result.data);
  assert.ok(state.captureId);
  assert.notEqual(state.captureId, meetingId);
  const association = await f.view.getViewData(f.context, VIEW, {
    parameters: { captureId: state.captureId },
  });
  assert.deepEqual(association.meta.capture, {
    captureId: state.captureId,
    meetingId,
  });
  f.emit({ type: "started" });
  for (const track of ["microphone", "system"]) f.emit(chunk(track));
  await f.controller.active.write;
  const stopped = await f.command("stop", { captureId: state.captureId });
  assert.equal(stopped.success, true, stopped.code);
  await f.controller.draining?.promise;
  const meeting = await f.meetings.get(f.businessScope, meetingId);
  assert.equal(meeting.capture, "stopped");
  assert.deepEqual(meeting.expectedChunks, { microphone: 1, system: 1 });
  assert.deepEqual(f.delivered, [
    "created",
    "started",
    "microphone:0",
    "system:0",
    "stopped",
  ]);
  assert.equal((await f.command("state")).data.status, "idle");
  assert.equal((await f.controller.cache.list(scope)).length, 0);
});

test("lost chunk/final acknowledgements retry safely without acquiring devices again", async (t) => {
  const f = await fixture(t),
    meetingId = randomUUID();
  const result = await f.command(
    "start",
    captureStartPayload(meetingId, "Synthetic retry test"),
    { userActivated: true }
  );
  assert.equal(result.success, true, result.code);
  f.emit({ type: "started" });
  for (const track of ["microphone", "system"]) f.emit(chunk(track));
  await f.controller.active.write;
  f.loseAcknowledgement.add("system:0");
  f.loseAcknowledgement.add("stopped");
  await f.controller.stop("user");
  await f.controller.draining?.promise.catch(() => {});
  for (
    let attempt = 0;
    attempt < 3 && (await f.controller.cache.list(scope)).length;
    attempt++
  ) {
    const retry = await f.command("retry", {
      captureId: result.data.captureId,
    });
    assert.equal(retry.success, true, retry.code);
    await f.controller.draining?.promise.catch(() => {});
  }
  assert.equal((await f.controller.cache.list(scope)).length, 0);
  assert.equal(f.children.length, 1);
  assert.equal(f.delivered.filter((item) => item === "system:0").length, 2);
  assert.equal(f.delivered.filter((item) => item === "stopped").length, 2);
  assert.equal(
    f.queued.filter(({ chunk }) => !chunk).length,
    1,
    "final task is not enqueued again after an acknowledged result"
  );
  assert.equal((await f.meetings.list(f.businessScope)).total, 1);
});

test("native startup failure finalizes a zero-audio meeting without waiting forever", async (t) => {
  const f = await fixture(t),
    meetingId = randomUUID();
  const result = await f.command(
    "start",
    captureStartPayload(meetingId, "Synthetic device failure"),
    { userActivated: true }
  );
  assert.equal(result.success, true, result.code);
  await f.controller.stop("device_lost");
  await f.controller.draining?.promise;
  const meeting = await f.meetings.get(f.businessScope, meetingId);
  assert.equal(meeting.capture, "interrupted");
  assert.equal(meeting.processing, "failed");
  assert.deepEqual(f.delivered, ["created", "stopped"]);
  assert.equal((await f.command("state")).data.status, "idle");
});
