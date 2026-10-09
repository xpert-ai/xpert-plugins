import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { WorkspaceFilesApi } from "@xpert-ai/plugin-sdk";
import { FileStore, atomicWrite } from "../src/file-store.js";
import { MeetingWorkspaceFiles } from "../src/workspace-files.js";
import { Meetings } from "../src/meetings.js";
import { saveSummary } from "../src/summary-store.js";
import type { Scope } from "../src/domain.js";

const scope: Scope = {
  tenantId: "tenant",
  organizationId: "org",
  userId: "owner",
  assistantId: "assistant",
  workspaceCatalog: "user-xperts",
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "meetings-workspace-"));
  const files = new Map<string, Buffer>(),
    destinations: Scope[] = [];
  let writes = 0,
    fail = false;
  const api: Pick<
    WorkspaceFilesApi,
    "writeRuntimeBuffer" | "readRuntimeBuffer" | "deleteFile"
  > = {
    async writeRuntimeBuffer(input) {
      if (fail) throw new Error("Storage offline");
      const path = input.path!;
      files.set(path, input.buffer);
      writes++;
      return {
        name: input.originalName!,
        filePath: path,
        workspacePath: path,
        catalog: "user-xperts",
        reference: {
          source: "platform.workspace.files",
          filePath: path,
          workspacePath: path,
          catalog: "user-xperts",
          scopeId: scope.assistantId,
        },
      };
    },
    async readRuntimeBuffer(input) {
      assert.equal(typeof input, "string");
      if (typeof input !== "string") throw new Error("Expected runtime path");
      const buffer = files.get(input);
      if (!buffer)
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return {
        name: input,
        filePath: input,
        workspacePath: input,
        catalog: "user-xperts",
        buffer,
        reference: {
          source: "platform.workspace.files",
          filePath: input,
          workspacePath: input,
        },
      };
    },
    async deleteFile(input) {
      files.delete(input.filePath);
    },
  };
  const projection = new MeetingWorkspaceFiles((s) => {
    destinations.push(s);
    return api;
  });
  const store = new FileStore(root, projection),
    service = new Meetings(store, async () => {});
  const create = (title = "讨论 ../ 销售\\季度") =>
    service.create(scope, { id: randomUUID(), sessionId: randomUUID(), title });
  return {
    root,
    files,
    destinations,
    store,
    service,
    create,
    count: () => writes,
    fail: (value: boolean) => {
      fail = value;
    },
    dispose: () => rm(root, { force: true, recursive: true }),
  };
}

test("meetings get stable separate Assistant folders; retries/rename do not duplicate or use sessions", async () => {
  const f = await fixture();
  try {
    const first = await f.create(),
      second = await f.create();
    assert.equal(first.workspace?.status, "ready");
    assert.notEqual(first.workspace?.folder, second.workspace?.folder);
    assert.match(first.workspace!.folder!, /^meetings\/\d{4}-\d{2}-\d{2}-/);
    assert.equal(first.workspace!.folder!.split("/").length, 2);
    assert.ok(
      [...f.files.keys()].every(
        (p) =>
          p.startsWith("meetings/") &&
          !p.includes("sessions/") &&
          !p.includes("..")
      )
    );
    const writes = f.count();
    await f.store.reconcile(scope, first.id, true);
    assert.equal(f.count(), writes);
    await f.service.edit(scope, {
      meetingId: first.id,
      expectedRevision: first.revision,
      title: "新名称",
    });
    assert.equal(
      (await f.service.get(scope, first.id)).workspace?.folder,
      first.workspace!.folder
    );
    assert.ok(
      f.destinations.every(
        (s) =>
          s.assistantId === scope.assistantId &&
          s.workspaceCatalog === "user-xperts"
      )
    );
    const metadata = f.files
      .get(`${first.workspace!.folder}/meeting.json`)!
      .toString();
    assert.ok(
      !metadata.includes("tenantId") && !metadata.includes("sessionId")
    );
    await assert.rejects(
      f.service.get({ ...scope, assistantId: "other" }, first.id),
      /meeting_not_found/
    );
    await assert.rejects(
      f.service.get({ ...scope, userId: "other" }, first.id),
      /meeting_not_found/
    );
    assert.equal(
      (await f.service.list({ ...scope, assistantId: "other" })).total,
      0
    );
  } finally {
    await f.dispose();
  }
});

