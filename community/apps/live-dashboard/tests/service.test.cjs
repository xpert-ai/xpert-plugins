const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DashboardService } = require('../dist/lib/dashboard.service.js')
const { normalizeAnalyticsResult, resolveAnalyticsParameters } = require('@xpert-ai/plugin-sdk/analytics')
const example = require('../examples/postgres-sales.json')

function setup() {
  const context = { tenantId: 'tenant', organizationId: 'org', userId: 'owner', hostType: 'agent', hostId: 'assistant' }
  const files = new Map(), artifacts = new Map(), versions = []
  const calls = { queries: [], denied: false, rejectFilter: false, invalidHtml: false }
  const capabilities = {
    'platform.datasource.analytics': {
      async query(actor, input) {
        calls.queries.push({ actor, input })
        if (calls.denied) throw new Error('SOURCE_ACCESS_REVOKED')
        const { region } = resolveAnalyticsParameters(input.binding, input.controls)
        if (calls.rejectFilter && region !== 'all') throw new Error('NATIVE_FILTER_TYPE_INVALID')
        const rows = [{ region: 'east', amount: 120 }, { region: 'west', amount: 80 }].filter(row => region === 'all' || row.region === region)
        return normalizeAnalyticsResult(input.binding, { columns: [{ key: 'region' }, { key: 'amount' }], rows,
          sourceFetchedAt: new Date().toISOString(), completeness: { returnedRows: rows.length, totalRows: rows.length,
            totalAccuracy: 'exact', scope: 'full_query_result', truncated: false } }, randomUUID(), 1000)
      }
    },
    'platform.workspace.files': {
      async uploadBuffer(input) {
        assert.equal(input.mimeType, 'application/json', 'must use a platform-supported Artifact MIME type')
        const filePath = input.folder + '/' + input.fileName
        files.set(filePath, Buffer.from(input.buffer)); return { filePath }
      },
      async readBuffer(ref) { return { buffer: files.get(ref.filePath) } }
    },
    'platform.artifacts': {
      async findArtifactBySource(source) { return [...artifacts.values()].find(a => a.resourceId === source.resourceId) },
      async createArtifact(input) { const a = { id: randomUUID(), ...input.source, ...input.scope, title: input.title }; artifacts.set(a.id, a); return a },
      async getArtifact(id) { return artifacts.get(id) },
      async listArtifactVersions({ artifactId }) { return versions.filter(v => v.artifactId === artifactId) },
      async ensureArtifactVersion(input) {
        const a = artifacts.get(input.artifactId)
        const current = versions.find(v => v.id === a.currentVersionId)
        if (current?.idempotencyKey === input.idempotencyKey) return { version: current, outcome: 'reused' }
        assert.equal(input.expectedCurrentVersionId, a.currentVersionId ?? null, 'CAS expectation must reach platform')
        const version = { ...input, id: randomUUID(), versionNumber: versions.length + 1 }
        versions.push(version); a.currentVersion = version; a.currentVersionId = version.id
        return { version, outcome: 'created' }
      }
    }
  }
  return { context, files, artifacts, versions, calls, service: new DashboardService({ require: key => capabilities[key.id] }, { async validate(_context, manifest) { if (manifest.presentation && calls.invalidHtml) throw Error('DASHBOARD_HTML_PREFLIGHT_FAILED'); return manifest.presentation ? { status: 'passed', jobId: 'test-job', requestedBindings: manifest.bindings.map(b => b.id) } : null } }) }
}

test('save stores only a definition; reload/filter/refresh re-query with distinct executions', async () => {
  const s = setup(); const saved = await s.service.save(s.context, example, null)
  assert.deepEqual(JSON.parse([...s.files.values()][0]), example)
  assert.equal(s.versions.length, 1)
  const reload = await s.service.open(s.context, saved.artifactId)
  assert.deepEqual(reload.manifest, example)
  const first = await s.service.query(s.context, saved.artifactId, saved.versionId, { region: 'west' })
  const refreshed = await s.service.query(s.context, saved.artifactId, saved.versionId, { region: 'west' })
  assert.deepEqual(first.datasets[0].rows, [{ region: 'west', amount: 80 }])
  assert.deepEqual(first.datasets[0].rows, refreshed.datasets[0].rows)
  assert.notEqual(first.datasets[0].provenance.executionId, refreshed.datasets[0].provenance.executionId)
  assert.equal(s.calls.queries.length, 4)
})

