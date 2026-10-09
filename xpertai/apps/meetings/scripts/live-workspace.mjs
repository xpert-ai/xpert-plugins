// Uses authorized View and Assistant Workspace APIs. Never reads platform host-volume paths.
import fs from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import * as Y from "yjs";

const [platform, contextPath, output] = process.argv.slice(2);
if (!output)
  throw new Error(
    "Usage: live-workspace.mjs <platform> <private-context.json> <private-output>"
  );
const { requireAuthentication, createRequestHeaders } = await import(
  pathToFileURL(resolve(platform, "tools/scripts/local-plugin-cli.mjs")).href
);
const context = JSON.parse(await fs.readFile(contextPath, "utf8"));
const origin = context.apiUrl ?? "http://localhost:3000";
const auth = await requireAuthentication({ apiUrl: origin });
const headers = createRequestHeaders(
  { scope: "organization", orgId: context.organizationId },
  auth.token,
  auth.tenantId
);
const view = `/api/view-hosts/agent/${context.assistantId}/views/meetings.provider__meetings.workspace`;
const workspace = `/api/xpert/${context.assistantId}/workspace`;
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const checks = [],
  receipt = { checks, migrated: [], fixture: null };
const save = () =>
  fs.writeFile(join(output, "workspace.json"), JSON.stringify(receipt), {
    mode: 0o600,
  });
const request = async (path, init = {}) => {
  const r = await fetch(origin + path, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`API HTTP ${r.status}`);
  const body = await r.text();
  return body ? JSON.parse(body) : null;
};
const action = async (key, input) => {
  const result = await request(`${view}/actions/${key}`, {
    method: "POST",
    body: JSON.stringify({ input }),
  });
  assert.equal(result.success, true, `${key}: ${result.data?.code}`);
  return result.data;
};
const read = (path) =>
  request(`${workspace}/file?path=${encodeURIComponent(path)}`);
const list = (path) =>
  request(`${workspace}/files?path=${encodeURIComponent(path)}&deepth=1`);
const detail = async (id) =>
  (await request(`${view}/data?selectionId=${id}`)).meta.detail;

for (let page = 1; ; page++) {
  const result = await request(`${view}/data?page=${page}&pageSize=20`);
  for (const item of result.items) {
    const meeting = await detail(item.id),
      folder = meeting.workspace?.folder;
    assert.equal(meeting.workspace?.status, "ready");
    assert.ok(folder.startsWith("meetings/") && !folder.includes("sessions/"));
    assert.equal(folder.split("/").length, 2);
    assert.equal(
      (await read(`${folder}/notes.md`)).contents,
      meeting.notes || "\n"
    );
    assert.deepEqual(
      JSON.parse((await read(`${folder}/transcript.json`)).contents),
      meeting.transcript
    );
    if (meeting.summary)
      assert.equal(
        (await read(`${folder}/summary.md`)).contents,
        meeting.summaryMarkdown
      );
    let stage = 0;
    for (const op of meeting.assistant.operations) {
      if (op.kind !== "phase") continue;
      stage++;
      if (op.status === "ready")
        assert.ok(
          (await read(`${folder}/stages/${String(stage).padStart(4, "0")}.md`))
            .contents
        );
    }
    receipt.migrated.push({
      id: meeting.id,
      folder,
      summary: Boolean(meeting.summary),
      stages: stage,
    });
  }
  if (page * 20 >= result.total) break;
}
checks.push(
  "all authorized existing meetings readable in Assistant root, source contents preserved"
);
assert.ok((await list("meetings")).length >= receipt.migrated.length);
await save();

const captureId = randomUUID(),
  meetingId = randomUUID();
await action("capture.event", {
  version: 1,
  captureId,
  context: { meetingId, title: "Meetings 工作区文件验收（合成数据）" },
  eventId: `${captureId}:created`,
  event: "created",
  createdAt: Date.now(),
  tracks: ["microphone", "system"],
});
const created = await detail(meetingId);
receipt.fixture = { id: created.id, folder: created.workspace.folder };
await save();
try {
  const folder = created.workspace.folder;
  await action("notes", {
    meetingId: created.id,
    notes: "# Workspace test\n\nOriginal synthetic note.",
    expectedRevision: 0,
  });
  const opened = await action("document.session", {
    meetingId: created.id,
    kind: "notes",
  });
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(opened.state, "base64"));
  const vector = Y.encodeStateVector(doc);
  const paragraph = new Y.XmlElement("paragraph"),
    text = new Y.XmlText();
  text.insert(0, "Tiptap collaboration workspace synchronization verified.");
  paragraph.insert(0, [text]);
  const body = doc.getXmlFragment("body");
  body.insert(body.length, [paragraph]);
  await action("document.update", {
    meetingId: created.id,
    kind: "notes",
    updateBase64: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString(
      "base64"
    ),
  });
  doc.destroy();
  await action("workspace.sync", { meetingId: created.id });
  assert.match(
    (await read(`${folder}/notes.md`)).contents,
    /workspace synchronization verified/
  );
  checks.push(
    "new meeting and real collaboration update materialize in same workspace file"
  );
  const current = await detail(created.id);
  await action("edit", {
    meetingId: created.id,
    expectedRevision: current.revision,
    title: "Meetings 工作区改名验收（合成数据）",
  });
  assert.equal((await detail(created.id)).workspace.folder, folder);
  await action("workspace.sync", { meetingId: created.id });
  checks.push("rename and repeated sync retain one stable meeting folder");
} finally {
  await action("delete", { meetingId: created.id });
  assert.equal((await list(receipt.fixture.folder)).length, 0);
  await request(
    `${workspace}/file?path=${encodeURIComponent(receipt.fixture.folder)}`,
    { method: "DELETE" }
  );
  checks.push(
    "fixture deletion removes its projected files without touching existing meetings"
  );
  await save();
}
console.log({ migrated: receipt.migrated.length, checks });
