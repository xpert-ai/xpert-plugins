const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID, createHash } = require('node:crypto')
const { DashboardPresentationProvider } = require('../dist/lib/presentation.provider.js')
const { DashboardSharingService } = require('../dist/lib/sharing.service.js')
const { encodeDashboardPackage } = require('../dist/lib/document-package.js')
const { normalizeAnalyticsResult, resolveAnalyticsParameters } = require('@xpert-ai/plugin-sdk/analytics')
const example = require('../examples/postgres-sales.json')

function fixture() {
  const queries = [], links = [], versions = [{ artifactId: randomUUID(), versionId: randomUUID(), versionNumber: 1, current: true, title: 'Published' }]
  const artifactId = versions[0].artifactId, versionId = versions[0].versionId
  const content = encodeDashboardPackage(example, [])
  const context = { actor: { userId: 'teammate', tenantId: 'tenant', organizationId: 'team' },
    artifact: { id: artifactId, userId: 'creator', tenantId: 'tenant', organizationId: 'team', xpertId: 'assistant',
      pluginName: '@xpert-ai/plugin-live-dashboard', resourceType: 'live-dashboard', resourceId: `agent/assistant/${example.id}` },
    version: { id: versionId, artifactId, versionNumber: 1, mimeType: 'application/json', sha256: createHash('sha256').update(content).digest('hex'), title: 'Published' }, content }
  const source = { id: example.bindings[0].dataSourceId, providers: [{ id: example.bindings[0].providerId }] }
  const capabilities = {
    'platform.datasource.analytics': { async query(actor, input) {
      queries.push({ actor, input })
      const { region } = resolveAnalyticsParameters(input.binding, input.controls)
      const rows = [{ region: 'east', amount: 120 }, { region: 'west', amount: 80 }].filter(row => region === 'all' || row.region === region)
      return normalizeAnalyticsResult(input.binding, { rows, columns: [{ key: 'region' }, { key: 'amount' }], sourceFetchedAt: new Date().toISOString(),
        completeness: { returnedRows: rows.length, totalRows: rows.length, totalAccuracy: 'exact', scope: 'full_query_result', truncated: false } }, randomUUID(), 1000)
    } },
    'platform.artifacts': {
      async getArtifactShare() { return links.find(link => link.status === 'active') ?? null },
      async ensureArtifactShare(input) {
        const old = links.find(link => link.status === 'active')
        if (old && old.versionMode === input.versionMode && old.artifactVersionId === input.artifactVersionId) return { link: old }
        if (old) old.status = 'revoked'
        const link = { ...input, status: 'active', presentationUrl: `https://platform.test/artifacts/view/${randomUUID()}` }; links.push(link); return { link }
      },
      async revokeArtifactShare() { for (const link of links) link.status = 'revoked' }
    }
  }
  const runtime = { require(key) { return capabilities[key.id] } }
  const dashboards = {
    async history(actor, id) { assert.equal(actor.userId, 'creator'); assert.equal(id, artifactId); return versions },
    async open(actor, id, version) { assert.equal(version, versionId); return { manifest: example } },
    async sources() { return [source] }
  }
  return { context, artifactId, versionId, source, versions, queries, links,
    owner: { userId: 'creator' }, viewer: new DashboardPresentationProvider(runtime), sharing: new DashboardSharingService(dashboards, runtime) }
}

test('standalone renderer reuses the deployed bundle and excludes drafts and authoring metadata', async () => {
  const f = fixture(), data = await f.viewer.read(f.context), entry = await f.viewer.getEntry()
  assert.equal(data.meta.saved.versionId, f.versionId)
  assert.equal(data.meta.saved.isDraft, false)
  assert.deepEqual(data.meta.versions, [])
  assert.deepEqual(data.meta.sources, [])
  assert.ok(entry.html.includes('window.__DASHBOARD_READ_ONLY__=true'))
})

test('published bindings filter and refresh with the current viewer identity', async () => {
  const f = fixture(), target = { artifactId: f.artifactId, versionId: f.versionId }
  const request = { target, operation: 'query-binding', input: { ...target, bindingId: example.bindings[0].id, controls: { region: 'west' } } }
  const first = await f.viewer.query(f.context, request), fresh = await f.viewer.query(f.context, request)
  assert.deepEqual(first.rows, [{ region: 'west', amount: 80 }])
  assert.notEqual(first.provenance.executionId, fresh.provenance.executionId)
  assert.ok(f.queries.every(query => query.actor.userId === 'teammate'))
  assert.deepEqual(f.queries[0].input.binding, example.bindings[0])
})