test('stale saves fail before source queries; idempotent retry still checks current source access', async () => {
  const s = setup(); const saved = await s.service.save(s.context, example, null)
  const edit = { ...example, title: 'Changed' }
  await assert.rejects(s.service.save(s.context, edit, null), /VERSION_CONFLICT/)
  assert.equal(s.calls.queries.length, 2)
  const retry = await s.service.save(s.context, example, null)
  assert.equal(retry.versionId, saved.versionId)
  s.calls.denied = true
  await assert.rejects(s.service.save(s.context, example, saved.versionId), /REVOKED/)
  await assert.rejects(s.service.query(s.context, saved.artifactId, saved.versionId, {}), /REVOKED/)
  assert.equal(s.versions.length, 1)
})

test('View opens the receipt version even when another edit is already current', async () => {
  const { DashboardViewProvider } = require('../dist/lib/view.provider.js')
  const s = setup(), first = await s.service.save(s.context, example, null)
  await s.service.save(s.context, { ...example, title: 'Newer edit' }, first.versionId)
  s.service.list = async () => []
  s.service.sources = async () => []
  const view = new DashboardViewProvider(s.service)
  const pinned = await view.getViewData(s.context, 'live-dashboard', { parameters: { artifactId: first.artifactId, versionId: first.versionId } })
  assert.equal(pinned.meta.saved.versionId, first.versionId)
  assert.equal(pinned.meta.saved.manifest.title, example.title)
  const current = await view.getViewData(s.context, 'live-dashboard', { parameters: { artifactId: first.artifactId } })
  assert.equal(current.meta.saved.manifest.title, 'Newer edit')
  await assert.rejects(view.getViewData(s.context, 'live-dashboard', { parameters: { versionId: first.versionId } }), /version requires an Artifact/)
})

test('a default-only query cannot authorize saving a broken interactive filter', async () => {
  const s = setup(); s.calls.rejectFilter = true
  await assert.rejects(s.service.preview(s.context, { binding: example.bindings[0], controls: { region: 'all' } }), /FILTER_PREVIEW_FAILED/)
  await assert.rejects(s.service.save(s.context, example, null), /FILTER_PREVIEW_FAILED/)
  assert.equal(s.artifacts.size, 0); assert.equal(s.files.size, 0)
})

test('host and owner isolation precede file reads; modified Workspace bytes cannot impersonate a saved version', async () => {
  const s = setup(); const saved = await s.service.save(s.context, example, null)
  for (const override of [{ userId: 'other' }, { organizationId: 'other' }, { hostId: 'other' }])
    await assert.rejects(s.service.open({ ...s.context, ...override }, saved.artifactId), /ACCESS_DENIED/)
  s.files.set([...s.files.keys()][0], Buffer.from(JSON.stringify({ ...example, title: 'Tampered' })))
  await assert.rejects(s.service.open(s.context, saved.artifactId), /VERSION_CONTENT_CHANGED/)
})

