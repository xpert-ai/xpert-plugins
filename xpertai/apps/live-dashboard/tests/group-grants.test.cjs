const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID, createHash } = require('node:crypto')
const { executeGroupGrant } = require('../dist/lib/group-sharing.js')
const { DashboardArtifactType } = require('../dist/lib/artifact-type.provider.js')
const { DashboardPresentationProvider } = require('../dist/lib/presentation.provider.js')
const { encodeDashboardPackage } = require('../dist/lib/document-package.js')
const example = require('../examples/postgres-sales.json')

test('group offers pin published versions and cannot override actor, permission or source scope', async () => {
  const artifactId = randomUUID(), versionId = randomUUID(), targetGroupId = randomUUID(), calls = []
  const context = { userId: 'author', tenantId: 'tenant', organizationId: 'org' }
  const api = { offer: async input => { calls.push(input); return { id: 'grant' } }, revoke: async input => { calls.push(input); return { status: 'revoked' } } }
  const runtime = { require(capability) { assert.equal(capability.id, 'platform.artifact-use-grants'); return api } }
  const dashboards = { authorizeProject: async (actor, operation) => { assert.equal(actor, context); assert.equal(operation, 'manage') }, history: async (_actor, id) => { assert.equal(id, artifactId); return [{ versionId }] } }
  const input = { artifactId, versionId, targetGroupId, days: 7 }
  assert.deepEqual(await executeGroupGrant(runtime, dashboards, context, 'group-grant-offer', input), { id: 'grant' })
  assert.equal(calls[0].versionId, versionId)
  assert.equal(calls[0].targetGroupId, targetGroupId)
  assert.ok(Date.parse(calls[0].expiresAt) > Date.now())
  for (const override of [{ versionId: randomUUID() }, { actor: { userId: 'creator' } }, { permission: 'write' }, { projectId: randomUUID() }, { days: 0 }]) {
    await assert.rejects(executeGroupGrant(runtime, dashboards, context, 'group-grant-offer', { ...input, ...override }))
  }
  assert.equal(calls.length, 1)
  const revoke = { artifactId, grantId: randomUUID(), expectedRevision: 2 }
  await executeGroupGrant(runtime, dashboards, context, 'group-grant-revoke', revoke)
  assert.deepEqual(calls[1], revoke)
})

test('group presentation preserves authoring identity and queries as the current viewer, with independent data ACL', async () => {
  const artifactId = randomUUID(), versionId = randomUUID(), projectA = randomUUID(), projectB = randomUUID()
  const bytes = encodeDashboardPackage(example, []), calls = []
  const runtime = { require(capability) { assert.equal(capability.id, 'platform.analytics'); return {
    query: async actor => { calls.push(actor); throw new Error('DATA_ACCESS_DENIED') },
    queryGroupReference: async (actor, reference) => { calls.push(actor); assert.equal(reference.datasetKey, example.bindings[0].id); assert.ok(reference.groupId); assert.ok(reference.referenceId); assert.ok(!Object.hasOwn(reference, 'binding')); throw new Error('DATA_ACCESS_DENIED') }
  } } }
  const provider = new DashboardPresentationProvider(runtime)
  const context = { actor: { userId: 'viewer', tenantId: 'tenant', organizationId: 'org' },
    artifact: { id: artifactId, tenantId: 'tenant', organizationId: 'org', projectId: projectA, pluginName: '@xpert-ai/plugin-live-dashboard', resourceType: 'live-dashboard', resourceId: `project/${projectA}/${example.id}` },
    version: { id: versionId, artifactId, versionNumber: 1, mimeType: 'application/json', sha256: createHash('sha256').update(bytes).digest('hex') }, content: bytes,
    usage: { kind: 'group-reference', referenceId: randomUUID(), grantId: randomUUID(), groupId: randomUUID(), ownerProjectId: projectA, runtimeProjectId: projectB } }
  assert.deepEqual(new DashboardArtifactType(runtime, {}).definition.useGrants, { audience: 'group', permission: 'read', queryOperations: ['query', 'query-binding'] })
  const view = await provider.read(context)
  assert.equal(view.meta.saved.versionId, versionId)
  assert.deepEqual(view.meta.versions, [])
  const target = { artifactId, versionId }
  await assert.rejects(provider.query(context, { target, operation: 'query-binding', input: { ...target, bindingId: example.bindings[0].id, controls: {} } }), /DATA_ACCESS_DENIED/)
  assert.equal(calls[0].userId, 'viewer')
  await assert.rejects(provider.read({ ...context, artifact: { ...context.artifact, projectId: projectB } }), /DASHBOARD_ACCESS_DENIED/)
  assert.equal(calls.length, 1)
  assert.equal(provider.analysis, undefined)
  const type = new DashboardArtifactType(runtime, {})
  const declared = await type.analytics.resolveBindings(context)
  assert.deepEqual(declared[0].binding, example.bindings[0])
  assert.equal(calls.length, 1) // Parsing never queries data or checks sharing through a rendering provider.
  await assert.rejects(async () => type.analytics.resolveBindings({ ...context, content: Buffer.from('{}') }), /CONTENT_CHANGED/)
  assert.throws(() => type.analytics.normalizeControls(context, 'missing', {}), /DATASET_UNAVAILABLE/)
  assert.throws(() => type.analytics.normalizeControls(context, example.bindings[0].id, { unknown: 'value' }), /UNKNOWN_CONTROL/)
})

test('Artifact Type analytics preserves published control defaults and allowlists without a renderer', async () => {
  const manifest = structuredClone(example)
  const binding = manifest.bindings[0]
  binding.parameters = [{ name: 'plant', controlId: 'plant', type: 'string', required: false }]
  manifest.controls = [{ controlId: 'plant', type: 'string', label: 'Plant', defaultValue: 'A', allowedValues: ['A', 'B'] }]
  const artifactId = randomUUID(), projectId = randomUUID(), bytes = encodeDashboardPackage(manifest, [])
  const context = { actor: { tenantId: 'tenant', organizationId: 'org', userId: 'reader' },
    artifact: { id: artifactId, tenantId: 'tenant', organizationId: 'org', projectId, pluginName: '@xpert-ai/plugin-live-dashboard',
      resourceType: 'live-dashboard', resourceId: `project/${projectId}/${manifest.id}` },
    version: { id: randomUUID(), artifactId, versionNumber: 1, mimeType: 'application/json', sha256: createHash('sha256').update(bytes).digest('hex') }, content: bytes }
  const type = new DashboardArtifactType({ require() { throw Error('Parsing must not call runtime capabilities') } }, {})
  assert.equal(type.analytics.resolveBindings(context)[0].binding.id, binding.id)
  assert.deepEqual(type.analytics.normalizeControls(context, binding.id, {}), { plant: 'A' })
  assert.deepEqual(type.analytics.normalizeControls(context, binding.id, { plant: 'B' }), { plant: 'B' })
  for (const input of [{ plant: 'C' }, { plant: null }, { plant: 1 }, { unknown: 'A' }]) {
    assert.throws(() => type.analytics.normalizeControls(context, binding.id, input))
  }
})
