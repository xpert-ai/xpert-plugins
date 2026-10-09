import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { FileStore, sha256 } from "../src/file-store.js";
import { Meetings } from "../src/meetings.js";
import { Processing as BaseProcessing } from "../src/processing.js";
import { saveSummary } from "../src/summary-store.js";
import { type Meeting } from "../src/domain.js";
import { wav } from "../src/audio.js";
import { type Scope, type Summary } from "../src/domain.js";

class Processing extends BaseProcessing {
  constructor(
    store: FileStore,
    models: {
      transcribe(scope: Scope, audio: Buffer): Promise<string>;
      summarize(scope: Scope, input: Meeting): Promise<Summary>;
    }
  ) {
    super(store, models, {
      live: async () => {},
      finish: async (input) => {
        await saveSummary(
          store,
          input.scope,
          input.id,
          input,
          await models.summarize(input.scope, input)
        );
      },
    });
  }
}
const scope: Scope = {
  tenantId: "tenant",
  organizationId: "org",
  userId: "alice",
  assistantId: "assistant",
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "meetings-")),
    store = new FileStore(root),
    queued: string[] = [];
  const service = new Meetings(store, async (_scope, id) => {
    queued.push(id);
  });
  const input = {
    id: randomUUID(),
    sessionId: randomUUID(),
    title: "Product review",
  };
  await service.create(scope, input);
  const pcm = Buffer.alloc(240000);
  for (let i = 0; i < pcm.length / 2; i++)
    pcm.writeInt16LE(Math.round(6000 * Math.sin(i / 10)), i * 2);
  const audio = wav(pcm);
  const upload = (track: "microphone" | "system", sequence = 0) =>
    service.upload(
      scope,
      {
        meetingId: input.id,
        sessionId: input.sessionId,
        track,
        sequence,
        startMs: sequence * 5000,
        endMs: (sequence + 1) * 5000,
        sha256: sha256(audio),
      },
      audio
    );
  const finish = () =>
    service.finish(scope, {
      meetingId: input.id,
      sessionId: input.sessionId,
      durationMs: 5000,
      reason: "user",
      chunks: { microphone: 1, system: 1 },
    });
  return {
    root,
    store,
    service,
    input,
    audio,
    upload,
    finish,
    queued,
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
const code = (expected: string) => (error: unknown) =>
  error instanceof Error && error.message === expected;
const summary: Summary = {
  overview: "Ship the draft.",
  decisions: [
    {
      text: "Ship the draft",
      evidence: { segmentId: "system-0", quote: "Ship the draft" },
    },
  ],
  actions: [
    {
      id: "one",
      text: "Prepare draft",
      owner: null,
      dueDate: null,
      evidence: { segmentId: "system-0", quote: "Ship the draft" },
    },
  ],
  questions: [],
};

test("persists private notes across restart, rejects other owners and path traversal", async () => {
  const f = await fixture();
  try {
    await f.service.notes(scope, {
      meetingId: f.input.id,
      expectedRevision: 0,
      notes: "Private draft",
    });
    assert.equal(
      (await new FileStore(f.root).read(scope, f.input.id)).notes,
      "Private draft"
    );
    assert.equal(
      (await stat(join(f.store.directory(scope, f.input.id), "meeting.json")))
        .mode & 0o777,
      0o600
    );
    await assert.rejects(
      f.service.get({ ...scope, userId: "bob" }, f.input.id),
      code("meeting_not_found")
    );
    await assert.rejects(
      f.service.get({ ...scope, organizationId: "other" }, f.input.id),
      code("meeting_not_found")
    );
    assert.throws(() => f.store.directory(scope, "../../other"));
    assert.equal((await f.service.list({ ...scope, userId: "bob" })).total, 0);
  } finally {
    await f.dispose();
  }
});
test("one concurrent writer wins the notes revision, background metadata does not cause a false conflict", async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled(
      ["A", "B"].map((notes) =>
        f.service.notes(scope, {
          meetingId: f.input.id,
          expectedRevision: 0,
          notes,
        })
      )
    );
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1
    );
    assert.equal(
      results.filter((result) => result.status === "rejected").length,
      1
    );
    await f.service.start(scope, f.input.id, f.input.sessionId);
    await f.service.notes(scope, {
      meetingId: f.input.id,
      expectedRevision: 1,
      notes: "Latest",
    });
    assert.equal((await f.service.get(scope, f.input.id)).notes, "Latest");
  } finally {
    await f.dispose();
  }
});
test("chunk retries are idempotent; tampering, missing chunks and sealed appends fail", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.upload("microphone")).reused, false);
    assert.equal((await f.upload("microphone")).reused, true);
    await assert.rejects(f.finish(), code("chunks_missing"));
    await f.upload("system");
    await f.finish();
    await f.finish();
    await assert.rejects(f.upload("system", 1), code("capture_sealed"));
    await assert.rejects(
      f.service.upload(
        scope,
        {
          meetingId: f.input.id,
          sessionId: f.input.sessionId,
          track: "system",
          sequence: 0,
          startMs: 0,
          endMs: 5000,
          sha256: "0".repeat(64),
        },
        f.audio
      ),
      code("checksum_mismatch")
    );
  } finally {
    await f.dispose();
  }
});
test("transcription retry reuses completed batches, preserves new notes, deletes audio only on success", async () => {
  const f = await fixture();
  try {
    await f.upload("microphone");
    await f.upload("system");
    await f.finish();
    let calls = 0,
      fail = true;
    const worker = new Processing(f.store, {
      transcribe: async () => {
        calls++;
        if (calls === 2) throw new Error("temporary");
        return "Ship the draft";
      },
      summarize: async () => {
        if (fail) {
          fail = false;
          throw new Error("temporary");
        }
        return summary;
      },
    });
    await assert.rejects(worker.run(scope, f.input.id));
    assert.equal((await f.service.get(scope, f.input.id)).transcript.length, 1);
    await assert.rejects(worker.run(scope, f.input.id));
    await f.service.notes(scope, {
      meetingId: f.input.id,
      expectedRevision: 0,
      notes: "A human addition",
    });
    await worker.run(scope, f.input.id);
    await worker.run(scope, f.input.id);
    const record = await f.service.get(scope, f.input.id);
    assert.equal(calls, 3);
    assert.equal(record.processing, "ready");
    assert.equal(record.summaryVersion, 1);
    assert.equal(record.notes, "A human addition");
    assert.equal(record.notesInputRevision, 1);
    await assert.rejects(
      stat(join(f.store.directory(scope, f.input.id), "audio"))
    );
    assert.match(
      (await f.service.export(scope, f.input.id, true)).content,
      /A human addition/
    );
  } finally {
    await f.dispose();
  }
});
test("summary evidence is validated against original content", async () => {
  const f = await fixture();
  try {
    await f.upload("microphone");
    await f.upload("system");
    await f.finish();
    const worker = new Processing(f.store, {
      transcribe: async () => "Something else",
      summarize: async () => summary,
    });
    await assert.rejects(
      worker.run(scope, f.input.id),
      code("invalid_evidence")
    );
    assert.equal((await f.service.get(scope, f.input.id)).summary, null);
    await stat(join(f.store.directory(scope, f.input.id), "audio"));
  } finally {
    await f.dispose();
  }
});
test("deletion racing an in-flight model cannot resurrect content or accept late upload", async () => {
  const f = await fixture();
  try {
    await f.upload("microphone");
    await f.upload("system");
    await f.finish();
    let started!: () => void, release!: () => void;
    const waiting = new Promise<void>((resolve) => {
        started = resolve;
      }),
      barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
    const worker = new Processing(f.store, {
      transcribe: async () => {
        started();
        await barrier;
        return "Ship the draft";
      },
      summarize: async () => summary,
    });
    const running = worker.run(scope, f.input.id);
    const rejected = assert.rejects(running);
    await waiting;
    await f.service.remove(scope, f.input.id);
    release();
    await rejected;
    await f.service.remove(scope, f.input.id);
    await assert.rejects(f.upload("system"), code("meeting_not_found"));
    await assert.rejects(
      f.service.create(scope, f.input),
      code("idempotency_conflict")
    );
    assert.equal((await f.store.read(scope, f.input.id, true)).deleted, true);
    assert.equal((await f.service.list(scope)).total, 0);
  } finally {
    await f.dispose();
  }
});
test("corrupt files are reported and expired failed audio is removed without deleting notes", async () => {
  const f = await fixture();
  try {
    await f.upload("microphone");
    const record = await f.store.read(scope, f.input.id);
    record.updatedAt = "2000-01-01T00:00:00.000Z";
    record.notes = "Keep this";
    await f.store.save(f.store.directory(scope, f.input.id), record);
    await f.service.list(scope);
    assert.equal(
      (await f.service.get(scope, f.input.id)).errorCode,
      "audio_expired"
    );
    assert.equal((await f.service.get(scope, f.input.id)).notes, "Keep this");
    await assert.rejects(
      f.service.retry(scope, f.input.id),
      code("audio_expired")
    );
    const file = join(f.store.directory(scope, f.input.id), "meeting.json");
    await writeFile(file, "invalid JSON");
    await assert.rejects(f.service.list(scope), code("storage_corrupt"));
  } finally {
    await f.dispose();
  }
});

