// Synthetic fixtures are confined to this preview adapter; production uses the authorized View API.
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
const root = fileURLToPath(new URL("../..", import.meta.url));
function meeting(title, id, ready = true) {
  return {
    schemaVersion: 1,
    id,
    sessionId: randomUUID(),
    title,
    createdAt: "2026-10-08T02:00:00.000Z",
    startedAt: "2026-10-08T02:00:00.000Z",
    endedAt: ready ? "2026-10-08T02:42:00.000Z" : null,
    revision: 1,
    notesRevision: 0,
    notes: ready ? "重点关注首版的录音体验和笔记保存，先验证完整流程。" : "",
    capture: ready ? "stopped" : "created",
    stopReason: ready ? "user" : null,
    processing: ready ? "ready" : "not_started",
    errorCode: null,
    durationMs: ready ? 2520000 : 0,
    expectedChunks: ready ? { microphone: 504, system: 504 } : null,
    transcript: ready
      ? [
          {
            id: "system-0",
            track: "system",
            startMs: 720000,
            endMs: 780000,
            text: "首版先聚焦手动录音、个人笔记和会后摘要，日历集成放到下一阶段。",
          },
          {
            id: "microphone-0",
            track: "microphone",
            startMs: 1240000,
            endMs: 1300000,
            text: "林悦负责整理录音权限引导文案，周五之前完成。陈默补充系统音频断开后的恢复方案。",
          },
        ]
      : [],
    summary: ready
      ? {
          overview:
            "本次会议围绕 Meetings 首版范围与上线准备展开。团队确认优先做好录音、个人笔记和会后整理的完整体验，并讨论了音频权限引导、异常恢复和验证安排。",
          decisions: [
            {
              text: "首版聚焦手动录音、个人笔记和会后摘要，日历集成安排在下一阶段。",
              evidence: {
                segmentId: "system-0",
                quote:
                  "首版先聚焦手动录音、个人笔记和会后摘要，日历集成放到下一阶段。",
              },
            },
          ],
          actions: [
            {
              id: "copy",
              text: "整理录音权限引导文案",
              owner: "林悦",
              dueDate: "2026-10-09",
              evidence: {
                segmentId: "microphone-0",
                quote: "林悦负责整理录音权限引导文案，周五之前完成。",
              },
            },
            {
              id: "recovery",
              text: "补充系统音频断开后的恢复方案",
              owner: "陈默",
              dueDate: null,
              evidence: {
                segmentId: "microphone-0",
                quote: "陈默补充系统音频断开后的恢复方案。",
              },
            },
          ],
          questions: ["录音异常恢复方案需要覆盖哪些外接设备？"],
        }
      : null,
    summaryVersion: ready ? 1 : 0,
    notesInputRevision: ready ? 0 : null,
    updatedAt: "2026-10-08T02:42:00.000Z",
  };
}
const records = [
  meeting("产品设计评审", "00000000-0000-4000-8000-000000000001"),
  meeting("每周团队同步", "00000000-0000-4000-8000-000000000002"),
  meeting("客户需求沟通", "00000000-0000-4000-8000-000000000003"),
];
records[2].createdAt = "2026-10-07T07:00:00.000Z";
export default {
  title: "Meetings · 合成数据预览",
  workspaceRoot: root,
  instanceId: "meetings-preview",
  component: {
    root: `${root}/dist/remote-components/meetings`,
    runtime: "react",
  },
  hostContext: {
    manifest: { key: "meetings.provider__meetings.workspace" },
    initialQuery: {},
    locale: process.env.MEETINGS_PREVIEW_LOCALE ?? "zh-Hans",
    theme: { mode: process.env.MEETINGS_PREVIEW_THEME ?? "light" },
  },
  state: { records, recording: null },
  async handleRequest(message, { state }) {
    const input = message.input ?? {},
      payload = message.payload ?? {},
      current = state.records.find((item) => item.id === input.meetingId);
    if (message.type === "requestData") {
      const query = message.query ?? {};
      if (query.parameters?.captureId) {
        const item = state.records.find(
          (item) => item.sessionId === query.parameters.captureId
        );
        return {
          data: {
            items: [],
            meta: {
              capture: item
                ? { captureId: item.sessionId, meetingId: item.id }
                : null,
            },
          },
        };
      }
      if (query.selectionId)
        return {
          data: {
            items: [],
            meta: {
              detail: state.records.find(
                (item) => item.id === query.selectionId
              ),
            },
          },
        };
      const items = state.records
        .filter(
          (item) =>
            !query.search ||
            `${item.title} ${item.notes}`.includes(query.search)
        )
        .map(
          ({
            id,
            title,
            createdAt,
            startedAt,
            durationMs,
            capture,
            processing,
            errorCode,
            summary,
          }) => ({
            id,
            title,
            createdAt,
            startedAt,
            durationMs,
            capture,
            processing,
            errorCode,
            preview: summary?.overview ?? "",
          })
        );
      return { data: { items, total: items.length, page: 1 } };
    }
    if (message.type === "executeAction") {
      let result = {};
      if (message.actionKey === "notes") {
        if (current.notesRevision !== input.expectedRevision)
          return {
            result: { success: false, data: { code: "revision_conflict" } },
          };
        current.notes = input.notes;
        current.notesRevision++;
        result = { revision: current.notesRevision };
      }
      if (message.actionKey === "edit") {
        if (input.title) current.title = input.title;
        if (input.actions) current.summary.actions = input.actions;
        current.revision++;
        result = { revision: current.revision };
      }
      if (message.actionKey === "delete")
        state.records = state.records.filter(
          (item) => item.id !== input.meetingId
        );
      if (message.actionKey === "retry") {
        current.processing = "ready";
        current.errorCode = null;
      }
      if (message.actionKey === "export")
        result = {
          fileName: "meeting.md",
          mimeType: "text/markdown",
          content: `# ${current.title}\n\n${current.notes}`,
        };
      return { result: { success: true, data: result } };
    }
    if (message.type === "invokeClientCommand") {
      if (message.commandKey === "desktop.audio.capture.start") {
        const item = meeting(
          payload.delivery.context.title,
          payload.delivery.context.meetingId,
          false
        );
        item.capture = "recording";
        state.records.unshift(item);
        state.recording = {
          id: item.id,
          captureId: item.sessionId,
          start: Date.now(),
        };
      }
      if (message.commandKey === "desktop.audio.capture.stop") {
        const item = state.records.find(
          (item) => item.sessionId === payload.captureId
        );
        Object.assign(item, meeting(item.title, item.id), {
          notes: item.notes,
          notesRevision: item.notesRevision,
          notesInputRevision: item.notesRevision,
          sessionId: item.sessionId,
        });
        state.recording = null;
      }
      return {
        result: {
          success: true,
          data: {
            supported: true,
            status: state.recording ? "recording" : "idle",
            ...(state.recording
              ? { captureId: state.recording.captureId }
              : {}),
            elapsedMs: state.recording ? Date.now() - state.recording.start : 0,
            microphone: 0.36,
            system: 0.57,
            pendingCount: 0,
          },
        },
      };
    }
    return { result: { success: false, code: "unsupported" } };
  },
};
