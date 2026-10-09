import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { startPreview } = await import(pathToFileURL(resolve(root, 'remote/preview.mjs')).href)
const configPath = pathToFileURL(join(root, 'remote/preview.config.mjs')).href
const { default: baseConfig } = await import(configPath)
const playwrightPath = process.env.PLAYWRIGHT_MODULE ?? 'playwright'
const { chromium } = await import(isAbsolute(playwrightPath) ? pathToFileURL(playwrightPath).href : playwrightPath)
const screenshotDirectory = process.env.WORKBENCH_E2E_SCREENSHOTS

async function screenshot(page, name) {
  if (!screenshotDirectory) return
  await mkdir(screenshotDirectory, { recursive: true })
  await page.screenshot({ path: join(screenshotDirectory, `${name}.png`), fullPage: true })
}
async function setup({ locale = 'zh-Hans', scenario = 'populated', empty = false } = {}) {
  const host = await startPreview({
    ...baseConfig,
    hostContext: { ...baseConfig.hostContext, locale },
    state: { ...structuredClone(baseConfig.state), scenario, ...(empty ? { tickets: [] } : {}) },
  })
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) }).catch(async error => { await host.close(); throw error })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.addInitScript(() => {
    for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, { configurable: true, get() { throw new DOMException('Opaque sandbox storage disabled', 'SecurityError') } })
  })
  await page.goto(host.url)
  const frame = page.frameLocator('#remote-view')
  await frame.getByTestId('app-shell').waitFor()
  const cleanup = async () => { await browser.close(); await host.close(); assert.deepEqual(errors, [], 'Unexpected browser errors') }
  return { host, browser, page, frame, cleanup }
}

test('real built remote: edit, dirty guard, evidence, confirm, reload, create, AI processing, retry and persistence', { timeout: 90000 }, async () => {
  const { host, page, frame, cleanup } = await setup()
  try {
    await frame.getByTestId('reply-editor').waitFor()
    assert.match(await frame.getByTestId('original-message').innerText(), /两笔 299 元/)
    const styles = await frame.getByTestId('app-shell').evaluate(element => {
      const root = getComputedStyle(document.documentElement)
      const border = getComputedStyle(element.querySelector('.pane-heading')).borderBottomColor
      return { xui: root.getPropertyValue('--xui-color-border').trim(), border: root.getPropertyValue('--border').trim(), input: root.getPropertyValue('--input').trim(), ring: root.getPropertyValue('--ring').trim(), actual: border, width: document.documentElement.scrollWidth, viewport: innerWidth }
    })
    assert.equal(styles.xui, '#e4e6eb')
    assert.ok(styles.border && styles.input && styles.ring)
    assert.equal(styles.actual, 'rgb(228, 230, 235)')
    assert.ok(styles.width <= styles.viewport)
    await screenshot(page, '01-review-workbench')
    const edited = '您好，感谢反馈。请补充订单号与交易时间，我们将核实两笔扣款后说明处理方案。'
    await frame.getByTestId('reply-editor').fill(edited)
    await frame.getByRole('button', { name: /成员登录后无法进入项目空间/ }).click()
    await frame.getByRole('alertdialog').waitFor()
    const bounds = await frame.getByRole('alertdialog').boundingBox()
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 1440)
    await screenshot(page, '02-unsaved-edits-dialog')
    await frame.getByRole('button', { name: '继续编辑', exact: true }).click()
    assert.equal(await frame.getByTestId('reply-editor').inputValue(), edited)
    await frame.getByRole('button', { name: '确认并保存', exact: true }).click()
    await frame.getByText('审核结果已确认并保存。', { exact: true }).waitFor()
    assert.equal(host.state.tickets[0].status, 'confirmed')
    assert.equal(host.state.tickets[0].confirmedReply, edited)
    await page.reload()
    await frame.getByTestId('reply-editor').waitFor()
    assert.equal(await frame.getByTestId('reply-editor').inputValue(), edited)
    assert.equal(await frame.getByTestId('reply-editor').getAttribute('readonly'), '')
    await frame.getByRole('button', { name: '新建工单', exact: true }).click()
    await frame.getByRole('button', { name: '创建工单', exact: true }).click()
    await frame.getByText('请填写全部必填字段。', { exact: true }).waitFor()
    await frame.getByLabel('工单主题').fill('测试：导出报表失败')
    await frame.getByLabel('客户代称').fill('测试客户 D')
    await frame.getByLabel('客户原文').fill('点击导出按钮后没有响应，请协助排查。')
    await screenshot(page, '03-ticket-intake')
    await frame.getByRole('button', { name: '创建工单', exact: true }).click()
    await frame.getByTestId('ticket-workspace').getByRole('heading', { name: '测试：导出报表失败', exact: true }).waitFor()
    assert.equal(host.state.tickets.length, 4)
    await frame.getByRole('button', { name: '开始 AI 分析', exact: true }).click()
    await frame.getByText('AI 正在分析这张工单', { exact: true }).waitFor()
    assert.equal(host.state.tickets[0].status, 'processing')
    await screenshot(page, '04-processing')
    await frame.getByTestId('reply-editor').waitFor({ timeout: 12000 })
    assert.equal(host.state.tickets[0].status, 'pending_review')
    assert.ok(host.events.some(event => event.commandKey === 'assistant.chat.send_message'))
    await frame.getByRole('button', { name: /导出报表时页面一直加载/ }).click()
    await frame.getByRole('button', { name: '重试分析', exact: true }).waitFor()
    await screenshot(page, '05-failed-recoverable')
    await frame.getByRole('button', { name: '重试分析', exact: true }).click()
    await frame.getByTestId('reply-editor').waitFor({ timeout: 12000 })
    const retried = host.state.tickets.find(ticket => ticket.customerAlias === '客户 C')
    assert.equal(retried.status, 'pending_review')
    assert.ok(retried.analysis.evidence.every(quote => retried.message.includes(quote)))
    await page.setViewportSize({ width: 390, height: 844 })
    await screenshot(page, '06-mobile-review')
    assert.ok(await frame.getByTestId('app-shell').evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  } finally { await cleanup() }
})

