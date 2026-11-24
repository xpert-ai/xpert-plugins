#!/usr/bin/env node
/**
 * Captures the board states that the four-layer test plan asks for.
 *
 *   node tests/browser/capture-board.mjs --stage persisted
 *   node tests/browser/capture-board.mjs --stage empty
 *   node tests/browser/capture-board.mjs --stage failed
 *   node tests/browser/capture-board.mjs --stage retry
 *
 * Start `tests/browser/serve-host.mjs` first (it forwards everything to the real
 * `view-hosts` endpoints). The `empty` and `failed` stages need a database state
 * that no UI action produces; see tests/browser/README.md for the two SQL
 * statements - the script only takes the screenshot, it never writes rows itself.
 *
 * Env: HOST_URL (default http://127.0.0.1:4310), SHOTS_DIR (default
 * docs/interview/screenshots), PLAYWRIGHT (path to playwright-core's index.mjs).
 */
import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(here, '..', '..')
const stage = (process.argv.find((arg) => arg.startsWith('--stage=')) ?? '--stage=persisted').split('=')[1]
const hostUrl = process.env.HOST_URL ?? 'http://127.0.0.1:4310'
const shotsDir = isAbsolute(process.env.SHOTS_DIR ?? '')
  ? process.env.SHOTS_DIR
  : join(pluginRoot, process.env.SHOTS_DIR ?? 'docs/interview/screenshots')
const playwrightSpecifier = process.env.PLAYWRIGHT ?? 'playwright-core'

const FILES = {
  persisted: '09-board-persisted-after-restart.png',
  empty: '10-board-empty-state.png',
  failed: '11-board-needs-retry.png',
  retry: '12-board-retry-recovered.png'
}
if (!FILES[stage]) {
  console.error(`unknown stage ${stage}; expected one of ${Object.keys(FILES).join(', ')}`)
  process.exit(1)
}

const { chromium } = await import(playwrightSpecifier)

await mkdir(shotsDir, { recursive: true })

const log = (...args) => console.log('[capture-board]', ...args)
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('pageerror', (error) => log('PAGEERROR', String(error).slice(0, 200)))

await page.goto(hostUrl, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

const board = page.frameLocator('#frame')
const text = async () => (await board.locator('body').innerText()).replace(/\n+/g, ' | ')

if (stage === 'retry') {
  log('before:', (await text()).slice(0, 300))
  await board.getByRole('button', { name: '重试分诊' }).first().click()
  await page.waitForTimeout(4000)
  log('after:', (await text()).slice(0, 300))
}

if (stage === 'failed') {
  const state = await text()
  if (!state.includes('需重试')) {
    console.error('[capture-board] no failed ticket on the board; run the mark-failed SQL from tests/browser/README.md first')
  }
}

await page.screenshot({ path: join(shotsDir, FILES[stage]) })
log('wrote', join(shotsDir, FILES[stage]))
log('board:', (await text()).slice(0, 500))

await browser.close()
