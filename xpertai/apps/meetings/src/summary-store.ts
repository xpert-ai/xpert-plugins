import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { FileStore, atomicWrite, sha256 } from "./file-store.js";
import { summaryMarkdown } from "./document-markdown.js";
import {
  summarySchema,
  MeetingError,
  type Meeting,
  type Scope,
  type Summary,
} from "./domain.js";

export function validateSummary(
  input: Pick<Meeting, "transcript">,
  summary: Summary
) {
  for (const item of [...summary.decisions, ...summary.actions]) {
    const segment = input.transcript.find(
      (s) => s.id === item.evidence.segmentId
    );
    if (!segment || !segment.text.includes(item.evidence.quote))
      throw new MeetingError("invalid_evidence");
  }
  if (
    new Set(summary.actions.map((item) => item.id)).size !==
    summary.actions.length
  )
    throw new MeetingError("invalid_evidence");
  for (const item of summary.actions)
    if (item.owner && !item.evidence.quote.includes(item.owner))
      throw new MeetingError("invalid_evidence");
}
export async function saveSummary(
  store: FileStore,
  scope: Scope,
  id: string,
  input: Meeting,
  value: Summary,
  operationId?: string
) {
  const summary = summarySchema.parse(value);
  validateSummary(input, summary);
  await store.update(scope, id, async (m, dir) => {
    const operation = operationId
      ? m.assistant.operations.find((o) => o.id === operationId)
      : undefined;
    if (operationId && (!operation || operation.kind !== "final"))
      throw new MeetingError("summary_operation_mismatch");
    if (operation?.status === "ready") {
      const prior = await readFile(
        join(dir, "assistant", `${operation.id}.output.json`),
        "utf8"
      );
      if (sha256(prior) !== sha256(JSON.stringify(summary)))
        throw new MeetingError("summary_already_submitted");
      return;
    }
    if (operation?.status === "failed")
      throw new MeetingError("summary_operation_closed");
    if (operation) {
      await atomicWrite(
        join(dir, "assistant", `${operation.id}.output.json`),
        JSON.stringify(summary)
      );
      operation.status = "ready";
    }
    m.summaryVersion++;
    m.summary = summary;
    m.notesInputRevision = input.notesRevision;
    m.processing = "ready";
    m.liveTranscription = { status: "complete", errorCode: null };
    if (!m.documents.summary)
      m.summaryMarkdown = summaryMarkdown(m.title, summary);
    m.errorCode = null;
    await mkdir(join(dir, "summaries"), { recursive: true, mode: 0o700 });
    await atomicWrite(
      join(dir, "summaries", `${m.summaryVersion}.json`),
      JSON.stringify({
        summary,
        notesRevision: input.notesRevision,
        notesDocumentSequence: input.documents.notes?.sequence ?? null,
        notesSha256: sha256(input.notes),
        transcriptSha256: sha256(JSON.stringify(input.transcript)),
      })
    );
    await atomicWrite(
      join(dir, "summaries", `${m.summaryVersion}.md`),
      summaryMarkdown(m.title, summary)
    );
    await atomicWrite(
      join(dir, "transcript.json"),
      JSON.stringify(m.transcript)
    );
    await atomicWrite(join(dir, "summary.md"), m.summaryMarkdown);
  });

  await rm(join(store.directory(scope, id), "audio"), {
    recursive: true,
    force: true,
  });
}