test('HTML bytes and bindings are one immutable version; query endpoint cannot accept a replacement binding', async () => {
  const { DashboardViewProvider } = require('../dist/lib/view.provider.js')
  const s = setup(), html = '<html><body><main>Live</main><script>window.xpertLiveArtifact.ready()</script></body></html>'
  const manifest = { ...example, charts: [], tables: [], presentation: { type: 'html', html } }
  const saved = await s.service.save(s.context, manifest, null)
  const view = new DashboardViewProvider(s.service)
  const input = { artifactId: saved.artifactId, versionId: saved.versionId, bindingId: manifest.bindings[0].id, controls: { region: 'west' } }
  const response = await view.executeViewAction(s.context, 'live-dashboard', 'query-binding', { input })
  assert.deepEqual(response.data.rows, [{ region: 'west', amount: 80 }])
  assert.equal((await s.service.open(s.context, saved.artifactId)).manifest.presentation.html, html)
  const count = s.calls.queries.length
  for (const extras of [{ binding: example.bindings[0] }, { providerId: 'foreign' }, { payload: { sql: 'SELECT secret' } }, { dataSourceId: randomUUID() }])
    await assert.rejects(view.executeViewAction(s.context, 'live-dashboard', 'query-binding', { input: { ...input, ...extras } }), error => error.getStatus() === 400 && /INVALID_QUERY/.test(error.message))
  await assert.rejects(view.executeViewAction(s.context, 'live-dashboard', 'query-binding', { input: { ...input, bindingId: 'undeclared' } }), /BINDING_DENIED/)
  await assert.rejects(view.executeViewAction(s.context, 'live-dashboard', 'query-binding', { input: { ...input, controls: { sql: 'SELECT secret' } } }), /UNKNOWN_CONTROL/)
  await assert.rejects(view.executeViewAction({ ...s.context, userId: 'stranger' }, 'live-dashboard', 'query-binding', { input }), /ACCESS_DENIED/)
  assert.equal(s.calls.queries.length, count)
  const updated = await s.service.save(s.context, { ...manifest, presentation: { type: 'html', html: html.replace('Live', 'Changed') } }, saved.versionId)
  assert.notEqual(updated.versionId, saved.versionId)
  assert.equal((await s.service.open(s.context, saved.artifactId, saved.versionId)).manifest.presentation.html, html)
  s.calls.denied = true
  await assert.rejects(view.executeViewAction(s.context, 'live-dashboard', 'query-binding', { input }), /REVOKED/)
})

 test('HTML preflight failure never creates or changes an Artifact', async () => {
  const s = setup(), manifest = { ...example, charts: [], tables: [], presentation: { type: 'html', html: '<html><body>Broken</body></html>' } };
  s.calls.invalidHtml = true;
  await assert.rejects(s.service.save(s.context, manifest, null), /PREFLIGHT_FAILED/);
  assert.equal(s.artifacts.size, 0); assert.equal(s.files.size, 0); assert.equal(s.versions.length, 0);
})


test('saved library bytes reach preflight and View while Agent reads receive locks only', async () => {
  const { libraryLocks } = require('../dist/lib/document-libraries.js')
  const { DashboardViewProvider } = require('../dist/lib/view.provider.js')
  const s = setup(), locks = await libraryLocks(['echarts'])
  let validated
  s.service.htmlValidation = { async validate(_context, _manifest, _preview, dependencies) { validated = dependencies } }
  const manifest = { ...example, charts: [], tables: [], presentation: { type: 'html', html: '<html><body>Chart</body></html>', dependencies: locks } }
  const first = await s.service.save(s.context, manifest, null)
  const opened = await s.service.openDocument(s.context, first.artifactId, first.versionId)
  assert.deepEqual(opened.dependencies, validated)
  assert.equal(opened.dependencies[0].id, 'echarts')
  assert.equal('dependencies' in await s.service.open(s.context, first.artifactId), false)
  s.service.list = async () => []; s.service.sources = async () => []
  const view = new DashboardViewProvider(s.service)
  const result = await view.getViewData(s.context, 'live-dashboard', { parameters: { artifactId: first.artifactId, versionId: first.versionId } })
  assert.deepEqual(result.meta.saved.dependencies, opened.dependencies)
  const second = await s.service.save(s.context, { ...manifest, title: 'Changed' }, first.versionId)
  assert.deepEqual((await s.service.openDocument(s.context, first.artifactId, second.versionId)).dependencies, opened.dependencies)
  assert.equal((await s.service.open(s.context, first.artifactId, first.versionId)).manifest.title, manifest.title)
})
