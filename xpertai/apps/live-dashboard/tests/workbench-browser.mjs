// Production remote assets with an in-memory View Host; no login, deployment or real source mutations.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
const require = createRequire(`${process.argv[2]}/package.json`)
const { chromium } = require('playwright-core')
const server = spawn(process.execPath, [fileURLToPath(new URL('./workbench-host.cjs', import.meta.url))], {
  env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe']
})
let browser, page
try {
  const url = await new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(Error('Fixture host did not start')), 15000)
    server.stdout.on('data', bytes => {
      output += bytes
      const match = output.match(/Acceptance host: (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) { clearTimeout(timer); resolve(match[1]) }
    })
    server.on('error', error => { clearTimeout(timer); reject(error) })
    server.on('exit', code => { clearTimeout(timer); reject(Error(`Fixture host exited: ${code}`)) })
    server.stderr.on('data', bytes => process.stderr.write(bytes))
  })
  // Use Playwright's matching Chromium build for opaque-frame pointer routing.
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const state = async () => (await fetch(`${url}/state`)).json()
  const example = JSON.parse(await readFile(new URL('../examples/postgres-sales.json', import.meta.url)))
  await page.goto(url)
  const view = page.frameLocator('#view')
  await view.getByRole('button', { name: '导入定义', exact: true }).click()
  await view.getByLabel('看板定义', { exact: true }).fill(JSON.stringify(example))
  await view.getByRole('button', { name: '保存', exact: true }).click()
  const renderer = view.frameLocator(`iframe[title="${example.title}"]`)
  await renderer.getByRole('cell', { name: 'east', exact: true }).waitFor()
  await renderer.getByRole('cell', { name: 'west', exact: true }).waitFor()
  let stored = await state()
  assert.equal(stored.versions, 0)
  assert.deepEqual(stored.storedManifests, [example])
  const artifactId = stored.artifacts[0].id
  assert.deepEqual(stored.selection, { schemaVersion: 1, artifactId, draftRevision: 1 })

  // All draft actions must remain on one row and reachable at narrow Workbench widths.
  for (const width of [1280, 960, 800, 600, 420, 375, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const layout = await view.locator('.dashboard-toolbar').evaluate(async toolbar => {
      void toolbar.offsetWidth
      await Promise.allSettled(toolbar.getAnimations({ subtree: true }).map(animation => animation.finished))
      const bounds = toolbar.getBoundingClientRect()
      const controls = [...toolbar.querySelectorAll('button')].map(button => button.getBoundingClientRect()).filter(rect => rect.width)
      return { width: innerWidth, height: bounds.height, right: Math.max(...controls.map(rect => rect.right)),
        left: Math.min(...controls.map(rect => rect.left)), rows: new Set(controls.map(rect => Math.round(rect.top))).size }
    })
    assert.equal(layout.rows, 1, `Toolbar must stay on one row at ${width}px`)
    assert.ok(layout.height <= 54, `Toolbar must stay compact at ${width}px`)
    assert.ok(layout.left >= 0 && layout.right <= layout.width, `Toolbar buttons clipped at ${width}px: ${JSON.stringify(layout)}`)
  }
  await page.setViewportSize({ width: 1280, height: 900 })

  await view.getByLabel('区域', { exact: true }).click()
  await view.getByRole('option', { name: 'west', exact: true }).click()
  await view.getByRole('button', { name: '应用筛选', exact: true }).click()
  await renderer.getByRole('cell', { name: 'west', exact: true }).waitFor()
  assert.equal(await renderer.getByRole('cell', { name: 'east', exact: true }).count(), 0)
  assert.equal((await state()).parameters.at(-1).region, 'west')
  const beforeRefresh = (await state()).queries
  const refreshed = page.waitForResponse(response => response.url() === `${url}/rpc` && response.request().postDataJSON()?.actionKey === 'query')
  await view.locator('.canvas-panel[aria-busy="false"]').waitFor()
  const canvasBefore = await view.locator('.canvas-panel').boundingBox()
  const toolbarBefore = await view.locator('.dashboard-toolbar').boundingBox()
  let releaseQuery
  const queryGate = new Promise(resolve => { releaseQuery = resolve })
  const holdQuery = async route => {
    if (route.request().postDataJSON()?.actionKey === 'query') await queryGate
    await route.continue()
  }
  await page.route(`${url}/rpc`, holdQuery)
  try {
    await view.getByRole('button', { name: '刷新', exact: true }).click()
    await view.locator('.dashboard-toolbar').getByRole('status').filter({ hasText: '加载中…' }).waitFor()
    assert.equal(await view.locator('.canvas-panel').getByRole('status').count(), 0)
    assert.equal(await view.locator('.canvas-panel').getAttribute('aria-busy'), 'true')
    assert.deepEqual(await view.locator('.canvas-panel').boundingBox(), canvasBefore, 'Loading must not move or shrink the canvas')
    assert.deepEqual(await view.locator('.dashboard-toolbar').boundingBox(), toolbarBefore, 'Loading must not resize the header')
  } finally {
    releaseQuery()
    await refreshed
    await page.unroute(`${url}/rpc`, holdQuery)
  }
  await renderer.getByRole('cell', { name: 'west', exact: true }).waitFor()
  assert.equal((await state()).queries, beforeRefresh + 1)

  await view.getByRole('button', { name: '发布草稿', exact: true }).click()
  await view.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal((await state()).versions, 0)
  await view.getByRole('button', { name: '发布草稿', exact: true }).click()
  await view.getByRole('button', { name: '确认发布', exact: true }).click()
  await view.getByRole('combobox', { name: '版本历史', exact: true }).filter({ hasText: '版本 1' }).waitFor()
  const first = (await state()).artifacts[0].currentVersion
  await view.getByRole('button', { name: '编辑工作草稿', exact: true }).click()
  await view.getByLabel('看板定义', { exact: true }).fill(JSON.stringify({ ...example, title: 'Newer edit' }))
  await view.getByRole('button', { name: '保存', exact: true }).click()
  await view.frameLocator('iframe[title="Newer edit"]').getByRole('cell', { name: 'east', exact: true }).waitFor()
  assert.equal((await state()).versions, 1, 'Editing only changes the draft')
  await view.getByRole('combobox', { name: '版本历史', exact: true }).click()
  await view.getByRole('option', { name: '版本 1', exact: true }).click()
  await renderer.getByRole('cell', { name: 'east', exact: true }).waitFor()
  assert.equal((await state()).selection.versionId, first.id)
  const opened = page.waitForRequest(request => request.url() === `${url}/rpc` && request.postDataJSON()?.query?.parameters?.artifactId === artifactId)
  await page.evaluate(({ artifactId }) => send({ type: 'hostEvent', event: {
    type: 'assistant.tool.completed', toolName: 'dashboard_update', data: { output: { dashboard: { artifactId, draftRevision: 2, status: 'draft' } } }
  } }), { artifactId })
  await opened
  await view.frameLocator('iframe[title="Newer edit"]').getByRole('cell', { name: 'east', exact: true }).waitFor()
  assert.equal((await state()).selection.draftRevision, 2)
  assert.equal((await state()).versions, 1, 'Opening a draft receipt must not publish')
  await view.getByRole('button', { name: '发布草稿', exact: true }).click()
  await view.getByRole('button', { name: '确认发布', exact: true }).click()
  await view.getByRole('combobox', { name: '版本历史', exact: true }).filter({ hasText: '版本 2' }).waitFor()
  assert.equal((await state()).versions, 2)
  await view.getByRole('button', { name: '团队分享', exact: true }).click()
  const dialog = view.getByRole('dialog')
  await dialog.getByRole('button', { name: '开启分享', exact: true }).click()
  const shareUrl = await dialog.getByLabel('分享链接', { exact: true }).inputValue()
  assert.ok(shareUrl.startsWith('https://platform.test/artifacts/view/'))
  await dialog.getByRole('button', { name: '复制链接', exact: true }).click()
  await dialog.getByRole('button', { name: '已复制', exact: true }).waitFor()
  await dialog.getByRole('combobox', { name: '版本策略', exact: true }).click()
  await view.getByRole('option', { name: '固定正式版本', exact: true }).click()
  await dialog.getByRole('combobox', { name: '版本', exact: true }).click()
  await view.getByRole('option', { name: '版本 1', exact: true }).click()
  await dialog.getByRole('button', { name: '更新分享', exact: true }).click()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await view.getByRole('button', { name: '团队分享', exact: true }).click()
  await dialog.getByRole('combobox', { name: '版本策略', exact: true }).filter({ hasText: '固定正式版本' }).waitFor()
  await dialog.getByRole('combobox', { name: '版本', exact: true }).filter({ hasText: '版本 1' }).waitFor()
  assert.notEqual(await dialog.getByLabel('分享链接', { exact: true }).inputValue(), shareUrl)
  await dialog.getByRole('button', { name: '撤销链接', exact: true }).click()
  await dialog.getByRole('button', { name: '开启分享', exact: true }).waitFor()
  assert.equal(await dialog.getByLabel('分享链接', { exact: true }).count(), 0)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  const frame = page.frames().find(frame => frame.url() === `${url}/view`)
  assert.deepEqual(await frame.evaluate(() => ['localStorage', 'sessionStorage'].map(name => {
    try { void window[name]; return 'accessible' } catch (error) { return error.name }
  })), ['SecurityError', 'SecurityError'])

  const another = { ...example, id: '33333333-3333-4333-8333-333333333333', title: '另一份区域销售' }
  await view.getByRole('button', { name: '导入定义', exact: true }).click()
  await view.getByLabel('看板定义', { exact: true }).fill(JSON.stringify(another))
  await view.getByRole('button', { name: '保存', exact: true }).click()
  await view.frameLocator(`iframe[title="${another.title}"]`).getByRole('cell', { name: 'east', exact: true }).waitFor()
  const secondId = (await state()).selection.artifactId
  assert.notEqual(secondId, artifactId)
  await page.reload()
  await view.getByRole('combobox', { name: '选择看板', exact: true }).click()
  const search = view.getByRole('combobox', { name: '搜索看板…', exact: true })
  await search.fill('no-matching-dashboard')
  await view.getByText('未找到匹配的看板。', { exact: true }).waitFor()
  assert.equal(await view.getByRole('option').count(), 0)
  await search.fill('另一份')
  await search.press('Enter')
  await view.frameLocator(`iframe[title="${another.title}"]`).getByRole('cell', { name: 'east', exact: true }).waitFor()
  assert.equal((await state()).selection.artifactId, secondId)
  await view.getByRole('combobox', { name: '选择看板', exact: true }).click()
  await search.fill('newer')
  await view.getByRole('option', { name: 'Newer edit', exact: true }).waitFor()
  await search.press('Enter')
  await view.frameLocator('iframe[title="Newer edit"]').getByRole('cell', { name: 'east', exact: true }).waitFor()
  assert.equal((await state()).versions, 2)
  assert.equal((await state()).selection.artifactId, artifactId)
  // A card's public query must select its Artifact, even while another dashboard is mounted.
  await page.evaluate(({ secondId }) => send({ type: 'init', locale: 'zh-Hans', initialQuery: { selectionId: secondId } }), { secondId })
  await view.frameLocator(`iframe[title="${another.title}"]`).getByRole('cell', { name: 'east', exact: true }).waitFor()
  assert.equal((await state()).selection.artifactId, secondId)
  const beforeEcho = (await state()).queries
  await view.getByRole('button', { name: '编辑工作草稿', exact: true }).click()
  await view.getByLabel('看板定义', { exact: true }).fill('unsaved local editing')
  await page.evaluate(({ secondId }) => send({ type: 'init', locale: 'zh-Hans', initialQuery: { selectionId: secondId, page: 1 } }), { secondId })
  assert.equal(await view.getByLabel('看板定义', { exact: true }).inputValue(), 'unsaved local editing')
  assert.equal((await state()).queries, beforeEcho)
  await page.evaluate(({ artifactId, versionId }) => send({ type: 'init', locale: 'zh-Hans', initialQuery: { selectionId: artifactId, parameters: { versionId } } }), { artifactId, versionId: first.id })
  await renderer.getByRole('cell', { name: 'east', exact: true }).waitFor()
  assert.equal((await state()).selection.artifactId, artifactId)
  assert.equal((await state()).selection.versionId, first.id)
  // Card navigation must dismiss actions that belong to the previous Artifact.
  await view.getByRole('button', { name: '团队分享', exact: true }).click()
  await dialog.waitFor()
  await page.evaluate(({ secondId }) => send({ type: 'init', locale: 'zh-Hans', initialQuery: { selectionId: secondId } }), { secondId })
  await view.frameLocator(`iframe[title="${another.title}"]`).getByRole('cell', { name: 'east', exact: true }).waitFor()
  await dialog.waitFor({ state: 'hidden' })
  await view.getByRole('button', { name: '发布草稿', exact: true }).click()
  await view.getByRole('alertdialog').waitFor()
  await page.evaluate(({ artifactId }) => send({ type: 'init', locale: 'zh-Hans', initialQuery: { selectionId: artifactId } }), { artifactId })
  await view.frameLocator('iframe[title="Newer edit"]').getByRole('cell', { name: 'east', exact: true }).waitFor()
  await view.getByRole('alertdialog').waitFor({ state: 'hidden' })
  assert.equal((await state()).versions, 2, 'Navigation must never confirm publication')
  // A delayed default listing must not override a more recent resource-card selection.
  const activeFrame = page.frames().find(frame => frame.url() === `${url}/view`)
  let releaseList, listRequestId, listingReady, listingDelivered
  const listGate = new Promise(resolve => { releaseList = resolve })
  const heldListing = new Promise(resolve => { listingReady = resolve })
  const deliveredListing = new Promise(resolve => { listingDelivered = resolve })
  const holdDefaultListing = async route => {
    const message = route.request().postDataJSON()
    if (message.type !== 'requestData' || message.query?.parameters?.artifactId) return route.continue()
    const response = await route.fetch(), body = await response.json()
    listRequestId = message.requestId
    // Choose a known different default using the real fixture's authorized Artifact summary.
    body.meta.dashboards = body.meta.dashboards.filter(item => item.artifactId === artifactId)
    listingReady()
    await listGate
    await route.fulfill({ response, json: body })
    listingDelivered()
  }
  await page.route(`${url}/rpc`, holdDefaultListing)
  try {
    await page.evaluate(() => send({ type: 'init', locale: 'zh-Hans', initialQuery: {} }))
    await heldListing
    await page.evaluate(({ secondId }) => send({ type: 'init', locale: 'zh-Hans', initialQuery: { selectionId: secondId } }), { secondId })
    await view.frameLocator(`iframe[title="${another.title}"]`).getByRole('cell', { name: 'east', exact: true }).waitFor()
    await page.evaluate(() => {
      window.navigationReads = []
      window.addEventListener('message', event => {
        if (event.source === frame.contentWindow && event.data.type === 'requestData') window.navigationReads.push(event.data.query)
      })
    })
    await activeFrame.evaluate(requestId => {
      window.delayedListingSettled = new Promise(resolve => {
        const listener = event => {
          if (event.source !== window.parent || event.data.type !== 'data' || event.data.requestId !== requestId) return
          window.removeEventListener('message', listener)
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        }
        window.addEventListener('message', listener)
      })
    }, listRequestId)
    releaseList()
    await activeFrame.evaluate(() => window.delayedListingSettled)
    assert.deepEqual(await page.evaluate(() => window.navigationReads), [], 'Stale default response must not open another Artifact')
    assert.equal((await state()).selection.artifactId, secondId)
    await view.frameLocator(`iframe[title="${another.title}"]`).getByRole('cell', { name: 'east', exact: true }).waitFor()
  } finally {
    releaseList()
    await deliveredListing
    await page.unroute(`${url}/rpc`, holdDefaultListing)
  }
  if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: ['draft save', 'cancel publication', 'confirmed publication', 'filter', 'fresh query', 'draft receipt preview', 'version history', 'Assistant selection', 'update receipt', 'opaque origin', 'search and keyboard selection', 'compact responsive header', 'loading without layout shift', 'reopen current version', 'team share enable/copy/pin/reopen/revoke', 'resource card selection', 'historical version selection', 'idempotent init preserves local editing', 'navigation dismisses old share/publication dialogs', 'stale default listing cannot replace card selection'] }))
} catch (error) {
  // This host contains synthetic data only. Keep failure evidence for the exact production bundle.
  if (page) {
    for (const frame of page.frames()) console.error(JSON.stringify({ frame: frame.url(), text: (await frame.locator('body').innerText().catch(() => '')).slice(0, 2000) }))
    if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true })
  }
  throw error
} finally {
  if (browser) await browser.close()
  if (server.exitCode === null) { server.kill(); await once(server, 'exit') }
}
