// Normal authenticated View API + platform Socket.IO. Uses a synthetic private meeting only.
import fs from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { io } from "socket.io-client";
const [platformRoot, contextPath, outputRoot] = process.argv.slice(2);
if (!outputRoot)
  throw new Error(
    "Usage: live-collaboration.mjs <platform-root> <private-context.json> <private-output-dir>"
  );
const { requireAuthentication, createRequestHeaders } = await import(
  pathToFileURL(resolve(platformRoot, "tools/scripts/local-plugin-cli.mjs"))
    .href
);
const { documentMarkdown } = await import("../dist/document-markdown.js");
const context = JSON.parse(await fs.readFile(contextPath, "utf8"));
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
  checks = [],
  sockets = [];
await fs.mkdir(outputRoot, { recursive: true, mode: 0o700 });
const receipt = { meetingId, checks };
const save = () =>
  fs.writeFile(
    join(outputRoot, "collaboration.json"),
    JSON.stringify(receipt),
    { mode: 0o600 }
  );
const action = async (key, input) => {
  const r = await fetch(`${root}/actions/${key}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await r.json();
  assert.equal(
    r.ok && body.success,
    true,
    `${key}:${body.data?.code ?? r.status}`
  );
  return body.data;
};
const waitUntil = async (predicate) => {
  const until = Date.now() + 15000;
  while (!(await predicate())) {
    if (Date.now() > until) throw new Error("convergence_timeout");
    await new Promise((r) => setTimeout(r, 100));
  }
};
const open = async () => {
  const { session, state } = await action("document.session", {
    meetingId,
    kind: "notes",
  });
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(state, "base64"));
  const socket = io(session.connectionUrl, {
    autoConnect: false,
    transports: ["websocket"],
    auth: {
      sessionId: session.sessionId,
      clientKey: session.clientKey,
      documentId: session.documentId,
    },
  });
  sockets.push(socket);
  let snapshot;
  socket.on("presence-snapshot", (value) => {
    snapshot = value;
  });
  socket.on("update", (payload) =>
    Y.applyUpdate(doc, Buffer.from(payload.updateBase64, "base64"))
  );
  socket.on("sync", (payload) =>
    Y.applyUpdate(doc, Buffer.from(payload.updateBase64, "base64"))
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket_timeout")), 10000);
    socket.once("sync", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", () => {
      clearTimeout(timer);
      reject(new Error("socket_connect_error"));
    });
    socket.once("error", () => {
      clearTimeout(timer);
      reject(new Error("socket_authorization_failed"));
    });
    socket.connect();
  });
  socket.emit("presence", {
    mode: "edit",
    focus: { kind: "document", fieldKey: "notes" },
  });
  return { doc, socket, snapshot: () => snapshot };
};
try {
  const captureContext = { meetingId, title: "Meetings 协同编辑验收（合成）" };
  await action("capture.event", {
    version: 1,
    captureId,
    context: captureContext,
    eventId: `${captureId}:created`,
    event: "created",
    createdAt: Date.now(),
    tracks: ["microphone", "system"],
  });
  await save();
  await action("notes", {
    meetingId,
    expectedRevision: 0,
    notes: "Original note.",
  });
  const a = await open(),
    b = await open();
  checks.push("session-authorized", "websocket-connected");
  const text = (doc) => doc.getXmlFragment("body").get(0).get(0);
  text(a.doc).insert(0, "窗口 A：");
  text(b.doc).insert(0, "窗口 B：");
  const payload = (doc) => ({
    meetingId,
    kind: "notes",
    updateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
  });
  const pa = payload(a.doc),
    pb = payload(b.doc);
  await Promise.all([
    action("document.update", pa),
    action("document.update", pb),
  ]);
  await waitUntil(
    () =>
      documentMarkdown(a.doc) === documentMarkdown(b.doc) &&
      documentMarkdown(a.doc).includes("窗口 B：")
  );
  const synced = await action("document.sync", { meetingId });
  assert.match(synced.notes, /窗口 A：/);
  assert.match(synced.notes, /窗口 B：/);
  const revision = synced.documents.notes.sequence;
  await action("document.update", pb);
  const duplicate = await action("document.sync", { meetingId });
  assert.equal(duplicate.documents.notes.sequence, revision);
  checks.push(
    "concurrent-merge",
    "duplicate-update-idempotent",
    "markdown-projection"
  );
  b.socket.disconnect();
  text(a.doc).insert(text(a.doc).length, " Reconnect proof.");
  await action("document.update", payload(a.doc));
  const c = await open();
  assert.match(documentMarkdown(c.doc), /Reconnect proof/);
  await waitUntil(() => c.snapshot()?.selfClientId === c.socket.id);
  checks.push("reconnect-state", "self-client-presence");
  const exported = await action("export", {
    meetingId,
    includeTranscript: false,
  });
  assert.match(exported.content, /窗口 A：/);
  assert.match(exported.content, /Reconnect proof/);
  checks.push("strong-export");
  receipt.completed = true;
} catch (error) {
  receipt.failure = error.message;
  process.exitCode = 1;
} finally {
  sockets.forEach((socket) => socket.disconnect());
  await save();
}
console.log(
  JSON.stringify({
    checks,
    completed: receipt.completed,
    failure: receipt.failure,
  })
);
