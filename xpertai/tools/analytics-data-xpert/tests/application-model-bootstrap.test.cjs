const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { createBootstrap } = require('../dist/lib/application-model-bootstrap')
const { materializeBundle } = require('../dist/lib/bootstrap-bundle')
const { readableIdentities } = require('../dist/lib/bootstrap-access')
const bundle = {
  format: 'data-xpert.sql-model/v1',
  key: 'sample',
  version: '1',
  name: 'Sample',
  catalog: 'demo',
  schema: JSON.stringify({
    cubes: [
      {
        name: 'Sample',
        fact: { type: 'table', table: { schema: 'demo', name: 'facts' } },
        measures: [{ name: 'Total', column: 'n' }]
      }
    ]
  }),
  views: JSON.stringify({ facts: 'SELECT 42 AS n' })
}
function mock(visibleLegacyIds = []) {
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
  const workspaceId = randomUUID(),
    dataSourceId = randomUUID(),
    driver = randomUUID(),
    areaId = randomUUID(),
    readerId = randomUUID()
  const selected = { workspaceId, dataSourceId, mode: 'demo-views', userIds: [actor.userId] }
  const base = '/workspaces/' + workspaceId
  const stored = { model: null, reader: null, resources: [], grants: [], policies: [] }
  const writes = []
  const read = async (path, method = 'GET', body) => {
    if (method !== 'GET') writes.push({ method, path, body })
    if (path === '/assistant-management/access') return { ...actor,hasAdminAccess:true }
    if (path === '/workspace-discovery/workspaces')
      return { organizationId: actor.organizationId, workspaces: [{ id: workspaceId, name: 'Workspace' }] }
    if (path === base + '/data-sources')
      return {
        authorized: [{ id: dataSourceId, name: 'Bound', typeId: driver }],
        available: [{ id: randomUUID(), name: 'Unbound', typeId: driver }]
      }
    if (path === base + '/data-sources/types') return { items: [{ id: driver, type: 'mysql' }] }
    if (path.startsWith(base + '/semantic-models?'))
      return { items: stored.model ? [stored.model] : [], total: stored.model ? 1 : 0 }
    if (path === base + '/semantic-models' && method === 'POST') {
      assert.equal(body.businessAreaId, areaId)
      return (stored.model = {
        ...body,
        type: 'SQL',
        tenantId: actor.tenantId,
        organizationId: actor.organizationId,
        workspaceId,
        id: randomUUID(),
        status: 'draft',
        draftRevision: 1,
        publishedVersion: 0,
        published: {}
      })
    }
    if (path.endsWith('/draft/validate')) return { summary: { errorCount: 0 } }
    if (path.endsWith('/publish')) {
      assert.equal(body.expectedDraftRevision, stored.model.draftRevision)
      return Object.assign(stored.model, {
        draftRevision: 2,
        publishedVersion: 1,
        published: structuredClone(stored.model.draft),
        status: 'published'
      })
    }
    if (path === '/assistant-management/custom') {
      if (method === 'GET') return stored.reader ? [stored.reader] : []
      stored.resources = body.resourceIds
      return (stored.reader = { ...body, xpertId: readerId, id: randomUUID() })
    }
    if (path.endsWith('/resources')) return { organizationId: actor.organizationId, resourceIds: stored.resources }
    if (path.includes('/assets?')) return { items: [], total: 0 }
    if (path.endsWith('/grants')) {
      if (method === 'PUT') stored.grants.push(body)
      return stored.grants
    }
    if (path.startsWith('/uose/policies?')) return { items: stored.policies }
    if (path === '/uose/policies' && method === 'POST') {
      stored.policies.push(body)
      return body
    }
    throw Error('Unexpected ' + method + ' ' + path)
  }
  const provider = createBootstrap(
    () => read,
    async () => new Set(visibleLegacyIds)
  )
  const access = {
    area: async () => areaId,
    prepare: async () => ({ xpertId: readerId, businessAreaId: areaId }),
    grant: async () => {}
  }
  return { actor, selected, stored, writes, provider, access, context: { actor }, workspaceId }
}