test("live transcription appears before finish, retries checkpoints and finalization consumes only the tail", async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const worker = new Processing(f.store, {
      transcribe: async () => {
        calls++;
        return "Ship the draft";
      },
      summarize: async () => summary,
    });
    await f.service.start(scope, f.input.id, f.input.sessionId);
    await f.upload("microphone");
    await worker.live(scope, f.input.id);
    let m = await f.service.get(scope, f.input.id);
    assert.equal(m.capture, "recording");
    assert.equal(m.expectedChunks, null);
    assert.equal(m.processing, "not_started");
    assert.equal(m.transcript.length, 1);
    await worker.live(scope, f.input.id);
    assert.equal(calls, 1);
    await f.upload("system");
    await worker.live(scope, f.input.id);
    await f.finish();
    await worker.run(scope, f.input.id);
    m = await f.service.get(scope, f.input.id);
    assert.equal(calls, 2);
    assert.equal(m.processing, "ready");
    assert.equal(m.liveTranscription.status, "complete");
    assert.match(
      await readFile(
        join(f.store.directory(scope, f.input.id), "summary.md"),
        "utf8"
      ),
      /Ship the draft/
    );
  } finally {
    await f.dispose();
  }
});
test("live provider failure leaves recording and notes usable and resumes without duplicate segments", async () => {
  const f = await fixture();
  try {
    let failing = true;
    const worker = new Processing(f.store, {
      transcribe: async () => {
        if (failing) throw new Error("offline");
        return "Recovered";
      },
      summarize: async () => summary,
    });
    await f.service.start(scope, f.input.id, f.input.sessionId);
    await f.upload("microphone");
    await assert.rejects(worker.live(scope, f.input.id));
    const m = await f.service.get(scope, f.input.id);
    assert.equal(m.capture, "recording");
    assert.equal(m.processing, "not_started");
    assert.equal(m.liveTranscription.status, "retrying");
    await f.service.notes(scope, {
      meetingId: f.input.id,
      notes: "Safe",
      expectedRevision: 0,
    });
    failing = false;
    await worker.live(scope, f.input.id);
    await worker.live(scope, f.input.id);
    assert.equal((await f.service.get(scope, f.input.id)).transcript.length, 1);
    assert.equal((await f.service.get(scope, f.input.id)).notes, "Safe");
  } finally {
    await f.dispose();
  }
});

