import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { startRemoteViewPreview } from "../../../../tools/remote-view-preview/preview-host.mjs";
import fixture from "../remote-components/meetings/preview.config.mjs";

const records = Array.from({ length: 20 }, (_, index) => ({
  ...structuredClone(fixture.state.records[0]),
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  title: `刷新测试 ${index + 1}`,
}));
let gate;
const heldRequests = [];
function holdRequest(fail = false) {
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  gate = { ready, pending, started, release, fail };
  heldRequests.push(gate);
  return gate;
}
const init = { ...fixture.hostContext, scopeRevision: 1, initialQuery: {} };
const preview = await startRemoteViewPreview({ ...fixture, hostContext: init,
  state: { records, recording: null },
  async handleRequest(message, context) {
    const result = await fixture.handleRequest(message, context);
    if (message.type === "requestData" && !message.query?.selectionId && gate) {
      const held = gate;
      gate = undefined;
      held.started();
      await held.pending;
      if (held.fail) throw new Error("request_failed");
    }
    return result;
  },
});
const browser = await chromium.launch(process.env.MEETINGS_CHROME_PATH
  ? { executablePath: process.env.MEETINGS_CHROME_PATH, headless: true }
  : { channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 850, height: 600 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.goto(preview.url);
  const frame = page.frameLocator("#remote-view");
  const list = frame.locator(".meeting-list");
  const rows = frame.locator('[data-meeting-id]:not([data-leaving]) .meeting-row');
  const refresh = frame.getByRole("button", { name: "刷新", exact: true }).first();
  const row = id => frame.locator(`[data-meeting-id="${id}"]`);
  const settled = () => list.evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
  });
  const idle = () => frame.locator('[aria-busy="false"]').waitFor();
  await rows.nth(19).waitFor();
  await idle();
  await settled();
  // Observe animation calls by business ID without changing production animation behavior.
  await list.evaluate(element => {
    window.meetingAnimations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (element.contains(this)) window.meetingAnimations.push(this.dataset.meetingId);
      return animate.apply(this, args);
    };
  });
  const original = await row(records[8].id).elementHandle();
  const listNode = await list.elementHandle();
  const position = await list.evaluate(element => {
    element.parentElement.scrollTop = 220;
    return element.parentElement.scrollTop;
  });
  const delayed = holdRequest();
  await refresh.click();
  await delayed.ready;
  await row(records[8].id).locator("button").focus();
  assert.equal(await rows.count(), 20, "rows stay mounted during a slow refresh");
  assert.equal(await listNode.evaluate(element => element.isConnected), true);
  assert.equal(await list.evaluate(element => element.parentElement.scrollTop), position);
  delayed.release();
  await idle();
  assert.equal(await original.evaluate(element => element.isConnected && element.contains(document.activeElement)), true, "same ID retains DOM and focus");
  assert.equal(await list.evaluate(element => element.parentElement.scrollTop), position);
  assert.deepEqual(await list.evaluate(() => window.meetingAnimations), [], "unchanged rows never replay entrance animations");

  // One insertion, removal, reorder and content/status update in the same response.
  const removed = preview.state.records[3];
  const added = { ...structuredClone(records[0]), id: "00000000-0000-4000-8000-000000000099", title: "新增会议" };
  preview.state.records = [added, preview.state.records[8], ...preview.state.records.filter(record => ![removed.id, records[8].id].includes(record.id))];
  preview.state.records[1].title = "同一会议的新标题";
  preview.state.records[1].processing = "failed";
  await refresh.click();
  await row(records[8].id).getByText("同一会议的新标题", { exact: true }).waitFor();
  await idle();
  assert.equal(await original.evaluate(element => element.isConnected), true);
  await row(records[8].id).getByText("需要处理", { exact: true }).waitFor();
  await row(removed.id).waitFor({ state: "detached" });
  await settled();
  assert.equal(await rows.count(), 20);
  assert.equal(await rows.first().innerText().then(text => text.includes("新增会议")), true);
  const animatedIds = await list.evaluate(() => window.meetingAnimations);
  assert.ok(animatedIds.includes(added.id) && animatedIds.includes(removed.id) && animatedIds.includes(records[8].id), "membership and position changes animate by ID");

  // A failed refresh keeps the previous result available and retry recovers it.
  const failed = holdRequest(true);
  await refresh.click();
  await failed.ready;
  failed.release();
  await frame.getByRole("alert").waitFor();
  await idle();
  assert.equal(await rows.count(), 20);
  assert.equal(await original.evaluate(element => element.isConnected), true);
  await refresh.click();
  await frame.getByRole("alert").waitFor({ state: "hidden" });
  await idle();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await list.evaluate(() => { window.meetingAnimations.length = 0; });
  preview.state.records = preview.state.records.slice(1);
  await refresh.click();
  await row(added.id).waitFor({ state: "detached" });
  await idle();
  assert.equal(await rows.count(), 19);
  assert.deepEqual(await list.evaluate(() => window.meetingAnimations), [], "reduced motion skips all row transitions");

  preview.state.records = [];
  await refresh.click();
  await rows.first().waitFor({ state: "detached" });
  await idle();
  assert.equal(await listNode.evaluate(element => element.isConnected), true, "empty refresh keeps the list container");
  preview.state.records = records;
  await refresh.click();
  await rows.nth(19).waitFor();
  await idle();

  // Changing scope must clear data immediately; a late old-scope response cannot repopulate it.
  const stale = holdRequest();
  await refresh.click();
  await stale.ready;
  const newScope = holdRequest();
  preview.state.records = [];
  await page.evaluate(payload => document.querySelector("#remote-view").contentWindow.postMessage(payload, "*"), {
    channel: "xpertai.remote_component", protocolVersion: 1, instanceId: fixture.instanceId,
    type: "init", ...init, scopeRevision: 2,
  });
  await list.waitFor({ state: "detached" });
  await newScope.ready;
  stale.release();
  assert.equal(await rows.count(), 0);
  newScope.release();
  await idle();
  assert.equal(await rows.count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS slow/no-op refresh preserves DOM, focus and scroll; keyed insert/remove/move/update; failure/retry; reduced motion; scope isolation and late-response rejection");
} finally {
  for (const held of heldRequests) held.release();
  await page.close(); await browser.close(); await preview.close();
}