test('plans without writes, publishes into the private area and reuses the same model, exact grant and read action', async () => {
  const { provider, context, selected, stored, writes, access } = mock()
  const inspect = () => provider.inspect(context, bundle, selected)
  const apply = (p) => provider.apply(context, bundle, selected, p.fingerprint, access)
  const plan = await inspect()
  assert.equal(plan.state, 'create')
  assert.equal(writes.length, 0)
  await assert.rejects(apply({ fingerprint: 'stale' }))
  assert.equal(writes.length, 0)
  const result = await apply(plan)
  assert.equal(result.id, 'datax-semantic-model-' + stored.model.id)
  const policy = stored.policies[0]
  assert.deepEqual(policy.binding.actorIds, selected.userIds)
  assert.deepEqual(policy.binding.actionTypeCodes, ['sql.query_cube_slice'])
  assert.equal(policy.resourceId, result.id)
  assert.equal(stored.grants[0].role, 'consumer')
  const n = writes.length
  const reused = await inspect()
  assert.equal(reused.state, 'reuse')
  assert.deepEqual(await apply(reused), result)
  assert.equal(writes.length, n)
  stored.model.draft.cubes[0].caption = 'Edited by administrator'
  const changed = await inspect()
  assert.equal(changed.state, 'conflict')
  assert.deepEqual(changed.differences, ['draft'])
  await assert.rejects(apply(changed))
  assert.equal(writes.length, n)
})
test('scope, bound source and obsolete plans are enforced before any model creation', async () => {
  const { provider, context, selected, writes } = mock()
  for (const selection of [
    { ...selected, workspaceId: randomUUID() },
    { ...selected, dataSourceId: randomUUID() },
    { ...selected, mode: 'custom' }
  ])
    await assert.rejects(provider.inspect(context, bundle, selection))
  assert.equal(writes.length, 0)
})
test('manual published models retain their grants and require current read access for reuse', async () => {
  const visible = []
  const { actor, workspaceId, context, selected, stored, writes, provider, access } = mock(visible)
  const original = structuredClone(JSON.parse(bundle.schema))
  const modelId = randomUUID()
  stored.model = {
    id: modelId, key: bundle.key, name: 'Existing model', type: 'SQL', catalog: bundle.catalog,
    tenantId: actor.tenantId, organizationId: actor.organizationId, workspaceId,
    dataSourceId: selected.dataSourceId, draftRevision: 1, publishedVersion: 1, status: 'published',
    draft: original, published: original, options: {}
  }
  const selection = { ...selected, mode: 'existing-tables' }
  const inspect = () => provider.inspect(context, bundle, selection)
  assert.deepEqual((await inspect()).differences, ['existingAccess'])
  visible.push('datax-semantic-model-' + modelId)
  const plan = await inspect()
  assert.equal(plan.state, 'reuse')
  assert.equal((await provider.apply(context, bundle, selection, plan.fingerprint, access)).id, visible[0])
  visible.pop()
  await assert.rejects(provider.apply(context, bundle, selection, plan.fingerprint, access))
  assert.equal(writes.length, 0)
})
test('trusted template separates an inline read-only fact from a bound physical table', () => {
  const view = materializeBundle(bundle, 'demo-views').draft.cubes[0].fact
  assert.equal(view.type, 'view')
  assert.equal(view.view.sql.content, view.view.SQL[0]._)
  assert.deepEqual(
    materializeBundle(bundle, 'existing-tables').draft.cubes[0].fact,
    JSON.parse(bundle.schema).cubes[0].fact
  )
  assert.throws(() =>
    materializeBundle({ ...bundle, views: JSON.stringify({ facts: 'SELECT 1; DELETE FROM facts' }) }, 'demo-views')
  )
})
test('a model reader is ignored when its effective grants include any other model', async () => {
  const { actor, context, workspaceId } = mock()
  const modelId = randomUUID(),
    code = 'analytics-model-' + modelId,
    xpertId = randomUUID()
  const row = {
    code,
    category: 'application-analytics-reader',
    scopeType: 'organization',
    organizationId: actor.organizationId,
    xpertId,
    workspaceId
  }
  const effective = {
    ...row,
    allowed: true,
    configured: true,
    enabled: true,
    tenantId: actor.tenantId,
    resourceIds: ['datax-semantic-model-' + modelId]
  }
  const read = (path) => Promise.resolve(path.endsWith('/menu') ? [row] : effective)
  assert.equal((await readableIdentities(read, context)).length, 1)
  effective.resourceIds.push('other-model')
  assert.deepEqual(await readableIdentities(read, context), [])
})
