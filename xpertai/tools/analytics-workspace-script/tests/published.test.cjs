const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const sdk = require('@xpert-ai/plugin-sdk')
const { PublishedWorkspaceScriptProvider, publishedScriptSchema } = require('../dist/lib/published-provider.js')
const { digest } = require('../dist/lib/definitions.js')
const { PUBLISHED_PROVIDER } = require('../dist/lib/schema.js')

function fixture() {
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
  const output = { datasetId: 'orders', fields: [{ id: 'amount', sourceField: 'amount', label: 'Amount', logicalType: 'decimal', nullable: false, role: 'measure' }], grain: [] }
  const source = { kind: 'data-source', dataSourceId: randomUUID() }
  const upstream = { source, id: 'orders', providerId: 'postgres.sql', operation: 'query', contractVersion: 1, payload: {}, parameters: [], output }
  const code = 'export async function query(ctx) { return ctx.sources.query("orders", {}) }'
  const definition = publishedScriptSchema.parse({ schema: 'xpert.published-analytics-script/v1', title: 'Published orders', language: 'javascript', mode: 'pinned',
    scriptSha256: digest(code), code: { content: code, sha256: digest(code) }, files: [{ alias: 'labels', content: 'name\nSupplier\n', sha256: digest('name\nSupplier\n') }],
    sources: [{ alias: 'orders', binding: upstream }], parameters: [], output })
  const binding = { ...upstream, source: { kind: 'definition', definitionId: randomUUID(), versionId: randomUUID() }, providerId: PUBLISHED_PROVIDER }
  const result = Buffer.from(JSON.stringify({ columns: [{ key: 'amount' }], rows: [{ amount: '120.00' }] }))
  const queries = [], authorizations = [], jobs = [], snapshots = []
  let granted = true, upstreamGranted = true, operation
  const runtime = { require: capability => {
    if (capability.id === sdk.AnalyticsRuntimeCapability.id) return {
      list: async () => [{ source, providers: [{ id: 'postgres.sql', sharing: { mode: 'viewer_permissions' } }] }],
      discover: async current => { authorizations.push(current); if (!granted) throw new Error('DEFINITION_REVOKED'); return {} },
      query: async (current, request) => { if (!upstreamGranted) throw new Error('UPSTREAM_DENIED'); queries.push({ current, request }); return { rows: [{ amount: 120 }], freshness: { sourceFetchedAt: '2026-10-30T00:00:00Z' }, completeness: { scope: 'full_query_result', truncated: false }, provenance: { executionId: randomUUID() } } }
    }
    if (capability.id === sdk.WorkspaceFilesRuntimeCapability.id) return { readBuffer: async ref => {
      assert.equal(ref.filePath, 'output', 'published execution must never read the creator workspace'); return { buffer: result }
    }, deleteFile: async () => {} }
    if (capability.id === sdk.ArtifactsRuntimeCapability.id) return { createArtifact: async () => ({ id: 'audit' }), ensureArtifactVersion: async () => ({}) }
    if (capability.id === sdk.SandboxJobsRuntimeCapability.id) return { run: async (job, options) => {
      jobs.push(job)
      const call = (name, alias) => options.invocation.handle(name, { alias, controls: {} }, { signal: options.signal })
      if (operation) await operation(call)
      else { await call('file.read', 'labels'); await call('source.query', 'orders') }
      return { outputs: [{ reference: { filePath: 'output' }, sha256: digest(result) }] }
    } }
    throw new Error('Unexpected capability')
  } }
  const definitions = { store: async (current, bytes) => { snapshots.push({ current, bytes }); return { filePath: 'snapshot' } } }
  const provider = new PublishedWorkspaceScriptProvider(runtime, definitions)
  const context = () => ({ actor, source: binding.source, options: definition, executionId: randomUUID(), signal: new AbortController().signal,
    maxRows: 1000, deadlineAt: Date.now() + 30000, ancestry: [PUBLISHED_PROVIDER] })
  return { provider, definition, binding, actor, queries, jobs, authorizations, snapshots,
    run: () => provider.execute(binding, {}, context()), revoke: () => { granted = false }, denyUpstream: () => { upstreamGranted = false },
    operation: value => { operation = value }, runtime }
}

test('published pinned code/files execute live inputs as the current viewer on every refresh', async () => {
  const f = fixture()
  await f.provider.validateConfiguration(f.definition, f.actor)
  assert.deepEqual((await f.run()).rows, [{ amount: '120.00' }])
  await f.run()
  assert.equal(f.queries.length, 2)
  assert(f.queries.every(item => item.current === f.actor))
  assert(f.snapshots.every(item => item.current === f.actor))
  assert(f.authorizations.length >= 4)
  assert.notEqual(f.jobs[0].idempotencyKey, f.jobs[1].idempotencyKey)
})
test('revocation interrupts an already running page, including cached file reads', async () => {
  const f = fixture()
  f.operation(async call => { await call('file.read', 'labels'); f.revoke(); await call('file.read', 'labels') })
  await assert.rejects(f.run(), /DEFINITION_REVOKED/)
  assert.equal(f.queries.length, 0)
})
test('upstream denial and undeclared aliases cannot fall back to creator permissions', async () => {
  const f = fixture(); f.denyUpstream()
  await assert.rejects(f.run(), /UPSTREAM_DENIED/)
  const other = fixture(); other.operation(call => call('file.read', 'private_unlisted'))
  await assert.rejects(other.run(), /ALIAS_DENIED/)
})
test('published packages reject mutable code, tampering, private references and recursive sources', () => {
  const f = fixture()
  for (const changes of [{ mode: 'current' }, { authorization: { filePath: 'private' } },
    { code: { ...f.definition.code, content: 'changed' } },
    { sources: [{ ...f.definition.sources[0], binding: { ...f.definition.sources[0].binding, providerId: PUBLISHED_PROVIDER } }] }])
    assert.equal(publishedScriptSchema.safeParse({ ...f.definition, ...changes }).success, false)
})
test('publication preparation rejects upstream private resources without deleting the private provider guard', async () => {
  const f = fixture(), original = f.runtime.require
  f.runtime.require = capability => capability.id === sdk.AnalyticsRuntimeCapability.id ? {
    list: async () => [{ source: f.definition.sources[0].binding.source, providers: [{ id: 'postgres.sql', sharing: { mode: 'owner_only' } }] }]
  } : original(capability)
  await assert.rejects(f.provider.validateConfiguration(f.definition, f.actor), /UPSTREAM_NOT_SHAREABLE/)
  const { WorkspaceScriptProvider } = require('../dist/lib/provider.js')
  assert.equal(new WorkspaceScriptProvider(f.runtime, {}).descriptor.sharing.mode, 'owner_only')
})
