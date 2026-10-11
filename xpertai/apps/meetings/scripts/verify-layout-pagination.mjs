import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { startRemoteViewPreview } from "../../../../tools/remote-view-preview/preview-host.mjs";
import fixture from "../remote-components/meetings/preview.config.mjs";

const records = Array.from({ length: 45 }, (_, index) => ({
  ...structuredClone(fixture.state.records[0]),
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  title: `评审会议 ${String(index + 1).padStart(2, "0")}`,
  workspace: { folder: `meetings/2026-10-11-review-${index}`, status: "ready", errorCode: null },
}));
const reads = [], actions = [], navigation = [];
const init = { ...fixture.hostContext, scopeRevision: 1, initialQuery: {} };
const preview = await startRemoteViewPreview({ ...fixture, hostContext: init,
  state: { records, recording: null },
  async handleRequest(message, context) {
    if (message.type === "requestData") reads.push(message.query);
    if (message.type === "executeAction") actions.push({ key: message.actionKey, input: message.input });
    if (message.commandKey === "workbench.navigation.open") navigation.push(message.payload);
    return fixture.handleRequest(message, context);
  },
});
const browser = await chromium.launch(process.env.MEETINGS_CHROME_PATH
  ? { executablePath: process.env.MEETINGS_CHROME_PATH, headless: true }
  : { channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 850, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
const output = process.env.MEETINGS_VERIFY_OUTPUT_DIR;
if (output) await mkdir(output, { recursive: true });
try {
  await page.goto(preview.url);
  const frame = page.frameLocator("#remote-view");
  const rows = frame.locator(".meeting-list [data-meeting-id]:not([data-leaving]) .meeting-row");
  const pageLabel = text => frame.getByText(text, { exact: true });
  const waitCount = async count => {
    await rows.nth(count).waitFor({ state: "hidden" });
    await rows.nth(count - 1).waitFor();
    assert.equal(await rows.count(), count);
  };
  await waitCount(20);
  await pageLabel("共 45 条").waitFor();
  const geometry = await rows.first().evaluate(element => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    const next = element.parentElement.nextElementSibling.getBoundingClientRect();
    return { px: parseFloat(style.paddingLeft), py: parseFloat(style.paddingTop), gap: next.top - rect.bottom };
  });
  assert.ok(geometry.px > geometry.py);
  assert.equal(geometry.gap, 0);
  assert.deepEqual(reads.filter(q => !q.selectionId && !q.parameters?.captureId)[0], { search: "", page: 1, pageSize: 20 });
  if (output) await page.screenshot({ path: join(output, "library.png") });
  await frame.getByRole("button", { name: "下一页", exact: true }).click();
  await rows.filter({ hasText: "评审会议 21" }).waitFor();
  assert.equal(reads.at(-1).page, 2);
  await rows.filter({ hasText: "评审会议 21" }).click();
  await frame.getByRole("heading", { name: "评审会议 21", exact: true }).waitFor();
  assert.ok(await frame.locator(".meeting-header").evaluate(e => e.getBoundingClientRect().height < 110));
  assert.equal(await frame.getByText("助手工作区目录", { exact: true }).count(), 0);
  if (output) await page.screenshot({ path: join(output, "detail.png") });
  await frame.getByRole("button", { name: "会议信息", exact: true }).click();
  const info = frame.locator('[data-slot="popover-content"]');
  await info.getByText("工作区文件已同步", { exact: true }).waitFor();
  assert.equal(await frame.getByRole("button", { name: "会议信息", exact: true }).getAttribute("aria-expanded"), "true");
  const box = await info.evaluate(e => {
    const r = e.getBoundingClientRect();
    return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, width: innerWidth, height: innerHeight };
  });
  assert.ok(box.x >= 0 && box.right <= box.width && box.y >= 0 && box.bottom <= box.height, JSON.stringify(box));
  if (output) await page.screenshot({ path: join(output, "meeting-info.png") });
  const synced = page.waitForResponse(response => response.url().endsWith("/__xpert/bridge") && response.request().postDataJSON()?.actionKey === "workspace.sync");
  await info.getByRole("button", { name: "重新同步文件" }).click();
  await synced;
  await info.getByRole("button", { name: "重新同步文件" }).and(frame.locator(":enabled")).waitFor();
  assert.ok(actions.some(a => a.key === "workspace.sync" && a.input.meetingId === records[20].id));
  await info.press("Escape");
  await info.waitFor({ state: "hidden" });
  await frame.getByRole("button", { name: "导出笔记", exact: true }).click();
  await frame.getByRole("menuitemcheckbox", { name: "包含转写" }).click();
  assert.equal(await frame.getByRole("menuitemcheckbox", { name: "包含转写" }).getAttribute("aria-checked"), "true");
  const downloaded = page.waitForEvent("download");
  await frame.getByRole("menuitem", { name: "导出笔记", exact: true }).click();
  await downloaded;
  assert.equal(actions.find(a => a.key === "export").input.includeTranscript, true);
  await frame.getByRole("button", { name: "更多操作" }).click();
  await frame.getByRole("menuitem", { name: "删除会议", exact: true }).click();
  await frame.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(actions.filter(a => a.key === "delete").length, 0);
  await frame.getByRole("button", { name: "会议记录", exact: true }).click();
  await rows.filter({ hasText: "评审会议 21" }).waitFor();
  await pageLabel("第 2 / 3 页").waitFor();
  assert.equal(navigation.at(-1).parameters.listPage, 2);
  await frame.getByRole("button", { name: "下一页", exact: true }).click();
  await waitCount(5);
  await pageLabel("第 3 / 3 页").waitFor();
  assert.equal(await frame.getByRole("button", { name: "下一页", exact: true }).isEnabled(), false);
  await frame.getByRole("textbox", { name: "搜索会议、笔记和转写内容" }).fill("评审会议 01");
  await rows.filter({ hasText: "评审会议 01" }).waitFor();
  assert.equal(await rows.count(), 1);
  await pageLabel("第 1 / 1 页").waitFor();
  assert.equal(reads.at(-1).page, 1);
  await frame.getByRole("textbox", { name: "搜索会议、笔记和转写内容" }).fill("");
  await waitCount(20);
  await frame.getByRole("combobox", { name: "每页条数" }).click();
  await frame.getByRole("option", { name: "10", exact: true }).click();
  await waitCount(10);
  await pageLabel("第 1 / 5 页").waitFor();
  assert.equal(reads.at(-1).pageSize, 10);
  // Simulate host query restoration and compact/dark theme without replacing the iframe.
  await page.evaluate(payload => document.querySelector("#remote-view").contentWindow.postMessage(payload, "*"), {
    channel: "xpertai.remote_component", protocolVersion: 1, instanceId: fixture.instanceId, type: "init", ...init,
    initialQuery: { parameters: { listPage: 3, listPageSize: 10, listSearch: "" } },
    theme: { mode: "dark", tokens: { densityRootFontSize: "14px", colorBackground: "#09090b", colorForeground: "#fafafa", colorMuted: "#27272a", colorMutedForeground: "#a1a1aa", colorBorder: "#3f3f46" } },
  });
  await rows.filter({ hasText: "评审会议 21" }).waitFor();
  await pageLabel("第 3 / 5 页").waitFor();
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(await frame.locator("main").evaluate(e => e.scrollWidth <= innerWidth), true);
  if (output) {
    await frame.locator(".meeting-list").evaluate(async element => {
      await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
    });
    await page.screenshot({ path: join(output, "library-dark-narrow.png") });
  }
  await rows.first().click();
  await frame.getByRole("heading", { name: "评审会议 21", exact: true }).waitFor();
  assert.equal(await frame.locator("main").evaluate(e => e.scrollWidth <= innerWidth), true);
  if (output) await page.screenshot({ path: join(output, "detail-dark-narrow.png") });
  await frame.getByRole("button", { name: "更多操作" }).click();
  await frame.getByRole("menuitem", { name: "删除会议", exact: true }).click();
  await frame.getByRole("alertdialog").getByRole("button", { name: "删除会议", exact: true }).click();
  await rows.first().waitFor();
  assert.equal(preview.state.records.some(r => r.id === records[20].id), false);
  assert.deepEqual(errors, []);
  console.log("PASS compact headers, disclosure placement, export options, delete cancel/confirm, remote pagination/search/page size/query restoration, dark/compact/narrow layout");
} finally { await page.close(); await browser.close(); await preview.close(); }