test("legacy migration, interrupted synchronization and deleted files recover without losing notes", async () => {
  const f = await fixture();
  try {
    const legacy = new Meetings(new FileStore(f.root), async () => {});
    const oldScope = { ...scope, workspaceCatalog: undefined };
    const old = await legacy.create(oldScope, {
      id: randomUUID(),
      sessionId: randomUUID(),
      title: "Legacy meeting",
    });
    await legacy.notes(oldScope, {
      meetingId: old.id,
      expectedRevision: 0,
      notes: "# 保留的笔记",
    });
    f.fail(true);
    let migrated = await f.service.get(scope, old.id);
    assert.equal(migrated.workspace?.status, "failed");
    assert.equal(migrated.notes, "# 保留的笔记");
    f.fail(false);
    migrated = await f.service.get(scope, old.id);
    assert.equal(migrated.workspace?.status, "ready");
    const path = `${migrated.workspace!.folder}/notes.md`;
    assert.equal(f.files.get(path)!.toString(), migrated.notes);
    f.files.delete(path);
    await f.store.reconcile(scope, old.id, true);
    assert.equal(f.files.get(path)!.toString(), migrated.notes);
    await assert.rejects(
      f.service.get({ ...scope, workspaceCatalog: "xperts" }, old.id),
      /workspace_scope_changed/
    );
  } finally {
    await f.dispose();
  }
});

test("pre-Tiptap JSON-only summaries migrate without losing their history", async () => {
  const f = await fixture();
  try {
    const legacyStore = new FileStore(f.root);
    const legacy = new Meetings(legacyStore, async () => {});
    const m = await legacy.create(scope, {
      id: randomUUID(),
      sessionId: randomUUID(),
      title: "Legacy summary",
    });
    await saveSummary(legacyStore, scope, m.id, m, {
      overview: "Original summary",
      decisions: [],
      actions: [],
      questions: [],
    });
    const directory = legacyStore.directory(scope, m.id);
    await rm(join(directory, "summaries", "1.md"));
    const record = await legacyStore.read(scope, m.id);
    record.summaryMarkdown = "";
    await atomicWrite(join(directory, "meeting.json"), JSON.stringify(record));
    const migrated = await f.service.get(scope, m.id);
    assert.equal(migrated.workspace?.status, "ready");
    assert.match(migrated.summaryMarkdown, /Original summary/);
    assert.equal(
      f.files.get(`${migrated.workspace!.folder}/summary.md`)!.toString(),
      migrated.summaryMarkdown
    );
    assert.match(
      f.files
        .get(`${migrated.workspace!.folder}/history/summary-1.md`)!
        .toString(),
      /Original summary/
    );
  } finally {
    await f.dispose();
  }
});

test("final summary, transcript and AI history are files; human edits update the same Markdown and conflicts survive", async () => {
  const f = await fixture();
  try {
    const m = await f.create("Minutes test");
    await f.store.update(scope, m.id, (draft) => {
      draft.transcript = [
        {
          id: "source",
          track: "microphone",
          final: true,
          startMs: 0,
          endMs: 5000,
          text: "确认方案",
        },
      ];
    });
    const input = await f.store.read(scope, m.id);
    await saveSummary(f.store, scope, m.id, input, {
      overview: "总结内容",
      decisions: [],
      actions: [],
      questions: [],
    });
    const folder = (await f.service.get(scope, m.id)).workspace!.folder!;
    assert.match(f.files.get(`${folder}/summary.md`)!.toString(), /总结内容/);
    assert.match(
      f.files.get(`${folder}/transcript.md`)!.toString(),
      /确认方案/
    );
    assert.ok(f.files.has(`${folder}/history/summary-1.md`));
    const original = f.files.get(`${folder}/history/summary-1.md`)!.toString();
    await f.store.update(scope, m.id, (draft) => {
      draft.summaryMarkdown = "# 人工编辑";
    });
    assert.equal(f.files.get(`${folder}/summary.md`)!.toString(), "# 人工编辑");
    assert.equal(
      f.files.get(`${folder}/history/summary-1.md`)!.toString(),
      original
    );
    f.files.set(`${folder}/summary.md`, Buffer.from("Separate workspace edit"));
    await f.store.update(scope, m.id, (draft) => {
      draft.summaryMarkdown = "# 新的协作版本";
    });
    assert.equal(
      (await f.store.read(scope, m.id)).workspace?.errorCode,
      "workspace_file_conflict"
    );
    assert.equal(
      f.files.get(`${folder}/summary.md`)!.toString(),
      "Separate workspace edit"
    );
    assert.match(
      await readFile(
        join(f.store.directory(scope, m.id), "meeting.json"),
        "utf8"
      ),
      /新的协作版本/
    );
    f.files.delete(`${folder}/summary.md`);
    await f.store.reconcile(scope, m.id, true);
    assert.equal(
      f.files.get(`${folder}/summary.md`)!.toString(),
      "# 新的协作版本"
    );
    const extra = `${folder}/user-added.md`;
    f.files.set(extra, Buffer.from("User file"));
    await f.service.remove(scope, m.id);
    assert.deepEqual([...f.files.keys()], [extra]);
    await assert.rejects(f.service.get(scope, m.id), /meeting_not_found/);
  } finally {
    await f.dispose();
  }
});
