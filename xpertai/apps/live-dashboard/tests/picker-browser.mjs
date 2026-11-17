// Production remote bundle, synthetic host only. Installed Bosi acceptance is a separate check.
// node tests/picker-browser.mjs <workspace-with-playwright-core> [screenshot-directory]
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { verifyDist } from '../scripts/dist-manifest.mjs'
await verifyDist(fileURLToPath(new URL('..', import.meta.url)))
const { chromium } = createRequire(`${process.argv[2]}/package.json`)('playwright-core')
const screenshots = process.argv[3]
if (screenshots) await mkdir(screenshots, { recursive: true })
const server = spawn(process.execPath, [fileURLToPath(new URL('./workbench-host.cjs', import.meta.url))], {
  env: { ...process.env, PORT: '0', DASHBOARD_FIXTURE_SHARED: 'true' }, stdio: ['ignore', 'pipe', 'pipe']
})
let browser, page
const errors = []
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Fixture host did not start')), 15000)
    server.stdout.on('data', bytes => { const match = bytes.toString().match(/Acceptance host: (http:\/\/127\.0\.0\.1:\d+)/); if (match) { clearTimeout(timer); resolve(match[1]) } })
    server.on('error', reject); server.stderr.on('data', bytes => process.stderr.write(bytes))
  })
  const rpc = async (type, input) => {
    const response = await fetch(`${url}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...input }) })
    const result = await response.json(); assert.equal(response.ok, true, JSON.stringify(result)); return result.data
  }
  const state = async () => (await fetch(`${url}/state`)).json()
  const example = JSON.parse(await readFile(new URL('../examples/postgres-sales.json', import.meta.url)))
  const boards = []
  for (let n = 1; n <= 55; n++) boards.push(await rpc('executeAction', { actionKey: 'save', input: {
    manifest: { ...example, id: randomUUID(), title: `看板 ${String(n).padStart(2, '0')} · 用于验证长标题与级联尺寸适配的销售分析` }, expectedVersionId: null, expectedRevision: 0
  } }))
  const projects = (await state()).projects
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1000, height: 700 } }); page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  const view = page.frameLocator('#view')
  const picker = view.getByRole('combobox', { name: '选择项目和看板', exact: true })
  await view.locator('.canvas-panel[aria-busy=false]').waitFor()
  const sharedTitle = '库存透视 · 授权共享看板'
  for (const [width, height] of [[1000, 700], [600, 360], [520, 400], [375, 640], [320, 280], [900, 240]]) {
    await page.setViewportSize({ width, height }); await picker.click()
    const menu = view.getByRole('dialog', { name: '选择项目和看板', exact: true }); await menu.waitFor()
    await menu.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)))
    const box = await menu.boundingBox()
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, JSON.stringify({ width, height, box }))
    if (width <= 520) {
      await menu.getByRole('tab', { name: '项目', exact: true }).click()
      await menu.getByRole('combobox', { name: '搜索项目', exact: true }).waitFor()
      await menu.getByRole('tab', { name: '看板', exact: true }).click()
    }
    const search = menu.getByRole('combobox', { name: '搜索可用看板…', exact: true })
    await menu.getByRole('option', { name: boards[0].title, exact: true }).waitFor()
    // Scrolling may load the page before the fallback button can be clicked.
    await menu.locator('section[aria-label="可用看板"] .picker-list').evaluate(element => { element.scrollTop = element.scrollHeight })
    await menu.getByRole('option', { name: boards[20].title, exact: true }).waitFor()
    assert.equal(await menu.getByRole('option', { name: boards[0].title, exact: true }).count(), 1)
    await search.fill('看板 55'); await menu.getByRole('option', { name: boards[54].title, exact: true }).waitFor()
    await search.fill('不存在的看板'); await menu.getByText('没有匹配的看板，请尝试缩短名称或切换来源。', { exact: true }).waitFor()
    await menu.getByRole('button', { name: '清除搜索', exact: true }).click()
    await menu.getByRole('tab', { name: '共享给本群', exact: true }).click()
    const shared = menu.getByRole('option', { name: sharedTitle, exact: true }); await shared.waitFor()
    await shared.getByText('· 正式版 v1', { exact: true }).waitFor()
    await shared.getByText('只读', { exact: true }).waitFor()
    await shared.scrollIntoViewIfNeeded()
    assert.equal(await shared.evaluate(element => {
      const row = element.getBoundingClientRect()
      let top = row.top, bottom = row.bottom
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowY === 'visible') continue
        const rect = parent.getBoundingClientRect()
        top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom)
      }
      return bottom - top >= row.height - 2
    }), true, 'the complete result row remains reachable in short viewports')
    assert.equal(await menu.getByRole('button', { name: `删除看板“${sharedTitle}”`, exact: true }).count(), 0)
    if (screenshots) await page.screenshot({ path: `${screenshots}/shared-${width}x${height}.png` })
    const before = await state(); await shared.click()
    await menu.waitFor({ state: 'hidden' })
    const after = await state()
    assert.deepEqual(after.navigation.at(-1).kind, 'group-reference')
    assert.equal(after.projectId, before.projectId); assert.equal(after.saves, before.saves)
  }
  await page.setViewportSize({ width: 1000, height: 700 }); await picker.click()
  await view.getByRole('combobox', { name: '搜索项目', exact: true }).fill('项目 25')
  await view.getByRole('option', { name: projects[24].name, exact: true }).hover()
  await view.getByRole('tab', { name: '共享给本群', exact: true }).waitFor()
  await view.getByText('暂无可用看板。可以在本项目创建，或接受群聊共享授权。', { exact: true }).waitFor()
  assert.equal(await view.getByRole('tab', { name: '共享给本群', exact: true }).isEnabled(), false)
  assert.equal((await state()).projectId, projects[0].projectId, 'hover never changes active Project')
  await view.getByRole('combobox', { name: '搜索项目', exact: true }).fill('项目 01')
  await view.getByRole('option', { name: projects[0].name, exact: true }).hover()
  await view.getByRole('combobox', { name: '搜索可用看板…', exact: true }).fill('看板 55')
  await view.getByRole('option', { name: boards[54].title, exact: true }).click()
  await view.getByRole('dialog', { name: '选择项目和看板', exact: true }).waitFor({ state: 'hidden' })
  assert.equal((await state()).navigation.at(-1).viewKey, 'live-dashboard__dashboard', 'owned content opens one document tab')
  await page.reload(); await view.locator('.canvas-panel[aria-busy=false]').waitFor(); await picker.click()
  await view.getByRole('tab', { name: '共享给本群', exact: true }).click()
  await view.getByRole('option', { name: sharedTitle, exact: true }).waitFor()
  await view.getByRole('combobox', { name: '搜索可用看板…', exact: true }).press('Escape')
  await page.evaluate(() => send({ type: 'init', locale: 'en-US', theme: { mode: 'dark', density: 'compact', tokens: {
    '--xui-color-background': '#09090b', '--xui-color-foreground': '#fafafa', '--xui-color-card': '#18181b',
    '--xui-color-popover': '#18181b', '--xui-color-popover-foreground': '#fafafa', '--xui-color-card-foreground': '#fafafa',
    '--xui-color-secondary': '#27272a', '--xui-color-secondary-foreground': '#fafafa', '--xui-color-muted': '#27272a',
    '--xui-color-accent': '#27272a', '--xui-color-accent-foreground': '#fafafa', '--xui-color-muted-foreground': '#a1a1aa',
    '--xui-color-border': '#3f3f46', '--xui-color-input': '#3f3f46'
  } } }))
  await view.getByRole('combobox', { name: 'Select project and dashboard', exact: true }).click()
  await view.getByRole('tab', { name: 'Shared with this group', exact: true }).click()
  await view.getByRole('option', { name: sharedTitle, exact: true }).waitFor()
  if (screenshots) await page.screenshot({ path: `${screenshots}/shared-dark-compact.png` })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: ['six viewport sizes', 'mobile tabs', 'pagination', 'server search', 'empty search recovery', 'shared fixed-version labels', 'generic Workbench opening', 'other Project audience isolation', 'owned document navigation', 'reload', 'dark compact theme'], screenshots }))
} catch (error) {
  if (page && screenshots) await page.screenshot({ path: `${screenshots}/failure.png` })
  console.error(errors); throw error
} finally {
  await browser?.close()
  if (server.exitCode === null) { server.kill(); await once(server, 'exit') }
}
