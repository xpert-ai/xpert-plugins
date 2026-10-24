// Real HTTP boundary and business oracle. This does not mutate sources or prove browser rendering.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const options = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) =>
  [process.argv[2 + i * 2].replace(/^--/, ''), process.argv[3 + i * 2]]))
assert.ok(options.context && options['platform-root'] && options.output, 'Required: --context --platform-root --output')
const context = JSON.parse(await readFile(options.context, 'utf8'))
const { requireAuthentication, createRequestHeaders } = await import(pathToFileURL(resolve(options['platform-root'], 'tools/scripts/local-plugin-cli.mjs')))
const login = { apiUrl: context.apiUrl, orgId: context.orgId, usernameKeychainService: context.usernameKeychainService,
  passwordKeychainService: context.passwordKeychainService }
const auth = await requireAuthentication(login), headers = createRequestHeaders(login, auth.token, auth.tenantId)
const base = `${context.apiUrl.replace(/\/$/, '')}/api/view-hosts/agent/${encodeURIComponent(context.assistantId)}/views/live-dashboard__live-dashboard`
async function request(path, input, expectedStatus = 200) {
  const response = await fetch(base + path, { headers, method: input ? 'POST' : 'GET',
    ...(input ? { body: JSON.stringify({ input }) } : {}), signal: AbortSignal.timeout(45000) })
  assert.ok(expectedStatus === 200 ? [200, 201].includes(response.status) : response.status === expectedStatus, `Unexpected HTTP status ${response.status}: ${path}`)
  return response.json()
}
const checks = [], bindings = [], pages = []
for (const page of context.pages) {
  const saved = (await request('/data?parameters=' + encodeURIComponent(JSON.stringify({ artifactId: page.artifactId })))).meta.saved
  assert.equal(saved.versionId, page.versionId)
  assert.equal(saved.manifest.presentation.type, 'html')
  assert.ok(saved.manifest.presentation.html.includes('xpertLiveArtifact'))
  const binding = saved.manifest.bindings[0]
  bindings.push(binding); pages.push({ artifactId: saved.artifactId, versionId: saved.versionId, title: saved.title })
  const input = { artifactId: saved.artifactId, versionId: saved.versionId, bindingId: binding.id, controls: {} }
  for (const scenario of context.scenarios) {
    const first = (await request('/actions/query-binding', { ...input, controls: scenario.controls })).data
    const fresh = (await request('/actions/query-binding', { ...input, controls: scenario.controls })).data
    const normalize = rows => rows.map(row => Object.fromEntries(context.fields.map(field =>
      [field, context.numericFields.includes(field) ? Number(row[field]) : row[field]])))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    assert.deepEqual(normalize(first.rows), normalize(scenario.rows), scenario.name)
    assert.deepEqual(normalize(fresh.rows), normalize(scenario.rows), `${scenario.name} refresh`)
    assert.equal(first.completeness.truncated, false)
    assert.notEqual(first.provenance.executionId, fresh.provenance.executionId)
    checks.push({ artifactId: saved.artifactId, scenario: scenario.name, rows: first.rows.length,
      executionId: first.provenance.executionId, refreshExecutionId: fresh.provenance.executionId })
  }
  for (const injection of [{ payload: { sql: 'SELECT 1' } }, { providerId: 'foreign' }, { binding }, { dataSourceId: binding.dataSourceId }])
    await request('/actions/query-binding', { ...input, ...injection }, 400)
  await request('/actions/query-binding', { ...input, bindingId: 'undeclared' }, 403)
  await request('/actions/query-binding', { ...input, controls: { undeclared: 'value' } }, 400)
  const reopened = (await request('/data?parameters=' + encodeURIComponent(JSON.stringify({ artifactId: page.artifactId })))).meta.saved
  assert.deepEqual(reopened.manifest, saved.manifest)
}
assert.ok(bindings.every(binding => JSON.stringify(binding) === JSON.stringify(bindings[0])), 'Styles must share exactly the same data binding')
await writeFile(options.output, JSON.stringify({ pages, checks, rejectedRequests: context.pages.length * 6 }, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ passed: true, pages: pages.length, scenarios: checks.length, rejectedRequests: pages.length * 6 }))
