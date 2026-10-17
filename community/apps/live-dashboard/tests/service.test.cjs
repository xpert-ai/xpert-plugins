const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DashboardService } = require('../dist/lib/dashboard.service.js')
const { normalizeAnalyticsResult, resolveAnalyticsParameters } = require('@xpert-ai/plugin-sdk/analytics')
const example = require('../examples/postgres-sales.json')

function setup() {
  const context = { tenantId: 'tenant', organizationId: 'org', userId: 'owner', hostType: 'agent', hostId: 'assistant' }
  const files = new Map(), artifacts = new Map(), versions = [], drafts = new Map()
  const calls = { queries: [], denied: false, rejectFilter: false, invalidHtml: false, failUpload: false }
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
        if (calls.failUpload) throw Error('UPLOAD_FAILED')
        assert.equal(input.mimeType, 'application/json', 'must use a platform-supported Artifact MIME type')
        const filePath = input.folder + '/' + input.fileName
        files.set(filePath, Buffer.from(input.buffer)); return { filePath }
      },
      async readBuffer(ref) { return { buffer: files.get(ref.filePath) } }
    },
    'platform.artifact-drafts': {
      async list(ids) { return [...drafts.values()].filter(draft => ids.includes(draft.artifactId)) },
      async get(id) { return drafts.get(id) ?? null },
      async save(input) {
        const a = artifacts.get(input.artifactId), previous = drafts.get(a.id)
        if ((previous?.revision ?? 0) !== input.expectedRevision || (a.currentVersionId ?? null) !== input.expectedCurrentVersionId) throw Error('DRAFT_CONFLICT')
        const draft = { ...input, id: previous?.id ?? randomUUID(), revision: input.expectedRevision + 1, baseVersionId: input.expectedCurrentVersionId,
          publishedRevision: previous?.publishedRevision ?? null, publishedVersionId: previous?.publishedVersionId ?? null }
        drafts.set(a.id, draft); return draft
      },
      async publish(input) {
        const draft = drafts.get(input.artifactId), a = artifacts.get(input.artifactId)
        if (draft.revision !== input.expectedRevision) throw Error('DRAFT_CONFLICT')
        if (draft.publishedRevision === draft.revision) return versions.find(v => v.id === draft.publishedVersionId)
        assert.equal(a.currentVersionId ?? null, input.expectedCurrentVersionId)
        const version = { ...draft, id: randomUUID(), versionNumber: versions.length + 1 }
        versions.push(version); a.currentVersion = version; a.currentVersionId = version.id
        draft.publishedRevision = draft.revision; draft.publishedVersionId = version.id; draft.baseVersionId = version.id
        return version
      }
    },
    'platform.artifacts': {
      async listArtifacts() { return { items: [...artifacts.values()] } },
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
  return { context, files, artifacts, versions, drafts, calls, service: new DashboardService({ require: key => capabilities[key.id] }, { async validate(_context, manifest) { if (manifest.presentation && calls.invalidHtml) throw Error('DASHBOARD_HTML_PREFLIGHT_FAILED'); return manifest.presentation ? { status: 'passed', jobId: 'test-job', requestedBindings: manifest.bindings.map(b => b.id) } : null } }) }
}

test('persistent drafts reopen, filter and refresh without creating formal versions', async () => {
  const s = setup(), first = await s.service.save(s.context, example, null)
  assert.equal(first.status, 'draft'); assert.equal(first.draftRevision, 1); assert.equal(first.versionNumber, undefined)
  assert.equal(s.versions.length, 0)
  const reopened = await s.service.open(s.context, first.artifactId)
  assert.deepEqual(reopened.manifest, example); assert.equal(reopened.isDraft, true)
  const a = await s.service.query(s.context, first.artifactId, undefined, { region: 'west' }, 1)
  const b = await s.service.query(s.context, first.artifactId, undefined, { region: 'west' }, 1)
  assert.deepEqual(a.datasets[0].rows, [{ region: 'west', amount: 80 }])
  assert.notEqual(a.datasets[0].provenance.executionId, b.datasets[0].provenance.executionId)
  const next = await s.service.update(s.context, first.artifactId, 1, { title: 'Revised' }, null)
  assert.equal(next.artifactId, first.artifactId); assert.equal(next.draftRevision, 2)
  assert.equal(s.versions.length, 0)
  await assert.rejects(s.service.update(s.context, first.artifactId, 1, { title: 'Stale' }, null), /CONFLICT/)
  await assert.rejects(s.service.query(s.context, first.artifactId, undefined, {}, 1), /CONFLICT/)
})

