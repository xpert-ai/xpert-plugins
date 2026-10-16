// Production remote assets with an in-memory View Host; no login, deployment or real source mutations.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
const require = createRequire(`${process.argv[2]}/package.json`)
const { chromium } = require('playwright')
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
  assert.equal(stored.versions, 1)
  assert.deepEqual(stored.storedManifests, [example])
  const first = stored.artifacts[0].currentVersion
  const artifactId = stored.artifacts[0].id

  await view.getByLabel('区域', { exact: true }).click()
  await view.getByRole('option', { name: 'west', exact: true }).click()
  await view.getByRole('button', { name: '应用筛选', exact: true }).click()
  await renderer.getByRole('cell', { name: 'west', exact: true }).waitFor()
  assert.equal(await renderer.getByRole('cell', { name: 'east', exact: true }).count(), 0)
  assert.equal((await state()).parameters.at(-1).region, 'west')
  const beforeRefresh = (await state()).queries
  await view.getByRole('button', { name: '刷新', exact: true }).click()
  await renderer.getByRole('cell', { name: 'west', exact: true }).waitFor()
  assert.equal((await state()).queries, beforeRefresh + 1)

  await view.getByRole('button', { name: '编辑定义', exact: true }).click()
  await view.getByLabel('看板定义', { exact: true }).fill(JSON.stringify({ ...example, title: 'Newer edit' }))
  await view.getByRole('button', { name: '保存', exact: true }).click()
  await view.frameLocator('iframe[title="Newer edit"]').getByRole('cell', { name: 'east', exact: true }).waitFor()
  assert.equal((await state()).versions, 2)

  const opened = page.waitForRequest(request => request.url() === `${url}/rpc` && request.postDataJSON()?.query?.parameters?.versionId === first.id)
  await page.evaluate(({ artifactId, versionId }) => send({ type: 'hostEvent', event: {
    type: 'assistant.tool.completed', toolName: 'dashboard_create', data: { output: { dashboard: { artifactId, versionId } } }
  } }), { artifactId, versionId: first.id })
  await opened
  await renderer.getByRole('cell', { name: 'east', exact: true }).waitFor()
  assert.equal((await state()).versions, 2, 'Opening a receipt must not create a version')
  const frame = page.frames().find(frame => frame.url() === `${url}/view`)
  assert.deepEqual(await frame.evaluate(() => ['localStorage', 'sessionStorage'].map(name => {
    try { void window[name]; return 'accessible' } catch (error) { return error.name }
  })), ['SecurityError', 'SecurityError'])

  await page.reload()
  await view.getByRole('combobox', { name: '选择看板', exact: true }).click()
  await view.getByRole('option', { name: 'Newer edit', exact: true }).click()
  await view.frameLocator('iframe[title="Newer edit"]').getByRole('cell', { name: 'east', exact: true }).waitFor()
  assert.equal((await state()).versions, 2)
  if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: ['save', 'filter', 'fresh query', 'receipt version pinning', 'opaque origin', 'reopen current version'] }))
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
