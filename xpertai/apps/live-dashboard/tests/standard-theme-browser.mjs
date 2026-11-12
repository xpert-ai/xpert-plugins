import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { verifyDist } from '../scripts/dist-manifest.mjs'
// Production bundle with synthetic source data; no platform login or deployment.
// node tests/standard-theme-browser.mjs <workspace-with-@playwright/test> [screenshots]
const app = fileURLToPath(new URL('..', import.meta.url))
await verifyDist(app)
const screenshots = process.argv[3]
const require = createRequire(`${process.argv[2]}/package.json`)
const { chromium, expect } = require('@playwright/test')
const server = spawn(process.execPath, [`${app}/tests/workbench-host.cjs`], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
let browser
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Host startup timeout')), 15000)
    server.stdout.on('data', chunk => { const match = String(chunk).match(/Acceptance host: (http:\/\/127\.0\.0\.1:\d+)/); if (match) { clearTimeout(timer); resolve(match[1]) } })
    server.stderr.on('data', chunk => process.stderr.write(chunk))
    server.once('error', error => { clearTimeout(timer); reject(error) })
    server.once('exit', code => { clearTimeout(timer); reject(Error(`Host exit ${code}`)) })
  })
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.setDefaultTimeout(15000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const state = async () => (await fetch(`${url}/state`)).json()
  const example = JSON.parse(await readFile(`${app}/examples/postgres-sales.json`, 'utf8'))
  example.visualTheme = 'contrast'
  const seeded = await fetch(`${url}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    type: 'executeAction', actionKey: 'save', input: { manifest: example, expectedVersionId: null, expectedRevision: 0 }
  }) })
  const receipt = await seeded.json()
  assert.equal(seeded.ok, true, JSON.stringify(receipt))
  await page.route(`${url}/`, async route => {
    const response = await route.fetch()
    const body = (await response.text()).replace('manifest:{},payload:{}', `manifest:{},initialQuery:${JSON.stringify({ selectionId: receipt.data.artifactId, parameters: {} })}`)
    await route.fulfill({ response, body })
  })
  await page.goto(url)
  const view = page.frameLocator('#view')
  const renderer = view.frameLocator(`iframe[title="${example.title}"]`)
  await renderer.getByRole('cell', { name: 'east', exact: true }).waitFor()
  const before = await state()
  const nav = { selectionId: receipt.data.artifactId, parameters: {} }
  if (screenshots) await mkdir(screenshots, { recursive: true })
  for (const dark of [false, true]) {
    const background = dark ? '#09090b' : '#ffffff'
    const foreground = dark ? '#fafafa' : '#18181b'
    await page.evaluate(({ dark, background, foreground, nav }) => send({
      type: 'init', locale: 'zh-Hans', initialQuery: { selectionId: nav.selectionId, parameters: nav.parameters },
      theme: { mode: dark ? 'dark' : 'light', tokens: {
        'color.background': background, 'color.foreground': foreground,
        'color.card': dark ? '#18181b' : '#f8fafc', 'color.cardForeground': foreground,
        'color.muted': dark ? '#27272a' : '#e2e8f0', 'color.mutedForeground': dark ? '#a1a1aa' : '#64748b',
        'color.border': dark ? '#3f3f46' : '#cbd5e1', 'color.primary': dark ? '#93c5fd' : '#1d4ed8'
      } }
    }), { dark, background, foreground, nav })
    await expect(renderer.locator('html')).toHaveCSS('--color-background-primary', background)
    await expect(renderer.locator('html')).toHaveAttribute('data-theme', dark ? 'dark' : 'light')
    await expect(renderer.locator('html')).toHaveCSS('--color-border-primary', foreground)
    await renderer.getByRole('cell', { name: 'east', exact: true }).waitFor()
    await renderer.getByRole('cell', { name: 'west', exact: true }).waitFor()
    await expect(renderer.getByRole('cell', { name: '120', exact: true })).toHaveCSS('color', dark ? 'rgb(250, 250, 250)' : 'rgb(24, 24, 27)')
    assert.equal(await renderer.locator('style[data-dashboard-theme="contrast"]').count(), 1)
    assert.equal(await view.locator(`iframe[title="${example.title}"]`).getAttribute('sandbox'), 'allow-scripts')
    if (screenshots) await page.screenshot({ path: `${screenshots}/${dark ? 'dark' : 'light'}.png` })
    const after = await state()
    assert.equal(after.queries, before.queries)
    assert.equal(after.saves, before.saves)
    assert.deepEqual(after.storedManifests, before.storedManifests)
  }
  assert.deepEqual(errors, [])
  console.log('PASS: production standard renderer follows light/dark host tokens; data and saved manifests unchanged; sandbox retained.')
} finally { await browser?.close(); server.kill('SIGTERM') }
