import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Use a previously logged-in local test profile; no credentials are stored here.
const url = process.env.XPERT_ASSISTANT_URL;
const profile = process.env.XPERT_PROFILE_DIR;
assert.ok(url && profile, 'Set XPERT_ASSISTANT_URL and XPERT_PROFILE_DIR (already logged in).');
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Only local acceptance is supported.');
const output = new URL('../test-results/browser-xpert/', import.meta.url);
await mkdir(output, { recursive: true });
const context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1600, height: 1100 } });
const page = context.pages()[0] || await context.newPage();
page.on('dialog', dialog => dialog.accept());
const report = { at: new Date().toISOString(), scope: 'Real local Xpert workbench + agent tools + Java + Ollama', checks: [], model: 'qwen2.5:7b' };
const title = 'Xpert浏览器验收（虚构）-' + randomUUID().slice(0, 8);
const source = '设备维护服务合同\n甲方：星河制造有限公司\n乙方：远帆设备服务有限公司\n合同总金额：120,000元（含税）。\n服务生效日期：2026-10-01；到期日期：2027-09-30。\n付款方式：合同签订后支付30%，验收合格后支付70%。\n以上企业与合同均为测试用虚构数据。';
const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true });
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('iframe[src^="blob:"]').waitFor({ state: 'attached', timeout: 45000 });
  const show = page.getByRole('button', { name: '显示工作区面板', exact: true });
  if (await show.isVisible()) await show.click();
  const ui = page.frameLocator('iframe[src^="blob:"]');
  await expect(ui.getByRole('button', { name: '刷新合同列表', exact: true })).toBeEnabled({ timeout: 30000 });
  await expect(ui.getByRole('status', { includeHidden: true })).not.toContainText('Internal server error');
  await ui.getByLabel('合同标题', { exact: true }).fill(title);
  await ui.getByLabel('合同正文', { exact: true }).fill(source);
  await screenshot('01-xpert-input.png');
  await ui.getByRole('button', { name: '交给助手提取', exact: true }).click();
  await expect(ui.getByRole('status')).toContainText('已发送到助手', { timeout: 30000 });
  report.checks.push('intake-persists-original-and-dispatches-agent-command');
  console.log('Xpert saved original; waiting for actual model and candidate tool.');
  await expect(async () => {
    await ui.getByRole('button', { name: '刷新合同列表', exact: true }).click();
    await expect(ui.getByLabel('甲方', { exact: true })).toHaveValue('星河制造有限公司', { timeout: 3000 });
    await expect(ui.getByRole('button', { name: '重试提取', exact: true })).toHaveCount(0);
  }).toPass({ timeout: 240000, intervals: [5000] });
  await ui.getByRole('heading', { name: '合同资料整理助手', exact: true }).scrollIntoViewIfNeeded();
  await screenshot('02-xpert-model-result.png');
  report.checks.push('real-platform-agent-populates-evidence-fields');
  let failSave = true;
  await page.route('**/api/view-hosts/**/actions/update_contract', async route => {
    if (failSave) {
      failSave = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '验收注入：本次保存暂时失败，请重试。' }) });
    } else await route.continue();
  });
  const amount = ui.getByLabel('合同金额', { exact: true });
  const edited = (await amount.inputValue()) === '120,000元' ? '120,000' : '120,000元';
  await amount.fill(edited);
  await ui.getByLabel('合同金额的原文依据', { exact: true }).fill('合同总金额：120,000元（含税）。');
  await ui.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(ui.getByRole('status')).toContainText('验收注入', { timeout: 15000 });
  await expect(amount).toHaveValue(edited);
  await expect(ui.getByRole('button', { name: '确认资料', exact: true })).toBeDisabled();
  await ui.getByRole('status').scrollIntoViewIfNeeded();
  await screenshot('03-xpert-save-failure.png');
  report.checks.push('injected-save-failure-retains-edits-and-blocks-confirm');
  await ui.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(ui.getByRole('status')).toContainText('修改已保存');
  await page.reload();
  await expect(amount).toHaveValue(edited, { timeout: 30000 });
  await ui.getByRole('button', { name: '确认资料', exact: true }).click();
  await expect(ui.getByRole('status')).toContainText('资料已人工确认');
  await page.reload();
  await expect(amount).toHaveValue(edited, { timeout: 30000 });
  await expect(amount).toBeDisabled();
  await ui.getByRole('button', { name: '生成摘要', exact: true }).click();
  await expect(ui.getByRole('heading', { name: '合同摘要', exact: true })).toBeVisible();
  await ui.getByRole('heading', { name: '合同资料整理助手', exact: true }).scrollIntoViewIfNeeded();
  await screenshot('04-xpert-confirmed.png');
  report.checks.push('save-retry-reload-human-confirm-reload-summary');
  report.title = title;
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL'; report.error = String(error);
  await screenshot('failure.png').catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.close();
}
