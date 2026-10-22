import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "./storage-fixture.js";
import { randomUUID } from "node:crypto";
import type {
  AgentMiddlewareAssistantTaskApi,
  AgentMiddlewareAssistantTaskInput,
  AgentMiddlewareAssistantTaskResult,
} from "@xpert-ai/plugin-sdk";
import { sha256 } from "../src/file-store.js";
import { TestFileStore as FileStore } from "./storage-fixture.js";
import { Meetings } from "../src/meetings.js";
import { AssistantWorkflow } from "../src/assistant-workflow.js";
import { silentBoundaries } from "../src/phase-planner.js";
import { audioActivity, wav } from "../src/audio.js";
import { Transcription } from "../src/transcription.js";
import { type Meeting, type Scope } from "../src/domain.js";
const scope: Scope = {
  tenantId: "test-tenant",
  organizationId: "test-org",
  userId: "test-owner",
  assistantId: "test-assistant",
};
const segment = (
  track: "microphone" | "system",
  seq: number,
  text = "",
  active = !!text
): Meeting["transcript"][number] => ({
  id: `${track}-${seq}`,
  track,
  final: false,
  startMs: seq * 5000,
  endMs: (seq + 1) * 5000,
  text,
  activity: active ? [{ startMs: seq * 5000, endMs: (seq + 1) * 5000 }] : [],
});
const silentAfterSpeech = () =>
  [0, 1, 2].flatMap((i) => [
    segment("microphone", i, i === 0 ? "第一阶段确定试点。" : ""),
    segment("system", i),
  ]);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "meeting-assistant-")),
    store = new FileStore(root),
    service = new Meetings(store, async () => {});
  const id = randomUUID();
  await service.create(scope, {
    id,
    sessionId: randomUUID(),
    title: "Synthetic meeting",
  });
  const starts: AgentMiddlewareAssistantTaskInput[] = [],
    statuses = new Map<string, AgentMiddlewareAssistantTaskResult>(),
    queued: number[] = [],
    actors: string[] = [];
  let busy = false,
    failOnce = false;
  const api: AgentMiddlewareAssistantTaskApi = {
    getTaskStatus: async (input) =>
      input.executionId
        ? statuses.get(input.executionId) ?? null
        : busy
        ? { status: "running" }
        : null,
    startTask: async (input) => {
      starts.push(input);
      if (failOnce) {
        failOnce = false;
        throw new Error("connection interrupted");
      }
      const result: AgentMiddlewareAssistantTaskResult = {
        status: "running",
        conversationId: input.conversationId!,
        executionId: input.executionId!,
        threadId: "test-thread",
      };
      statuses.set(input.executionId!, result);
      return result;
    },
  };
  const workflow = new AssistantWorkflow(
    store,
    (actor) => {
      actors.push(actor.userId);
      return api;
    },
    async (_scope, _id, delay) => {
      queued.push(delay ?? 0);
    }
  );
  return {
    root,
    store,
    service,
    id,
    starts,
    statuses,
    workflow,
    actors,
    queued,
    setBusy: (b: boolean) => {
      busy = b;
    },
    fail: () => {
      failOnce = true;
    },
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
const config = (m: Meeting, i: number) => ({
  configurable: {
    executionId: m.assistant.operations[i].executionId,
    rootExecutionId: m.assistant.operations[i].executionId,
    context: {
      meetings: { meetingId: m.id, operationId: m.assistant.operations[i].id },
    },
  },
});
const simple = {
  overview: "阶段记录",
  decisions: [],
  actions: [],
  questions: [],
};

test("another member retries a summary under their own task identity and shares the result", async () => {
  const f = await fixture();
  try {
    const other = { ...scope, userId: "other-member" };
    const live = [
      segment("microphone", 0, "Shared decision"),
      segment("system", 0),
    ];
    await f.store.update(scope, f.id, (m) => {
      m.transcript = live;
      m.durationMs = 5000;
    });
    await f.workflow.finish(scope, await f.store.read(scope, f.id), live);
    await f.workflow.tick(scope, f.id);
    const original = await f.store.read(scope, f.id);
    await f.workflow.failSupervision(scope, f.id);
    await f.workflow.finish(other, await f.store.read(other, f.id), live);
    await f.workflow.tick(other, f.id);
    const retried = await f.store.read(other, f.id);
    assert.equal(f.actors.at(-1), other.userId);
    assert.notEqual(
      retried.assistant.conversationId,
      original.assistant.conversationId
    );
    assert.equal(retried.scope.userId, scope.userId);
    await assert.rejects(
      f.workflow.submit(scope, config(retried, 1), simple),
      /summary_operation_mismatch/
    );
    await f.workflow.submit(other, config(retried, 1), simple);
    assert.equal(
      (await f.service.get(scope, f.id)).summary?.overview,
      simple.overview
    );
    assert.equal(
      (await f.service.get(scope, f.id)).assistant.conversationId,
      null
    );
    assert.equal(
      (await f.service.get(other, f.id)).assistant.conversationId,
      retried.assistant.conversationId
    );
  } finally {
    await f.dispose();
  }
});

test("a previous member's task cannot replace the current member's conversation link", async () => {
  const f = await fixture();
  try {
    const other = { ...scope, userId: "other-member" };
    const live = silentAfterSpeech();
    await f.store.update(scope, f.id, (m) => {
      m.transcript = live;
      m.durationMs = 15000;
    });
    await f.workflow.live(scope, await f.store.read(scope, f.id));
    await f.workflow.finish(other, await f.store.read(other, f.id), live);
    await f.workflow.tick(other, f.id);
    const final = f.starts[0];
    f.statuses.set(final.executionId!, {
      status: "running",
      threadId: "other-member-thread",
    });
    await f.workflow.tick(other, f.id);
    await f.workflow.tick(scope, f.id);
    assert.equal(
      (await f.service.get(other, f.id)).assistant.threadId,
      "other-member-thread"
    );
    const phase = f.starts[1];
    f.statuses.set(phase.executionId!, {
      status: "running",
      threadId: "previous-member-thread",
    });
    await f.workflow.tick(scope, f.id);
    assert.equal(
      (await f.service.get(other, f.id)).assistant.threadId,
      "other-member-thread"
    );
    assert.equal((await f.service.get(scope, f.id)).assistant.threadId, null);
  } finally {
    await f.dispose();
  }
});

test("silence uses both contiguous audio timelines, configurable duration and conservative legacy checkpoints", () => {
  assert.deepEqual(silentBoundaries(silentAfterSpeech(), 10000), [15000]);
  assert.deepEqual(silentBoundaries(silentAfterSpeech(), 11000), []);
  assert.deepEqual(
    silentBoundaries(
      silentAfterSpeech().map((s) =>
        s.id === "system-2" ? segment("system", 2, "对方继续讲话") : s
      ),
      10000
    ),
    []
  );
  assert.deepEqual(
    silentBoundaries(
      silentAfterSpeech().filter((s) => s.id !== "system-1"),
      10000
    ),
    []
  );
  assert.deepEqual(
    silentBoundaries(
      silentAfterSpeech().map(({ activity, ...s }) => s),
      10000
    ),
    []
  );
  assert.deepEqual(
    silentBoundaries(
      [0, 1, 2].flatMap((i) => [
        segment("system", i),
        segment("microphone", i),
      ]),
      10000
    ),
    []
  );
});

test("quiet PCM never reaches ASR; real signal produces measured activity", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(audioActivity(Buffer.alloc(240000), 0), []);
    const pcm = Buffer.alloc(240000);
    for (let i = 0; i < 120000; i++)
      pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 9)), i * 2);
    assert.deepEqual(audioActivity(pcm, 5000), [
      { startMs: 5000, endMs: 10000 },
    ]);
    const m = await f.store.read(scope, f.id),
      audio = wav(Buffer.alloc(240000));
    await f.service.upload(
      scope,
      {
        meetingId: f.id,
        sessionId: m.sessionId,
        sequence: 0,
        track: "system",
        startMs: 0,
        endMs: 5000,
        sha256: sha256(audio),
      },
      audio
    );
    await new Transcription(f.store, {
      transcribe: async () => {
        throw new Error("silent audio must not call provider");
      },
    }).available(scope, f.id, null);
    const result = await f.store.read(scope, f.id);
    assert.equal(result.transcript[0].text, "");
    assert.deepEqual(result.transcript[0].activity, []);
  } finally {
    await f.dispose();
  }
});

