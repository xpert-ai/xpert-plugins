import { z } from "zod/v3";
import { idSchema, trackSchema, finishSchema, chunkSchema } from "./domain.js";

// Validates the public Desktop audio-capture v1 wire contract at the plugin boundary.
// The context belongs to this plugin; Desktop must treat it as opaque JSON.
export const captureCommands = [
  "desktop.audio.capture.start",
  "desktop.audio.capture.stop",
  "desktop.audio.capture.state",
  "desktop.audio.capture.retry",
  "browser.audio.capture.start",
  "browser.audio.capture.stop",
  "browser.audio.capture.state",
  "browser.audio.capture.retry",
] as const;
export const captureContextSchema = z
  .object({
    meetingId: idSchema,
    title: z.string().trim().min(1).max(200),
  })
  .strict();
const envelope = z.object({
  version: z.literal(1),
  captureId: idSchema,
  context: captureContextSchema,
});
const eventEnvelope = envelope.extend({ eventId: z.string().min(1).max(100) });
export const captureEventSchema = z
  .discriminatedUnion("event", [
    eventEnvelope
      .extend({
        event: z.literal("created"),
        createdAt: z.number().int().nonnegative().max(8640000000000000),
        tracks: z
          .array(trackSchema)
          .min(1).max(2)
          .refine((tracks) => new Set(tracks).size === tracks.length),
      })
      .strict(),
    eventEnvelope
      .extend({
        event: z.literal("started"),
        startedAt: z.number().int().nonnegative().max(8640000000000000),
      })
      .strict(),
    eventEnvelope
      .extend({
        event: z.literal("stopped"),
        durationMs: finishSchema.shape.durationMs,
        reason: finishSchema.shape.reason,
        chunks: finishSchema.shape.chunks,
        errorCode: z.string().max(120).nullable(),
      })
      .strict(),
  ])
  .refine((input) => input.eventId === `${input.captureId}:${input.event}`);
export const captureChunkSchema = envelope
  .extend({
    track: trackSchema,
    sequence: z.number().int().min(0).max(4999),
    startMs: z.number().min(0).max(14400000),
    endMs: z.number().positive().max(14400000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine(
    (chunk) =>
      chunkSchema.safeParse({
        meetingId: chunk.context.meetingId,
        sessionId: chunk.captureId,
        track: chunk.track,
        sequence: chunk.sequence,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        sha256: chunk.sha256,
      }).success
  );
export type CaptureEvent = z.infer<typeof captureEventSchema>;
export type CaptureChunk = z.infer<typeof captureChunkSchema>;
export const captureStateSchema = z.object({
  runtime: z.enum(["desktop", "browser"]).optional(),
  tracks: z.array(trackSchema).optional(),
  supported: z.boolean(),
  status: z.enum(["idle", "starting", "recording", "uploading", "pending"]),
  captureId: idSchema.optional(),
  elapsedMs: z.number().nonnegative(),
  microphone: z.number(),
  system: z.number(),
  pendingCount: z.number().int().nonnegative(),
  errorCode: z.string().nullable().optional(),
});
export function captureStartPayload(meetingId: string, title: string) {
  return {
    delivery: {
      eventAction: "capture.event",
      chunkAction: "capture.chunk",
      context: captureContextSchema.parse({ meetingId, title }),
    },
  };
}
