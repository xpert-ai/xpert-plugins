#!/usr/bin/env node
/**
 * Captures the chat-side screenshots: workspace entry, agent canvas, preview
 * composer, a real model turn with both tool calls, and the middleware panel.
 *
 *   node tests/browser/capture-chat.mjs
 *
 * Needs the platform Cloud UI running (XPERT_UI_URL, default
 * http://127.0.0.1:4300) and a real model configured, because the point is to
 * prove the tools are called by the model - not to render a fixture.
 *
 * Env: XPERT_UI_URL, XPERT_WORKSPACE_ID, XPERT_XPERT_ID, SHOTS_DIR (default
 * docs/interview/screenshots), PLAYWRIGHT (path to playwright-core index.mjs),
 * CHROME_CHANNEL (default chrome).
 */
import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(here, '..', '..')

const uiUrl = process.env.XPERT_UI_URL ?? 'http://127.0.0.1:4300'
const assistantTitle = process.env.XPERT_ASSISTANT_TITLE ?? 'Support ticket triage'
const shotsDir = isAbsolute(process.env.SHOTS_DIR ?? '')
  ? process.env.SHOTS_DIR
  : join(pluginRoot, process.env.SHOTS_DIR ?? 'docs/interview/screenshots')
const playwrightSpecifier = process.env.PLAYWRIGHT ?? 'playwright-core'

const STEPS = [
  ['01-workspace-assistant.png', 'workspace entry with the app card'],
  ['02-agent-canvas.png', 'agent canvas: middleware node and its two tools'],
  ['03-preview-composer.png', 'preview panel before typing'],
  ['04-preview-prompt.png', 'prompt that asks for one ticket only'],
  ['05-chat-tool-calls.png', 'real model turn: list then propose, with the board table in the reply'],
  ['08-middleware-capabilities.png', 'middleware panel: tools plus the view capability']
]

const log = (...args) => console.log('[capture-chat]', ...args)
await mkdir(shotsDir, { recursive: true })

const { chromium } = await import(playwrightSpecifier)
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('pageerror', (error) => log('PAGEERROR', String(error).slice(0, 160)))

const shot = async (index) => {
  const [file, why] = STEPS[index]
  await page.screenshot({ path: join(shotsDir, file) })
  log('wrote', file, '-', why)
}

const bodyText = async (limit = 3000) => (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, limit)

// 1. log in with the test account configured in the platform
await page.goto(`${uiUrl}/auth/login`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.locator('input').first().fill(process.env.XPERT_EMAIL ?? '')
await page.locator('input[type="password"]').first().fill(process.env.XPERT_PASSWORD ?? '')
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(7000)
log('login ->', page.url())

// 2. workspace list -> app card
await page.goto(`${uiUrl}/xpert/w/${process.env.XPERT_WORKSPACE_ID ?? ''}/xperts`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)
await shot(0)
log('list:', (await bodyText(200)))

// 3. studio canvas
if (process.env.XPERT_XPERT_ID) {
  await page.goto(`${uiUrl}/xpert/x/${process.env.XPERT_XPERT_ID}/agents`, { waitUntil: 'domcontentloaded' })
} else {
  await page.locator(`text=${assistantTitle}`).first().click()
}
await page.waitForTimeout(12000)
await shot(1)
log('studio url', page.url())

// 4. preview panel, then a real model turn
await page.getByText('预览', { exact: true }).first().click()
await page.waitForTimeout(8000)
await shot(2)

const composer = page.locator('textarea').last()
await composer.click()
await composer.fill(process.env.XPERT_PROMPT ?? '请调用 list_pending_tickets 列出待处理工单，然后只对 T-1002 提交分诊建议：priority=P2、team=billing，并给出 rationale 与 draftReply。')
await page.waitForTimeout(800)
await shot(3)
await composer.press('Enter')
log('sent; polling for tool calls...')

let settled = false
for (let attempt = 0; attempt < 16; attempt += 1) {
  await page.waitForTimeout(15000)
  const text = await bodyText()
  const list = text.includes('list_pending_tickets')
  const propose = text.includes('propose_ticket_triage')
  log(`poll ${attempt + 1}: list=${list} propose=${propose} len=${text.length}`)
  if (list && propose) {
    await page.waitForTimeout(25000)
    settled = true
    break
  }
}

await shot(4)
log('settled:', settled)
log('final:', await bodyText(1500))

// 5. middleware panel (canvas node, not the chat) - shows tools + view capability
await page.locator('text=工单分诊').first().click().catch(() => log('middleware node not clickable'))
await page.waitForTimeout(4000)
await shot(5)

await browser.close()
