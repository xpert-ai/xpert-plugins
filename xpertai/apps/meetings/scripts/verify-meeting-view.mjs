import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { startRemoteViewPreview } from "../../../../tools/remote-view-preview/preview-host.mjs";
import fixture from "../remote-components/meetings/preview.config.mjs";

// Built iframe + protocol regression. Synthetic data, no devices or account access.
const record = structuredClone(fixture.state.records[0]);
const final = structuredClone(record);
Object.assign(record, {
  capture: "recording",
  processing: "not_started",
  expectedChunks: null,
  transcript: [],
  summary: null,
  summaryVersion: 0,
  notesInputRevision: null,
  notes: "已保存的个人笔记",
  endedAt: null,
  workspace: { folder: "meetings/preview", status: "ready", errorCode: null },
  assistant: {
    conversationId: randomUUID(),
    threadId: "preview-thread",
    submittedUntilMs: 0,
    silenceSeconds: 10,
    operations: [],
  },
});
const tokens = {
  densityRootFontSize: "16px",
  fontSizeXs: "0.6875rem",
  fontSizeSm: "0.75rem",
  fontSizeMd: "0.8125rem",
  fontSizeLg: "0.875rem",
  fontSizeButton: "0.75rem",
  fontSizeControl: "0.75rem",
  buttonHeight: "2rem",
  buttonHeightSm: "1.75rem",
  controlHeight: "2rem",
  radiusMd: "0.5rem",
  radiusLg: "0.625rem",
  colorPrimary: "#f59e0b",
  colorBackground: "#ffffff",
  colorForeground: "#18181b",
  colorCard: "#ffffff",
  colorMuted: "#f4f4f5",
  colorMutedForeground: "#71717a",
  colorBorder: "#e4e4e7",
};
let reads = 0,
  activeReads = 0,
  maxReads = 0,
  sessions = 0;
