// 预览仅使用内存模拟宿主，不连接真实平台或模型。组件与发布构建完全一致。
import { fileURLToPath } from "node:url";
export default {
  title: "竞品监控 · React 迁移预览（模拟宿主）",
  workspaceRoot: fileURLToPath(new URL("../", import.meta.url)),
  instanceId: "monitor-preview",
  component: {
    root: fileURLToPath(new URL("../dist/remote/", import.meta.url)),
    runtime: "react",
    viewportBound: true,
    sandbox: "allow-scripts",
  },
  hostContext: {
    manifest: { key: "competitor-monitor.workbench" },
    locale: "zh-Hans",
    theme: {
      mode: "light",
      density: "default",
      tokens: { "color.border": "#dfe3eb", "color.primary": "#0f766e" },
    },
    debug: { enabled: false },
  },
  state: {
    items: [
      {
        id: "i1",
        itemId: "6543210",
        title: "无线蓝牙耳机 · 降噪运动款",
        status: "active",
      },
    ],
    rounds: [
      {
        id: "r1",
        status: "success",
        startedAt: "2026-11-04T06:07:13Z",
        errorReason: null,
      },
    ],
    changes: [
      {
        id: "c1",
        roundId: "r1",
        itemId: "6543210",
        dimension: "price",
        beforeValue: "199",
        afterValue: "179",
        evidence: "mock:6543210:price",
        severity: "high",
      },
    ],
    advice: [
      {
        id: "a1",
        changeId: "c1",
        category: "promotion_adjustment",
        content: "核对当前价格差异，评估是否调整优惠力度。",
        reason: "模拟证据：竞品价格由 199 元下降至 179 元。",
        status: "pending",
        revision: 4,
      },
    ],
  },
  async handleRequest(message, { state }) {
    if (message.type === "requestData") return { data: { item: state } };
    if (message.type === "executeAction") {
      const { actionKey, input } = message;
      if (actionKey === "approve_advice" || actionKey === "reject_advice") {
        const advice = state.advice.find((a) => a.id === input.id);
        if (!advice || advice.revision !== input.expectedRevision)
          return { result: { success: false, message: "Revision conflict" } };
        advice.status =
          actionKey === "approve_advice" ? "approved" : "rejected";
        advice.revision++;
      } else if (actionKey === "toggle_item") {
        const item = state.items.find((i) => i.itemId === input.itemId);
        item.status = item.status === "active" ? "paused" : "active";
      } else if (actionKey === "delete_records") {
        const counts = {
          items: state.items.length,
          rounds: state.rounds.length,
          snapshots: 2,
          changes: state.changes.length,
          advice: state.advice.length,
        };
        if (input.confirmation === "preview-digest") {
          state.items = [];
          state.rounds = [];
          state.changes = [];
          state.advice = [];
        }
        return {
          result: {
            success: true,
            data: {
              confirmation: "preview-digest",
              counts,
              deleted: input.confirmation === "preview-digest",
            },
          },
        };
      } else
        return {
          result: {
            success: false,
            message:
              "此预览仅支持审核、暂停和清空演示；完整业务请运行测试或连接平台。",
          },
        };
      return { result: { success: true, data: {} } };
    }
    throw Error("Unsupported preview request");
  },
};
