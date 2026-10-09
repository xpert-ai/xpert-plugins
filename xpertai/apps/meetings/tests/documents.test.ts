import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import type {
  PluginContext,
  CollaborationProviderContext,
} from "@xpert-ai/plugin-sdk";
import {
  MeetingDocuments,
  MeetingDocumentProvider,
  DOCUMENT_PROVIDER,
} from "../src/documents.js";
import {
  documentFromMarkdown,
  documentMarkdown,
} from "../src/document-markdown.js";
import { Meetings } from "../src/meetings.js";
import { configSchema } from "../src/config.js";
import { type Scope } from "../src/domain.js";

const scope: Scope = {
  tenantId: "tenant",
  organizationId: "org",
  userId: "alice",
  assistantId: "assistant",
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "meetings-docs-"));
  const config = configSchema.parse({ dataDirectory: root });
  const documents = new MeetingDocuments({ config } as PluginContext<
    typeof config
  >);
  const service = new Meetings(documents.store, async () => {});
  const input = {
    id: randomUUID(),
    sessionId: randomUUID(),
    title: "Collaboration test",
  };
  await service.create(scope, input);
  const provider = new MeetingDocumentProvider(documents);
  const context: CollaborationProviderContext = {
    ...scope,
    xpertId: scope.assistantId,
    providerKey: DOCUMENT_PROVIDER,
    resourceId: `${input.id}:notes`,
    operation: "initialize",
  };
  return {
    documents,
    provider,
    service,
    input,
    context,
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
const encoded = (doc: Y.Doc) =>
  Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
test("Markdown and Tiptap Yjs documents preserve structured content, reject unsafe links", () => {
  const source =
    "# Heading\n\nA **bold** and *italic* note.\n\n- one\n- two\n\n> quoted\n\n[link](https://example.com)";
  const doc = documentFromMarkdown(source);
  const output = documentMarkdown(doc);
  assert.match(output, /# Heading/);
  assert.match(output, /\*\*bold\*\*/);
  assert.match(output, /- two/);
  assert.match(output, /> quoted/);
  assert.equal(documentMarkdown(documentFromMarkdown(output)), output);
  assert.throws(() => documentFromMarkdown("[bad](javascript:alert)"));
  doc.destroy();
});
test("migration is idempotent, scoped, blocks legacy writes and projects newest sequence into Markdown files", async () => {
  const f = await fixture();
  try {
    await f.service.notes(scope, {
      meetingId: f.input.id,
      expectedRevision: 0,
      notes: "# Private\n\nOriginal.",
    });
    assert.equal(await f.provider.authorize(f.context), true);
    for (const patch of [
      { tenantId: "other" },
      { organizationId: "other" },
      { userId: "bob" },
      { resourceId: `${f.input.id}:unknown` },
    ])
      assert.equal(
        await f.provider.authorize({ ...f.context, ...patch }),
        false
      );
    const initial = await f.provider.initializeDocument(f.context);
    assert.deepEqual(await f.provider.initializeDocument(f.context), initial);
    await assert.rejects(
      f.service.notes(scope, {
        meetingId: f.input.id,
        expectedRevision: 1,
        notes: "stale",
      }),
      /collaborative_document_required/
    );
    const id = randomUUID(),
      doc = documentFromMarkdown("# Human edited\n\n**Shared** draft.");
    await f.documents.project(scope, f.input.id, "notes", id, 10, encoded(doc));
    await f.documents.project(
      scope,
      f.input.id,
      "notes",
      id,
      9,
      initial.stateBase64
    );
    const before = await f.documents.store.read(scope, f.input.id);
    await f.documents.project(scope, f.input.id, "notes", id, 10, encoded(doc));
    const after = await f.documents.store.read(scope, f.input.id);
    assert.equal(before.notesRevision, after.notesRevision);
    assert.equal(before.revision, after.revision);
    assert.match(after.notes, /Human edited/);
    assert.equal(after.summaryVersion, 0);
    const path = join(
      f.documents.store.directory(scope, f.input.id),
      "notes.md"
    );
    assert.equal(await readFile(path, "utf8"), after.notes);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.match(
      (await f.service.export(scope, f.input.id)).content,
      /Human edited/
    );
    await f.service.remove(scope, f.input.id);
    assert.equal(await f.provider.authorize(f.context), false);
    await assert.rejects(
      f.documents.project(scope, f.input.id, "notes", id, 11, encoded(doc)),
      /meeting_not_found/
    );
    doc.destroy();
  } finally {
    await f.dispose();
  }
});
test("two Tiptap clients converge for concurrent same-paragraph edits and reconnect deltas", () => {
  const initial = documentFromMarkdown("Original."),
    a = new Y.Doc(),
    b = new Y.Doc();
  Y.applyUpdate(a, Y.encodeStateAsUpdate(initial));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(initial));
  const text = (doc: Y.Doc) =>
    (doc.getXmlFragment("body").get(0) as Y.XmlElement).get(0) as Y.XmlText;
  const vector = Y.encodeStateVector(a);
  text(a).insert(0, "Alice: ");
  text(b).insert(0, "Bob: ");
  const au = Y.encodeStateAsUpdate(a, vector),
    bu = Y.encodeStateAsUpdate(b, vector);
  Y.applyUpdate(a, bu);
  Y.applyUpdate(b, au);
  Y.applyUpdate(b, au);
  assert.equal(documentMarkdown(a), documentMarkdown(b));
  assert.match(documentMarkdown(a), /Alice:/);
  assert.match(documentMarkdown(a), /Bob:/);
  const beforeDisconnect = Y.encodeStateVector(b);
  text(a).insert(text(a).length, " Reconnected.");
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, beforeDisconnect));
  assert.equal(documentMarkdown(a), documentMarkdown(b));
  initial.destroy();
  a.destroy();
  b.destroy();
});
