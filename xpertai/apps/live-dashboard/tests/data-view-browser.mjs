// node tests/data-view-browser.mjs <workspace-with-@playwright/test> [screenshots]
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { verifyDist } from '../scripts/dist-manifest.mjs'

await verifyDist(fileURLToPath(new URL('..', import.meta.url)))
const require = createRequire(`${process.argv[2]}/package.json`)
const { chromium, expect } = require('@playwright/test')
const screenshots = process.argv[3]
if (screenshots) await mkdir(screenshots, { recursive: true })
const server = spawn(process.execPath, [fileURLToPath(new URL('./data-view-host.cjs', import.meta.url))], {
  env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe']
})
let browser
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Fixture startup timed out')), 15000)
    server.stdout.on('data', bytes => { const match = bytes.toString().match(/Data View fixture: (http:\/\/127\.0\.0\.1:\d+)/); if (match) { clearTimeout(timer); resolve(match[1]) } })
    server.stderr.on('data', bytes => process.stderr.write(bytes))
    server.once('error', error => { clearTimeout(timer); reject(error) })
    server.once('exit', code => { clearTimeout(timer); reject(Error(`Fixture exited: ${code}`)) })
  })
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 } })
  page.setDefaultTimeout(10000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const state = async () => (await fetch(`${url}/state`)).json()
  const view = page.frameLocator('#view')
  await page.goto(url)
  await view.getByRole('heading', { name: '添加数据', exact: true }).waitFor()
  assert.equal(await view.getByRole('button', { name: '使用数据集', exact: true }).count(), 0)
  await view.getByRole('tab', { name: /^数据源/ }).click()
  await view.getByRole('button', { name: 'Synthetic sales source', exact: true }).click()
  await view.getByRole('button', { name: 'Synthetic sales table', exact: true }).waitFor()
  assert.ok((await state()).discoveries > 0)
  if (screenshots) await page.screenshot({ path: `${screenshots}/sources-light.png` })
  await view.getByRole('tab', { name: /^数据集/ }).click()
  await view.getByRole('button', { name: 'Regional sales', exact: true }).click()
  await view.getByRole('button', { name: '查询 / 刷新', exact: true }).click()
  await view.getByRole('cell', { name: 'east', exact: true }).waitFor()
  await view.getByRole('cell', { name: 'west', exact: true }).waitFor()
  await view.getByRole('button', { name: '编辑数据集', exact: true }).click()
  const dialog = view.getByRole('dialog')
  await dialog.getByLabel('数据集名称', { exact: true }).fill('Edited dataset')
  const original = await dialog.getByLabel('查询配置（JSON）', { exact: true }).inputValue()
  await dialog.getByLabel('查询配置（JSON）', { exact: true }).fill('{')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.getByRole('alert').waitFor()
  assert.equal((await state()).datasets[0].revision, 1)
  await dialog.getByLabel('查询配置（JSON）', { exact: true }).fill(original)
  // Updating the host theme must preserve the draft and reach portaled controls.
  for (const [mode, density, radius] of [['dark', 'compact', '0px'], ['light', 'default', '12px']]) {
    await page.evaluate(({ mode, density, radius }) => {
      const dark = mode === 'dark'
      window.qa.init({ theme: { mode, density, tokens: {
        'radius.md': radius, 'color.background': dark ? '#09090b' : '#ffffff',
        'color.foreground': dark ? '#fafafa' : '#18181b', 'color.card': dark ? '#18181b' : '#ffffff',
        'color.cardForeground': dark ? '#fafafa' : '#18181b', 'color.popover': dark ? '#18181b' : '#ffffff',
        'color.popoverForeground': dark ? '#fafafa' : '#18181b', 'color.muted': dark ? '#27272a' : '#f4f4f5',
        'color.mutedForeground': dark ? '#a1a1aa' : '#71717a', 'color.secondary': dark ? '#27272a' : '#f4f4f5',
        'color.secondaryForeground': dark ? '#fafafa' : '#18181b', 'color.accent': dark ? '#27272a' : '#f4f4f5',
        'color.accentForeground': dark ? '#fafafa' : '#18181b', 'color.primary': dark ? '#fafafa' : '#18181b',
        'color.primaryForeground': dark ? '#18181b' : '#ffffff', 'color.border': dark ? '#3f3f46' : '#e4e4e7',
        'color.input': dark ? '#3f3f46' : '#e4e4e7'
      } } })
    }, { mode, density, radius })
    assert.equal(await dialog.getByLabel('数据集名称', { exact: true }).inputValue(), 'Edited dataset')
    await expect(dialog).toHaveCSS('--xui-radius-md', radius)
    await expect(dialog).toHaveCSS('background-color', mode === 'dark' ? 'rgb(24, 24, 27)' : 'rgb(255, 255, 255)')
    const style = await dialog.evaluate(el => ({ dark: el.ownerDocument.documentElement.classList.contains('dark') }))
    assert.equal(style.dark, mode === 'dark')
    if (screenshots) await page.screenshot({ path: `${screenshots}/editor-${mode}.png` })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const bounds = await dialog.boundingBox()
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, 'Dialog must fit the narrow tab')
  assert.equal(await view.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true)
  if (screenshots) await page.screenshot({ path: `${screenshots}/editor-narrow.png` })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal((await state()).datasets[0].name, 'Edited dataset')
  assert.equal((await state()).datasets[0].revision, 2)
  await page.setViewportSize({ width: 1120, height: 900 })
  // A held request from the old scope must not repopulate selection or show an error.
  await page.evaluate(() => { window.qa.holdNext = true })
  await view.getByRole('button', { name: 'Edited dataset', exact: true }).click()
  await page.waitForFunction(() => window.qa.held)
  await page.evaluate(() => window.qa.reset())
  await view.getByRole('button', { name: 'Edited dataset', exact: true }).waitFor()
  await page.evaluate(() => window.qa.release())
  await view.locator('main[aria-busy="false"]').waitFor()
  assert.equal(await view.getByRole('button', { name: '编辑数据集', exact: true }).count(), 0)
  assert.equal(await view.getByRole('alert').count(), 0)
  // Create a second dataset by reusing the already-authorized dashboard Binding.
  await view.getByRole('button', { name: '新建数据集', exact: true }).first().click()
  await dialog.getByRole('button', { name: '从已有看板复用查询', exact: true }).click()
  await dialog.getByRole('combobox', { name: '选择已有看板', exact: true }).click()
  const example = JSON.parse(await readFile(new URL('../examples/postgres-sales.json', import.meta.url)))
  await view.getByRole('option', { name: example.title, exact: true }).click()
  await dialog.getByRole('combobox', { name: '选择查询', exact: true }).click()
  await view.getByRole('option', { name: example.bindings[0].output.datasetId, exact: true }).click()
  await dialog.getByLabel('数据集名称', { exact: true }).fill('Copied dataset')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal((await state()).datasets.length, 2)
  await view.getByRole('button', { name: '删除数据集', exact: true }).click()
  const confirmation = view.getByRole('alertdialog')
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal((await state()).datasets.length, 2)
  await view.getByRole('button', { name: '删除数据集', exact: true }).click()
  await confirmation.getByRole('button', { name: '删除数据集', exact: true }).click()
  await confirmation.waitFor({ state: 'hidden' })
  assert.equal((await state()).datasets.length, 1)
  assert.deepEqual(errors, [])
  console.log('PASS: source discovery, preview, invalid JSON, revision save, host scope reset, query reuse, confirmed recycling, themes and narrow layout')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