test('host events retain dirty editor and surface concurrent revisions; refresh applies saved state', { timeout: 40000 }, async () => {
  const { host, page, frame, cleanup } = await setup()
  try {
    await frame.getByTestId('reply-editor').waitFor()
    await frame.getByTestId('reply-editor').fill('保留本地正在编辑的内容')
    host.state.tickets[0].revision++
    host.state.tickets[0].analysis.replyDraft = '来自另一审核会话的新版本'
    await page.evaluate(ticketId => window.XpertRemoteViewPreview.emitHostEvent({ event: { data: { tool_call: { function: { name: 'support_triage_save_analysis', arguments: JSON.stringify({ ticketId }) } }, output: { ticketId } } } }), host.state.tickets[0].id)
    await frame.getByText('这张工单已有更新，你的编辑已保留。请载入最新版本后重新审核。', { exact: true }).waitFor()
    assert.equal(await frame.getByTestId('reply-editor').inputValue(), '保留本地正在编辑的内容')
    assert.equal(await frame.getByRole('button', { name: '确认并保存', exact: true }).isDisabled(), true)
    await frame.getByRole('button', { name: '载入最新版本', exact: true }).click()
    await frame.getByRole('button', { name: '放弃修改', exact: true }).click()
    await frame.getByText('已载入回复草稿', { exact: true }).waitFor()
    assert.equal(await frame.getByTestId('reply-editor').inputValue(), '来自另一审核会话的新版本')
  } finally { await cleanup() }
})

test('missing Assistant command immediately releases attempt and offers retry', { timeout: 30000 }, async () => {
  const { host, frame, cleanup } = await setup({ scenario: 'dispatcher_unavailable' })
  try {
    await frame.getByRole('button', { name: /成员登录后无法进入项目空间/ }).click()
    await frame.getByRole('button', { name: '开始 AI 分析', exact: true }).click()
    await frame.getByRole('button', { name: '重试分析', exact: true }).waitFor()
    assert.equal(host.state.tickets[1].status, 'failed')
    assert.ok(host.events.some(event => event.actionKey === 'abort_analysis'))
    await frame.getByRole('alert').waitFor()
  } finally { await cleanup() }
})

test('empty state and host English locale; dark compact theme updates resolve semantic colors', { timeout: 30000 }, async () => {
  const { host, page, frame, cleanup } = await setup({ locale: 'en_US', empty: true })
  try {
    await frame.getByRole('heading', { name: 'Support review', exact: true }).waitFor()
    await frame.getByText('Connected to workspace', { exact: true }).waitFor()
    await frame.getByRole('main').getByText('Your queue is clear', { exact: true }).waitFor()
    await page.evaluate(() => document.getElementById('remote-view').contentWindow.postMessage({ channel: 'xpertai.remote_component', protocolVersion: 1, instanceId: 'support-triage-preview', type: 'themeChanged', theme: { mode: 'dark', density: 'compact', tokens: { '--xui-color-background': '#111827', '--xui-color-foreground': '#f3f4f6', '--xui-color-border': '#374151', '--xui-color-card': '#111827', '--xui-color-muted': '#1f2937', '--xui-color-input': '#4b5563', '--xui-color-primary': '#a5b4fc', '--xui-color-primary-foreground': '#111827' } } }, '*'))
    await frame.locator('html.dark').waitFor()
    const style = await frame.getByTestId('app-shell').evaluate(() => ({ density: document.documentElement.dataset.xuiDensity, border: getComputedStyle(document.querySelector('.app-header')).borderBottomColor }))
    assert.equal(style.density, 'compact')
    assert.equal(style.border, 'rgb(55, 65, 81)')
    await screenshot(page, '07-english-dark-empty')
    assert.equal(host.state.tickets.length, 0)
  } finally { await cleanup() }
})

test('provider-shaped data.code conflicts display an actionable error and preserve edits', { timeout: 30000 }, async () => {
  const { host, frame, cleanup } = await setup()
  try {
    await frame.getByTestId('reply-editor').waitFor()
    await frame.getByTestId('reply-editor').fill('需要保留的审核回复')
    host.state.scenario = 'conflict_on_confirm'
    await frame.getByRole('button', { name: '确认并保存', exact: true }).click()
    await frame.getByRole('alert').waitFor({ timeout: 8000 })
    assert.match(await frame.getByRole('alert').innerText(), /这张工单已被更新，请载入最新版本后重新审核。/)
    assert.equal(await frame.getByTestId('reply-editor').inputValue(), '需要保留的审核回复')
    assert.equal(host.state.tickets[0].confirmedReply, null)
  } finally { await cleanup() }
})
