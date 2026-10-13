// Run against a local host checkout; no API deployment, credentials or model calls.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";

const argument = process.argv.indexOf("--platform-root");
if (argument < 0 || !process.argv[argument + 1])
  throw new Error("Pass --platform-root <local-xpert-checkout>");
const platform = resolve(process.argv[argument + 1]);
const require = createRequire(join(platform, "package.json"));
require("ts-node").register({
  project: join(platform, "packages/server-ai/tsconfig.spec.json"),
  transpileOnly: true,
});
const config = require(join(platform, "tsconfig.base.json"));
const unregister = require("tsconfig-paths").register({
  baseUrl: platform,
  paths: config.compilerOptions.paths,
});
const { VolumeHandle } = require(join(
  platform,
  "packages/server-ai/src/shared/volume/volume.ts"
));
const { WorkspaceFilesRuntimeCapabilityService } = require(join(
  platform,
  "packages/server-ai/src/shared/runtime/workspace-files-runtime-capability.service.ts"
));
const { RequestContext, DefaultRuntimeCapabilityRegistry } = require("@xpert-ai/plugin-sdk");
const { xpert: { plugin: { artifactNamespace } } } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const { FileStore, sha256 } = await import("../dist/file-store.js");
const { Meetings } = await import("../dist/meetings.js");
const { CaptureDelivery } = await import("../dist/capture-delivery.js");
const { captureStartPayload } = await import("../dist/capture-contract.js");
const { Processing } = await import("../dist/processing.js");
const { saveSummary } = await import("../dist/summary-store.js");
const { wav, SAMPLE_RATE } = await import("../dist/audio.js");

const root = await mkdtemp(join(tmpdir(), "meetings-host-storage-"));
const scope = {
  tenantId: "tenant",
  organizationId: "org",
  userId: "alice",
  assistantId: "assistant",
  workspaceCatalog: "user-xperts",
};
RequestContext.currentTenantId = () => scope.tenantId;
RequestContext.getOrganizationId = () => scope.organizationId;
RequestContext.currentUserId = () => scope.userId;
const jobs = [];
const replica = () => {
  const store = new FileStore((actor) => {
    // Only the test volume layout is synthetic. Filesystem operations and locks are production code.
    const volumeRoot = join(
      root,
      sha256(
        JSON.stringify([
          actor.tenantId,
          actor.organizationId,
          actor.userId,
          actor.assistantId,
        ])
      )
    );
    const volume = new VolumeHandle(
      {
        tenantId: actor.tenantId,
        catalog: "user-xperts",
        userId: actor.userId,
        xpertId: actor.assistantId,
      },
      volumeRoot,
      volumeRoot,
      "",
      root
    );
    const host = new WorkspaceFilesRuntimeCapabilityService(
      { execute: async () => ({ scope: volume.scope }) },
      { resolve: () => volume },
      new DefaultRuntimeCapabilityRegistry(),
      { execute: async () => artifactNamespace }
    );
    return host.createScopedApi({ ...actor, xpertId: actor.assistantId }).appData({
      pluginName: "@xpert-ai/plugin-meetings", requireUserIsolation: true
    });
  });
  const meetings = new Meetings(store, async (_scope, id) => {
    jobs.push(id);
  });
  return { store, meetings, delivery: new CaptureDelivery(meetings) };
};
try {
  const [a, b, c] = [replica(), replica(), replica()];
  const id = randomUUID(),
    captureId = randomUUID();
  const context = captureStartPayload(id, "Synthetic storage verification")
    .delivery.context;
  const event = (kind, extra = {}) => ({
    version: 1,
    captureId,
    eventId: `${captureId}:${kind}`,
    event: kind,
    context,
    ...extra,
  });
  await a.delivery.event(
    scope,
    event("created", {
      createdAt: Date.now(),
      tracks: ["microphone", "system"],
    })
  );
  await b.delivery.event(scope, event("started", { startedAt: Date.now() }));
  assert.equal((await c.meetings.get(scope, id)).capture, "recording");
  const notes = await Promise.allSettled(
    [a, b, c].map((api, i) =>
      api.meetings.notes(scope, {
        meetingId: id,
        expectedRevision: 0,
        notes: `Writer ${i}`,
      })
    )
  );
  assert.equal(notes.filter((x) => x.status === "fulfilled").length, 1);
  const pcm = Buffer.alloc(SAMPLE_RATE * 5 * 2);
  for (let i = 0; i < pcm.length / 2; i++)
    pcm.writeInt16LE(Math.round(6000 * Math.sin(i / 10)), i * 2);
  const audio = wav(pcm);
  for (const track of ["microphone", "system"]) {
    const chunk = {
      meetingId: id,
      sessionId: captureId,
      track,
      sequence: 0,
      startMs: 0,
      endMs: 5000,
      sha256: sha256(audio),
    };
    const results = await Promise.all(
      [a, b, c].map((api) => api.meetings.upload(scope, chunk, audio))
    );
    assert.equal(results.filter((result) => !result.reused).length, 1);
  }
  await c.delivery.event(
    scope,
    event("stopped", {
      durationMs: 5000,
      chunks: { microphone: 1, system: 1 },
      reason: "user",
      errorCode: null,
    })
  );
  const worker = new Processing(
    b.store,
    { transcribe: async () => "Synthetic meeting text" },
    {
      live: async () => {},
      finish: async (input) =>
        saveSummary(b.store, scope, id, input, {
          overview: "Synthetic summary",
          decisions: [],
          actions: [],
          questions: [],
        }),
    }
  );
  await worker.run(scope, id);
  const restarted = replica();
  const result = await restarted.meetings.get(scope, id);
  assert.equal(result.processing, "ready");
  assert.equal(result.transcript.length, 2);
  assert.ok(jobs.length >= 3);
  for (const patch of [
    { userId: "bob" },
    { organizationId: "other" },
    { tenantId: "other" },
    { assistantId: "other" },
  ]) {
    await assert.rejects(
      restarted.meetings.get({ ...scope, ...patch }, id),
      "assistantId" in patch ? /meeting_not_found/ : { status: 403 }
    );
  }
  console.log(
    "PASS: create/start on separate replicas, one notes revision winner, idempotent concurrent chunks, finalization on another replica, restart persistence, scope isolation."
  );
} finally {
  unregister();
  await rm(root, { recursive: true, force: true });
}
