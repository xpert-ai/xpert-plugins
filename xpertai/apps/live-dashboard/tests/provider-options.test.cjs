const { test } = require('node:test')
const assert = require('node:assert/strict')
require('reflect-metadata')
const { RequestContext, AnalyticsRuntimeCapability } = require('@xpert-ai/plugin-sdk')
const { DashboardProviderOptionsController } = require('../dist/lib/provider-options.controller.js')
const { DashboardMiddleware } = require('../dist/lib/middleware.js')

test('provider dropdown uses the authenticated catalog, deduplicates IDs and refreshes per request', async (t) => {
  let organizationId = 'organization-1'
  t.mock.method(RequestContext, 'currentTenantId', () => 'tenant-1')
  t.mock.method(RequestContext, 'currentUserId', () => 'user-1')
  t.mock.method(RequestContext, 'getOrganizationId', () => organizationId)
  const calls = []
  const controller = new DashboardProviderOptionsController({ require: capability => {
    assert.equal(capability, AnalyticsRuntimeCapability)
    return { list: async actor => {
      calls.push(actor)
      return actor.organizationId === 'organization-1' ? [
        { name: 'private source name', providers: [{ id: 'hana.sql', name: 'SAP HANA' }] },
        { providers: [{ id: 'doris.sql', name: 'Doris' }, { id: 'hana.sql', name: 'SAP HANA' }] }
      ] : []
    } }
  } })
  assert.deepEqual(await controller.list(), [
    { value: 'doris.sql', label: 'Doris', description: 'doris.sql' },
    { value: 'hana.sql', label: 'SAP HANA', description: 'hana.sql' }
  ])
  organizationId = 'organization-2'
  assert.deepEqual(await controller.list(), [])
  assert.deepEqual(calls.map(actor => actor.organizationId), ['organization-1', 'organization-2'])
  assert.deepEqual(calls[0], { tenantId: 'tenant-1', organizationId: 'organization-1', userId: 'user-1' })
  organizationId = null
  await assert.rejects(controller.list(), error => error.getStatus() === 401)
  assert.equal(calls.length, 2)
})

test('provider catalog failures propagate and the middleware keeps its array policy', async (t) => {
  t.mock.method(RequestContext, 'currentTenantId', () => 'tenant')
  t.mock.method(RequestContext, 'getOrganizationId', () => 'organization')
  t.mock.method(RequestContext, 'currentUserId', () => 'user')
  const controller = new DashboardProviderOptionsController({ require: () => ({ list: async () => { throw new Error('access denied') } }) })
  await assert.rejects(controller.list(), /access denied/)
  const schema = new DashboardMiddleware({}).meta.configSchema.properties.allowedFinalProviders
  assert.equal(schema.type, 'array')
  assert.equal(schema.items.type, 'string')
  assert.deepEqual(schema.items['x-ui'], { component: 'remoteSelect', selectUrl: '/api/live-dashboard/provider-options' })
  assert.equal(Reflect.getMetadata('path', DashboardProviderOptionsController), 'live-dashboard/provider-options')
})
