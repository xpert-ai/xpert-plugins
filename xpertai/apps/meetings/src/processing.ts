import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { FileStore } from "./file-store.js";
import { Transcription, type TranscriptionEngine } from "./transcription.js";
import { MeetingError, type Meeting, type Scope } from "./domain.js";

export interface SummaryWorkflow {
  live(input: Meeting): Promise<void>;
  finish(input: Meeting, liveTranscript: Meeting["transcript"]): Promise<void>;
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
    const directory = this.store.directory(scope, id),
      jobDirectory = join(directory, "processing");
    const initial = await this.store.read(scope, id);
    if (initial.expectedChunks || initial.processing === "ready") return;
    await mkdir(jobDirectory, { recursive: true, mode: 0o700 });
    const release = await lockfile.lock(jobDirectory, {
      stale: 180000,
      update: 10000,
      retries: 0,
    });
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
      await this.workflow.live(await this.store.read(scope, id));
      await this.store.update(scope, id, (m) => {
        m.liveTranscription = { status: "listening", errorCode: null };
      });
    } catch (error) {
      try {
        await this.store.update(scope, id, (m) => {
          m.liveTranscription = {
            status: "retrying",
            errorCode: "live_transcription_failed",
          };
        });
      } catch {
        /* Preserve deletion. */
      }
      throw error;
    } finally {
      await release();
    }
  }
  async run(scope: Scope, id: string) {
    const directory = this.store.directory(scope, id),
      jobDirectory = join(directory, "processing");
    await this.store.read(scope, id);
    await mkdir(jobDirectory, { recursive: true, mode: 0o700 });
    const release = await lockfile.lock(jobDirectory, {
      stale: 180000,
      update: 10000,
      retries: { retries: 130, minTimeout: 1000, maxTimeout: 1000 },
    });
    try {
      let m = await this.store.read(scope, id);
      if (m.processing === "ready") {
        await rm(join(directory, "audio"), { recursive: true, force: true });
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
      if (JSON.stringify(input.transcript).length + input.notes.length > 250000)
        throw new MeetingError("summary_input_too_large");
      await this.workflow.finish(input, liveTranscript);
    } catch (error) {
      try {
        await this.store.update(scope, id, (m) => {
          if (m.processing !== "ready") {
            m.processing = "failed";
            m.errorCode =
              error instanceof MeetingError ? error.code : "processing_failed";
          }
        });
      } catch {
        /* A deletion keeps its tombstone; never recreate it. */
      }
      throw error;
    } finally {
      await release();
    }
  }
}