test("phase dispatch is durable and deduplicated; quotes are preserved; final uses whole source plus exact unsent tail", async () => {
  const f = await fixture();
  try {
    await f.store.update(scope, f.id, (m) => {
      m.transcript = silentAfterSpeech();
    });
    await f.workflow.live(scope, await f.store.read(scope, f.id));
    await f.workflow.live(scope, await f.store.read(scope, f.id));
    let m = await f.store.read(scope, f.id);
    assert.equal(m.assistant.operations.length, 1);
    await f.workflow.tick(scope, f.id);
    assert.equal(f.starts.length, 1);
    assert.match(f.starts[0].prompt, /> 第一阶段确定试点。/);
    const ctx = await f.workflow.context(scope, config(m, 0));
    assert.equal(ctx.evidence[0].quote, "第一阶段确定试点。");
    await assert.rejects(
      f.workflow.submit(scope, config(m, 0), {
        ...simple,
        decisions: [{ text: "Fake", evidenceId: "missing" }],
      }),
      /invalid_evidence/
    );
    await f.workflow.submit(scope, config(m, 0), {
      ...simple,
      decisions: [{ text: "确定试点", evidenceId: ctx.evidence[0].id }],
    });
    await assert.rejects(
      stat(join(f.store.directory(scope, f.id), "summary.md"))
    );
    // More silence never emits empty or repeated summaries, even after a process restart.
    await f.store.update(scope, f.id, (m) => {
      m.transcript.push(segment("microphone", 3), segment("system", 3));
    });
    const restarted = new AssistantWorkflow(
      f.store,
      () => ({
        startTask: async () => {
          throw new Error("unexpected");
        },
      }),
      async () => {}
    );
    await restarted.live(scope, await f.store.read(scope, f.id));
    m = await f.store.read(scope, f.id);
    assert.equal(m.assistant.operations.length, 1);
    const live = [
      ...m.transcript,
      segment("microphone", 4, "最后一段取消试点，先评估。"),
      segment("system", 4),
    ];
    await f.store.update(scope, f.id, (m) => {
      m.transcript = live;
      m.expectedChunks = { microphone: 5, system: 5 };
      m.durationMs = 25000;
      m.processing = "summarizing";
    });
    m = await f.store.read(scope, f.id);
    await f.workflow.finish(scope, m, live);
    await f.workflow.finish(scope, m, live);
    m = await f.store.read(scope, f.id);
    assert.equal(m.assistant.operations.length, 2);
    await f.workflow.tick(scope, f.id);
    assert.equal(
      f.starts.length,
      1,
      "final waits until phase execution terminates"
    );
    f.statuses.set(m.assistant.operations[0].executionId, {
      status: "succeeded",
    });
    await f.workflow.tick(scope, f.id);
    await f.workflow.tick(scope, f.id);
    assert.equal(f.starts.length, 2);
    assert.equal(f.starts[0].conversationId, f.starts[1].conversationId);
    assert.match(f.starts[1].prompt, /> 最后一段取消试点，先评估。/);
    assert.doesNotMatch(f.starts[1].prompt, /> 第一阶段确定试点。/);
    const finalContext = await f.workflow.context(scope, config(m, 1));
    assert.equal(finalContext.evidence.length, 2);
    await f.workflow.submit(scope, config(m, 1), {
      ...simple,
      overview: "最终以取消试点为准。",
      decisions: [
        { text: "取消试点，先评估", evidenceId: finalContext.evidence[1].id },
      ],
    });
    await f.workflow.submit(scope, config(m, 1), {
      ...simple,
      overview: "最终以取消试点为准。",
      decisions: [
        { text: "取消试点，先评估", evidenceId: finalContext.evidence[1].id },
      ],
    });
    const done = await f.store.read(scope, f.id);
    assert.equal(done.processing, "ready");
    assert.equal(done.summaryVersion, 1);
    assert.match(
      await readFile(
        join(f.store.directory(scope, f.id), "summary.md"),
        "utf8"
      ),
      /取消试点/
    );
    assert.equal(
      (await stat(join(f.store.directory(scope, f.id), "summary.md"))).mode &
        0o777,
      0o600
    );
    await assert.rejects(
      f.workflow.submit(scope, config(m, 1), simple),
      /summary_already_submitted/
    );
  } finally {
    await f.dispose();
  }
});

