import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pcmFromWav, wav, audioActivity } from "./audio.js";
import { FileStore, sha256, atomicWrite } from "./file-store.js";
import {
  chunkSchema,
  MeetingError,
  type Scope,
  type Meeting,
} from "./domain.js";

export interface TranscriptionEngine {
  transcribe(scope: Scope, audio: Buffer): Promise<string>;
}

/** Source checkpoints are shared by live capture, reconnect recovery and finalization. */
export class Transcription {
  constructor(
    readonly store: FileStore,
    readonly engine: TranscriptionEngine,
    readonly thresholdDb = -50
  ) {}
  async available(
    scope: Scope,
    id: string,
    sealed: Meeting["expectedChunks"],
    drain = false
  ) {
    if (sealed) return this.finalize(scope, id, sealed);
    let meeting = await this.store.read(scope, id);
    const directory = this.store.directory(scope, id);
    for (const track of ["microphone", "system"] as const) {
      let sequences: number[];
      {
        try {
          sequences = (await readdir(join(directory, "audio", track)))
            .filter((name) => /^\d+\.json$/.test(name))
            .map((name) => Number(name.slice(0, -5)))
            .sort((a, b) => a - b);
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
            continue;
          throw error;
        }
      }
      for (const sequence of sequences) {
        // Hand the remaining tail to finalization as soon as recording is sealed.
        if (
          !drain &&
          !sealed &&
          (await this.store.read(scope, id)).expectedChunks
        )
          return meeting;
        const chunk = chunkSchema.parse(
          JSON.parse(
            await readFile(
              join(directory, "audio", track, `${sequence}.json`),
              "utf8"
            )
          )
        );
        if (
          chunk.meetingId !== id ||
          chunk.sessionId !== meeting.sessionId ||
          chunk.track !== track ||
          chunk.sequence !== sequence
        )
          throw new MeetingError("chunk_conflict");
        const segmentId = `${track}-${sequence}`;
        // Older recordings may have one checkpoint covering several chunks.
        if (
          meeting.transcript.some(
            (s) =>
              s.track === track &&
              (s.id === segmentId ||
                (s.startMs <= chunk.startMs && s.endMs >= chunk.endMs))
          )
        )
          continue;
        const bytes = await readFile(
          join(directory, "audio", track, `${sequence}.wav`)
        );
        if (sha256(bytes) !== chunk.sha256)
          throw new MeetingError("checksum_mismatch");
        await this.store.read(scope, id);
        const activity = audioActivity(
          pcmFromWav(bytes),
          chunk.startMs,
          this.thresholdDb
        );
        const text = activity.length
          ? (await this.engine.transcribe(meeting.scope, bytes)).trim()
          : "";
        if (text.length > 20000)
          throw new MeetingError("transcription_response_invalid");
        meeting = await this.store.update(scope, id, async (current, dir) => {
          if (!current.transcript.some((s) => s.id === segmentId))
            current.transcript.push({
              id: segmentId,
              track,
              final: false,
              startMs: chunk.startMs,
              endMs: chunk.endMs,
              text,
              activity,
            });
          current.transcript.sort(
            (a, b) => a.startMs - b.startMs || a.track.localeCompare(b.track)
          );
          await atomicWrite(
            join(dir, "transcript.json"),
            JSON.stringify(current.transcript)
          );
        });
      }
    }
    return meeting;
  }
  /** Re-recognize contiguous audio with context before creating evidence-bound summaries.
   * Short live segments are provisional; finalized checkpoints survive retries. */
  private async finalize(
    scope: Scope,
    id: string,
    counts: NonNullable<Meeting["expectedChunks"]>
  ) {
    let meeting = await this.store.read(scope, id);
    const directory = this.store.directory(scope, id);
    for (const track of ["microphone", "system"] as const) {
      let previousEnd: number | undefined;
      for (let offset = 0; offset < counts[track]; offset += 12) {
        const chunks = [];
        for (
          let sequence = offset;
          sequence < Math.min(offset + 12, counts[track]);
          sequence++
        ) {
          const chunk = chunkSchema.parse(
            JSON.parse(
              await readFile(
                join(directory, "audio", track, `${sequence}.json`),
                "utf8"
              )
            )
          );
          if (
            chunk.meetingId !== id ||
            chunk.sessionId !== meeting.sessionId ||
            chunk.track !== track ||
            chunk.sequence !== sequence
          )
            throw new MeetingError("chunk_conflict");
          if (
            previousEnd !== undefined &&
            Math.abs(previousEnd - chunk.startMs) > 100
          )
            throw new MeetingError("audio_gap");
          previousEnd = chunk.endMs;
          chunks.push(chunk);
        }
        const first = chunks[0],
          last = chunks[chunks.length - 1],
          segmentId = `${track}-${offset}`;
        const existing = meeting.transcript.find(
          (s) =>
            s.track === track &&
            s.startMs <= first.startMs &&
            s.endMs >= last.endMs
        );
        if (existing?.final) continue;
        let text = chunks.length === 1 ? existing?.text : undefined;
        if (text === undefined) {
          const pcm: Buffer[] = [];
          for (const chunk of chunks) {
            const bytes = await readFile(
              join(directory, "audio", track, `${chunk.sequence}.wav`)
            );
            if (sha256(bytes) !== chunk.sha256)
              throw new MeetingError("checksum_mismatch");
            pcm.push(pcmFromWav(bytes));
          }
          await this.store.read(scope, id);
          const combined = Buffer.concat(pcm);
          text = audioActivity(combined, first.startMs, this.thresholdDb).length
            ? (
                await this.engine.transcribe(meeting.scope, wav(combined))
              ).trim()
            : "";
        }
        if (text.length > 20000)
          throw new MeetingError("transcription_response_invalid");
        const finalText = text;
        meeting = await this.store.update(scope, id, async (current, dir) => {
          current.transcript = current.transcript.filter(
            (s) =>
              !(
                s.track === track &&
                s.startMs >= first.startMs &&
                s.endMs <= last.endMs
              )
          );
          current.transcript.push({
            id: segmentId,
            track,
            final: true,
            startMs: first.startMs,
            endMs: last.endMs,
            text: finalText,
          });
          current.transcript.sort(
            (a, b) => a.startMs - b.startMs || a.track.localeCompare(b.track)
          );
          await atomicWrite(
            join(dir, "transcript.json"),
            JSON.stringify(current.transcript)
          );
        });
      }
    }
    return meeting;
  }
}
