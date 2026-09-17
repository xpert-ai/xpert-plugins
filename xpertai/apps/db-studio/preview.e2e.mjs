import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import previewConfig from './preview.config.mjs'
const platformRoot = resolve(new URL('../../../../xpert-pro/', import.meta.url).pathname)
const { startRemoteViewPreview } = await import(resolve(platformRoot, 'tools/remote-view-preview/preview-host.mjs'))
const { chromium } = createRequire(resolve(platformRoot, 'package.json'))('playwright')

test('DB Studio local Preview Host covers shadcn workbench states', async (context) => {
  const preview = await startRemoteViewPreview({ ...previewConfig, state: structuredClone(previewConfig.state) }, { port: 0 })
  context.after(() => preview.close())
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
  context.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, colorScheme: 'light', locale: 'zh-CN' })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(preview.url)
  const frame = page.frameLocator('#remote-view')
  await frame.getByRole('combobox', { name: '选择数据源', exact: true }).click()
  await frame.getByRole('option', { name: /Preview Doris/ }).click()
  await frame.getByRole('treeitem', { name: 'orders', exact: true }).click()
  await frame.getByRole('button', { name: '浏览数据', exact: true }).click()
  await frame.getByRole('button', { name: /^运行/ }).click()
  await frame.getByRole('grid').waitFor()
  await frame.getByText('9007199254740993', { exact: true }).waitFor()
  await frame.getByRole('tab', { name: '结构', exact: true }).click()
  await frame.getByText('BIGINT', { exact: true }).waitFor()
  await frame.getByRole('tab', { name: '结果', exact: true }).click()
  await frame.getByTitle('保存草稿', { exact: true }).click()
  await frame.getByRole('button', { name: '连接执行策略', exact: true }).click()
  await frame.getByRole('heading', { name: '连接执行策略', exact: true }).waitFor()
  const semanticVars = await frame.locator('html').evaluate((element) => {
    const style = getComputedStyle(element)
    return { border: style.getPropertyValue('--border').trim(), input: style.getPropertyValue('--input').trim(), ring: style.getPropertyValue('--ring').trim() }
  })
  assert.ok(semanticVars.border && semanticVars.input && semanticVars.ring)
  assert.ok(await frame.locator('[data-slot=tabs-trigger][data-state=active]').count() >= 1)
  const checkboxLabels = await frame.locator('.studio-dialog label').evaluateAll((labels) => labels.map((label) => getComputedStyle(label).display))
  assert.ok(checkboxLabels.length >= 1 && checkboxLabels.every((display) => display === 'flex'))
  await frame.getByRole('button', { name: '关闭', exact: true }).click()
  await frame.getByRole('tab', { name: '图表', exact: true }).click()
  await frame.getByRole('tab', { name: '透视', exact: true }).click()
  await frame.getByRole('tab', { name: 'ER', exact: true }).click()
  await page.screenshot({ path: 'artifacts/preview-host-light.png', fullPage: true })
  await page.evaluate(() => document.querySelector('#remote-view').contentWindow.postMessage({ channel: 'xpertai.remote_component', protocolVersion: 1, instanceId: 'db-studio-preview', type: 'themeChanged', theme: { mode: 'dark' } }, '*'))
  await frame.locator('html.dark').waitFor()
  await page.screenshot({ path: 'artifacts/preview-host-dark.png', fullPage: true })
  await page.setViewportSize({ width: 780, height: 800 })
  await page.screenshot({ path: 'artifacts/preview-host-narrow.png', fullPage: true })
  assert.deepEqual(errors, [])
  assert.ok(preview.state.requestDataCount > 0)
  assert.ok(preview.state.actions.some((action) => action.actionKey === 'run_query'))
})
