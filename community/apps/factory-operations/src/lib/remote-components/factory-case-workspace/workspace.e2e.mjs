import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'

import previewConfig, { platformRoot } from './preview.config.mjs'

const { startRemoteViewPreview } = await import(
  resolve(platformRoot, 'tools/remote-view-preview/preview-host.mjs')
)
const requireFromPlatform = createRequire(resolve(platformRoot, 'package.json'))
const { chromium } = requireFromPlatform('playwright')

test('renders and operates the dedicated Factory Case task workspace', async (context) => {
  const preview = await startRemoteViewPreview(
    { ...previewConfig, state: structuredClone(previewConfig.state), logStartup: false, logErrors: false },
    { port: 0 }
  )
  context.after(() => preview.close())
  const browser = await chromium.launch({ headless: true })
  context.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, locale: 'zh-CN', colorScheme: 'light' })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  await page.goto(preview.url)
  const frame = page.frameLocator('#remote-view')
  await assertVisible(frame.getByRole('heading', { name: 'Factory Case 任务工作区' }))
  await assertVisible(frame.getByRole('heading', { name: '验证设备、质量与生产恢复' }))
  assert.equal(await frame.locator('.fcw-owner .foc-avatar-glyph').textContent(), '✅')
  await assertRoundedSquareAvatar(frame.locator('.fcw-owner .foc-assistant-avatar'))
  await assertVisible(frame.getByRole('button', { name: '验证恢复' }))
  await frame.getByRole('button', { name: '验证恢复' }).click()
  await waitFor(() => preview.state.actions.at(-1)?.actionKey === 'verify_recovery')
  await assertVisible(frame.getByText('主轴振动恢复至 2.1 mm/s', { exact: true }))

  await frame.getByRole('button', { name: /返回流水线/ }).click()
  await waitFor(() => preview.state.navigation?.target === 'workbench.view')
  assert.equal(preview.state.navigation.viewKey, 'factory-operations-center')
  assert.equal(preview.state.navigation.selectionId, '00000000-0000-4000-8000-000000000070')

  assert.equal(pageErrors.length, 0, pageErrors.join('\n'))
  assert.equal(consoleErrors.length, 0, consoleErrors.join('\n'))
})

async function assertVisible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 15_000 })
  assert.equal(await locator.isVisible(), true)
}

async function assertRoundedSquareAvatar(locator) {
  const shape = await locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return { width: style.width, height: style.height, borderRadius: style.borderRadius }
  })
  assert.equal(shape.width, shape.height)
  assert.notEqual(shape.borderRadius, '50%')
  assert.ok(Number.parseFloat(shape.borderRadius) > 0)
}

async function waitFor(predicate, timeoutMs = 10_000) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for preview state.')
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25))
  }
}