test('human publication freezes reviewed bytes and preserves history during later edits', async () => {
  const s = setup(), first = await s.service.save(s.context, example, null)
  const v1 = await s.service.publish(s.context, first.artifactId, 1, null)
  assert.equal(v1.versionNumber, 1)
  assert.deepEqual(await s.service.publish(s.context, first.artifactId, 1, null), v1)
  assert.equal(s.versions.length, 1)
  const next = await s.service.update(s.context, first.artifactId, 1, { title: 'Second draft' }, v1.versionId)
  assert.equal(s.versions.length, 1)
  assert.equal((await s.service.open(s.context, first.artifactId, v1.versionId)).manifest.title, example.title)
  const v2 = await s.service.publish(s.context, first.artifactId, next.draftRevision, v1.versionId)
  assert.equal(v2.versionNumber, 2)
  assert.equal((await s.service.history(s.context, first.artifactId)).length, 2)
})

test('draft library bytes remain pinned and content/ownership/query boundaries remain enforced', async () => {
  const { libraryLocks } = require('../dist/lib/document-libraries.js')
  const { DashboardViewProvider } = require('../dist/lib/view.provider.js')
  const s = setup(), locks = await libraryLocks(['echarts'])
  const manifest = { ...example, charts: [], tables: [], presentation: { type: 'html', html: '<html><body>Chart</body></html>', dependencies: locks } }
  const first = await s.service.save(s.context, manifest, null)
  const before = await s.service.openDocument(s.context, first.artifactId)
  const second = await s.service.update(s.context, first.artifactId, 1, { title: 'Changed' }, null)
  assert.deepEqual((await s.service.openDocument(s.context, first.artifactId)).dependencies, before.dependencies)
  assert.equal('dependencies' in await s.service.open(s.context, first.artifactId), false)
  const view = new DashboardViewProvider(s.service)
  const input = { artifactId: first.artifactId, draftRevision: second.draftRevision, bindingId: manifest.bindings[0].id, controls: { region: 'west' } }
  assert.deepEqual((await view.executeViewAction(s.context, 'live-dashboard', 'query-binding', { input })).data.rows, [{ region: 'west', amount: 80 }])
  for (const extra of [{ binding: example.bindings[0] }, { payload: { sql: 'select secret' } }, { providerId: 'other' }, { dataSourceId: randomUUID() }])
    await assert.rejects(view.executeViewAction(s.context, 'live-dashboard', 'query-binding', { input: { ...input, ...extra } }), /INVALID_QUERY/)
  await assert.rejects(view.executeViewAction(s.context, 'live-dashboard', 'query-binding', { input: { ...input, bindingId: 'unknown' } }), /BINDING_DENIED/)
  await assert.rejects(view.executeViewAction(s.context, 'live-dashboard', 'query-binding', { input: { ...input, controls: { sql: 'select secret' } } }), /UNKNOWN_CONTROL/)
  await assert.rejects(view.executeViewAction(s.context, 'live-dashboard', 'publish', { input: { artifactId: first.artifactId, expectedRevision: 2, expectedCurrentVersionId: null } }))
  for (const extra of [{ userId: 'other' }, { organizationId: 'other' }, { hostId: 'other' }])
    await assert.rejects(s.service.open({ ...s.context, ...extra }, first.artifactId), /ACCESS_DENIED/)
  s.calls.denied = true
  await assert.rejects(s.service.update(s.context, first.artifactId, 2, { title: 'Denied' }, null), /REVOKED/)
  await assert.rejects(view.executeViewAction(s.context, 'live-dashboard', 'query-binding', { input }), /REVOKED/)
  await assert.rejects(s.service.publish(s.context, first.artifactId, 2, null), /REVOKED/)
  s.calls.denied = false
  for (const key of s.files.keys()) s.files.set(key, Buffer.from('tampered'))
  await assert.rejects(s.service.open(s.context, first.artifactId), /CONTENT_CHANGED/)
})

test('failed data/filter/HTML preflight never commits a draft', async () => {
  const s = setup(); s.calls.rejectFilter = true
  await assert.rejects(s.service.save(s.context, example, null), /FILTER_PREVIEW_FAILED/)
  assert.equal(s.artifacts.size, 0)
  s.calls.rejectFilter = false; s.calls.invalidHtml = true
  await assert.rejects(s.service.save(s.context, { ...example, charts: [], tables: [], presentation: { type: 'html', html: '<html><body>broken</body></html>' } }, null), /PREFLIGHT_FAILED/)
  assert.equal(s.artifacts.size, 0)
})


