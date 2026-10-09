import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { chromium } from "playwright-core";
import { startRemoteViewPreview } from "../../../../tools/remote-view-preview/preview-host.mjs";
import fixture from "../remote-components/meetings/preview.config.mjs";

// Exercises the built iframe and actual bridge; no audio devices or live APIs.
const browser = await chromium.launch(
  process.env.MEETINGS_CHROME_PATH
    ? { executablePath: process.env.MEETINGS_CHROME_PATH, headless: true }
    : { channel: "chrome", headless: true }
);
const output = process.env.MEETINGS_VERIFY_OUTPUT_DIR;
if (output) await mkdir(output, { recursive: true });
let passed = 0;
try {
  for (const locale of ["zh-Hans", "en-US"]) {
    const zh = locale === "zh-Hans";
    for (const mode of [
      "unsupported",
      "unsupported-state",
      "permission-denied",
      "host-error",
      "supported",
    ]) {
      let stateRequests = 0,
        startRequests = 0;
      const preview = await startRemoteViewPreview({
        ...fixture,
        hostContext: { ...fixture.hostContext, locale },
        async handleRequest(message, context) {
          if (message.type === "invokeClientCommand") {
            if (message.commandKey === "desktop.audio.capture.state") {
              stateRequests++;
              if (mode === "unsupported")
                return { result: { success: false, code: "unsupported" } };
              if (mode === "unsupported-state")
                return {
                  result: {
                    success: true,
                    data: {
                      supported: false,
                      status: "idle",
                      elapsedMs: 0,
                      microphone: 0,
                      system: 0,
                      pendingCount: 0,
                    },
                  },
                };
            }
            if (message.commandKey === "desktop.audio.capture.start") {
              startRequests++;
              if (mode === "permission-denied")
                return {
                  result: { success: false, code: "audio_permission_denied" },
                };
              if (mode === "host-error")
                throw new Error("Synthetic bridge failure");
            }
          }
          return fixture.handleRequest(message, context);
        },
      });
      const page = await browser.newPage({
        viewport: { width: 1000, height: 900 },
      });
      try {
        await page.goto(preview.url);
        const frame = page.frameLocator("#remote-view");
        await frame
          .getByRole("button", {
            name: zh ? "开始新录音" : "New recording",
            exact: true,
          })
          .click();
        const dialog = frame.getByRole("dialog");
        const start = dialog.getByRole("button", {
          name: zh ? "开始录音" : "Start recording",
          exact: true,
        });
        if (mode === "unsupported" || mode === "unsupported-state") {
          const hint = dialog.getByRole("status");
          await hint
            .getByText(
              zh
                ? /当前环境不支持录音/
                : /Recording is unavailable in this environment/
            )
            .waitFor();
          assert.match(
            await hint.innerText(),
            zh
              ? /浏览器中仍可查看和编辑/
              : /view and edit meetings in your browser/
          );
          assert.equal(await start.isDisabled(), true);
          await setTimeout(450);
          assert.equal(
            stateRequests,
            1,
            "unsupported hosts should not be polled repeatedly"
          );
          assert.equal(startRequests, 0);
          await dialog
            .getByRole("button", { name: zh ? "取消" : "Cancel", exact: true })
            .click();
          await frame.getByRole("button", { name: /产品设计评审/ }).click();
          await frame
            .getByRole("heading", { name: "产品设计评审", exact: true })
            .waitFor();
        } else {
          const name = dialog.getByLabel(zh ? "会议名称" : "Meeting title", {
            exact: true,
          });
          await name.fill("Capture feedback fixture");
          await start.click();
          if (mode === "supported") {
            await dialog.waitFor({ state: "hidden" });
            await frame
              .getByRole("button", {
                name: zh ? "结束录音" : "End recording",
                exact: true,
              })
              .waitFor();
            assert.ok(preview.state.recording);
          } else {
            const alert = dialog.getByRole("alert");
            await alert.waitFor();
            assert.match(
              await alert.innerText(),
              mode === "permission-denied"
                ? zh
                  ? /隐私与安全性/
                  : /Privacy & Security/
                : zh
                ? /无法连接录音功能/
                : /Could not connect to the recording feature/
            );
            assert.equal(await name.inputValue(), "Capture feedback fixture");
            assert.equal(
              await start.isEnabled(),
              true,
              "user can retry after fixing permissions"
            );
            assert.equal(preview.state.recording, null);
            if (output && zh)
              await page.screenshot({ path: join(output, `${mode}.png`) });
          }
          assert.equal(startRequests, 1);
        }
        passed++;
        console.log(`PASS ${locale} ${mode}`);
      } finally {
        await page.close();
        await preview.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(`Capture feedback: ${passed} browser checks passed.`);
