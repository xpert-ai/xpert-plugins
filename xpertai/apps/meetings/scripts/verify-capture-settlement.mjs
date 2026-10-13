import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { startRemoteViewPreview } from "../../../../tools/remote-view-preview/preview-host.mjs";
import fixture from "../remote-components/meetings/preview.config.mjs";

// Built iframe and real bridge, with synthetic lifecycle events and no audio devices.
const browser = await chromium.launch(
  process.env.MEETINGS_CHROME_PATH
    ? { executablePath: process.env.MEETINGS_CHROME_PATH, headless: true }
    : { channel: "chrome", headless: true }
);
try {
  for (const locale of ["zh-Hans", "en-US"]) {
    for (const capture of ["created", "recording", "stopped"]) {
      const record = structuredClone(fixture.state.records[0]);
      Object.assign(record, {
        capture, processing: capture === "stopped" ? "queued" : "not_started", startedAt: null, endedAt: null,
        expectedChunks: null, errorCode: null, durationMs: 0, transcript: [], summary: null,
      });
      const preview = await startRemoteViewPreview({
        ...fixture,
        state: { records: [record], recording: null },
        hostContext: { ...fixture.hostContext, locale, initialQuery: { selectionId: record.id } },
      });
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(preview.url);
        const frame = page.frameLocator("#remote-view");
        await frame.getByRole("heading", { name: record.title, exact: true }).waitFor();
        await frame.getByRole("tab", { name: locale === "zh-Hans" ? "会议笔记" : "Meeting notes", exact: true }).click();
        Object.assign(preview.state.records[0], {
          capture: capture === "stopped" ? "stopped" : "interrupted", processing: "failed",
          errorCode: capture === "stopped" ? "speech_to_text_model_missing" : "audio_input_timeout",
          endedAt: new Date().toISOString(), expectedChunks: { microphone: 0, system: 0 },
        });
        const alert = frame.getByRole("alert");
        await alert.waitFor({ timeout: 6000 });
        assert.match(await alert.innerText(), capture === "stopped"
          ? (locale === "zh-Hans" ? /尚未配置语音转写模型/ : /No speech-to-text model is configured/)
          : (locale === "zh-Hans" ? /未能持续收到音频/ : /Audio input stopped arriving/));
        await frame.getByText(locale === "zh-Hans" ? "需要处理" : "Needs attention", { exact: true }).waitFor();
        if (capture === "stopped") {
          const retry = frame.getByRole("button", { name: locale === "zh-Hans" ? "重试处理" : "Retry processing", exact: true });
          assert.equal(await retry.count(), 1);
          await retry.click();
          await alert.waitFor({ state: "hidden" });
          assert.equal(preview.state.records[0].processing, "ready");
        }
        assert.deepEqual(errors, []);
        console.log(`PASS ${locale}: ${capture} → failed, error visible without manual refresh`);
      } finally {
        await page.close();
        await preview.close();
      }
    }
  }
} finally {
  await browser.close();
}
