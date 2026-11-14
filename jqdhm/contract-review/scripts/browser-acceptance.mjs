import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Real browser + Java + Ollama against the explicitly labelled local preview.
// A network failure is injected once; it is not claimed to be a real model outage.
const base = process.env.DEMO_URL || 'http://127.0.0.1:4397';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = new URL('../test-results/browser-preview/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
page.on('dialog', async dialog => dialog.accept());
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const title = `浏览器验收合同（虚构）-${randomUUID().slice(0,8)}`;
const source = '设备维护服务合同\n甲方：星河制造有限公司\n乙方：远帆设备服务有限公司\n合同总金额：120,000元（含税）。\n服务生效日期：2026-10-01；到期日期：2027-09-30。\n付款方式：合同签订后支付30%，验收合格后支付70%。\n以上企业与合同均为测试用虚构数据。';
const report = { at: new Date().toISOString(), scope: 'Local preview browser + Java + real Ollama; not Xpert platform acceptance', title, checks: [] };
try {
  await page.goto(base);
  const ui = page.frameLocator('iframe');
  await expect(ui.getByRole('button', { name: '本地模型提取', exact: true })).toBeEnabled();
  await ui.getByLabel('合同标题', { exact: true }).fill(title);
  await ui.getByLabel('合同正文', { exact: true }).fill(source);
  let failedOnce = false;
  await page.route('**/api/action', async route => {
    if (!failedOnce && route.request().postDataJSON()?.actionKey === 'extract_contract') {
      failedOnce = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '验收注入：模型暂时不可用，请重试。' }) });
    } else await route.continue();
  });
  await ui.getByRole('button', { name: '本地模型提取', exact: true }).click();
  await expect(ui.getByRole('status')).toContainText('验收注入');
  await expect(ui.getByRole('button', { name: '重试提取', exact: true })).toBeEnabled();
  await expect(ui.getByRole('button', { name: '确认资料', exact: true })).toBeDisabled();
  await page.screenshot({ path: fileURLToPath(new URL('01-failure-original-retained.png', output)), fullPage: true });
  report.checks.push('injected-failure-keeps-original-and-blocks-confirm');
  await page.reload();
  await expect(ui.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(ui.getByRole('button', { name: '重试提取', exact: true })).toBeEnabled();
  report.checks.push('pending-original-survives-reload');
  await ui.getByRole('button', { name: '重试提取', exact: true }).click();
  await expect(ui.getByRole('status')).toContainText('本地模型已生成草稿', { timeout: 240000 });
  await expect(ui.getByLabel('甲方', { exact: true })).not.toHaveValue('');
  await page.screenshot({ path: fileURLToPath(new URL('02-real-model-fields.png', output)), fullPage: true });
  report.checks.push('real-model-extracts-fields');
  const amount = ui.getByLabel('合同金额', { exact: true });
  const edited = await amount.inputValue() === '120,000元' ? '120,000' : '120,000元';
  await amount.fill(edited);
  await ui.getByLabel('合同金额的原文依据', { exact: true }).fill('合同总金额：120,000元（含税）。');
  await expect(ui.getByRole('button', { name: '确认资料', exact: true })).toBeDisabled();
  await ui.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(ui.getByRole('status')).toContainText('修改已保存');
  await page.reload();
  await expect(amount).toHaveValue(edited);
  await ui.getByRole('button', { name: '确认资料', exact: true }).click();
  await expect(ui.getByRole('status')).toContainText('资料已人工确认');
  await expect(amount).toBeDisabled();
  await page.reload();
  await expect(amount).toHaveValue(edited);
  await expect(amount).toBeDisabled();
  await ui.getByRole('button', { name: '生成摘要', exact: true }).click();
  await expect(ui.getByRole('heading', { name: '合同摘要', exact: true })).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL('03-confirmed-reloaded.png', output)), fullPage: true });
  report.checks.push('human-save-reload-confirm-reload-summary');
  assert.deepEqual(errors, []);
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.error = String(error);
  await page.screenshot({ path: fileURLToPath(new URL('failure.png', output)), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.tracing.stop({ path: fileURLToPath(new URL('trace.zip', output)) });
  await browser.close();
}
