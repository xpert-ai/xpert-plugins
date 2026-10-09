// Uses normal platform authentication. Context and raw receipts stay in a private directory.
import fs from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
const [platformRoot, contextPath, outputRoot, audioPath] =
  process.argv.slice(2);
if (!platformRoot || !contextPath || !outputRoot || !audioPath)
  throw new Error(
    "Usage: live-smoke.mjs <platform-root> <private-context.json> <private-output-dir> <synthetic.wav>"
  );
const { requireAuthentication, createRequestHeaders } = await import(
  pathToFileURL(resolve(platformRoot, "tools/scripts/local-plugin-cli.mjs"))
    .href
);
const { wav } = await import("../dist/audio.js");
const context = JSON.parse(await fs.readFile(contextPath, "utf8"));
await fs.mkdir(outputRoot, { recursive: true, mode: 0o700 });
const origin = context.apiUrl ?? "http://localhost:3000";
const auth = await requireAuthentication({ apiUrl: origin });
const headers = createRequestHeaders(
  { scope: "organization", orgId: context.organizationId },
  auth.token,
  auth.tenantId
);
const root = `${origin}/api/view-hosts/agent/${context.assistantId}/views/meetings.provider__meetings.workspace`;
const meetingId = randomUUID(),
  captureId = randomUUID(),
  receipt = { meetingId, captureId, checks: [] };
const save = () =>
  fs.writeFile(
    join(outputRoot, "live-smoke.json"),
    JSON.stringify(receipt, null, 2),
    { mode: 0o600 }
  );
