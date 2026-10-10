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
    "Usage: live-assistant.mjs <platform-root> <private-context.json> <private-output-dir> <synthetic.wav>"
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
    join(outputRoot, "assistant-smoke.json"),
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

const detail = async () =>
  (await request(`/data?selectionId=${meetingId}`)).meta.detail;
const waitFor = async (predicate, label) => {
  for (let i = 0; i < 120; i++) {
    const m = await detail();
    receipt.processing = m.processing;
    receipt.errorCode = m.errorCode;
    receipt.operations = m.assistant.operations;
    receipt.conversationId = m.assistant.conversationId;
    receipt.threadId = m.assistant.threadId;
    await save();
    if (predicate(m)) {
      receipt.checks.push(label);
      console.log(
        JSON.stringify({
          check: label,
          phases: m.assistant.operations.filter((o) => o.kind === "phase")
            .length,
        })
      );
      return m;
    }
    if (m.assistant.operations.some((o) => o.status === "failed"))
      throw new Error(
        m.assistant.operations.find((o) => o.status === "failed").errorCode
      );
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(label + "_timeout");
};
try {
  const captureContext = {
    meetingId,
    title: "Meetings 静音阶段总结验收（合成音频）",
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
  const file = await fs.readFile(audioPath);
  let pcm;
  for (let at = 12; at + 8 <= file.length; ) {
    const n = file.readUInt32LE(at + 4);
    if (file.toString("ascii", at, at + 4) === "data")
      pcm = file.subarray(at + 8, at + 8 + n);
    at += 8 + n + (n % 2);
  }
  assert.ok(pcm?.length > 480000);
  const send = async (sequence, activeTrack, sourceOffset) => {
    for (const track of ["microphone", "system"]) {
      const data = Buffer.alloc(240000);
      if (track === activeTrack)
        pcm.copy(data, 0, sourceOffset, sourceOffset + 240000);
      const audio = wav(data),
        input = {
          version: 1,
          captureId,
          context: captureContext,
          track,
          sequence,
          startMs: sequence * 5000,
          endMs: (sequence + 1) * 5000,
          sha256: createHash("sha256").update(audio).digest("hex"),
        };
      await ok("capture.chunk", input, audio);
      if (sequence === 0) await ok("capture.chunk", input, audio);
    }
  };
  for (let sequence = 0; sequence < 5; sequence++)
    await send(sequence, sequence < 2 ? "microphone" : null, sequence * 240000);
  let m = await waitFor(
    (m) => m.assistant.operations[0]?.status === "ready",
    "phase-before-finish"
  );
  assert.equal(m.capture, "recording");
  assert.equal(m.expectedChunks, null);
  assert.equal(m.summary, null);
  assert.equal(
    m.transcript.filter((s) => s.track === "system" && s.text).length,
    0
  );
  receipt.checks.push(
    "quiet-system-no-hallucination",
    "phase-does-not-write-minutes"
  );
  const conversation = m.assistant.conversationId;
  for (let sequence = 5; sequence < 10; sequence++)
    await send(
      sequence,
      sequence < 7 ? "system" : null,
      (sequence - 3) * 240000
    );
  m = await waitFor(
    (m) =>
      m.assistant.operations.filter(
        (o) => o.kind === "phase" && o.status === "ready"
      ).length === 2,
    "second-phase-same-conversation"
  );
  assert.equal(m.assistant.conversationId, conversation);
  assert.equal(m.assistant.operations.length, 2);
  await send(10, "microphone", 240000);
  await ok("capture.event", {
    version: 1,
    captureId,
    context: captureContext,
    eventId: `${captureId}:stopped`,
    event: "stopped",
    errorCode: null,
    durationMs: 55000,
    reason: "user",
    chunks: { microphone: 11, system: 11 },
  });
  m = await waitFor((m) => m.processing === "ready", "final-minutes-ready");
  assert.equal(m.assistant.conversationId, conversation);
  assert.equal(m.assistant.operations.length, 3);
  assert.equal(m.summaryVersion, 1);
  const exp = await ok("export", { meetingId, includeTranscript: true });
  assert.equal(exp.mimeType, "text/markdown");
  assert.ok(exp.content.includes(m.summary.overview));
  for (const item of [...m.summary.decisions, ...m.summary.actions])
    assert.ok(
      m.transcript
        .find((s) => s.id === item.evidence.segmentId)
        ?.text.includes(item.evidence.quote)
    );
  receipt.checks.push(
    "one-conversation-three-executions",
    "markdown-export",
    "verified-evidence"
  );
  receipt.completed = true;
  await fs.writeFile(
    join(outputRoot, "detail.json"),
    JSON.stringify(m, null, 2),
    { mode: 0o600 }
  );
} catch (error) {
  receipt.failure = error.message;
  process.exitCode = 1;
}
await save();
console.log(
  JSON.stringify({
    completed: receipt.completed,
    checks: receipt.checks,
    failure: receipt.failure,
    processing: receipt.processing,
  })
);
