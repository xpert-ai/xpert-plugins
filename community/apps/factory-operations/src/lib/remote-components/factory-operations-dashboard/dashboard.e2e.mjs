import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'

import { startRemoteViewPreview } from '../../../../../v3_16/xpert/tools/remote-view-preview/preview-host.mjs'
import previewConfig, { platformRoot } from './preview.config.mjs'

const requireFromPlatform = createRequire(resolve(platformRoot, 'package.json'))
const { chromium } = requireFromPlatform('playwright')

test('renders the read-only organization management dashboard from built assets', async (context) => {
  const preview = await startRemoteViewPreview({ ...previewConfig, state: structuredClone(previewConfig.state), logStartup: false, logErrors: false }, { port: 0 })
  context.after(() => preview.close())
  const browser = await chromium.launch({ headless: true })
  context.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, locale: 'zh-CN', colorScheme: 'light' })
  const pageErrors = []; const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  await page.goto(preview.url)
  const frame = page.frameLocator('#remote-view')
  await frame.getByRole('heading', { name: '工厂运营管理监控 Dashboard' }).waitFor({ state: 'visible', timeout: 15_000 })
  await frame.getByText('386,000', { exact: false }).waitFor({ state: 'visible' })
  assert.equal(await frame.locator('.fod-metric').count(), 5)
  assert.equal(await frame.locator('.fod-chart canvas').count(), 2)
  await frame.getByRole('row').filter({ hasText: '第一次诊断调用超时，已保留失败记录。' }).getByRole('button', { name: /打开/ }).click()
  await waitFor(() => Boolean(preview.state.navigation))
  assert.equal(preview.state.navigation.target, 'assistant.conversation')
  assert.equal(preview.state.navigation.executionId, 'execution-record-1')
  assert.equal(await frame.getByRole('button', { name: /批准|执行|拒绝/ }).count(), 0)
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'))
  assert.equal(consoleErrors.length, 0, consoleErrors.join('\n'))
})

async function waitFor(predicate, timeoutMs = 10_000) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for preview state.')
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25))
  }
}