async function request(path, input, file) {
  const opts = { headers };
  if (input) {
    opts.method = "POST";
    if (file) {
      const body = new FormData();
      body.set("input", JSON.stringify(input));
      body.set(
        "file",
        new Blob([file], { type: "audio/wav" }),
        "synthetic.wav"
      );
      opts.body = body;
      opts.headers = { ...headers };
      delete opts.headers["content-type"];
    } else opts.body = JSON.stringify({ input });
  }
  const response = await fetch(root + path, {
    ...opts,
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return result;
}
const action = (key, input, file) =>
  request(`/actions/${key}${file ? "/file" : ""}`, input, file);
const ok = async (key, input, file) => {
  const result = await action(key, input, file);
  assert.equal(result.success, true, result.data?.code ?? key);
  return result.data;
};
try {
  const manifest = await request("/manifest");
  assert.equal(manifest.source.plugin, "@xpert-ai/plugin-meetings");
  receipt.checks.push("manifest");
  const captureContext = {
    meetingId,
    title: "Meetings 实时转写验收（合成音频）",
  };
  await ok("capture.event", {
    version: 1,
    captureId,
    context: captureContext,
    eventId: `${captureId}:created`,
    event: "created",
    createdAt: Date.now(),
    tracks: ["microphone", "system"],
  });
  await save();
  await ok("capture.event", {
    version: 1,
    captureId,
    context: captureContext,
    eventId: `${captureId}:started`,
    event: "started",
    startedAt: Date.now(),
  });
  const notes = "合成验收笔记：确认文件保存、版本冲突和会后处理。";
  await ok("notes", { meetingId, notes, expectedRevision: 0 });
  const conflict = await action("notes", {
    meetingId,
    notes: "stale",
    expectedRevision: 0,
  });
  assert.equal(conflict.data.code, "revision_conflict");
  receipt.checks.push("notes-cas");
  const file = await fs.readFile(audioPath);
  let pcm;
  assert.equal(file.toString("ascii", 0, 4), "RIFF");
  for (let at = 12; at + 8 <= file.length; ) {
    const size = file.readUInt32LE(at + 4),
      key = file.toString("ascii", at, at + 4);
    if (key === "fmt ") {
      assert.equal(file.readUInt16LE(at + 8), 1);
      assert.equal(file.readUInt16LE(at + 10), 1);
      assert.equal(file.readUInt32LE(at + 12), 24000);
      assert.equal(file.readUInt16LE(at + 22), 16);
    }
    if (key === "data") pcm = file.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  assert.ok(pcm?.length);
  const count = Math.ceil(pcm.length / 240000),
    durationMs = pcm.length / 48;
  const liveStarted = Date.now();
  for (const track of ["microphone", "system"]) {
    for (let sequence = 0; sequence < count; sequence++) {
      const part = pcm.subarray(sequence * 240000, (sequence + 1) * 240000),
        audio = wav(part);
      const input = {
        version: 1,
        captureId,
        context: captureContext,
        track,
        sequence,
        startMs: sequence * 5000,
        endMs: sequence * 5000 + part.length / 48,
        sha256: createHash("sha256").update(audio).digest("hex"),
      };
      await ok("capture.chunk", input, audio);
      if (!sequence) await ok("capture.chunk", input, audio);
    }
  }
  receipt.checks.push("file-upload", "idempotent-chunks");
  let liveObserved = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const detail = (await request(`/data?selectionId=${meetingId}`)).meta
      .detail;
    assert.equal(detail.expectedChunks, null);
    assert.equal(detail.capture, "recording");
    if (detail.transcript.some((segment) => segment.text)) {
      liveObserved = true;
      receipt.firstTranscriptMs = Date.now() - liveStarted;
      receipt.checks.push("transcript-before-finish");
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(liveObserved, true, "live_transcript_missing");
  await ok("capture.event", {
    version: 1,
    captureId,
    context: captureContext,
    eventId: `${captureId}:stopped`,
    event: "stopped",
    errorCode: null,
    durationMs,
    reason: "user",
    chunks: { microphone: count, system: count },
  });
  receipt.checks.push("sealed");
  let finalDetail;
  for (let attempt = 0; attempt < 90; attempt++) {
    const result = await request(`/data?selectionId=${meetingId}`),
      detail = result.meta.detail;
    assert.equal(detail.notes, notes);
    receipt.processing = detail.processing;
    receipt.errorCode = detail.errorCode;
    receipt.transcriptSegments = detail.transcript.length;
    finalDetail = detail;
    await save();
    if (detail.processing === "ready" || detail.processing === "failed") break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
  }
  const exported = await ok("export", { meetingId, includeTranscript: true });
  assert.ok(exported.content.includes(notes));
  receipt.checks.push("notes-preserved", "markdown-export");
  receipt.completed = receipt.processing === "ready";
  if (receipt.completed) {
    assert.ok(finalDetail.summary);
    const { decisions, actions } = finalDetail.summary;
    for (const item of [...decisions, ...actions]) {
      const source = finalDetail.transcript.find(
        (s) => s.id === item.evidence.segmentId
      );
      assert.ok(
        source?.text.includes(item.evidence.quote),
        "summary evidence must match the transcript"
      );
    }
    assert.equal(new Set(actions.map((item) => item.id)).size, actions.length);
    for (const item of actions) {
      if (item.owner) assert.ok(item.evidence.quote.includes(item.owner));
      if (item.dueDate) assert.match(item.dueDate, /^\d{4}-\d{2}-\d{2}$/);
    }
    receipt.decisions = decisions.length;
    receipt.actions = actions.length;
    receipt.checks.push(
      "summary-evidence",
      "action-owners",
      "unique-action-ids"
    );
    await fs.writeFile(
      join(outputRoot, "detail.json"),
      JSON.stringify(finalDetail, null, 2),
      { mode: 0o600 }
    );
  }
  if (!receipt.completed) {
    receipt.failure = receipt.errorCode ?? "processing_did_not_finish";
    process.exitCode = 2;
  }
} catch (error) {
  receipt.failure = error.message;
  process.exitCode = 1;
}
await save();
console.log(
  JSON.stringify({
    checks: receipt.checks,
    processing: receipt.processing,
    errorCode: receipt.errorCode,
    transcriptSegments: receipt.transcriptSegments,
    firstTranscriptMs: receipt.firstTranscriptMs,
    decisions: receipt.decisions,
    actions: receipt.actions,
    failure: receipt.failure,
    completed: receipt.completed,
  })
);