test("waits for human chat; dispatch retry reuses operation identity; wrong execution and another actor cannot finalize a task", async () => {
  const f = await fixture();
  try {
    await f.store.update(scope, f.id, (m) => {
      m.transcript = silentAfterSpeech();
    });
    await f.workflow.live(scope, await f.store.read(scope, f.id));
    f.setBusy(true);
    await f.workflow.tick(scope, f.id);
    assert.equal(f.starts.length, 0);
    f.setBusy(false);
    f.fail();
    await assert.rejects(
      f.workflow.tick(scope, f.id),
      /connection interrupted/
    );
    await f.workflow.tick(scope, f.id);
    assert.equal(f.starts.length, 2);
    assert.deepEqual(f.starts[0], f.starts[1]);
    const m = await f.store.read(scope, f.id),
      c = config(m, 0);
    c.configurable.rootExecutionId = randomUUID();
    await assert.rejects(
      f.workflow.submit(scope, c, simple),
      /summary_operation_mismatch/
    );
    await assert.rejects(
      f.workflow.submit({ ...scope, userId: "other" }, config(m, 0), simple),
      /summary_operation_mismatch/
    );
    await f.service.remove(scope, f.id);
    await assert.rejects(
      f.workflow.submit(scope, config(m, 0), simple),
      /meeting_not_found/
    );
    await f.workflow.tick(scope, f.id);
  } finally {
    await f.dispose();
  }
});