test('retry initializes the same empty Artifact after the first file upload fails', async () => {
  const s = setup(); s.calls.failUpload = true
  await assert.rejects(s.service.save(s.context, example, null), /UPLOAD_FAILED/)
  assert.equal(s.artifacts.size, 1); assert.equal(s.versions.length, 0)
  const artifactId = [...s.artifacts.keys()][0]
  s.calls.failUpload = false
  const receipt = await s.service.save(s.context, example, null)
  assert.equal(receipt.artifactId, artifactId); assert.equal(receipt.draftRevision, 1)
  assert.equal(s.artifacts.size, 1)
  assert.deepEqual((await s.service.open(s.context, artifactId)).manifest, example)
})


test('draft titles are listed without mutating the published Artifact title', async () => {
  const s = setup(), first = await s.service.save(s.context, example, null)
  await s.service.update(s.context, first.artifactId, 1, { title: 'Working title' }, null)
  assert.equal((await s.service.list(s.context))[0].title, 'Working title')
  assert.equal(s.artifacts.get(first.artifactId).title, example.title)
  assert.equal(s.versions.length, 0)
})

test('first edit of a legacy formal version creates a draft on the same Artifact', async () => {
  const s = setup(), first = await s.service.save(s.context, example, null)
  const v1 = await s.service.publish(s.context, first.artifactId, 1, null)
  s.drafts.delete(first.artifactId)
  const edited = await s.service.update(s.context, first.artifactId, 0, { title: 'First draft' }, v1.versionId)
  assert.equal(edited.artifactId, first.artifactId); assert.equal(edited.draftRevision, 1)
  assert.equal(s.versions.length, 1)
  assert.equal((await s.service.open(s.context, first.artifactId, v1.versionId)).manifest.title, example.title)
  assert.equal((await s.service.open(s.context, first.artifactId)).manifest.title, 'First draft')
})

test('publication rejects a revision changed after confirmation and edits reject a published base change', async () => {
  const s = setup(), first = await s.service.save(s.context, example, null)
  await s.service.update(s.context, first.artifactId, 1, { title: 'Newer' }, null)
  await assert.rejects(s.service.publish(s.context, first.artifactId, 1, null), /CONFLICT/)
  assert.equal(s.versions.length, 0)
  await s.service.publish(s.context, first.artifactId, 2, null)
  await assert.rejects(s.service.update(s.context, first.artifactId, 2, { title: 'Stale base' }, null), /CONFLICT/)
  assert.equal(s.versions.length, 1)
})

test('library bytes reach preflight and View and remain pinned in formal history', async () => {
  const { libraryLocks } = require('../dist/lib/document-libraries.js')
  const { DashboardViewProvider } = require('../dist/lib/view.provider.js')
  const s = setup(), locks = await libraryLocks(['echarts'])
  let validated
  s.service.htmlValidation = { async validate(_context, _manifest, _preview, dependencies) { validated = dependencies } }
  const manifest = { ...example, charts: [], tables: [], presentation: { type: 'html', html: '<html><body>Chart</body></html>', dependencies: locks } }
  const first = await s.service.save(s.context, manifest, null)
  const opened = await s.service.openDocument(s.context, first.artifactId)
  assert.deepEqual(opened.dependencies, validated)
  assert.equal(opened.dependencies[0].id, 'echarts')
  assert.equal('dependencies' in await s.service.open(s.context, first.artifactId), false)
  s.service.sources = async () => []
  const view = new DashboardViewProvider(s.service)
  const result = await view.getViewData(s.context, 'live-dashboard', { parameters: { artifactId: first.artifactId } })
  assert.deepEqual(result.meta.saved.dependencies, opened.dependencies)
  const v1 = await s.service.publish(s.context, first.artifactId, 1, null)
  await s.service.update(s.context, first.artifactId, 1, { title: 'Changed' }, v1.versionId)
  assert.deepEqual((await s.service.openDocument(s.context, first.artifactId)).dependencies, opened.dependencies)
  assert.deepEqual((await s.service.openDocument(s.context, first.artifactId, v1.versionId)).dependencies, opened.dependencies)
  assert.equal((await s.service.open(s.context, first.artifactId, v1.versionId)).manifest.title, manifest.title)
})
