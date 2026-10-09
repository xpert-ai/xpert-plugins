import { z } from "zod/v3";

export const PLUGIN = "@xpert-ai/plugin-meetings";
export const FEATURE = "meetings.notes";
export const PROVIDER = "meetings.provider";
export const VIEW = "meetings.workspace";
export const CONTEXT = "MEETINGS_PLUGIN_CONTEXT";
export const QUEUE = "meetings.processing";
export const idSchema = z.string().uuid();
export const scopeSchema = z
  .object({
    tenantId: z.string().min(1).max(200),
    organizationId: z.string().min(1).max(200),
    userId: z.string().min(1).max(200),
    assistantId: z.string().min(1).max(200),
    // Supplied by the host's authorized workspace scope, never by a tool input.
    workspaceCatalog: z.enum(["xperts", "user-xperts"]).optional(),
  })
  .strict();
export type Scope = z.infer<typeof scopeSchema>;
export const trackSchema = z.enum(["microphone", "system"]);
export const activitySchema = z
  .object({
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
  })
  .strict();
export const operationSchema = z
  .object({
    id: idSchema,
    kind: z.enum(["phase", "final"]),
    status: z.enum(["queued", "running", "ready", "failed"]),
    executionId: idSchema,
    createdAt: z.string().datetime(),
    startedAt: z.string().datetime().nullable(),
    settled: z.boolean(),
    errorCode: z.string().nullable(),
    fromMs: z.number(),
    throughMs: z.number(),
  })
  .strict();
export const assistantSchema = z
  .object({
    conversationId: idSchema.nullable(),
    threadId: z.string().nullable(),
    submittedUntilMs: z.number().nonnegative(),
    silenceSeconds: z.number().min(1).max(300),
    operations: z.array(operationSchema).max(15000),
  })
  .default({
    conversationId: null,
    threadId: null,
    submittedUntilMs: 0,
    silenceSeconds: 10,
    operations: [],
  });
export const segmentSchema = z
  .object({
    id: z.string().max(100),
    track: trackSchema,
    final: z.boolean().default(true),
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    text: z.string().max(20000),
    activity: z.array(activitySchema).max(4000).optional(),
  })
  .strict();
export const evidenceSchema = z
  .object({
    segmentId: z.string().max(100),
    quote: z.string().min(1).max(2000),
  })
  .strict();
export const summarySchema = z
  .object({
    overview: z.string().max(6000),
    decisions: z
      .array(
        z
          .object({
            text: z.string().min(1).max(2000),
            evidence: evidenceSchema,
          })
          .strict()
      )
      .max(100),
    actions: z
      .array(
        z
          .object({
            id: z.string().max(100),
            text: z.string().min(1).max(2000),
            owner: z.string().max(200).nullable(),
            dueDate: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .nullable(),
            evidence: evidenceSchema,
          })
          .strict()
      )
      .max(100),
    questions: z.array(z.string().max(1000)).max(100),
  })
  .strict();
export type Summary = z.infer<typeof summarySchema>;
export const liveTranscriptionSchema = z
  .object({
    status: z
      .enum(["listening", "transcribing", "retrying", "complete"])
      .default("listening"),
    errorCode: z.string().nullable().default(null),
  })
  .default({ status: "listening", errorCode: null });
export const documentKindSchema = z.enum(["notes", "summary"]);
export type DocumentKind = z.infer<typeof documentKindSchema>;
export const documentBindingSchema = z.object({
  id: idSchema,
  sequence: z.number().int().nonnegative(),
});
export const meetingSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: idSchema,
    scope: scopeSchema,
    sessionId: idSchema,
    title: z.string().min(1).max(200),
    createdAt: z.string().datetime(),
    startedAt: z.string().datetime().nullable(),
    endedAt: z.string().datetime().nullable(),
    revision: z.number().int().positive(),
    notesRevision: z.number().int().nonnegative(),
    notes: z.string().max(100000),
    summaryMarkdown: z.string().max(100000).default(""),
    workspace: z
      .object({
        folder: z.string().nullable(),
        status: z.enum(["pending", "ready", "failed"]),
        errorCode: z.string().nullable(),
      })
      .strict()
      .nullable()
      .optional(),
    documents: z
      .object({
        notes: documentBindingSchema.nullable(),
        summary: documentBindingSchema.nullable(),
      })
      .default({ notes: null, summary: null }),
    liveTranscription: liveTranscriptionSchema,
    assistant: assistantSchema,
    capture: z.enum(["created", "recording", "stopped", "interrupted"]),
    stopReason: z.string().max(80).nullable(),
    processing: z.enum([
      "not_started",
      "queued",
      "transcribing",
      "summarizing",
      "ready",
      "failed",
    ]),
    errorCode: z.string().max(120).nullable(),
    durationMs: z.number().nonnegative().max(14400000),
    expectedChunks: z
      .object({
        microphone: z.number().int().min(0).max(5000),
        system: z.number().int().min(0).max(5000),
      })
      .nullable(),
    transcript: z.array(segmentSchema).max(10000),
    summary: summarySchema.nullable(),
    summaryVersion: z.number().int().nonnegative(),
    notesInputRevision: z.number().int().nonnegative().nullable(),
    deleted: z.boolean(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type Meeting = z.infer<typeof meetingSchema>;
export const chunkSchema = z
  .object({
    meetingId: idSchema,
    sessionId: idSchema,
    track: trackSchema,
    sequence: z.number().int().min(0).max(4999),
    startMs: z.number().min(0).max(14400000),
    endMs: z.number().positive().max(14400000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine((v) => v.endMs > v.startMs && v.endMs - v.startMs <= 6000);
export type Chunk = z.infer<typeof chunkSchema>;
export const createSchema = z
  .object({
    id: idSchema,
    sessionId: idSchema,
    title: z.string().trim().min(1).max(200),
  })
  .strict();
export const notesSchema = z
  .object({
    meetingId: idSchema,
    notes: z.string().max(100000),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export const finishSchema = z
  .object({
    meetingId: idSchema,
    sessionId: idSchema,
    durationMs: z.number().min(0).max(14400000),
    reason: z.enum([
      "user",
      "sleep",
      "quit",
      "scope_changed",
      "device_lost",
      "disk_error",
      "limit",
      "interrupted",
    ]),
    chunks: z
      .object({
        microphone: z.number().int().min(0).max(5000),
        system: z.number().int().min(0).max(5000),
      })
      .strict(),
  })
  .strict();
export class MeetingError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function publicMeeting(m: Meeting) {
  const { scope: _scope, deleted: _deleted, ...data } = m;
  return data;
}
export type MeetingDto = ReturnType<typeof publicMeeting>;
export function sameOwner(a: Scope, b: Scope) {
  return (
    a.tenantId === b.tenantId &&
    a.organizationId === b.organizationId &&
    a.userId === b.userId &&
    a.assistantId === b.assistantId
  );
}
