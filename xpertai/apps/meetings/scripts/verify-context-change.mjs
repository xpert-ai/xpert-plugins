import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { startRemoteViewPreview } from "../../../../tools/remote-view-preview/preview-host.mjs";
import fixture from "../remote-components/meetings/preview.config.mjs";

// Exercise the retained-View protocol used when opening the meeting conversation.
const browser = await chromium.launch(process.env.MEETINGS_CHROME_PATH
  ? { executablePath: process.env.MEETINGS_CHROME_PATH, headless: true }
  : { channel: "chrome", headless: true });
try {
  for (const locale of ["zh-Hans", "en-US"]) {
    const record = structuredClone(fixture.state.records[0]);
    let revision = 7, denied = false, reads = 0, states = 0;
    const preview = await startRemoteViewPreview({
      ...fixture,
      state: { records: [record], recording: null },
      hostContext: { ...fixture.hostContext, locale, scopeRevision: revision, initialQuery: { selectionId: record.id } },
      async handleRequest(message, context) {
        if (message.scopeRevision !== revision) return { type: "error", code: "context_changed" };
        if (message.commandKey === "desktop.audio.capture.state") {
          states++;
          return { type: "clientCommandResult", scopeRevision: revision, result: denied
            ? { success: false, code: "scope_changed" }
            : { success: true, data: { supported: true, status: "idle", elapsedMs: 0, microphone: 0, system: 0, pendingCount: 0 } } };
        }
        if (message.type === "requestData") reads++;
        return { ...await fixture.handleRequest(message, context), scopeRevision: revision };
      },
    });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    try {
      await page.goto(preview.url);
      const frame = page.frameLocator("#remote-view");
      await frame.getByRole("heading", { name: record.title, exact: true }).waitFor();
      const sendContext = (next, instanceId = fixture.instanceId) => page.evaluate(({next, instanceId}) => {
        document.querySelector("#remote-view").contentWindow.postMessage({
          channel: "xpertai.remote_component", protocolVersion: 1, type: "hostEvent", instanceId,
          event: { type: "view.context.changed", data: { revision: next, runtimeScope: { projectId: null, conversationId: "meeting-conversation" } } },
        }, "*");
      }, { next, instanceId });
      revision = 8;
      // Include a stale request during transition, as the real host does.
      await page.waitForTimeout(250);
      const priorReads = reads, priorStates = states;
      await sendContext(revision);
      await frame.getByRole("heading", { name: record.title, exact: true }).waitFor();
      await page.waitForTimeout(700);
      assert.ok(reads > priorReads && states > priorStates, "data and device polling recover at the new revision");
      const scopeError = locale === "zh-Hans" ? /账号或组织已切换/ : /Recording stopped because the account or organization changed/;
      assert.equal(await frame.getByText(scopeError).count(), 0);
      await sendContext(7);
      await sendContext(99, "another-instance");
      const before = states;
      await page.waitForTimeout(450);
      assert.ok(states > before, "stale and foreign context events cannot replace the revision");
      denied = true;
      await frame.getByText(scopeError).waitFor();
      denied = false;
      await frame.getByText(scopeError).waitFor({ state: "hidden" });
      assert.deepEqual(errors, []);
      console.log(`PASS ${locale}: retained context updates recover polling; real scope errors stay visible`);
    } finally { await page.close(); await preview.close(); }
  }
} finally { await browser.close(); }