test('rejects draft, foreign target, undeclared bindings and native query/source injection', async () => {
  const f = fixture(), target = { artifactId: f.artifactId, versionId: f.versionId }
  const input = { ...target, bindingId: example.bindings[0].id, controls: {} }
  for (const override of [{ draftRevision: 2 }, { artifactId: randomUUID() }, { versionId: randomUUID() }, { bindingId: 'foreign' },
    { payload: { sql: 'SELECT *' } }, { providerId: 'foreign' }, { dataSourceId: randomUUID() }, { controls: { undeclared: 'x' } }])
    await assert.rejects(f.viewer.query(f.context, { target, operation: 'query-binding', input: { ...input, ...override } }))
  await assert.rejects(f.viewer.query(f.context, { target, operation: 'publish', input: target }))
  assert.equal(f.queries.length, 0)
})

test('rejects mismatched Artifact scope, source identity and changed version content before querying', async () => {
  const f = fixture(), { artifact, version } = f.context
  const invalidContexts = [
    { ...f.context, artifact: { ...artifact, tenantId: 'foreign' } },
    { ...f.context, artifact: { ...artifact, organizationId: 'foreign' } },
    { ...f.context, artifact: { ...artifact, pluginName: 'foreign' } },
    { ...f.context, artifact: { ...artifact, resourceType: 'other' } },
    { ...f.context, artifact: { ...artifact, resourceId: `agent/another/${example.id}` } },
    { ...f.context, version: { ...version, artifactId: randomUUID() } },
    { ...f.context, version: { ...version, sha256: undefined } },
    { ...f.context, content: Buffer.concat([f.context.content, Buffer.from(' ')]) }
  ]
  const target = { artifactId: f.artifactId, versionId: f.versionId }
  for (const context of invalidContexts) {
    await assert.rejects(f.viewer.read(context))
    await assert.rejects(f.viewer.query(context, { target, operation: 'query', input: { ...target, controls: {} } }))
  }
  assert.equal(f.queries.length, 0)
})

test('team shares reuse links, distinguish latest and fixed, revoke and use platform URLs', async () => {
  const f = fixture()
  const first = await f.sharing.share(f.owner, { artifactId: f.artifactId, versionMode: 'latest' })
  const again = await f.sharing.share(f.owner, { artifactId: f.artifactId, versionMode: 'latest' })
  assert.equal(first.link.url, again.link.url)
  assert.equal(f.links[0].access.mode, 'organization_all')
  assert.equal(f.links[0].presentation.allowDownload, false)
  const fixed = await f.sharing.share(f.owner, { artifactId: f.artifactId, versionMode: 'version', versionId: f.versionId })
  assert.notEqual(fixed.link.url, first.link.url)
  assert.equal(f.links[0].status, 'revoked')
  assert.equal(fixed.link.versionId, f.versionId)
  await f.sharing.revoke(f.owner, f.artifactId)
  assert.equal((await f.sharing.inspect(f.owner, f.artifactId)).link, null)
})

test('blocks unpublished and private provider dependencies without widening file/source permissions', async () => {
  const f = fixture()
  f.source.providers[0].sharing = { mode: 'owner_only', reasonCode: 'WORKSPACE_SCRIPT_PRIVATE_DEPENDENCIES' }
  assert.equal((await f.sharing.inspect(f.owner, f.artifactId)).issues[0].code, 'WORKSPACE_SCRIPT_PRIVATE_DEPENDENCIES')
  await assert.rejects(f.sharing.share(f.owner, { artifactId: f.artifactId, versionMode: 'latest' }))
  f.versions.length = 0
  assert.equal((await f.sharing.inspect(f.owner, f.artifactId)).issues[0].code, 'DASHBOARD_PUBLISH_BEFORE_SHARING')
  await assert.rejects(f.sharing.share({ userId: 'teammate' }, { artifactId: f.artifactId, versionMode: 'latest' }))
  assert.equal(f.links.length, 0)
})
