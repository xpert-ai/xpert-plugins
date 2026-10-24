// Read-only acceptance against a real installed host; credentials stay in its login helper.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const options = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) =>
  [process.argv[2 + i * 2].replace(/^--/, ''), process.argv[3 + i * 2]]))
assert.ok(options.context && options['platform-root'] && options.output, 'Required: --context --platform-root --output')
const context = JSON.parse(await readFile(options.context, 'utf8'))
const { requireAuthentication, createRequestHeaders } = await import(pathToFileURL(resolve(options['platform-root'], 'tools/scripts/local-plugin-cli.mjs')))
const login = { apiUrl: context.apiUrl, orgId: context.orgId,
  usernameKeychainService: context.usernameKeychainService, passwordKeychainService: context.passwordKeychainService }
const auth = await requireAuthentication(login)
const headers = createRequestHeaders(login, auth.token, auth.tenantId)
const base = `${context.apiUrl.replace(/\/$/, '')}/api/view-hosts/agent/${encodeURIComponent(context.assistantId)}/views/live-dashboard__live-dashboard`
async function request(path, body) {
  const response = await fetch(base + path, { headers, method: body ? 'POST' : 'GET',
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(270000) })
  assert.equal(response.ok, true, `Host request failed: HTTP ${response.status}`)
  return response.json()
}
const opened = await request('/data?parameters=' + encodeURIComponent(JSON.stringify({ artifactId: context.artifactId })))
const saved = opened.meta.saved
assert.equal(saved.versionId, context.versionId, 'Persisted version changed')
const checks = []
for (const scenario of context.scenarios) {
  const run = async () => (await request('/actions/query', { input: {
    artifactId: saved.artifactId, versionId: saved.versionId, controls: scenario.controls
  } })).data
  const first = await run(), refreshed = await run()
  for (const expectation of scenario.datasets) {
    const dataset = first.datasets.find(item => item.datasetId === expectation.datasetId)
    const fresh = refreshed.datasets.find(item => item.datasetId === expectation.datasetId)
    assert.ok(dataset && fresh, 'Expected Dataset missing')
    assert.equal(dataset.completeness.truncated, false, 'Cannot accept partial business totals')
    const normalize = rows => rows.map(row => Object.fromEntries(expectation.fields.map(field =>
      [field, expectation.numericFields.includes(field) ? Number(row[field]) : row[field]])))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    assert.deepEqual(normalize(dataset.rows), normalize(expectation.rows), `Oracle mismatch: ${scenario.name}/${expectation.datasetId}`)
    assert.deepEqual(normalize(fresh.rows), normalize(expectation.rows), 'Refresh changed expected values')
    assert.notEqual(dataset.provenance.executionId, fresh.provenance.executionId, 'Refresh reused an execution')
    if (context.requireUpstreamExecution) assert.notEqual(dataset.provenance.upstreamExecutionId,
      fresh.provenance.upstreamExecutionId, 'Refresh reused the upstream action')
    checks.push({ scenario: scenario.name, datasetId: dataset.datasetId, rows: dataset.rows.length,
      executionId: dataset.provenance.executionId, refreshExecutionId: fresh.provenance.executionId,
      ...(context.requireUpstreamExecution ? { upstreamExecutionId: dataset.provenance.upstreamExecutionId,
        refreshUpstreamExecutionId: fresh.provenance.upstreamExecutionId } : {}) })
  }
}
await writeFile(options.output, JSON.stringify({ artifactId: saved.artifactId, versionId: saved.versionId, checks }, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ passed: true, scenarios: context.scenarios.length, datasetChecks: checks.length }))
