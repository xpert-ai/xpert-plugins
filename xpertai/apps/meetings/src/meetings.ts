import { mkdir, readFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod/v3";
import { FileStore, atomicWrite, sha256 } from "./file-store.js";
import { summaryMarkdown } from "./document-markdown.js";
import { pcmFromWav, SAMPLE_RATE } from "./audio.js";
import {
  createSchema,
  notesSchema,
  finishSchema,
  chunkSchema,
  MeetingError,
  publicMeeting,
  type Scope,
  type Meeting,
  type Chunk,
} from "./domain.js";

export class Meetings {
  constructor(
    readonly store: FileStore,
    readonly enqueue: (
      scope: Scope,
      id: string,
      chunk?: Pick<Chunk, "track" | "sequence">
    ) => Promise<void>,
    readonly failedAudioRetentionDays = 7,
    readonly silenceSeconds = 10
  ) {}
  async expireAudio(scope: Scope) {
    for (const record of await this.store.list(scope)) {
      if (
        record.processing === "ready" ||
        record.errorCode === "audio_expired" ||
        Date.now() - Date.parse(record.updatedAt) <
          this.failedAudioRetentionDays * 86400000
      )
        continue;
      await this.store.update(scope, record.id, async (m, directory) => {
        if (
          Date.now() - Date.parse(m.updatedAt) <
          this.failedAudioRetentionDays * 86400000
        )
          return;
        await rm(join(directory, "audio"), { recursive: true, force: true });
        m.capture = "interrupted";
        m.processing = "failed";
        m.errorCode = "audio_expired";
      });
    }
  }
  async create(scope: Scope, input: z.infer<typeof createSchema>) {
    return this.store.locked(scope, input.id, async (directory) => {
      try {
        const found = await this.store.read(scope, input.id, true);
        if (found.deleted || found.sessionId !== input.sessionId)
          throw new MeetingError("idempotency_conflict");
        return publicMeeting(found);
      } catch (error) {
        if (
          !(error instanceof MeetingError && error.code === "meeting_not_found")
        )
          throw error;
      }
      const now = new Date().toISOString();
      const meeting: Meeting = {
        schemaVersion: 1,
        id: input.id,
        scope,
        sessionId: input.sessionId,
        title: input.title,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        endedAt: null,
        revision: 1,
        notesRevision: 0,
        notes: "",
        summaryMarkdown: "",
        documents: { notes: null, summary: null },
        assistant: {
          conversationId: null,
          threadId: null,
          submittedUntilMs: 0,
          silenceSeconds: this.silenceSeconds,
          operations: [],
        },
        liveTranscription: { status: "listening", errorCode: null },
        tracks: input.tracks ?? ["microphone", "system"],
        capture: "created",
        stopReason: null,
        processing: "not_started",
        errorCode: null,
        durationMs: 0,
        expectedChunks: null,
        transcript: [],
        summary: null,
        summaryVersion: 0,
        notesInputRevision: null,
        deleted: false,
      };
      await this.store.save(directory, meeting);
      return publicMeeting(meeting);
    });
  }
  async start(
    scope: Scope,
    id: string,
    sessionId: string,
    startedAt = new Date().toISOString()
  ) {
    const record = await this.store.update(scope, id, (m) => {
      if (
        m.sessionId !== sessionId ||
        !["created", "recording"].includes(m.capture)
      )
        throw new MeetingError("session_mismatch");
      m.startedAt ??= startedAt;
      m.capture = "recording";
    });
    return { id, revision: record.revision };
  }
  async list(
    scope: Scope,
    query: {
      page?: number;
      pageSize?: number;
      search?: string;
      from?: string;
      to?: string;
    } = {}
  ) {
    await this.expireAudio(scope);
    const page = Math.max(1, query.page ?? 1),
      pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const search = query.search?.toLocaleLowerCase().trim() ?? "";
    const records = (await this.store.list(scope)).filter(
      (m) =>
        (!query.from || m.createdAt >= query.from) &&
        (!query.to || m.createdAt < query.to) &&
        (!search ||
          [
            m.title,
            m.notes,
            m.summaryMarkdown,
            m.summary?.overview ?? "",
            ...m.transcript.map((s) => s.text),
          ]
            .join("\n")
            .toLocaleLowerCase()
            .includes(search))
    );
    const visible = records.slice((page - 1) * pageSize, page * pageSize);
    return {
      items: visible.map((m) => ({
        id: m.id,
        title: m.title,
        createdAt: m.createdAt,
        startedAt: m.startedAt,
        durationMs: m.durationMs,
        capture: m.capture,
        processing: m.processing,
        errorCode: m.errorCode,
        preview: m.summary?.overview.slice(0, 140) ?? "",
      })),
      page,
      pageSize,
      total: records.length,
    };
  }
  async get(scope: Scope, id: string) {
    const meeting = await this.store.read(scope, id);
    if (meeting.deleted) throw new MeetingError("meeting_not_found");
    return publicMeeting(meeting);
  }
  async notes(scope: Scope, input: z.infer<typeof notesSchema>) {
    const m = await this.store.update(
      scope,
      input.meetingId,
      async (m, dir) => {
        const migrating = await access(
          join(dir, "documents", "notes.initial.json")
        ).then(
          () => true,
          () => false
        );
        if (m.documents.notes || migrating)
          throw new MeetingError("collaborative_document_required");
        if (m.notesRevision !== input.expectedRevision)
          throw new MeetingError("revision_conflict");
        m.notes = input.notes;
        m.notesRevision++;
        // Derived Markdown is repairable; meeting.json commits the text and its revision together.
        await atomicWrite(join(dir, "notes.md"), m.notes);
      }
    );
    return { revision: m.notesRevision, updatedAt: m.updatedAt };
  }
  async upload(scope: Scope, chunk: Chunk, bytes: Buffer) {
    if (sha256(bytes) !== chunk.sha256)
      throw new MeetingError("checksum_mismatch");
    const pcm = pcmFromWav(bytes);
    if (
      Math.abs(
        (pcm.length / (SAMPLE_RATE * 2)) * 1000 - (chunk.endMs - chunk.startMs)
      ) > 100
    )
      throw new MeetingError("audio_duration_mismatch");
    const result = await this.store.locked(
      scope,
      chunk.meetingId,
      async (directory) => {
        const meeting = await this.store.read(scope, chunk.meetingId);
        if (meeting.sessionId !== chunk.sessionId)
          throw new MeetingError("session_mismatch");
        const path = join(directory, "audio", chunk.track);
        await mkdir(path, { recursive: true, mode: 0o700 });
        const meta = join(path, `${chunk.sequence}.json`),
          audio = join(path, `${chunk.sequence}.wav`);
        try {
          const previous = chunkSchema.parse(
            JSON.parse(await readFile(meta, "utf8"))
          );
          if (JSON.stringify(previous) !== JSON.stringify(chunk))
            throw new MeetingError("chunk_conflict");
          return {
            sequence: chunk.sequence,
            sha256: chunk.sha256,
            reused: true,
          };
        } catch (error) {
          if (
            !(
              error instanceof Error &&
              "code" in error &&
              error.code === "ENOENT"
            )
          )
            throw error;
        }
        if (meeting.expectedChunks || meeting.processing !== "not_started")
          throw new MeetingError("capture_sealed");
        await atomicWrite(audio, bytes);
        await atomicWrite(meta, JSON.stringify(chunk));
        return {
          sequence: chunk.sequence,
          sha256: chunk.sha256,
          reused: false,
        };
      }
    );
    // Persist first. An enqueue failure makes the idempotent upload retry schedule it again.
    await this.enqueue(scope, chunk.meetingId, {
      track: chunk.track,
      sequence: chunk.sequence,
    });
    return result;
  }
  async finish(scope: Scope, input: z.infer<typeof finishSchema>) {
    const m = await this.store.update(
      scope,
      input.meetingId,
      async (m, directory) => {
        if (m.sessionId !== input.sessionId)
          throw new MeetingError("session_mismatch");
        if (m.expectedChunks) {
          if (
            JSON.stringify(m.expectedChunks) !== JSON.stringify(input.chunks) ||
            m.durationMs !== input.durationMs
          )
            throw new MeetingError("capture_sealed");
          return;
        }
        for (const track of ["microphone", "system"] as const) {
          for (let sequence = 0; sequence < input.chunks[track]; sequence++) {
            try {
              await access(join(directory, "audio", track, `${sequence}.json`));
            } catch {
              throw new MeetingError("chunks_missing");
            }
          }
        }
        m.expectedChunks = input.chunks;
        m.durationMs = input.durationMs;
        m.endedAt = new Date().toISOString();
        m.stopReason = input.reason;
        m.capture =
          input.reason === "user" || input.reason === "limit"
            ? "stopped"
            : "interrupted";
        m.processing =
          input.chunks.microphone && input.chunks.system ? "queued" : "failed";
        m.errorCode = m.processing === "failed" ? "audio_source_missing" : null;
      }
    );
    if (m.processing === "queued") await this.enqueue(scope, m.id);
    return { id: m.id, processing: m.processing };
  }
  async retry(scope: Scope, id: string) {
    await this.store.update(scope, id, (m) => {
      if (m.errorCode === "audio_expired")
        throw new MeetingError("audio_expired");
      if (!m.expectedChunks?.microphone || !m.expectedChunks.system)
        throw new MeetingError("audio_source_missing");
      if (m.processing === "ready") throw new MeetingError("already_ready");
      m.processing = "queued";
      m.errorCode = null;
    });
    await this.enqueue(scope, id);
    return { id, processing: "queued" };
  }
  async edit(
    scope: Scope,
    input: {
      meetingId: string;
      expectedRevision: number;
      title?: string;
      actions?: NonNullable<Meeting["summary"]>["actions"];
    }
  ) {
    const m = await this.store.update(scope, input.meetingId, (m) => {
      if (m.revision !== input.expectedRevision)
        throw new MeetingError("revision_conflict");
      if (input.title) m.title = input.title;
      if (input.actions) {
        if (m.documents.summary)
          throw new MeetingError("collaborative_document_required");
        if (!m.summary) throw new MeetingError("summary_missing");
        for (const action of input.actions)
          if (
            !m.transcript.some(
              (s) =>
                s.id === action.evidence.segmentId &&
                s.text.includes(action.evidence.quote)
            )
          )
            throw new MeetingError("invalid_evidence");
        m.summary.actions = input.actions;
      }
    });
    return { revision: m.revision };
  }
  async remove(scope: Scope, id: string) {
    await this.store.locked(scope, id, async (directory) => {
      const m = await this.store.read(scope, id, true);
      m.deleted = true;
      m.notes = "";
      m.transcript = [];
      m.summary = null;
      m.summaryMarkdown = "";
      m.errorCode = null;
      m.title = "Deleted meeting";
      m.revision++;
      m.updatedAt = new Date().toISOString();
      await this.store.save(directory, m); // Tombstone precedes cleanup and is never removed.
      if (m.workspace?.status === "failed")
        throw new MeetingError(
          m.workspace.errorCode ?? "workspace_sync_failed"
        );
      for (const name of [
        "audio",
        "summaries",
        "assistant",
        "notes.md",
        "summary.md",
        "documents",
        "transcript.json",
      ])
        await rm(join(directory, name), { recursive: true, force: true });
    });
    return { id, deleted: true };
  }
  async export(scope: Scope, id: string, includeTranscript = false) {
    const m = await this.store.read(scope, id);
    const lines = [
      m.summaryMarkdown ||
        (m.summary ? summaryMarkdown(m.title, m.summary) : `# ${m.title}`),
      "",
      m.createdAt,
      "",
      "## Personal notes",
      "",
      m.notes,
    ];
    if (includeTranscript)
      lines.push(
        "",
        "## Transcript",
        ...m.transcript.map(
          (s) => `\n[${s.id} ${s.startMs}–${s.endMs} ms] ${s.text}`
        )
      );
    const content = lines.join("\n");
    return {
      fileName: `meeting-${m.id}.md`,
      mimeType: "text/markdown",
      content,
      sha256: sha256(content),
      documentSequences: {
        notes: m.documents.notes?.sequence ?? m.notesRevision,
        summary: m.documents.summary?.sequence ?? m.summaryVersion,
      },
    };
  }
}