test("finish waits for an in-flight live chunk and drains the remaining audio without losing the job", async () => {
  const f = await fixture();
  try {
    await f.upload("microphone");
    await f.upload("system");
    let started!: () => void,
      release!: () => void,
      calls = 0;
    const pending = new Promise<void>((resolve) => {
      started = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const worker = new Processing(f.store, {
      transcribe: async () => {
        if (++calls === 1) {
          started();
          await barrier;
        }
        return "Ship the draft";
      },
      summarize: async () => summary,
    });
    const live = worker.live(scope, f.input.id);
    await pending;
    await f.finish();
    const final = worker.run(scope, f.input.id);
    release();
    await live;
    await final;
    const result = await f.service.get(scope, f.input.id);
    assert.equal(result.processing, "ready");
    assert.equal(result.transcript.length, 2);
    assert.equal(calls, 2);
  } finally {
    await f.dispose();
  }
});

test("final transcription refines short live fragments with context and preserves collaborative human summary", async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const worker = new Processing(f.store, {
      transcribe: async () => {
        calls++;
        return "Ship the draft";
      },
      summarize: async () => summary,
    });
    for (const track of ["microphone", "system"] as const) {
      await f.upload(track, 0);
      await f.upload(track, 1);
    }
    await worker.live(scope, f.input.id);
    assert.equal((await f.service.get(scope, f.input.id)).transcript.length, 4);
    await f.store.update(scope, f.input.id, (m) => {
      m.documents.summary = { id: randomUUID(), sequence: 5 };
      m.summaryMarkdown = "# Human decision\n\nKeep this edit.";
    });
    await f.service.finish(scope, {
      meetingId: f.input.id,
      sessionId: f.input.sessionId,
      durationMs: 10000,
      reason: "user",
      chunks: { microphone: 2, system: 2 },
    });
    await worker.run(scope, f.input.id);
    await worker.run(scope, f.input.id);
    const result = await f.service.get(scope, f.input.id);
    assert.equal(calls, 6);
    assert.equal(result.transcript.length, 2);
    assert.equal(
      result.transcript.every((s) => s.final && s.endMs === 10000),
      true
    );
    assert.equal(result.summaryMarkdown, "# Human decision\n\nKeep this edit.");
    assert.match(
      await readFile(
        join(f.store.directory(scope, f.input.id), "summaries", "1.md"),
        "utf8"
      ),
      /Ship the draft/
    );
    assert.match(
      (await f.service.export(scope, f.input.id)).content,
      /Keep this edit/
    );
  } finally {
    await f.dispose();
  }
});
