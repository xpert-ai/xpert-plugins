const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DashboardService, PLUGIN_NAME } = require('../dist/lib/dashboard.service')
const { DashboardViewProvider } = require('../dist/lib/view.provider')
const { dashboardViewDataSchema } = require('../dist/lib/dashboard-view.schema')

function setup(project = false) {
  const context = { tenantId: 'tenant', organizationId: 'org', userId: 'owner', hostType: 'agent', hostId: 'assistant',
    ...(project ? { runtimeScope: { projectId: 'project' } } : {}) }
  const artifact = { id: randomUUID(), pluginName: PLUGIN_NAME, resourceType: 'live-dashboard', status: 'active',
    tenantId: 'tenant', organizationId: 'org', userId: project ? null : 'owner', projectId: project ? 'project' : null,
    resourceId: `${project ? 'project/project' : 'agent/assistant'}/dashboard`, title: 'Published title' }
  const draft = { artifactId: artifact.id, title: 'Working title', revision: 3 }
  const calls = [], access = { projectId: 'project', canManage: true }
  const capabilities = {
    'platform.artifacts': {
      getArtifact: async () => artifact,
      listArtifacts: async input => { assert.equal(input.status, 'active'); return { items: artifact.status === 'active' ? [artifact] : [] } }
    },
    'platform.artifact-drafts': {
      list: async () => draft.revision ? [draft] : [],
      setRecycled: async input => {
        calls.push(input)
        if (input.expectedRevision !== draft.revision) throw Error('ARTIFACT_DRAFT_CONFLICT')
        artifact.status = 'archived'; draft.revision++
        return draft
      }
    },
    'platform.project.access': {
      assertAssistant: async input => { assert.equal(input.assistantId, 'assistant'); return access },
      listReadable: async () => [access],
      assertManage: async () => { if (!access.canManage) throw Error('PROJECT_MANAGE_DENIED'); return access }
    }
  }
  const service = new DashboardService({ require: key => { assert.ok(capabilities[key.id], `unexpected capability ${key.id}`); return capabilities[key.id] } })
  const view = new DashboardViewProvider(service)
  const input = () => ({ artifactId: artifact.id, expectedRevision: 3, confirmed: true })
  return { context, artifact, draft, calls, access, service, view, input }
}

test('list transports delete permission and the exact reviewed draft revision', async () => {
  const s = setup()
  const parsed = dashboardViewDataSchema.parse({ meta: { dashboards: await s.service.list(s.context), sources: [] } })
  assert.equal(parsed.meta.dashboards[0].canDelete, true)
  assert.equal(parsed.meta.dashboards[0].draftRevision, 3)
  assert.equal(parsed.meta.dashboards[0].title, 'Working title')
  s.draft.revision = 0
  assert.equal((await s.service.list(s.context))[0].canDelete, false, 'uninitialized/legacy artifacts have no CAS draft to recycle')
})

test('confirmed delete delegates recycling to the platform without querying data or reading HTML', async () => {
  const s = setup()
  const result = await s.view.executeViewAction(s.context, 'live-dashboard', 'delete', { input: s.input() })
  assert.deepEqual(result, { success: true, data: { artifactId: s.artifact.id }, refresh: false })
  assert.deepEqual(s.calls, [{ artifactId: s.artifact.id, expectedRevision: 3, recycled: true }])
  assert.deepEqual(await s.service.list(s.context), [])
  await assert.rejects(s.service.open(s.context, s.artifact.id), /DASHBOARD_ARCHIVED/)
})

test('delete returns HTTP 400 without mutation for missing confirmation or invalid input', async () => {
  const s = setup()
  for (const input of [ undefined, null, {}, { ...s.input(), confirmed: false },
    { ...s.input(), confirmed: 'true' }, { artifactId: s.artifact.id, expectedRevision: 3 },
    { artifactId: s.artifact.id, confirmed: true },
    { ...s.input(), expectedRevision: 0 }, { ...s.input(), expectedRevision: 1.5 },
    { ...s.input(), userId: 'other' }, { ...s.input(), artifactId: 'invalid' } ]) {
    await assert.rejects(s.view.executeViewAction(s.context, 'live-dashboard', 'delete', { input }), error => {
      assert.equal(error.getStatus?.(), 400)
      assert.equal(error.message, 'DASHBOARD_DELETION_CONFIRMATION_REQUIRED')
      return true
    })
  }
  assert.deepEqual(s.calls, [])
  assert.equal(s.artifact.status, 'active')
  assert.equal(s.draft.revision, 3)
})

test('delete rejects foreign tenant, organization, owner, Assistant and plugin identities before mutation', async () => {
  for (const patch of [{ tenantId: 'other' }, { organizationId: 'other' }, { userId: 'other' },
    { pluginName: 'other' }, { resourceType: 'other' }, { resourceId: 'agent/another/dashboard' },
    { userId: null }, { status: 'archived' }]) {
    const s = setup(); Object.assign(s.artifact, patch)
    await assert.rejects(s.service.trash(s.context, s.artifact.id, 3), /DASHBOARD_(ACCESS_DENIED|ARCHIVED)/)
    assert.deepEqual(s.calls, [])
  }
})

test('stale delete confirmation cannot remove a concurrently edited dashboard', async () => {
  const s = setup(); s.draft.revision++
  await assert.rejects(s.view.executeViewAction(s.context, 'live-dashboard', 'delete', { input: s.input() }), /CONFLICT/)
  assert.equal(s.artifact.status, 'active')
  assert.equal(s.draft.revision, 4)
})

test('project delete requires current management rights and exact project ownership', async () => {
  const s = setup(true)
  assert.equal((await s.service.list(s.context))[0].canDelete, true)
  s.access.canManage = false
  assert.equal((await s.service.list(s.context))[0].canDelete, false)
  await assert.rejects(s.service.trash(s.context, s.artifact.id, 3), /PROJECT_MANAGE_DENIED/)
  assert.deepEqual(s.calls, [])
  s.access.canManage = true; s.artifact.projectId = 'other'
  await assert.rejects(s.service.trash(s.context, s.artifact.id, 3), /DASHBOARD_ACCESS_DENIED/)
  s.artifact.projectId = 'project'
  await s.service.trash(s.context, s.artifact.id, 3)
  assert.equal(s.artifact.status, 'archived')
})
