import { rm, join } from "./workspace-storage.js";
import { FileStore } from "./file-store.js";
import { Transcription, type TranscriptionEngine } from "./transcription.js";
import { MeetingError, type Meeting, type Scope } from "./domain.js";

// Stable codes returned by the host SpeechToTextService. Never persist arbitrary
// provider messages: they can contain request details or credentials.
const speechErrors = new Set([
  "speech_to_text_model_missing",
  "speech_to_text_copilot_not_found",
  "speech_to_text_transcription_empty",
]);
function processingErrorCode(error: unknown, fallback: string) {
  if (error instanceof MeetingError) return error.code;
  return error instanceof Error && speechErrors.has(error.message)
    ? error.message
    : fallback;
}

export interface SummaryWorkflow {
  live(scope: Scope, input: Meeting): Promise<void>;
  finish(
    scope: Scope,
    input: Meeting,
    liveTranscript: Meeting["transcript"]
  ): Promise<void>;
}
export class Processing {
  constructor(
    readonly store: FileStore,
    readonly models: TranscriptionEngine,
    readonly workflow: SummaryWorkflow,
    readonly documents?: { sync(scope: Scope, id: string): Promise<void> },
    readonly thresholdDb = -50
  ) {}
  async live(scope: Scope, id: string) {
    const initial = await this.store.read(scope, id);
    if (initial.expectedChunks || initial.processing === "ready") return;
    return this.store.withProcessingLock(scope, id, "processing", async () => {
      try {
        if ((await this.store.read(scope, id)).expectedChunks) return;
        await this.store.update(scope, id, (m) => {
          m.liveTranscription = { status: "transcribing", errorCode: null };
        });
        await new Transcription(
          this.store,
          this.models,
          this.thresholdDb
        ).available(scope, id, null);
        await this.workflow.live(scope, await this.store.read(scope, id));
        await this.store.update(scope, id, (m) => {
          m.liveTranscription = { status: "listening", errorCode: null };
        });
      } catch (error) {
        try {
          await this.store.update(scope, id, (m) => {
            m.liveTranscription = {
              status: "retrying",
              errorCode: processingErrorCode(
                error,
                "live_transcription_failed"
              ),
            };
          });
        } catch {
          /* Preserve deletion. */
        }
        throw error;
      }
    });
  }
  async run(scope: Scope, id: string) {
    const directory = this.store.directory(scope, id);
    await this.store.read(scope, id);
    return this.store.withProcessingLock(
      scope,
      id,
      "processing",
      async () => {
        try {
          let m = await this.store.read(scope, id);
          if (m.processing === "ready") {
            await rm(join(directory, "audio"), {
              recursive: true,
              force: true,
            });
            return;
          }
          if (!m.expectedChunks?.microphone || !m.expectedChunks.system)
            throw new MeetingError("audio_source_missing");
          const expectedChunks = m.expectedChunks;
          // Drain original live-sized checkpoints before context refinement so the unsent tail is exact.
          await new Transcription(
            this.store,
            this.models,
            this.thresholdDb
          ).available(scope, id, null, true);
          const liveTranscript = (await this.store.read(scope, id)).transcript;
          await this.store.update(scope, id, (m) => {
            m.processing = "transcribing";
            m.errorCode = null;
          });
          await new Transcription(
            this.store,
            this.models,
            this.thresholdDb
          ).available(scope, id, expectedChunks);
          await this.documents?.sync(scope, id);
          const input = await this.store.update(scope, id, (m) => {
            m.processing = "summarizing";
            m.transcript.sort(
              (a, b) => a.startMs - b.startMs || a.track.localeCompare(b.track)
            );
          });
          if (!input.transcript.some((s) => s.text))
            throw new MeetingError("transcript_empty");
          if (
            JSON.stringify(input.transcript).length + input.notes.length >
            250000
          )
            throw new MeetingError("summary_input_too_large");
          await this.workflow.finish(scope, input, liveTranscript);
        } catch (error) {
          try {
            await this.store.update(scope, id, (m) => {
              if (m.processing !== "ready") {
                m.processing = "failed";
                m.errorCode = processingErrorCode(error, "processing_failed");
              }
            });
          } catch {
            /* A deletion keeps its tombstone; never recreate it. */
          }
          throw error;
        }
      },
      130000
    );
  }
}