const init = {
  ...fixture.hostContext,
  scopeRevision: 7,
  initialQuery: { selectionId: record.id },
  theme: { mode: "light", tokens },
};
const preview = await startRemoteViewPreview({
  ...fixture,
  hostContext: init,
  state: {
    records: [record],
    recording: {
      id: record.id,
      captureId: record.sessionId,
      start: Date.now(),
    },
  },
  async handleRequest(message, context) {
    const response = (result) => ({
      type: "clientCommandResult",
      scopeRevision: message.scopeRevision,
      result: { success: true, data: result },
    });
    if (message.type === "requestData" && message.query?.selectionId) {
      activeReads++;
      maxReads = Math.max(maxReads, activeReads);
      try {
        // Longer than the 1.5s polling interval: formerly every response was discarded.
        if (++reads > 1) await delay(2200);
        return await fixture.handleRequest(message, context);
      } finally {
        activeReads--;
      }
    }
    if (message.actionKey === "document.session") {
      sessions++;
      // Real hosts send errors without scopeRevision, even after a versioned init.
      throw new Error("Synthetic collaboration connection failure");
    }
    if (message.commandKey === "desktop.audio.capture.stop") {
      context.state.recording = null;
      Object.assign(context.state.records[0], {
        capture: "stopped",
        processing: "summarizing",
        endedAt: new Date().toISOString(),
        expectedChunks: { microphone: 1, system: 1 },
      });
      context.state.records[0].assistant.operations = [
        {
          id: randomUUID(),
          kind: "final",
          status: "running",
          executionId: randomUUID(),
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          settled: false,
          errorCode: null,
          fromMs: 0,
          throughMs: 5000,
        },
      ];
      return response({
        supported: true,
        status: "idle",
        elapsedMs: 0,
        microphone: 0,
        system: 0,
        pendingCount: 0,
      });
    }
    return fixture.handleRequest(message, context);
  },
});
const browser = await chromium.launch(
  process.env.MEETINGS_CHROME_PATH
    ? { executablePath: process.env.MEETINGS_CHROME_PATH, headless: true }
    : { channel: "chrome", headless: true }
);
const page = await browser.newPage({ viewport: { width: 780, height: 1050 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const output = process.env.MEETINGS_VERIFY_OUTPUT_DIR;
if (output) await mkdir(output, { recursive: true });
try {
  await page.goto(preview.url);
  const frame = page.frameLocator("#remote-view");
  await frame
    .getByRole("heading", { name: record.title, exact: true })
    .waitFor();
  await frame.getByText(/编辑器暂时无法连接/).waitFor({ timeout: 4000 });
  await frame.getByText("已保存的个人笔记", { exact: true }).waitFor();
  await frame
    .getByRole("button", { name: "重新连接编辑器", exact: true })
    .click();
  await delay(200);
  assert.ok(sessions >= 2, "manual reconnection retries immediately");
  assert.equal(
    await frame.getByRole("checkbox", { name: "跟随最新内容" }).isChecked(),
    true
  );
  await frame.getByRole("checkbox", { name: "跟随最新内容" }).uncheck();
  assert.equal(
    await frame.getByRole("checkbox", { name: "跟随最新内容" }).isChecked(),
    false
  );
  preview.state.records[0].transcript = [
    {
      id: "microphone-0",
      track: "microphone",
      startMs: 0,
      endMs: 5000,
      text: "实时转写在慢接口下持续刷新",
      final: false,
    },
  ];
  await frame
    .getByText("实时转写在慢接口下持续刷新", { exact: true })
    .waitFor({ timeout: 8000 });
  assert.equal(maxReads, 1, "detail polls must not overlap");
  const stop = frame.getByRole("button", { name: "结束录音", exact: true });
  const measure = () =>
    stop.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      fontSize: getComputedStyle(element).fontSize,
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
    }));
  assert.deepEqual(await measure(), {
    height: 32,
    fontSize: "12px",
    rootFontSize: "16px",
  });
  await frame.locator("body").evaluate(() => window.scrollTo(0, 0));
  if (output)
    await page.screenshot({
      path: join(output, "meeting-light.png"),
      fullPage: true,
    });
  const updateTheme = async (theme) =>
    page.evaluate(
      (payload) => {
        document
          .querySelector("#remote-view")
          .contentWindow.postMessage(payload, "*");
      },
      {
        channel: "xpertai.remote_component",
        protocolVersion: 1,
        instanceId: fixture.instanceId,
        type: "init",
        ...init,
        theme,
      }
    );
  await updateTheme({
    mode: "dark",
    tokens: {
      ...tokens,
      densityRootFontSize: "14px",
      buttonHeight: "1.75rem",
      colorBackground: "#09090b",
      colorForeground: "#fafafa",
      colorCard: "#18181b",
      colorMuted: "#27272a",
      colorMutedForeground: "#a1a1aa",
      colorBorder: "#3f3f46",
    },
  });
  await delay(300);
  assert.deepEqual(await measure(), {
    height: 24.5,
    fontSize: "10.5px",
    rootFontSize: "14px",
  });
  assert.equal(await frame.locator("html").getAttribute("data-theme"), "dark");
  assert.equal(
    await frame
      .locator("main")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(9, 9, 11)"
  );
  await page.setViewportSize({ width: 390, height: 950 });
  await delay(300);
  assert.equal(
    await frame
      .locator("body")
      .evaluate((element) => element.scrollWidth <= window.innerWidth),
    true,
    "no narrow viewport horizontal overflow"
  );
  if (output)
    await page.screenshot({
      path: join(output, "meeting-dark-compact.png"),
      fullPage: true,
    });
  await page.setViewportSize({ width: 780, height: 1050 });
  await updateTheme({ mode: "light", tokens });
  await stop.click();
  await frame
    .getByText("助手正在总结", { exact: true })
    .waitFor({ timeout: 10000 });
  Object.assign(preview.state.records[0], {
    processing: "ready",
    summary: final.summary,
    summaryVersion: 1,
    summaryMarkdown: "最终纪要正文已保存",
  });
  preview.state.records[0].assistant.operations[0].status = "ready";
  await frame
    .getByText("最终纪要已保存", { exact: true })
    .waitFor({ timeout: 9000 });
  await frame.getByRole("tab", { name: "会议摘要", exact: true }).click();
  await frame.getByText("最终纪要正文已保存", { exact: true }).waitFor();
  const summaryTab = frame.getByRole("tab", { name: "会议摘要", exact: true });
  assert.equal(
    await summaryTab.evaluate(
      (element) => getComputedStyle(element, "::after").height
    ),
    "2px"
  );
  await summaryTab.focus();
  await summaryTab.press("ArrowRight");
  await frame
    .locator('[role="tab"][aria-selected="true"]')
    .filter({ hasText: "个人笔记" })
    .waitFor();
  assert.equal(
    await frame
      .getByRole("tab", { name: "个人笔记", exact: true })
      .getAttribute("aria-selected"),
    "true"
  );
  await frame.getByRole("tab", { name: "会议摘要", exact: true }).click();
  assert.equal(
    await frame
      .locator("main")
      .innerText()
      .then((text) => text.includes("Assistant")),
    false
  );
  if (output)
    await page.screenshot({
      path: join(output, "meeting-complete.png"),
      fullPage: true,
    });
  assert.deepEqual(errors, []);
  console.log(
    "PASS slow polling, final status, unversioned host errors, saved-content fallback, reconnect, shadcn controls, keyboard tabs, locale and responsive theme/density"
  );
} finally {
  await page.close();
  await browser.close();
  await preview.close();
}
