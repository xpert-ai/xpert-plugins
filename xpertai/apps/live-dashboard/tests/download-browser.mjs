import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { text } from 'node:stream/consumers'
import { fileURLToPath } from 'node:url'
import { dashboardRemoteEntry } from '../dist/lib/remote-entry.js'
// The collection workbench opens on its starter and does not mount a viewer.
// The single-dashboard document entry keeps the production viewer in frame.
// node tests/download-browser.mjs <workspace-with-playwright-core>
const app = fileURLToPath(new URL('..', import.meta.url))
const { chromium } = createRequire(`${process.argv[2]}/package.json`)('playwright-core')
const documentEntry = await dashboardRemoteEntry(false, undefined, true)
const server = spawn(process.execPath, [`${app}/tests/workbench-host.cjs`], {
  env: { ...process.env, PORT: '0', DASHBOARD_FIXTURE_HTML: 'true' }, stdio: ['ignore', 'pipe', 'pipe']
})
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
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const example = JSON.parse(await readFile(`${app}/examples/postgres-sales.json`, 'utf8'))
  example.visualTheme = 'contrast'
  const save = async manifest => {
    const response = await fetch(`${url}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'executeAction', actionKey: 'save', input: { manifest, expectedVersionId: null, expectedRevision: 0 } }) })
    const body = await response.json()
    assert.equal(response.ok && body.success, true, JSON.stringify(body))
    return body.data.artifactId
  }
  const open = async artifactId => {
    await page.unroute(`${url}/`).catch(() => undefined)
    await page.route(`${url}/`, async route => {
      const response = await route.fetch()
      const body = (await response.text()).replace('manifest:{},payload:{}', `manifest:{},initialQuery:${JSON.stringify({ selectionId: artifactId, parameters: {} })}`)
      await route.fulfill({ response, body })
    })
    await page.goto(url)
  }
  await page.route(`${url}/view`, route => route.fulfill({ contentType: 'text/html', body: documentEntry.html }))
  const standardId = await save(example)
  await open(standardId)
  const view = page.frameLocator('#view')
  const standard = view.frameLocator(`iframe[title="${example.title}"]`)
  await standard.getByRole('cell', { name: 'east', exact: true }).waitFor()
  assert.equal(await view.locator(`iframe[title="${example.title}"]`).getAttribute('sandbox'), 'allow-scripts allow-downloads')
  await standard.locator('body').evaluate(() => {
    const link = document.createElement('a')
    link.id = 'standard-export'
    link.download = 'standard.csv'
    link.href = URL.createObjectURL(new Blob(['region,total\neast,120'], { type: 'text/csv' }))
    link.textContent = 'Download standard'
    document.body.appendChild(link)
  })
  const [standardDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    standard.locator('#standard-export').click()
  ])
  assert.equal(standardDownload.suggestedFilename(), 'standard.csv')
  assert.equal(await text(await standardDownload.createReadStream()), 'region,total\neast,120')
  const htmlId = await save({
    ...example, id: '44444444-4444-4444-8444-444444444444', title: 'Download fixture', charts: [], tables: [],
    presentation: { type: 'html', html: `<html><body><a id="export" download="sales.csv">Download sales</a>
      <script>document.getElementById('export').href = URL.createObjectURL(new Blob(['region,total\\neast,120'], {type:'text/csv'}))</script>
      </body></html>` }
  })
  await open(htmlId)
  const htmlFrame = view.frameLocator('iframe[title="Download fixture"]')
  await htmlFrame.getByRole('link', { name: 'Download sales' }).waitFor()
  assert.equal(await view.locator('iframe[title="Download fixture"]').getAttribute('sandbox'), 'allow-scripts allow-downloads')
  const [htmlDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    htmlFrame.getByRole('link', { name: 'Download sales' }).click()
  ])
  assert.equal(htmlDownload.suggestedFilename(), 'sales.csv')
  assert.equal(await text(await htmlDownload.createReadStream()), 'region,total\neast,120')
  assert.deepEqual(errors, [])
  console.log('PASS: document viewer downloads kept the Blob filename and bytes for the standard renderer and interactive HTML; validation entry is not used here.')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
