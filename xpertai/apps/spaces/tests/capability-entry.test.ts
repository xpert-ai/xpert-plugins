import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  AssistantMiddlewareAccessRuntimeCapability, DefaultRuntimeCapabilityRegistry,
  type AssistantMiddlewareAccessApi
} from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { SpaceAccess } from '../src/access.js'
import { SpacesView } from '../src/view.js'
import { SpacesMiddleware } from '../src/middleware.js'
import { VIEW } from '../src/domain.js'

function fixture() {
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(),
    assistantId: randomUUID(), projectId: randomUUID() }
  let allowed = true, businessCalls = 0
  const checks: Parameters<AssistantMiddlewareAccessApi['assertAccess']>[0][] = []
  const runtime = new DefaultRuntimeCapabilityRegistry().register(AssistantMiddlewareAccessRuntimeCapability, {
    async assertAccess(input) { checks.push(input); if (!allowed) throw new Error('capability revoked') }
  })
  const access = new SpaceAccess({} as never, {} as never, runtime)
  const space = { id: randomUUID(), projectId: actor.projectId, title: 'Space' }
  const spaces = {
    async workspace() { businessCalls++; return space },
    async tree() { businessCalls++; return { root: space, items: [] } },
    async list() { businessCalls++; return { root: space, items: [] } }
  }
  const view = new SpacesView({} as never, {} as never, {} as never, spaces as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, access)
  const context: XpertResolvedViewHostContext = { ...actor, hostType: 'agent', hostId: actor.assistantId,
    slots: [], capabilities: { features: ['spaces'] }, runtimeScope: { projectId: actor.projectId,
      conversationId: null, dataScopeKey: actor.projectId, workspaceFiles: { catalog: 'projects',
        projectId: actor.projectId, scopeId: actor.projectId } } }
  const middleware = new SpacesMiddleware({} as never, spaces as never, {} as never, {} as never, access)
  return { actor, space, context, view, middleware, checks, businessCalls: () => businessCalls,
    revoke: () => { allowed = false } }
}

test('View checks once per request and rechecks revocation before accessing content', async () => {
  const f = fixture()
  await f.view.getViewData(f.context, VIEW, {})
  assert.equal(f.checks.length, 1)
  assert.deepEqual(f.checks[0].scope, { type: 'project', projectId: f.actor.projectId })
  assert.equal(f.businessCalls(), 2)
  f.revoke()
  await assert.rejects(f.view.getViewData(f.context, VIEW, {}), /capability revoked/)
  assert.equal(f.businessCalls(), 2)
})

test('empty state is authorized in standalone scope, including null Project context', async () => {
  const f = fixture(), context = { ...f.context, runtimeScope: { ...f.context.runtimeScope!, projectId: null } }
  assert.deepEqual(await f.view.getViewData(context, VIEW, {}), { items: [], meta: { requiresProject: true } })
  assert.deepEqual(f.checks[0].scope, { type: 'assistant' })
  assert.equal(f.businessCalls(), 0)
  f.revoke()
  await assert.rejects(f.view.getViewData(context, VIEW, {}), /capability revoked/)
})

test('all View entry transports stop before business operations when capability is revoked', async () => {
  const f = fixture()
  f.revoke()
  const calls = [
    () => f.view.getRemoteComponentEntry(f.context, VIEW, { isolation: 'iframe', entry: 'spaces' }),
    () => f.view.executeViewAction(f.context, VIEW, 'item.create', { input: {} }),
    () => f.view.executeViewFileAction(f.context, VIEW, 'file.upload', { input: {} }, { buffer: Buffer.from('test') } as never),
    () => f.view.resolveViewFile(f.context, VIEW, { fileKey: `item:${randomUUID()}`, purpose: 'download' })
  ]
  for (const call of calls) await assert.rejects(call(), /capability revoked/)
  assert.equal(f.checks.length, calls.length)
  assert.equal(f.businessCalls(), 0)
})

test('tool instances recheck every invocation, using server context rather than tool inputs', async () => {
  const f = fixture()
  const middleware = f.middleware.createMiddleware({}, { ...f.actor, xpertId: f.actor.assistantId } as never)
  const tools = middleware.tools!
  const list = tools.find(tool => tool.name === 'spaces_list')!
  await list.invoke({})
  assert.equal(f.checks.length, 1)
  assert.deepEqual(f.checks[0].scope, { type: 'project', projectId: f.actor.projectId })
  f.revoke()
  const inputs = {
    spaces_create_page: { title: 'Test', content: '' }, spaces_list: {},
    spaces_read_page: { itemId: randomUUID() }, spaces_search: { resourceId: randomUUID(), query: 'test' },
    spaces_propose_patch: { itemId: randomUUID(), blockId: randomUUID(), mutationId: 'proposal', expectedSequence: 0, before: '', after: 'test' }
  }
  for (const tool of tools) await assert.rejects(tool.invoke(inputs[tool.name as keyof typeof inputs]), /capability revoked/)
  assert.equal(f.businessCalls(), 1)
  assert.equal(f.checks.length, 6)
})
