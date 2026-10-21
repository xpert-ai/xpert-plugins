// Installed-runtime verification with independent private oracles. Browser/SSO and source mutation are separate checks.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
async function request(path, input, status = 200) {
  const response = await fetch(base + path, { headers, method: input ? 'POST' : 'GET',
    ...(input ? { body: JSON.stringify({ input }) } : {}), signal: AbortSignal.timeout(70000) })
  assert.ok(status === 200 ? [200, 201].includes(response.status) : response.status === status, `Unexpected status ${response.status}: ${path}`)
  return response.json()
}
const checks = []
for (const item of context.cases) {
  assert.ok(item.versions.length >= 2, `${item.name}: generation and update receipts required`)
  const current = (await request('/data?parameters=' + encodeURIComponent(JSON.stringify({ artifactId: item.artifactId })))).meta
  assert.equal(current.saved.versionId, item.versions.at(-1).versionId, `${item.name}: current version`)
  assert.equal(current.versions.length, item.versions.length, `${item.name}: retries must not create extra versions`)
  let previous
  for (const version of item.versions) {
    const { saved } = (await request('/data?parameters=' + encodeURIComponent(JSON.stringify({ artifactId: item.artifactId, versionId: version.versionId })))).meta
    assert.equal(saved.artifactId, item.artifactId)
    assert.equal(saved.versionId, version.versionId)
    assert.equal(saved.manifest.presentation.type, 'html')
    const locks = saved.manifest.presentation.dependencies ?? []
    assert.deepEqual((saved.dependencies ?? []).map(({ source, ...lock }) => lock), locks, `${item.name}: dependency snapshot matches locks`)
    for (const dependency of saved.dependencies ?? [])
      assert.equal(createHash('sha256').update(dependency.source).digest('hex'), dependency.sha256, `${item.name}: dependency bytes are immutable`)
    if (item.libraries) assert.deepEqual(locks.map(lock => ({ id: lock.id, version: lock.version })), item.libraries)
    if (version.manifestSha256) assert.equal(createHash('sha256').update(JSON.stringify(saved.manifest)).digest('hex'), version.manifestSha256, `${item.name}: previously captured definition is immutable`)
    assert.ok(saved.manifest.bindings.every(binding => binding.providerId === item.providerId), `${item.name}: required provider`)
    if (previous) {
      assert.equal(saved.manifest.id, previous.manifest.id)
      assert.ok(saved.versionNumber > previous.versionNumber)
      if (version.preserveBindings) assert.deepEqual(saved.manifest.bindings, previous.manifest.bindings, `${item.name}: style edit preserves bindings`)
      if (version.preserveDependencies) assert.deepEqual(saved.dependencies, previous.dependencies, `${item.name}: style edit preserves exact library bytes`)
    }
    const binding = saved.manifest.bindings[0]
    const input = { artifactId: item.artifactId, versionId: version.versionId, bindingId: binding.id, controls: {} }
    const oracle = version.oracle ?? item.oracle
    const normalize = rows => rows.map(row => Object.fromEntries(oracle.fields.map(field =>
      [field, oracle.numericFields.includes(field) ? Number(row[field]) : row[field]])))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    for (const scenario of oracle.scenarios) {
      const dataset = (await request('/actions/query-binding', { ...input, controls: scenario.controls })).data
      assert.deepEqual(normalize(dataset.rows), normalize(scenario.rows), `${item.name}/${saved.versionNumber}/${scenario.name}`)
      assert.equal(dataset.completeness.truncated, false)
      const fresh = (await request('/actions/query-binding', { ...input, controls: scenario.controls })).data
      assert.deepEqual(normalize(fresh.rows), normalize(scenario.rows))
      assert.notEqual(dataset.provenance.executionId, fresh.provenance.executionId)
      checks.push({ name: item.name, artifactId: item.artifactId, versionId: version.versionId, scenario: scenario.name,
        executionId: dataset.provenance.executionId, refreshExecutionId: fresh.provenance.executionId, rows: dataset.rows.length })
    }
    for (const injection of [{ payload: { sql: 'SELECT 1' } }, { providerId: 'foreign' }, { binding }, { dataSourceId: binding.dataSourceId }])
      await request('/actions/query-binding', { ...input, ...injection }, 400)
    await request('/actions/query-binding', { ...input, bindingId: 'undeclared' }, 403)
    await request('/actions/query-binding', { ...input, controls: { undeclared: 'value' } }, 400)
    const reopened = (await request('/data?parameters=' + encodeURIComponent(JSON.stringify({ artifactId: item.artifactId, versionId: version.versionId })))).meta.saved
    assert.deepEqual(reopened.manifest, saved.manifest, `${item.name}: immutable page and bindings`)
    previous = saved
  }
  console.log(JSON.stringify({ name: item.name, passed: true, versions: item.versions.length }))
}
await writeFile(options.output, JSON.stringify({ checks, cases: context.cases.length }, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ passed: true, cases: context.cases.length, queries: checks.length * 2 }))
