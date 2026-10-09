import { z } from "zod/v3";
import { segmentSchema, summarySchema } from "./domain.js";

export const snapshotSchema = z
  .object({
    title: z.string(),
    date: z.string(),
    notes: z.string(),
    notesRevision: z.number(),
    notesDocumentSequence: z.number().nullable(),
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
