import { config, api, login, load, save } from "./context.mjs";
import { messages, receipts, toolEvidence, assertCreatedDashboardEvidence } from "./evidence.mjs";
import assert from "node:assert/strict";
import { verifyBuild } from "./build-evidence.mjs";
await verifyBuild(config);
const format = process.argv[3],
  mode = process.argv[4] ?? "create";
const item = config.cases.find((item) => item.format === format);
assert(
  item && ["create", "repair", "edit1", "edit2"].includes(mode),
  "format csv/json/xlsx; mode create/repair/edit1/edit2",
);
const name = mode === "create" ? format : `${format}-${mode}`,
  prior =
    mode === "repair"
      ? format
      : mode === "edit1"
        ? item.repairPrompt
          ? `${format}-repair`
          : format
        : `${format}-edit1`;
const title = `${format.toUpperCase()} 文件看板重试回归${config.runLabel ? `·${config.runLabel}` : ""}`;
const prompts = {
  repair: item.repairPrompt,
  create: `请使用“${item.sourceName}”新建并保存${item.style ?? "白金与金属蓝"}风格的 HTML/ECharts 看板“${title}”，按来源已配置的指标口径，展示 2026 年第三季度按月和区域汇总的净销售额。顶部总额、左侧趋势、右侧明细，支持全部/华东/华西筛选和手动刷新，刷新时读取源文件最新内容。`,
  edit1: `把当前看板改成深蓝与金色，标题改为“${title}·修订”，趋势放在上方、明细放在下方；保持指标口径和数据来源，保留区域筛选与刷新，筛选后只显示所选区域的图表系列，保存到同一看板草稿。`,
  edit2: `继续修改当前看板，增加说明“金额单位：人民币元；按文件业务口径统计”，标题改为“${title}·定稿预览”；保留指标口径、图表、明细、筛选和刷新，自动保存同一个草稿。${item.edit2Extra ?? ""}`,
};
assert(
  typeof prompts[mode] === "string" && prompts[mode].length,
  "Configure an evidence-based repairPrompt for repair mode",
);
const previous =
  mode === "create" ? undefined : await load(`${prior}/saved-dashboard.json`);
const priorIds = previous
  ? messages(await load(`${prior}/agent-state.json`)).map(
      (message) => message.id,
    )
  : [];
let generation;
try {
  generation = await load(`${name}/ui-generation.json`);
} catch {}
// Resume an interrupted observation without sending the prompt again.
if (!generation) {
  const { b, p } = await login();
  try {
    const chat = p.frameLocator('iframe[name="chatkit"]');
    if (previous) {
      await p.goto((await load(`${format}/ui-generation.json`)).url);
      await chat
        .getByRole("button", {
          name: `打开 ${previous.dashboard.title}`,
          exact: true,
        })
        .last()
        .click({ timeout: 60000 });
      await chat
        .frameLocator('iframe[title="实时看板"]')
        .getByRole("combobox", { name: "选择看板", exact: true })
        .waitFor();
      await p.waitForTimeout(1000);
    }
    // A saved API preference can differ from the composer's explicit selection.
    // Select through the same visible control as a user before every prompt.
    if (config.model) {
      const catalog = await api(`/ai/assistants/${config.assistantId}/models`);
      const model = catalog.models.find((item) => item.id === config.model.id);
      assert(model && !model.disabled, "Expected model is not available");
      await chat.getByRole("button", { name: /^模型: / }).click();
      await chat.getByRole("menuitemradio").filter({ hasText: model.label }).click();
      await chat.getByRole("button", { name: `模型: ${model.label}`, exact: true }).waitFor();
    }
    await chat.getByRole("textbox").fill(prompts[mode]);
    await chat.getByRole("button", { name: "发送消息", exact: true }).click();
    await p.waitForURL(/\/c\/[a-f0-9-]{36}/);
    generation = {
      prompt: prompts[mode],
      url: p.url(),
      threadId: new URL(p.url()).pathname.split("/").at(-1),
      startedAt: new Date().toISOString(),
      sentThroughChatUi: true,
      priorIds,
    };
    await save(`${name}/ui-generation.json`, generation);
    console.log(JSON.stringify({ case: name, sent: true }));
  } finally {
    // Streaming chat sockets may delay Chromium shutdown after the server has
    // accepted the prompt. Continue receipt observation without resending it.
    let timer;
    try {
      await Promise.race([
        b.close(),
        new Promise((resolve) => {
          timer = setTimeout(resolve, 15000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
const deadline = Date.now() + (config.generationTimeoutMs ?? 1200000);
try {
  while (Date.now() < deadline) {
    const conversation = await api(
      "/chat-conversation/by-thread?threadId=" + generation.threadId,
    );
    if (!conversation?.id) {
      console.log(
        JSON.stringify({ case: name, status: "awaiting_conversation" }),
      );
      await new Promise((resolve) => setTimeout(resolve, 15000));
      continue;
    }
    const state = await api(`/chat-conversation/${conversation.id}/state`);
    await save(`${name}/agent-state.json`, state);
    const latest = receipts(state).at(-1),
      evidence = toolEvidence(state, generation.priorIds);
    const saved =
      latest &&
      (!previous ||
        (latest.dashboard.artifactId === previous.dashboard.artifactId &&
          latest.dashboard.draftRevision > previous.dashboard.draftRevision));
    if (saved && conversation.status === "idle") {
      await verifyBuild(config);
      if (mode === "create") assertCreatedDashboardEvidence(state, latest);
      const selected = await api(
        `/view-hosts/agent/${config.assistantId}/views/live-dashboard__live-dashboard/data?parameters=` +
          encodeURIComponent(
            JSON.stringify({ artifactId: latest.dashboard.artifactId }),
          ),
      );
      assert.equal(
        selected.meta.saved.draftRevision,
        latest.dashboard.draftRevision,
      );
      await save(`${name}/saved-dashboard.json`, latest);
      await save(`${name}/document.json`, selected.meta.saved);
      await save(`${name}/tool-evidence.json`, {
        ...evidence,
        classification: evidence.errors.length ? "recovered" : "first_pass",
        completedAt: new Date().toISOString(),
      });
      console.log(
        JSON.stringify({
          case: name,
          saved: true,
          revision: latest.dashboard.draftRevision,
          errors: evidence.errors.length,
          saveCalls: evidence.saveCalls,
        }),
      );
      process.exit(0);
    }
    console.log(
      JSON.stringify({
        case: name,
        status: conversation.status,
        saved: Boolean(saved),
        calls: evidence.calls.length,
        errors: evidence.errors.length,
      }),
    );
    if (["interrupted", "error", "failed"].includes(conversation.status))
      throw new Error("Conversation ended: " + conversation.status);
    if (conversation.status === "idle" && evidence.calls.length && !saved)
      throw new Error("Agent stopped without a new matching save receipt");
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  throw new Error("Generation deadline exceeded");
} catch (error) {
  const state = await load(`${name}/agent-state.json`).catch(() => null);
  if (state) await save(`${name}/tool-evidence.json`, {
    ...toolEvidence(state, generation.priorIds), classification: "failed",
    completedAt: new Date().toISOString(),
  });
  await save(`${name}/failure.json`, {
    classification: "failed",
    error: error.message,
    at: new Date().toISOString(),
  });
  throw error;
}
