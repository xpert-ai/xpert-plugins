const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { setup } = require('./service-fixture.cjs')
const { DashboardViewProvider } = require('../dist/lib/view.provider')
const { DashboardArtifactType } = require('../dist/lib/artifact-type.provider')
const { DashboardProjectsService } = require('../dist/lib/projects.service')
const { dashboardApp, DASHBOARD_PROJECT_TYPE } = require('../dist/lib/project')
const { dashboardTemplates } = require('../dist/lib/templates')
const example = require('../examples/postgres-sales.json')
function projectFixture() {
  const f = setup(), projectId = randomUUID()
  Object.assign(f.context, { hostId: randomUUID(), userId: randomUUID(), runtimeScope: { projectId } })
  let role = 'manager', revoked = false, archived = false
  const access = () => ({ projectId, name: 'Test project', role, canManage: ['owner','manager'].includes(role), archived })
  f.capabilities['platform.project.access'] = {
    listReadable: async input => revoked ? [] : (input.projectIds ?? [projectId]).map(projectId => ({...access(), projectId})),
    assertAssistant: async () => { if (revoked) throw Error('REVOKED'); return access() },
    assertEdit: async () => { if (revoked || archived || role === 'member') throw Error('EDIT_DENIED'); return access() },
    assertManage: async () => { if (revoked || archived || !access().canManage) throw Error('MANAGE_DENIED'); return access() }
  }
  const runtime = { require: key => { assert.ok(f.capabilities[key.id], key.id); return f.capabilities[key.id] } }
  return { ...f, projectId, runtime,
    role: value => { role = value }, revoke: () => { revoked = true }, archive: () => { archived = true } }
}

test('Project members consume the published version and cannot read/edit the newer draft', async () => {
  const f = projectFixture()
  const first = await f.service.save(f.context, example, null)
  const published = await f.service.publish(f.context, first.artifactId, 1, null)
  await f.service.update(f.context, first.artifactId, 1, { title: 'Unpublished change' }, published.versionId)
  f.role('member')
  const view = new DashboardViewProvider(f.service, f.sharing, new DashboardProjectsService(f.runtime))
  const result = await view.getViewData(f.context, 'live-dashboard', { selectionId: first.artifactId })
  assert.equal(result.meta.mode, 'published')
  assert.equal(result.meta.saved.manifest.title, example.title)
  assert.equal(result.meta.access.canEdit, false)
  assert.equal(result.meta.dashboards[0].title, example.title)
  await assert.rejects(f.service.open(f.context, first.artifactId), /DRAFT_ACCESS_DENIED/)
  await assert.rejects(view.getViewData(f.context, 'live-dashboard', { selectionId: first.artifactId, parameters: { mode: 'draft' } }), /DRAFT_ACCESS_DENIED/)
  const artifact = f.artifacts.get(first.artifactId)
  await assert.rejects(new DashboardArtifactType(f.runtime).authorizeDraft(artifact, f.context, 'read'), /DRAFT_ACCESS_DENIED/)
  f.revoke()
  await assert.rejects(f.service.open(f.context, first.artifactId, published.versionId), /REVOKED/)
})

test('two project editors preserve one Artifact and stale revisions cannot overwrite', async () => {
  const f = projectFixture(), first = await f.service.save(f.context, example, null)
  const other = { ...f.context, userId: randomUUID(), hostId: randomUUID() }
  f.role('editor')
  await f.service.update(other, first.artifactId, 1, { title: 'Second editor' }, null)
  await assert.rejects(f.service.update(f.context, first.artifactId, 1, { title: 'Stale overwrite' }, null), /CONFLICT/)
  assert.equal(f.artifacts.size, 1)
  assert.equal((await f.service.open(f.context, first.artifactId)).manifest.title, 'Second editor')
  f.archive()
  assert.equal((await f.service.access(f.context)).canEdit, false)
  await assert.rejects(f.service.update(other, first.artifactId, 2, { title: 'Archived' }, null), /EDIT_DENIED/)
})

test('project picker paginates only active readable projects bound to the current Assistant', async () => {
  const { ForbiddenException } = require('@nestjs/common')
  const f = projectFixture(), checks = []
  const projects = Array.from({ length: 24 }, (_, n) => ({ projectId: randomUUID(), name: `Project ${String(n).padStart(2, '0')}`, archived: n === 0 }))
  f.capabilities['platform.project.access'].listReadable = async () => projects
  f.capabilities['platform.project.access'].assertAssistant = async input => {
    checks.push(input)
    if (input.projectId === projects[1].projectId) throw new ForbiddenException()
    return projects.find(project => project.projectId === input.projectId)
  }
  const service = new DashboardProjectsService(f.runtime)
  const first = await service.list(f.context, { search: '', page: 1 })
  const second = await service.list(f.context, { search: '', page: 2 })
  assert.equal(first.items.length, 20); assert.equal(first.hasMore, true)
  assert.equal(second.items.length, 2); assert.equal(second.hasMore, false)
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 22)
  assert.ok(checks.every(input => input.assistantId === f.context.hostId && input.actor.userId === f.context.userId))
  assert.equal((await service.list(f.context, { search: 'Project 23', page: 1 })).items[0].id, projects[23].projectId)
  await assert.rejects(service.list({ ...f.context, userId: undefined }, { search: '', page: 1 }), /ACCESS_DENIED/)
})