test("missing domain result fails explicitly; retry retains final tail and uses a new execution in the same chat", async () => {
  const f = await fixture();
  try {
    const live = [segment("microphone", 0, "尾段"), segment("system", 0)];
    await f.store.update(scope, f.id, (m) => {
      m.transcript = live;
      m.durationMs = 5000;
      m.expectedChunks = { microphone: 1, system: 1 };
      m.processing = "summarizing";
    });
    await f.workflow.finish(scope, await f.store.read(scope, f.id), live);
    await f.workflow.tick(scope, f.id);
    let m = await f.store.read(scope, f.id);
    f.statuses.set(m.assistant.operations[0].executionId, {
      status: "succeeded",
    });
    await f.workflow.tick(scope, f.id);
    m = await f.store.read(scope, f.id);
    assert.equal(m.errorCode, "assistant_result_missing");
    await f.workflow.finish(scope, m, live);
    await f.workflow.tick(scope, f.id);
    assert.equal(f.starts.length, 2);
    assert.equal(f.starts[0].conversationId, f.starts[1].conversationId);
    assert.notEqual(f.starts[0].executionId, f.starts[1].executionId);
    assert.match(f.starts[1].prompt, /> 尾段/);
  } finally {
    await f.dispose();
  }
});

test("unknown platform outcome remains recoverable without duplicate identity or official minutes", async () => {
  const f = await fixture();
  try {
    await f.store.update(scope, f.id, (m) => {
      m.transcript = silentAfterSpeech();
    });
    await f.workflow.live(scope, await f.store.read(scope, f.id));
    const starts: AgentMiddlewareAssistantTaskInput[] = [];
    const workflow = new AssistantWorkflow(
      f.store,
      () => ({
        startTask: async (input) => {
          starts.push(input);
          return { status: "unknown" };
        },
        getTaskStatus: async () => null,
      }),
      async () => {}
    );
    await workflow.tick(scope, f.id);
    await workflow.tick(scope, f.id);
    const m = await f.store.read(scope, f.id);
    assert.equal(m.assistant.operations[0].status, "running");
    assert.equal(m.assistant.operations[0].settled, false);
    assert.deepEqual(starts[0], starts[1]);
    assert.equal(m.summaryVersion, 0);
  } finally {
    await f.dispose();
  }
});

test("exhausted supervision closes pending attempts and rejects late final writes", async () => {
  const f = await fixture();
  try {
    const live = [segment("microphone", 0, "尾段"), segment("system", 0)];
    await f.store.update(scope, f.id, (m) => {
      m.transcript = live;
      m.processing = "summarizing";
      m.durationMs = 5000;
      m.expectedChunks = { microphone: 1, system: 1 };
    });
    await f.workflow.finish(scope, await f.store.read(scope, f.id), live);
    await f.workflow.tick(scope, f.id);
    await f.workflow.failSupervision(scope, f.id);
    const m = await f.store.read(scope, f.id);
    assert.equal(m.processing, "failed");
    assert.equal(m.errorCode, "assistant_scheduling_failed");
    assert.equal(m.assistant.operations[0].settled, true);
    await assert.rejects(
      f.workflow.submit(scope, config(m, 0), simple),
      /summary_operation_closed/
    );
    assert.equal(m.summaryVersion, 0);
  } finally {
    await f.dispose();
  }
});

test("microphone-only browser recordings use their selected source as the silence clock", () => {
  const microphone = silentAfterSpeech().filter((s) => s.track === "microphone");
  assert.deepEqual(silentBoundaries(microphone, 10000, ["microphone"]), [15000]);
  assert.deepEqual(silentBoundaries(microphone, 10000), []);
});

async function finalAttempt(f: Awaited<ReturnType<typeof fixture>>) {
  await f.store.update(scope, f.id, (m) => {
    m.transcript = [segment("microphone", 0, "Original decision")];
    m.processing = "summarizing";
  });
  const m = await f.store.read(scope, f.id);
  await f.workflow.finish(scope, m, m.transcript);
  await f.workflow.tick(scope, f.id);
  return f.store.read(scope, f.id);
}

