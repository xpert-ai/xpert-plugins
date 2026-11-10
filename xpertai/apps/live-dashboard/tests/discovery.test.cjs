const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { setup } = require('./service-fixture.cjs')
const { DashboardViewProvider } = require('../dist/lib/view.provider')
const { DashboardProjectsService } = require('../dist/lib/projects.service')
const { DashboardArtifactType } = require('../dist/lib/artifact-type.provider')

test('discovery uses the platform audience, filters semantic type and never reads shared source content', async () => {
  const f = setup(), projectId = randomUUID(), conversationId = randomUUID(), calls = []
  f.context.runtimeScope = { projectId, conversationId }
  f.capabilities['platform.project.access'] = { assertAssistant: async () => ({ projectId }), listReadable: async () => [{ projectId, role: 'owner', canManage: true, archived: false }] }
  const shared = { resource: { kind: 'group-reference', id: randomUUID() }, title: 'Shared inventory', projectId,
    typeId: 'xpert.live-dashboard', publication: { versionId: randomUUID(), versionNumber: 1, expiresAt: '2026-12-01T00:00:00Z' },
    access: { canOpen: true, canEdit: false, analysis: 'none' } }
  f.capabilities['platform.content.resources'] = { discovery: { list: async (scope, query) => { calls.push({ scope, query }); return { items: [shared], nextCursor: null, sharedAvailable: true } } } }
  const page = await f.service.availableResources(f.context, { search: 'inventory', origin: 'shared' })
  assert.deepEqual(page.items, [shared])
  assert.equal(calls[0].scope.conversationId, conversationId)
  assert.equal(calls[0].scope.assistantId, f.context.hostId)
  assert.equal(calls[0].query.typeId, 'xpert.live-dashboard')
  assert.equal(f.artifacts.size, 0)
  assert.equal(f.calls.queries.length, 0)
  assert.equal(new DashboardArtifactType(f.runtime).definition.contentTypeId, 'xpert.live-dashboard')
})

test('browsing another Project drops the group audience and cannot accept a caller-supplied group ID', async () => {
  const f = setup(), current = randomUUID(), other = randomUUID(), calls = []
  f.context.runtimeScope = { projectId: current, conversationId: randomUUID() }
  f.capabilities['platform.project.access'] = {
    assertAssistant: async ({ projectId }) => ({ projectId, role: 'owner', canManage: true, archived: false }),
    listReadable: async ({ projectIds }) => projectIds.map(projectId => ({ projectId, role: 'owner', canManage: true, archived: false }))
  }
  f.capabilities['platform.content.resources'] = { discovery: { list: async (scope) => { calls.push(scope); return { items: [], nextCursor: null, sharedAvailable: false } } } }
  const runtime = { require: key => f.capabilities[key.id] }
  const view = new DashboardViewProvider(f.service, f.sharing, new DashboardProjectsService(runtime))
  await view.executeViewAction(f.context, 'live-dashboard', 'available-dashboards', { input: { projectId: other } })
  assert.equal(calls[0].projectId, other)
  assert.equal(calls[0].conversationId, undefined)
  await assert.rejects(view.executeViewAction(f.context, 'live-dashboard', 'available-dashboards', { input: { groupId: randomUUID() } }))
})
