import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod/v3";
import { atomicWrite, sha256 } from "./file-store.js";
import { idSchema, MeetingError, type Scope } from "./domain.js";
import { Meetings } from "./meetings.js";
import {
  captureEventSchema,
  captureChunkSchema,
  type CaptureEvent,
  type CaptureChunk,
} from "./capture-contract.js";

const bindingSchema = z
  .object({
    version: z.literal(1),
    captureId: idSchema,
    meetingId: idSchema,
    contextHash: z.string().regex(/^[a-f0-9]{64}$/),
    receipts: z
      .object({
        created: z.string().optional(),
        started: z.string().optional(),
        stopped: z.string().optional(),
      })
      .strict(),
  })
  .strict();
type Binding = z.infer<typeof bindingSchema>;

/** Durable mapping and acknowledgements for Desktop's at-least-once delivery. */
export class CaptureDelivery {
  constructor(private readonly meetings: Meetings) {}
  private async read(scope: Scope, captureId: string): Promise<Binding | null> {
    const directory = this.meetings.store.captureDirectory(scope, captureId);
    try {
      const binding = bindingSchema.parse(
        JSON.parse(await readFile(join(directory, "binding.json"), "utf8"))
      );
      if (binding.captureId !== captureId)
        throw new MeetingError("capture_conflict");
      return binding;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return null;
      throw error;
    }
  }
  private verify(
    binding: Binding | null,
    input: CaptureEvent | CaptureChunk
  ): asserts binding is Binding {
    if (!binding) throw new MeetingError("capture_not_found");
    if (
      binding.meetingId !== input.context.meetingId ||
      binding.contextHash !== sha256(JSON.stringify(input.context))
    )
      throw new MeetingError("capture_conflict");
  }
  async lookup(scope: Scope, captureId: string) {
    const binding = await this.read(scope, idSchema.parse(captureId));
    if (!binding) throw new MeetingError("capture_not_found");
    const meeting = await this.meetings.store.read(scope, binding.meetingId);
    if (meeting.sessionId !== captureId)
      throw new MeetingError("capture_conflict");
    return { captureId, meetingId: binding.meetingId };
  }
  async event(scope: Scope, raw: CaptureEvent) {
    const input = captureEventSchema.parse(raw);
    return this.meetings.store.lockedCapture(
      scope,
      input.captureId,
      async (directory) => {
        let binding = await this.read(scope, input.captureId);
        if (!binding && input.event === "created") {
          binding = {
            version: 1,
            captureId: input.captureId,
            meetingId: input.context.meetingId,
            contextHash: sha256(JSON.stringify(input.context)),
            receipts: {},
          };
          // Claim the association before creating a meeting; a failed create can resume only this association.
          await atomicWrite(
            join(directory, "binding.json"),
            JSON.stringify(binding)
          );
        }
        this.verify(binding, input);
        const digest = sha256(JSON.stringify(input));
        const previous = binding.receipts[input.event];
        if (previous) {
          if (previous !== digest)
            throw new MeetingError("capture_event_conflict");
          return {
            meetingId: binding.meetingId,
            captureId: input.captureId,
            reused: true,
          };
        }
        switch (input.event) {
          case "created":
            await this.meetings.create(scope, {
              id: binding.meetingId,
              sessionId: input.captureId,
              title: input.context.title,
            });
            break;
          case "started":
            if (!binding.receipts.created || binding.receipts.stopped)
              throw new MeetingError("capture_event_order");
            await this.meetings.start(
              scope,
              binding.meetingId,
              input.captureId,
              new Date(input.startedAt).toISOString()
            );
            break;
          case "stopped":
            // Device startup can fail after created, before a started event exists.
            if (!binding.receipts.created)
              throw new MeetingError("capture_event_order");
            await this.meetings.finish(scope, {
              meetingId: binding.meetingId,
              sessionId: input.captureId,
              durationMs: input.durationMs,
              chunks: input.chunks,
              reason: input.reason,
            });
            break;
        }
        binding.receipts[input.event] = digest;
        await atomicWrite(
          join(directory, "binding.json"),
          JSON.stringify(binding)
        );
        return {
          meetingId: binding.meetingId,
          captureId: input.captureId,
          reused: false,
        };
      }
    );
  }
  async chunk(scope: Scope, raw: CaptureChunk, bytes: Buffer) {
    const input = captureChunkSchema.parse(raw);
    const binding = await this.read(scope, input.captureId);
    this.verify(binding, input);
    if (!binding.receipts.started)
      throw new MeetingError("capture_event_order");
    return this.meetings.upload(
      scope,
      {
        meetingId: binding.meetingId,
        sessionId: input.captureId,
        track: input.track,
        sequence: input.sequence,
        startMs: input.startMs,
        endMs: input.endMs,
        sha256: input.sha256,
      },
      bytes
    );
  }
}
