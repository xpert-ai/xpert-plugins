// Run against the real built remote assets and service with synthetic host data only:
// node tests/picker-browser.mjs <workspace-with-playwright> [screenshot-directory]
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { verifyDist } from '../scripts/dist-manifest.mjs'

await verifyDist(fileURLToPath(new URL('..', import.meta.url)))
const require = createRequire(`${process.argv[2]}/package.json`)
const { chromium } = require('playwright-core')
const screenshots = process.argv[3]
if (screenshots) await mkdir(screenshots, { recursive: true })
const server = spawn(process.execPath, [fileURLToPath(new URL('./workbench-host.cjs', import.meta.url))], {
  env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe']
})
let browser, page
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Fixture host did not start')), 15000)
    server.stdout.on('data', bytes => {
      const match = bytes.toString().match(/Acceptance host: (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) { clearTimeout(timer); resolve(match[1]) }
    })
    server.on('error', reject)
    server.stderr.on('data', bytes => process.stderr.write(bytes))
  })
  const rpc = async (actionKey, input) => {
    const response = await fetch(`${url}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'executeAction', actionKey, input }) })
    const result = await response.json()
    assert.equal(response.ok, true, JSON.stringify(result))
    return result.data
  }
  const state = async () => (await fetch(`${url}/state`)).json()
  const example = JSON.parse(await readFile(new URL('../examples/postgres-sales.json', import.meta.url)))
  const boards = []
  for (let index = 1; index <= 55; index++) {
    boards.push(await rpc('save', { manifest: { ...example, id: randomUUID(), title: `看板 ${String(index).padStart(2, '0')} · 用于验证长标题与级联尺寸适配的销售分析` }, expectedVersionId: null, expectedRevision: 0 }))
  }
  const selected = boards.at(-1), other = boards[0]
  const published = await rpc('publish', { artifactId: selected.artifactId, expectedRevision: selected.draftRevision, expectedCurrentVersionId: null, confirmed: true })
  await rpc('share', { artifactId: selected.artifactId, versionMode: 'latest' })
  const projects = (await state()).projects
  const changeProject = async projectId => {
    const response = await fetch(`${url}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'invokeClientCommand', commandKey: 'workbench.navigation.open', payload: { target: 'assistant.project', projectId, viewKey: 'live-dashboard__live-dashboard', parameters: {} } }) })
    assert.equal(response.ok, true)
  }
  await changeProject(projects[24].projectId)
  const remote = await rpc('save', { manifest: { ...example, id: randomUUID(), title: '项目 25 的独立看板' }, expectedVersionId: null, expectedRevision: 0 })
  await changeProject(projects[0].projectId)
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  const view = page.frameLocator('#view')
  const picker = view.getByRole('combobox', { name: '选择项目和看板', exact: true })
  await picker.waitFor()
  await page.evaluate(({ id, versionId }) => send({ type: 'init', locale: 'zh-Hans', initialQuery: { selectionId: id, parameters: { versionId, mode: 'published' } } }), { id: selected.artifactId, versionId: published.versionId })
  await view.frameLocator(`iframe[title="${selected.title}"]`).getByRole('cell', { name: 'east', exact: true }).waitFor()
  await view.locator('.canvas-panel[aria-busy=false]').waitFor()
  await view.getByRole('button', { name: '更多操作', exact: true }).click()
  await view.getByRole('menuitem', { name: '删除看板', exact: true }).click()
  await view.getByRole('alertdialog').getByText(selected.artifactId, { exact: true }).waitFor()
  await view.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal((await state()).artifacts.filter(item => item.status === 'active').length, 56)

  // Preview a project that was not loaded, without changing current host or Assistant context.
  await picker.click()
  const projectSearch = view.getByRole('combobox', { name: '搜索项目', exact: true })
  await projectSearch.fill('项目 25')
  const beforeHover = await state()
  await view.getByRole('option', { name: projects[24].name, exact: true }).hover()
  await view.getByRole('option', { name: remote.title, exact: true }).waitFor()
  assert.equal((await state()).navigation.length, beforeHover.navigation.length)
  assert.equal((await state()).selection.artifactId, selected.artifactId)
  if (screenshots) await page.screenshot({ path: `${screenshots}/project-hover.png` })
  await view.getByRole('option', { name: remote.title, exact: true }).click()
  await view.frameLocator(`iframe[title="${remote.title}"]`).getByRole('cell', { name: 'east', exact: true }).waitFor()
  assert.equal((await state()).projectId, projects[24].projectId)
  assert.equal((await state()).selection.artifactId, remote.artifactId)
  await view.locator('.canvas-panel[aria-busy=false]').waitFor()
  await picker.click(); await projectSearch.fill('项目 01')
  await view.getByRole('option', { name: projects[0].name, exact: true }).hover()
  const previewSearch = view.getByRole('combobox', { name: '搜索看板…', exact: true })
  await previewSearch.fill('看板 55')
  await view.getByRole('option', { name: selected.title, exact: true }).click()
  await view.frameLocator(`iframe[title="${selected.title}"]`).getByRole('cell', { name: 'east', exact: true }).waitFor()
  await view.locator('.canvas-panel[aria-busy=false]').waitFor()

  for (const [width, height] of [[1000, 700], [600, 360], [520, 400], [375, 640], [320, 280], [900, 240]]) {
    await page.setViewportSize({ width, height })
    await picker.click()
    const menu = view.getByRole('dialog', { name: '选择项目和看板', exact: true })
    await menu.waitFor()
    assert.equal(await picker.getAttribute('aria-expanded'), 'true')
    await menu.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)))
    const box = await menu.boundingBox()
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, JSON.stringify({ width, height, box }))
    if (width <= 520) {
      await menu.getByRole('tab', { name: '项目', exact: true }).click()
      await menu.getByRole('combobox', { name: '搜索项目', exact: true }).waitFor()
      assert.equal(await menu.getByRole('combobox', { name: '搜索看板…', exact: true }).isVisible(), false)
      await menu.getByRole('tab', { name: '看板', exact: true }).click()
    } else {
      await menu.getByRole('combobox', { name: '搜索项目', exact: true }).waitFor()
    }
    const search = menu.getByRole('combobox', { name: '搜索看板…', exact: true })
    await menu.getByRole('option', { name: boards[19].title, exact: true }).scrollIntoViewIfNeeded()
    const list = menu.getByRole('region', { name: '看板', exact: true }).getByRole('listbox')
    assert.ok(await list.evaluate(element => element.scrollTop > 0), 'dashboard rows scroll within their own column')
    await menu.getByRole('option', { name: boards[20].title, exact: true }).waitFor()
    assert.equal(await menu.getByRole('option', { name: boards[0].title, exact: true }).count(), 1, 'new pages append without duplicates')
    assert.equal(await menu.getByRole('button', { name: '下一页', exact: true }).count(), 0)
    await search.fill('看板 55')
    await menu.getByRole('option', { name: selected.title, exact: true }).waitFor()
    await search.fill('看板 01')
    const remove = menu.getByRole('button', { name: `删除看板“${other.title}”`, exact: true })
    await remove.waitFor()
    await search.focus()
    await page.mouse.move(width - 1, height - 1)
    assert.equal(await remove.evaluate(element => getComputedStyle(element).opacity), '0')
    await menu.getByRole('option', { name: other.title, exact: true }).hover()
    const tooltip = view.getByRole('tooltip').filter({ hasText: '更新于' })
    await tooltip.waitFor()
    await tooltip.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)))
    const tooltipBox = await tooltip.boundingBox()
    assert.ok(tooltipBox.x >= 0 && tooltipBox.y >= 0 && tooltipBox.x + tooltipBox.width <= width + 1 && tooltipBox.y + tooltipBox.height <= height + 1, JSON.stringify({ width, height, tooltipBox }))
    assert.equal(await remove.evaluate(element => getComputedStyle(element).opacity), '1')
    const rowBox = await remove.boundingBox()
    assert.ok(rowBox.x >= box.x && rowBox.x + rowBox.width <= box.x + box.width + 1 && rowBox.y + rowBox.height <= box.y + box.height + 1, JSON.stringify({ width, height, box, rowBox }))
    if (screenshots) await page.screenshot({ path: `${screenshots}/picker-${width}x${height}.png` })
    await page.mouse.move(width - 1, height - 1)
    await view.getByRole('tooltip').waitFor({ state: 'hidden' })
    await search.press('Escape')
    await menu.waitFor({ state: 'hidden' })
  }

  await page.setViewportSize({ width: 1000, height: 700 })
  await picker.click()
  const search = view.getByRole('combobox', { name: '搜索看板…', exact: true })
  await search.fill('看板 01')
  // Enter on the sibling delete control must not select the CommandItem.
  const remove = view.getByRole('button', { name: `删除看板“${other.title}”`, exact: true })
  await remove.focus(); await remove.press('Enter')
  const confirmation = view.getByRole('alertdialog')
  await confirmation.getByText(other.artifactId, { exact: true }).waitFor()
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal((await state()).artifacts.find(item => item.id === other.artifactId).status, 'active')
  assert.equal((await state()).selection.artifactId, selected.artifactId)
  await picker.click(); await search.fill('看板 01')
  await view.getByRole('option', { name: other.title, exact: true }).hover(); await remove.click()
  await confirmation.waitFor()
  await view.locator('body').evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)))
  if (screenshots) await page.screenshot({ path: `${screenshots}/delete-confirmation.png` })
  await confirmation.getByRole('button', { name: '删除看板', exact: true }).click()
  await confirmation.waitFor({ state: 'hidden' })
  await view.locator('.canvas-panel[aria-busy=false]').waitFor()
  assert.equal((await state()).artifacts.find(item => item.id === other.artifactId).status, 'archived')
  assert.equal((await state()).selection.artifactId, selected.artifactId)
  await picker.click(); await search.fill('看板 01')
  await view.getByText('未找到匹配的看板。', { exact: true }).waitFor()
  await search.press('Escape')

  // Deleting the selected published board clears context/navigation and revokes its share.
  await view.getByRole('button', { name: '更多操作', exact: true }).click()
  await view.getByRole('menuitem', { name: '删除看板', exact: true }).click()
  await confirmation.getByRole('button', { name: '删除看板', exact: true }).click()
  await confirmation.waitFor({ state: 'hidden' })
  await view.locator('.canvas-panel[aria-busy=false]').waitFor()
  const deleted = await state()
  assert.equal(deleted.artifacts.find(item => item.id === selected.artifactId).status, 'archived')
  assert.equal(deleted.links.find(item => item.artifactId === selected.artifactId).status, 'revoked')
  assert.deepEqual(deleted.selection, { schemaVersion: 1, mode: 'new' })
  assert.equal(deleted.navigation.at(-1).selectionId, undefined)
  await page.reload(); await picker.click(); await search.fill('看板 55')
  await view.getByText('未找到匹配的看板。', { exact: true }).waitFor()
  await search.press('Escape')
  await page.setViewportSize({ width: 375, height: 640 })
  await page.evaluate(() => send({ type: 'init', locale: 'en-US', initialQuery: {}, theme: { mode: 'dark', density: 'compact', tokens: {
    '--xui-color-background': '#09090b', '--xui-color-foreground': '#fafafa', '--xui-color-card': '#18181b',
    '--xui-color-popover': '#18181b', '--xui-color-popover-foreground': '#fafafa', '--xui-color-card-foreground': '#fafafa',
    '--xui-color-secondary': '#27272a', '--xui-color-secondary-foreground': '#fafafa', '--xui-color-muted': '#27272a',
    '--xui-color-accent': '#27272a', '--xui-color-accent-foreground': '#fafafa',
    '--xui-color-muted-foreground': '#a1a1aa', '--xui-color-border': '#3f3f46', '--xui-color-input': '#3f3f46'
  } } }))
  const englishPicker = view.getByRole('combobox', { name: 'Select project and dashboard', exact: true })
  await englishPicker.click()
  await view.getByRole('combobox', { name: 'Search dashboards…', exact: true }).fill('看板 02')
  await view.getByRole('button', { name: `Delete dashboard “${boards[1].title}”`, exact: true }).waitFor()
  const darkMenu = view.getByRole('dialog', { name: 'Select project and dashboard', exact: true })
  await darkMenu.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)))
  assert.equal(await darkMenu.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(24, 24, 27)')
  assert.equal(await darkMenu.evaluate(element => getComputedStyle(element).color), 'rgb(250, 250, 250)')
  assert.equal(await darkMenu.evaluate(element => getComputedStyle(element).borderTopColor), 'rgb(63, 63, 70)')
  if (screenshots) await page.screenshot({ path: `${screenshots}/picker-english-dark-compact.png` })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: ['six viewport sizes', 'long titles', 'mobile tabs', 'infinite scroll', 'server search of unloaded data', 'project hover preview', 'cross-project selection', 'hover delete and update time', 'tooltip viewport bounds', 'keyboard deletion', 'cancel', 'nonselected deletion preserves context', 'published selection beyond first page', 'selected deletion clears context', 'share revocation', 'reload'], screenshots }))
} catch (error) {
  if (page && screenshots) await page.screenshot({ path: `${screenshots}/failure.png` })
  throw error
} finally {
  await browser?.close()
  if (server.exitCode === null) { server.kill(); await once(server, 'exit') }
}
