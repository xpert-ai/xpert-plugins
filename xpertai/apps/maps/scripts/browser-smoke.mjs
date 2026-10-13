import assert from 'node:assert/strict'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'
import { startRemoteViewPreview } from '../../../../tools/remote-view-preview/preview-host.mjs'
import config from '../src/lib/remote-components/maps-workbench/preview.config.mjs'
import { startPreview } from './preview-server.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'test-output/browser')
await mkdir(output, { recursive: true })
const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)
let executablePath
for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break } catch { /* Try the next installed browser. */ } }
const preview = await startRemoteViewPreview(config, { port: 0 })
const mcpPreview = await startPreview({ port: 0, initialQuery: '咖啡馆' })
const browser = await puppeteer.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const report = { host: 'Repository Remote View Preview Host with opaque-origin iframe', backend: 'Built DemoMapProvider', productionBundle: 'dist/lib/remote-components/maps-workbench + dist/mcp-apps/map/index.html', checks: [], externalRequests: [], pageErrors: [], consoleErrors: [] }
let page, frame
try {
  page = await browser.newPage()
  await page.setViewport({ width: 1200, height: 820, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(() => {
    for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, { get() { throw new DOMException('Storage blocked for acceptance', 'SecurityError') } })
  })
  page.on('pageerror', error => report.pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()) })
  page.on('request', request => { const url = request.url(); if (url.startsWith('http') && !url.startsWith(preview.url) && !url.startsWith(mcpPreview.url)) report.externalRequests.push(url) })
  await page.goto(preview.url)
  frame = await (await page.waitForSelector('#remote-view')).contentFrame()
  assert.ok(frame)
  const wait = (fn, ...args) => frame.waitForFunction(fn, { timeout: 12000 }, ...args)
  const click = selector => frame.click(selector)
  const text = selector => frame.$eval(selector, node => node.textContent)
  const input = async (selector, value) => {
    await frame.$eval(selector, (node, next) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, next)
      node.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)
  }
  const search = async value => { await input('#query', value); await click('#search-button') }
  const update = patch => page.evaluate(value => window.XpertRemoteViewPreview.updateContext(value), patch)
  const query = text => ({ parameters: { operation: 'search', inputJson: JSON.stringify({ query: `${text} 咖啡`, city: '杭州' }) } })
  const waitRequests = async count => page.waitForFunction(async ({url,count}) => {
    const data = await (await fetch(url)).json(); return data.state.requests.length >= count
  }, { timeout: 12000 }, { url: '/__xpert/remote-view-preview/state', count })
  await wait(() => document.querySelectorAll('.place-card').length === 6 && document.querySelector('#map-image')?.naturalWidth > 0 && !document.querySelector('#map-loading'))
  assert.equal(await page.$eval('#remote-view', node => node.getAttribute('sandbox')), 'allow-scripts')
  assert.equal(await frame.evaluate(() => { try { window.localStorage; return false } catch (error) { return error.name === 'SecurityError' } }), true)
  assert.match(await text('.plugin-footer'), /高德地图.*演示数据/)
  assert.equal(await frame.$eval('.results-grid', node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 3)
  assert.equal(await frame.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight), true)
  report.checks.push('Real React bundle loads six explicitly fictional places, data image, three-column grid, bounded iframe and blocked Web Storage')
  await page.screenshot({ path: join(output, 'workbench-wide-light-zh.png'), fullPage: true })

  const themeBefore = preview.state.requests.filter(item => item.type === 'requestData').length
  await update({ locale: 'en-US', theme: { mode: 'dark', tokens: { colorBackground: '#12161d', colorForeground: '#f4f5f7', colorCard: '#12161d', colorPopover: '#1d2633', colorBorder: '#384354', colorInput: '#384354', colorRing: '#7298ea', colorMuted: '#202a36', colorMutedForeground: '#a6b2c2' } } })
  await wait(() => document.querySelector('#search-button').textContent === 'Search' && document.documentElement.dataset.theme === 'dark')
  assert.equal(preview.state.requests.filter(item => item.type === 'requestData').length, themeBefore)
  const theme = await frame.evaluate(() => {
    const root = getComputedStyle(document.documentElement), border = getComputedStyle(document.querySelector('[role=search]'))
    return { xui: root.getPropertyValue('--xui-color-border').trim(), border: root.getPropertyValue('--border').trim(), input: root.getPropertyValue('--input').trim(), ring: root.getPropertyValue('--ring').trim(), actual: border.borderTopColor }
  })
  assert.equal(theme.xui, '#384354'); assert.equal(theme.border, '#384354'); assert.equal(theme.input, '#384354'); assert.equal(theme.ring, '#7298ea'); assert.equal(theme.actual, 'rgb(56, 67, 84)')
  report.checks.push('Theme-only repeated init preserves results; English and dark semantic border/input/ring variables match host')
  await page.screenshot({ path: join(output, 'workbench-wide-dark-en.png'), fullPage: true })

  for (const [width, columns] of [[880, 2], [600, 1]]) {
    await page.evaluate(width => { document.querySelector('#remote-view').style.width = `${width}px` }, width)
    await wait(columns => getComputedStyle(document.querySelector('.results-grid')).gridTemplateColumns.split(' ').length === columns, columns)
  }
  assert.equal(await frame.$$eval('.place-card', nodes => nodes.length), 6)
  await frame.$eval('.tray-body', node => { node.scrollTop = 160 })
  await wait(() => document.querySelector('.tray-body').scrollTop > 100)
  const beforeScroll = await frame.$eval('.tray-body', node => node.scrollTop)
  await click('.place-card[data-place-id="demo-3"]')
  await wait(() => document.querySelector('#detail-title')?.textContent.includes('巷口咖啡'))
  assert.equal(await frame.$$eval('.map-pin[data-selected=true]', nodes => nodes.length), 1)
  await click('button[aria-label="Back to results"]')
  await wait(value => document.querySelector('.tray-body').scrollTop >= value - 1, beforeScroll)
  assert.equal(await frame.evaluate(() => document.activeElement?.getAttribute('data-place-id')), 'demo-3')
  await click('button[aria-label="Collapse results"]')
  await wait(() => document.querySelector('.result-tray').classList.contains('tray-collapsed'))
  await click('button[aria-label="Expand results"]')
  report.checks.push('Container width selects 3/2/1 columns; resize retains state; details restore result scroll/focus; tray collapses and restores')

  await click('.place-card[data-place-id="demo-2"]')
  await wait(() => document.querySelector('#detail-title')?.textContent.includes('树下咖啡'))
  await click('.detail-actions button:nth-child(2)')
  await wait(() => document.querySelector('.maps-notice')?.textContent.includes('chat composer'))
  assert.equal(preview.state.references.length, 1); assert.equal(preview.state.references[0].type, 'quote'); assert.match(preview.state.references[0].text, /树下咖啡/)
  assert.deepEqual(preview.state.sentMessages, [])
  report.checks.push('Reference action appends a quote to the host composer and does not send a message')
  await click('.maps-notice button')
  await click('.detail-actions button:first-child')
  await wait(() => document.querySelector('#route-origin'))
  await click('.route-layout button.w-full:not([role=combobox])')
  await wait(() => document.querySelector('#route-metrics')?.textContent.includes('5 min') && document.querySelector('#route-path'))
  await click('[role=tab][data-state=inactive]')
  await wait(() => !document.querySelector('#route-metrics') && !document.querySelector('#route-path'))
  await click('.route-layout button.w-full:not([role=combobox])')
  await wait(() => document.querySelector('#route-metrics')?.textContent.includes('20 min'))
  await click('button[aria-label="Swap starting point and destination"]')
  await wait(() => !document.querySelector('#route-metrics'))
  // Select the same destination as the origin through the real Radix Select.
  await click('#route-destination')
  await wait(() => document.querySelector('[role=option]'))
  await frame.$$eval('[role=option]', nodes => nodes.find(node => node.textContent.includes('树下咖啡')).click())
  await wait(() => !document.querySelector('[role=listbox]'))
  await click('.route-layout button.w-full:not([role=combobox])')
  await wait(() => document.querySelector('[role=alert]')?.textContent.includes('two different places'))
  assert.equal(await frame.$('#route-metrics'), null)
  report.checks.push('Driving/walking routing, route SVG, endpoint swap, invalid equal endpoints, and old route invalidation use production controls')
  await page.screenshot({ path: join(output, 'workbench-route-dark-en.png'), fullPage: true })
  await frame.focus('#route-origin'); await page.keyboard.press('Escape'); await wait(() => document.querySelector('#detail-title'))
  await page.keyboard.press('Escape'); await wait(() => document.querySelector('.results-grid'))

  const beforeNavigation = preview.state.requests.filter(item => item.type === 'requestData').length
  await update({ initialQuery: query('第二次从助手打开') })
  await wait(() => document.querySelector('.tray-header h2')?.textContent.includes('第二次从助手打开'))
  assert.equal(preview.state.requests.filter(item => item.type === 'requestData').length, beforeNavigation + 1)
  report.checks.push('Changed initialQuery on the same iframe reloads data and updates query state')

  const searchCount = preview.state.requests.filter(item => item.type === 'executeAction' && item.actionKey === 'maps.search').length
  await click('button[aria-label="Zoom in"]'); await frame.focus('#viewport'); await page.keyboard.press('ArrowRight')
  await wait(() => document.querySelector('.search-area') && !document.querySelector('#map-loading'))
  assert.equal(preview.state.requests.filter(item => item.type === 'executeAction' && item.actionKey === 'maps.search').length, searchCount)
  const beforeAreaRequest = preview.state.requests.length
  await click('.search-area')
  await waitRequests(beforeAreaRequest + 1)
  await wait(() => !document.querySelector('.status-panel .animate-spin') && !document.querySelector('#map-loading'))
  assert.ok(preview.state.requests.some(item => item.type === 'executeAction' && item.actionKey === 'maps.search' && item.input.center))
  assert.ok(preview.state.requests.filter(item => item.type === 'executeAction' && item.actionKey === 'maps.render').every(item => item.input.width <= 1024 && item.input.height <= 1024))
  report.checks.push('Pan/zoom only change viewport; explicit area search performs query; provider image dimensions stay bounded')

  preview.state.failNextAction = true
  await search('失败查询')
  await wait(() => document.querySelector('.status-panel')?.textContent.includes('Places could not be retrieved'))
  assert.equal(await frame.$eval('#query', node => node.value), '失败查询')
  report.checks.push('Typed provider error response immediately shows a retryable failure without a timeout or demo fallback')
  preview.state.delayQuery = '旧查询'; preview.state.delayMs = 450
  await search('旧查询')
  await page.waitForFunction(async () => { const data = await (await fetch('/__xpert/remote-view-preview/state')).json(); return data.state.requests.some(item => item.type === 'executeAction' && item.actionKey === 'maps.search' && item.input.query === '旧查询') })
  await search('新查询')
  await wait(() => document.querySelector('.tray-header h2')?.textContent.includes('新查询'))
  await page.waitForFunction(async () => { const data = await (await fetch('/__xpert/remote-view-preview/state')).json(); return data.state.completedQueries.includes('旧查询') })
  assert.match(await text('.tray-header h2'), /新查询/)
  report.checks.push('Late cancelled search response cannot replace the current query')

  preview.state.emptyQuery = '空结果'
  await search('空结果'); await wait(() => document.querySelector('.status-panel')?.textContent.includes('No places found'))
  assert.equal(await frame.$$eval('.map-pin', nodes => nodes.length), 0)
  await update({ initialQuery: {}, scopeRevision: 2 })
  await wait(() => !document.querySelector('#map-image') && document.querySelector('#query').value === '' && document.querySelector('.plugin-footer')?.textContent.includes('Demo data'))
  assert.equal(await frame.$$eval('.place-card', nodes => nodes.length), 0)
  report.checks.push('Scope change clears former results, selection, map image and query; initial empty view still identifies provider/demo')

  preview.state.provider = 'tencent'
  await update({ initialQuery: query('可替换供应商'), scopeRevision: 3, locale: 'zh-CN', theme: { mode: 'light', tokens: { colorBackground: '#ffffff', colorForeground: '#202126', colorBorder: '#dce1e7', colorInput: '#dce1e7', colorRing: '#527de8', colorCard: '#ffffff', colorPopover: '#ffffff', colorMuted: '#f4f4f5', colorMutedForeground: '#71717a' } } })
  await wait(() => document.querySelector('.plugin-footer')?.textContent.includes('腾讯地图') && document.querySelectorAll('.place-card').length === 6)
  await page.evaluate(() => { document.querySelector('#remote-view').style.width = '100%' })
  await page.setViewport({ width: 375, height: 820, deviceScaleFactor: 1 })
  await wait(() => document.documentElement.scrollWidth <= window.innerWidth && document.querySelector('#map-image')?.naturalWidth > 0 && !document.querySelector('#map-loading'))
  await page.screenshot({ path: join(output, 'workbench-mobile-light-zh.png'), fullPage: true })
  report.checks.push('Provider-neutral UI accepts Tencent data and remains bounded at 375px')
  const beforeToolEvent = preview.state.requests.filter(item => item.type === 'requestData').length
  await page.evaluate(() => window.XpertRemoteViewPreview.emitHostEvent({ type: 'assistant.tool.completed', toolName: 'maps_search', toolCallId: 'preview-call-1', data: { argsPreview: JSON.stringify({ query: '助手工具结果', city: '杭州' }) } }))
  await wait(() => document.querySelector('.tray-header h2')?.textContent.includes('助手工具结果'))
  assert.equal(preview.state.requests.filter(item => item.type === 'requestData').length, beforeToolEvent + 1)
  report.checks.push('Non-Project Assistant tool completion arguments refresh the view through the trusted backend query')
  const toolResult = await new (await import('../dist/lib/mock-provider.js')).DemoMapProvider('tencent').search({ query: '结构化工具输出', city: '杭州', page: 1, pageSize: 10 })
  const toolEvent = { type: 'assistant.tool.completed', toolName: 'maps_search', toolCallId: 'preview-call-2', data: { status: 'success', toolInput: { query: '结构化工具输出', city: '杭州' }, toolResult: { structuredContent: toolResult } } }
  await page.evaluate(event => window.XpertRemoteViewPreview.emitHostEvent(event), toolEvent)
  await wait(() => document.querySelector('.tray-header h2')?.textContent.includes('结构化工具输出'))
  const afterToolResult = preview.state.requests.filter(item => item.type === 'requestData').length
  await update({ theme: { mode: 'light' } })
  await wait(() => document.documentElement.dataset.theme === 'light')
  assert.match(await text('.tray-header h2'), /结构化工具输出/)
  assert.equal(preview.state.requests.filter(item => item.type === 'requestData').length, afterToolResult)
  await page.evaluate(event => window.XpertRemoteViewPreview.emitHostEvent(event), { ...toolEvent, toolCallId: 'preview-running', data: { ...toolEvent.data, status: 'running', toolResult: undefined } })
  assert.match(await text('.tray-header h2'), /结构化工具输出/)
  report.checks.push('Completed MCP tool structuredContent renders directly; theme init preserves it; running events are ignored')
  const contextRequests = preview.state.requests.filter(item => item.type === 'requestData').length
  await page.evaluate(() => window.XpertRemoteViewPreview.emitHostEvent({ type: 'view.context.changed' }))
  await wait(() => document.querySelectorAll('.place-card').length === 0 && !document.querySelector('#map-image'))
  assert.equal(preview.state.requests.filter(item => item.type === 'requestData').length, contextRequests + 1)
  report.checks.push('Canonical view.context.changed host event clears old conversation content and reloads trusted context')

  await page.setViewport({ width: 960, height: 860, deviceScaleFactor: 1 })
  await page.goto(mcpPreview.url)
  frame = await (await page.waitForSelector('#app')).contentFrame()
  await wait(() => document.querySelectorAll('.place-card').length === 6 && document.querySelector('#map-image')?.naturalWidth > 0)
  await click('.place-card[data-place-id="demo-1"]')
  await wait(() => document.querySelector('#detail-title')?.textContent.includes('河畔咖啡'))
  assert.equal(await frame.$eval('.detail-actions button:nth-child(2)', node => node.disabled), true)
  await wait(() => !document.querySelector('.detail-layout [role=status]'))
  assert.ok(mcpPreview.state.calls.some(call => call.name === 'maps_detail_view'))
  await page.screenshot({ path: join(output, 'mcp-detail-light-zh.png'), fullPage: true })
  report.checks.push('MCP surface uses the same production React components, real ext-apps bridge, detail callback, and explicit unavailable composer reference')
  assert.deepEqual(report.externalRequests, [])
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.consoleErrors, [])
  report.checks.push('No direct external browser requests, unhandled errors, console errors, or blocked CSP resources')
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(`Maps React browser acceptance: ${report.checks.length} checks passed. Evidence: ${output}\n`)
} catch (error) {
  report.failure = error.stack
  report.requests = preview.state.requests.map(item => ({ type: item.type, actionKey: item.actionKey, query: item.input?.query }))
  if (frame) report.ui = await frame.evaluate(() => ({ text: document.body.innerText, html: document.querySelector('#root')?.innerHTML.slice(0, 16000) })).catch(() => null)
  if (page) await page.screenshot({ path: join(output, 'failure.png'), fullPage: true })
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  throw error
} finally { await browser.close(); await preview.close(); await mcpPreview.close() }