for (const field of [
  "notes",
  "transcript",
  "summary",
  "notes-document",
  "summary-document",
  "title",
] as const) {
  test(`commit detects concurrent ${field} changes inside the manifest lock`, async () => {
    const f = await fixture();
    try {
      const m = await finalAttempt(f);
      const update = f.store.update.bind(f.store);
      let resume: () => void = () => {},
        reached: () => void = () => {};
      const gate = new Promise<void>((r) => {
        resume = r;
      });
      const entered = new Promise<void>((r) => {
        reached = r;
      });
      let intercept = true;
      f.store.update = async (...args: Parameters<FileStore["update"]>) => {
        if (intercept) {
          intercept = false;
          reached();
          await gate;
        }
        return update(...args);
      };
      const submission = assert.rejects(
        f.workflow.submit(scope, config(m, 0), simple),
        /summary_input_conflict/
      );
      await entered;
      await update(scope, f.id, (current) => {
        if (field === "notes") {
          current.notes = "new notes";
          current.notesRevision++;
        }
        if (field === "transcript")
          current.transcript[0].text = "Corrected decision";
        if (field === "summary") {
          current.summaryVersion++;
          current.summary = { ...simple, overview: "New result" };
        }
        if (field === "notes-document")
          current.documents.notes = { id: randomUUID(), sequence: 1 };
        if (field === "summary-document")
          current.documents.summary = { id: randomUUID(), sequence: 1 };
        if (field === "title") current.title = "New title";
      });
      resume();
      await submission;
      const current = await f.store.read(scope, f.id);
      assert.equal(current.summaryVersion, field === "summary" ? 1 : 0);
      await assert.rejects(
        stat(
          join(
            f.store.directory(scope, f.id),
            "assistant",
            `${m.assistant.operations[0].id}.output.json`
          )
        )
      );
    } finally {
      await f.dispose();
    }
  });
}

test("cancelled task paused before commit cannot overwrite its replacement result", async () => {
  const f = await fixture();
  try {
    const old = await finalAttempt(f);
    const update = f.store.update.bind(f.store);
    let resume: () => void = () => {},
      reached: () => void = () => {};
    const gate = new Promise<void>((r) => {
      resume = r;
    });
    const entered = new Promise<void>((r) => {
      reached = r;
    });
    let intercept = true;
    f.store.update = async (...args: Parameters<FileStore["update"]>) => {
      if (intercept) {
        intercept = false;
        reached();
        await gate;
      }
      return update(...args);
    };
    const rejected = assert.rejects(
      f.workflow.submit(scope, config(old, 0), simple),
      /summary_operation_closed/
    );
    await entered;
    await f.workflow.failSupervision(scope, f.id);
    await f.workflow.finish(
      scope,
      await f.store.read(scope, f.id),
      old.transcript
    );
    await f.workflow.tick(scope, f.id);
    const fresh = await f.store.read(scope, f.id);
    await f.workflow.submit(scope, config(fresh, 1), {
      ...simple,
      overview: "Replacement result",
    });
    resume();
    await rejected;
    const saved = await f.store.read(scope, f.id);
    assert.equal(saved.summaryVersion, 1);
    assert.equal(saved.summary?.overview, "Replacement result");
  } finally {
    await f.dispose();
  }
});

test("unrelated manifest updates do not conflict, and Assistant dispatch holds no scheduling lock", async () => {
  const f = await fixture();
  try {
    const api: AgentMiddlewareAssistantTaskApi = {
      getTaskStatus: async () => null,
      startTask: async () => {
        await f.store.withProcessingLock(
          scope,
          f.id,
          "assistant",
          async () => {}
        );
        return { status: "running" };
      },
    };
    const workflow = new AssistantWorkflow(
      f.store,
      () => api,
      async () => {}
    );
    await f.store.update(scope, f.id, (m) => {
      m.transcript = [segment("microphone", 0, "decision")];
    });
    let m = await f.store.read(scope, f.id);
    await workflow.finish(scope, m, m.transcript);
    await workflow.tick(scope, f.id);
    m = await f.store.update(scope, f.id, (m) => {
      m.liveTranscription.status = "complete";
    });
    await workflow.submit(scope, config(m, 0), simple);
    assert.equal((await f.store.read(scope, f.id)).summaryVersion, 1);
  } finally {
    await f.dispose();
  }
});