test('editors open the working draft by default and project data remains isolated', async () => {
  const f = projectFixture(), saved = await f.service.save(f.context, example, null)
  const view = new DashboardViewProvider(f.service, f.sharing, new DashboardProjectsService(f.runtime))
  const result = await view.getViewData(f.context, 'live-dashboard', { selectionId: saved.artifactId })
  assert.equal(result.meta.mode, 'draft')
  assert.equal(result.meta.currentProject.id, f.projectId)
  assert.equal(result.meta.saved.artifactId, saved.artifactId)
  const other = { ...f.context, runtimeScope: { projectId: randomUUID() } }
  assert.deepEqual((await view.getViewData(other, 'live-dashboard', {})).meta.dashboards, [])
  await assert.rejects(f.service.open(other, saved.artifactId), /ACCESS_DENIED/)
})

test('the original publication flow needs no delivery pipeline and extra actions are unavailable', async () => {
  const f = projectFixture(), saved = await f.service.save(f.context, example, null)
  const view = new DashboardViewProvider(f.service, f.sharing, new DashboardProjectsService(f.runtime))
  const manifest = view.getViewManifests(f.context, 'agent.workbench')[0]
  assert.deepEqual(manifest.workbench.projectType, DASHBOARD_PROJECT_TYPE)
  assert.equal(JSON.parse(dashboardTemplates[0].dslContent).team.options.workspaceScope.mode, 'project-required')
  for (const key of ['copy-to-project', 'delivery-submit', 'delivery-decide', 'recycled-list', 'restore']) {
    assert.ok(!manifest.actions.some(action => action.key === key))
    await assert.rejects(view.executeViewAction(f.context, 'live-dashboard', key, { input: {} }), /ACTION_UNSUPPORTED/)
  }
  const published = await view.executeViewAction(f.context, 'live-dashboard', 'publish', { input: { artifactId: saved.artifactId, expectedRevision: 1, expectedCurrentVersionId: null, confirmed: true } })
  assert.ok(published.data.versionId)
  assert.ok(!f.capabilities['platform.project.pipeline_commands'])
})

test('dashboard picker searches every authorized page and draft display title, with independent result pagination', async () => {
  const f = projectFixture()
  const first = await f.service.save(f.context, example, null)
  const template = f.artifacts.get(first.artifactId)
  const artifacts = Array.from({length: 125}, (_, i) => ({...template, id: randomUUID(), title: `Stored ${i}`}))
  f.capabilities['platform.artifacts'].listArtifacts = async ({page, pageSize, resourceIdPrefix}) => {
    assert.equal(resourceIdPrefix, template.resourceId.slice(0, -example.id.length))
    return {items: artifacts.slice((page - 1) * pageSize, page * pageSize), total: artifacts.length}
  }
  f.capabilities['platform.artifact-drafts'].list = async ids => artifacts.filter(a => ids.includes(a.id)).map((a, i) => ({artifactId: a.id, title: `Renamed ${a.title}`, revision: 2}))
  const view = new DashboardViewProvider(f.service, f.sharing, new DashboardProjectsService(f.runtime))
  const search = async (search, page = 1) => (await view.executeViewAction(f.context, 'live-dashboard', 'dashboards', {input: {search, page}})).data
  const match = await search('Renamed Stored 124')
  assert.equal(match.items[0].artifactId, artifacts[124].id)
  assert.equal(match.hasMore, false)
  assert.equal((await search('not present')).items.length, 0)
  const firstPage = await search('Renamed'), secondPage = await search('Renamed', 2)
  assert.equal(firstPage.items.length, 20); assert.equal(firstPage.hasMore, true)
  assert.equal(secondPage.items.length, 20); assert.equal(secondPage.page, 2)
  assert.equal(new Set([...firstPage.items, ...secondPage.items].map(a => a.artifactId)).size, 40)
  f.role('member')
  assert.equal((await search('Renamed')).items.length, 0, 'unpublished titles never enter member search')
  await assert.rejects(view.executeViewAction(f.context, 'live-dashboard', 'dashboards', {input: {search: '', page: 1, projectId: randomUUID()}}))
  f.revoke()
  await assert.rejects(search(''), /REVOKED/)
})
