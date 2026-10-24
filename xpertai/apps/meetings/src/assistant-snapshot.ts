import { createHash } from "node:crypto";
import { z } from "zod/v3";
import {
  MeetingError,
  type Meeting,
  type Scope,
  segmentSchema,
  summarySchema,
} from "./domain.js";

export const snapshotSchema = z
  .object({
    title: z.string(),
    date: z.string(),
    notes: z.string(),
    notesRevision: z.number(),
    notesDocumentSequence: z.number().nullable(),
    // Optional only to read old snapshots; an unversioned task cannot publish a new result.
    inputVersion: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    transcript: z.array(segmentSchema),
    quoted: z.array(segmentSchema),
    prompt: z.string(),
  })
  .strict();
export type SummarySnapshot = z.infer<typeof snapshotSchema>;

/** Evidence text is copied by the server, never entrusted to the model's reproduction. */
export function evidenceCatalog(segments: SummarySnapshot["transcript"]) {
  return segments.flatMap((s) => {
    const items: {
      id: string;
      segmentId: string;
      quote: string;
      startMs: number;
      endMs: number;
    }[] = [];
    for (let offset = 0; offset < s.text.length; offset += 1500) {
      const quote = s.text.slice(offset, offset + 1500);
      if (quote.trim())
        items.push({
          id: `${s.id}:${offset}`,
          segmentId: s.id,
          quote,
          startMs: s.startMs,
          endMs: s.endMs,
        });
    }
    return items;
  });
}
const reference = z
  .string()
  .min(1)
  .max(160)
  .describe(
    "Exact evidence id from meetings_summary_context; the server supplies its source quote."
  );
export const submissionSchema = z
  .object({
    overview: summarySchema.shape.overview,
    decisions: z
      .array(
        z
          .object({ text: z.string().min(1).max(2000), evidenceId: reference })
          .strict()
      )
      .max(100),
    actions: z
      .array(
        z
          .object({
            text: z.string().min(1).max(2000),
            owner: z
              .string()
              .max(200)
              .nullable()
              .describe(
                "Exact name appearing in the selected evidence quote, otherwise null. If an action spans chunks, choose the quote containing the owner name."
              ),
            dueDate: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .nullable(),
            evidenceId: reference,
          })
          .strict()
      )
      .max(100),
    questions: summarySchema.shape.questions,
  })
  .strict();
export type SummarySubmission = z.infer<typeof submissionSchema>;

/** Only semantic inputs/output baselines participate; queue and projection status do not. */
export function summaryInputVersion(
  m: Meeting,
  transcript: Meeting["transcript"]
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: m.title,
        date: m.createdAt,
        sessionId: m.sessionId,
        notes: m.notes,
        notesRevision: m.notesRevision,
        notesDocument: m.documents.notes,
        transcript,
        summaryVersion: m.summaryVersion,
        summary: m.summary,
        summaryMarkdown: m.summaryMarkdown,
        summaryDocument: m.documents.summary,
      })
    )
    .digest("hex");
}

/** Called inside the meeting manifest lock, immediately before publishing an operation's output. */
export function assertSummaryCommit(
  current: Meeting,
  scope: Scope,
  expected: Meeting["assistant"]["operations"][number],
  input: SummarySnapshot
) {
  const active = current.assistant.operations.find((o) => o.id === expected.id);
  if (
    !active ||
    active.executionId !== expected.executionId ||
    active.userId !== scope.userId ||
    active.kind !== expected.kind ||
    active.conversationId !== expected.conversationId
  )
    throw new MeetingError("summary_operation_mismatch");
  if (
    active.status === "failed" ||
    (active.settled && active.status !== "ready")
  )
    throw new MeetingError("summary_operation_closed");
  if (
    active.kind === "final" &&
    current.assistant.operations.filter((o) => o.kind === "final").at(-1)
      ?.id !== active.id
  )
    throw new MeetingError("summary_operation_closed");
  // A committed retry only checks the output digest; it never republishes shared state.
  if (active.status === "ready") return active;
  const transcript =
    active.kind === "final"
      ? current.transcript
      : input.transcript.map((segment) =>
          current.transcript.find((s) => s.id === segment.id)
        );
  if (
    !input.inputVersion ||
    transcript.some((segment) => !segment) ||
    summaryInputVersion(
      current,
      transcript.filter((s): s is Meeting["transcript"][number] => !!s)
    ) !== input.inputVersion
  )
    throw new MeetingError("summary_input_conflict");
  return active;
}
