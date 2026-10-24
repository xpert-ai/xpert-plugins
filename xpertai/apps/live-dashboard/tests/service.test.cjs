const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DashboardService } = require('../dist/lib/dashboard.service.js')
const { DashboardSharingService } = require('../dist/lib/sharing.service.js')
const { normalizeAnalyticsResult, resolveAnalyticsParameters } = require('@xpert-ai/plugin-sdk/analytics')
const example = require('../examples/postgres-sales.json')

function setup() {
  const context = { tenantId: 'tenant', organizationId: 'org', userId: 'owner', hostType: 'agent', hostId: 'assistant' }
  const files = new Map(), artifacts = new Map(), versions = [], drafts = new Map(), links = new Map()
  const sources = [{ source: example.bindings[0].source, providers: [{ id: example.bindings[0].providerId }] }]
  const calls = { queries: [], denied: false, rejectFilter: false, invalidHtml: false, failUpload: false }
  const capabilities = {
    'platform.analytics': {
      async list() { await calls.onSources?.(); return sources },
      async query(actor, input) {
        calls.queries.push({ actor, input })
        if (calls.denied) throw new Error('SOURCE_ACCESS_REVOKED')
        const { region } = resolveAnalyticsParameters(input.binding, input.controls)
        if (calls.rejectFilter && region !== 'all') throw (calls.filterError ?? new Error('NATIVE_FILTER_TYPE_INVALID'))
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
        if ((a.currentVersionId ?? null) !== input.expectedCurrentVersionId) throw Error('VERSION_CONFLICT')
        const version = { ...draft, id: randomUUID(), versionNumber: versions.length + 1 }
        versions.push(version); a.currentVersion = version; a.currentVersionId = version.id
        draft.publishedRevision = draft.revision; draft.publishedVersionId = version.id; draft.baseVersionId = version.id
        return version
      }
    },
    'platform.artifacts': {
      async getArtifactShare({ artifactId, shareKey }) { assert.equal(shareKey, 'team-readonly'); return links.get(artifactId) ?? null },
      async ensureArtifactShare(input) {
        const link = { ...input, status: 'active', presentationUrl: `https://platform.test/artifacts/view/${randomUUID()}` }
        links.set(input.artifactId, link); return { link }
      },
      async revokeArtifactShare({ artifactId }) { links.get(artifactId).status = 'revoked' },
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
  const runtime = { require: key => capabilities[key.id] }
  const service = new DashboardService(runtime, { async validate(_context, manifest) { if (manifest.presentation && calls.invalidHtml) throw Error('DASHBOARD_HTML_PREFLIGHT_FAILED'); return manifest.presentation ? { status: 'passed', jobId: 'test-job', requestedBindings: manifest.bindings.map(b => b.id) } : null } })
  return { context, files, artifacts, versions, drafts, links, sources, calls, service, sharing: new DashboardSharingService(service, runtime) }
}

async function sharePublished(s, versionMode = 'latest') {
  const draft = await s.service.save(s.context, example, null)
  const published = await s.service.publish(s.context, draft.artifactId, draft.draftRevision, null)
  await s.sharing.share(s.context, { artifactId: draft.artifactId, versionMode, ...(versionMode === 'version' ? { versionId: published.versionId } : {}) })
  return published
}

test('publishing a private binding into a latest share preserves the published version, draft and link until revoked', async () => {
  const s = setup(), v1 = await sharePublished(s), { artifactId } = v1
  s.sources[0].providers.push({ id: 'private-provider', sharing: { mode: 'owner_only', reasonCode: 'WORKSPACE_SCRIPT_PRIVATE_DEPENDENCIES' } })
  const bindings = [...example.bindings, { ...example.bindings[0], id: 'private-sales', providerId: 'private-provider',
    output: { ...example.bindings[0].output, datasetId: 'private-sales' } }]
  const next = await s.service.update(s.context, artifactId, 1, { bindings }, v1.versionId)
  const originalLink = structuredClone(s.links.get(artifactId)), originalDraft = structuredClone(s.drafts.get(artifactId))
  await assert.rejects(s.service.publish(s.context, artifactId, next.draftRevision, v1.versionId), error => {
    assert.equal(error.message, 'DASHBOARD_PUBLISH_SHARE_BLOCKED')
    assert.deepEqual(error.getResponse().issues, [{ code: 'WORKSPACE_SCRIPT_PRIVATE_DEPENDENCIES', bindingId: 'private-sales' }])
    return true
  })
  assert.equal(s.versions.length, 1)
  assert.equal(s.artifacts.get(artifactId).currentVersionId, v1.versionId)
  assert.deepEqual(s.links.get(artifactId), originalLink)
  assert.deepEqual(s.drafts.get(artifactId), originalDraft)
  assert.deepEqual((await s.service.open(s.context, artifactId, v1.versionId)).manifest.bindings, example.bindings)
  await s.sharing.revoke(s.context, artifactId)
  assert.equal((await s.service.publish(s.context, artifactId, next.draftRevision, v1.versionId)).versionNumber, 2)
  assert.equal(s.links.get(artifactId).status, 'revoked')
})

test('latest-share publication rechecks provider availability and permits a compatible draft without changing the link', async () => {
  const s = setup(), v1 = await sharePublished(s), { artifactId } = v1
  const next = await s.service.update(s.context, artifactId, 1, { title: 'Shared update' }, v1.versionId)
  const source = s.sources.pop(), link = structuredClone(s.links.get(artifactId))
  await assert.rejects(s.service.publish(s.context, artifactId, next.draftRevision, v1.versionId), error => {
    assert.deepEqual(error.getResponse().issues, [{ code: 'DASHBOARD_SOURCE_UNAVAILABLE', bindingId: example.bindings[0].id }]); return true
  })
  s.sources.push({ ...source, providers: [] })
  await assert.rejects(s.service.publish(s.context, artifactId, next.draftRevision, v1.versionId), /DASHBOARD_PUBLISH_SHARE_BLOCKED/)
  s.sources[0] = source
  source.providers[0].sharing = { mode: 'owner_only' }
  await assert.rejects(s.service.publish(s.context, artifactId, next.draftRevision, v1.versionId), error => {
    assert.equal(error.getResponse().issues[0].code, 'DASHBOARD_PRIVATE_DEPENDENCY'); return true
  })
  source.providers[0].sharing = { mode: 'viewer_permissions' }
  const v2 = await s.service.publish(s.context, artifactId, next.draftRevision, v1.versionId)
  assert.equal(v2.versionNumber, 2)
  assert.equal(s.artifacts.get(artifactId).currentVersionId, v2.versionId)
  assert.deepEqual(s.links.get(artifactId), link)
})

test('fixed, expired and absent shares do not restrict publication of private drafts', async (t) => {
  for (const mode of ['version', 'expired', 'absent']) await t.test(mode, async () => {
    const s = setup(), v1 = await sharePublished(s, mode === 'version' ? mode : 'latest'), { artifactId } = v1
    if (mode === 'expired') s.links.get(artifactId).expiresAt = new Date(0).toISOString()
    if (mode === 'absent') s.links.delete(artifactId)
    const link = structuredClone(s.links.get(artifactId))
    const next = await s.service.update(s.context, artifactId, 1, { title: 'Private draft' }, v1.versionId)
    s.sources[0].providers[0].sharing = { mode: 'owner_only' }
    const v2 = await s.service.publish(s.context, artifactId, next.draftRevision, v1.versionId)
    assert.equal(v2.versionNumber, 2)
    assert.deepEqual(s.links.get(artifactId), link)
    if (mode === 'version') assert.equal(link.artifactVersionId, v1.versionId)
  })
})

test('share validation retains the platform revision and current-version checks when state changes during validation', async (t) => {
  for (const conflict of ['draft', 'version']) await t.test(conflict, async () => {
    const s = setup(), v1 = await sharePublished(s), { artifactId } = v1
    const next = await s.service.update(s.context, artifactId, 1, { title: 'Reviewed draft' }, v1.versionId)
    s.calls.onSources = async () => {
      s.calls.onSources = undefined
      if (conflict === 'draft') await s.service.update(s.context, artifactId, next.draftRevision, { title: 'Concurrent edit' }, v1.versionId)
      else s.artifacts.get(artifactId).currentVersionId = randomUUID()
    }
    await assert.rejects(s.service.publish(s.context, artifactId, next.draftRevision, v1.versionId), /CONFLICT/)
    assert.equal(s.versions.length, 1)
  })
})

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
  await assert.rejects(s.service.save(s.context, example, null), /NATIVE_FILTER_TYPE_INVALID/)
  assert.equal(s.artifacts.size, 0)
  s.calls.rejectFilter = false; s.calls.invalidHtml = true
  await assert.rejects(s.service.save(s.context, { ...example, charts: [], tables: [], presentation: { type: 'html', html: '<html><body>broken</body></html>' } }, null), /PREFLIGHT_FAILED/)
  assert.equal(s.artifacts.size, 0)
})


test('non-default filter probes preserve the host validation error for Agent repair', async () => {
  const s = setup()
  s.calls.rejectFilter = true
  s.calls.filterError = new Error('Returned rows repeat the declared grain. Use an empty grain for an unaggregated table.')
  await assert.rejects(s.service.preview(s.context, { binding: example.bindings[0], controls: { region: 'all' } }),
    error => error === s.calls.filterError)
  await assert.rejects(s.service.save(s.context, example, null), error => error === s.calls.filterError)
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
