import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { WorkbenchStore } from '../src/lib/domain/workbench-store.js'
import { persistDraftSchema, TestCaseError, workbenchStateSchema } from '../src/lib/domain/contracts.js'
import { InMemoryPort, draftCase, scope } from './in-memory-port.js'

function store() { const port = new InMemoryPort(); return { port, service: new WorkbenchStore(port) } }
async function withRequirement() {
  const ctx = store()
  const req = await ctx.service.saveRequirement(scope, { expectedRevision: 0, requirement: { title: '登录', description: '用户可用正确凭据登录' } })
  return { ...ctx, requirementId: req.requirement.id }
}
const draftInput = (requirementId: string, requestId: string, n = 3) => persistDraftSchema.parse({
  requirementId, requestId, cases: Array.from({ length: n }, (_, i) => ({ ...draftCase, title: `${draftCase.title} #${i + 1}` }))
})

test('empty state has no requirements or cases (empty state + clear data shape)', async () => {
  const { service } = store()
  assert.deepEqual(await service.getState(scope), { revision: 0, requirements: [], cases: [] })
})

test('a requirement survives reload: get reads from the store, not memory (save & restore)', async () => {
  const { port, service } = store()
  const saved = await service.saveRequirement(scope, { expectedRevision: 0, requirement: { title: '登录', description: '支持正确凭据登录' } })
  // A fresh service over the same port reproduces what an app reload would read back.
  const reloaded = await new WorkbenchStore(port).getState(scope)
  assert.equal(reloaded.requirements.length, 1)
  assert.equal(reloaded.revision, saved.revision)
  assert.equal(reloaded.requirements[0].title, '登录')
})

test('input validation rejects an empty requirement before touching the store', async () => {
  const { port, service } = store()
  await assert.rejects(
    service.saveRequirement(scope, { expectedRevision: 0, requirement: { title: '   ', description: '' } }),
    (error: unknown) => error instanceof TestCaseError && error.code === 'invalid_input'
  )
  assert.equal(port.size(), 0)
})

test('stale expectedRevision is rejected as a conflict and keeps saved data intact (failure path)', async () => {
  const { service } = store()
  await service.saveRequirement(scope, { expectedRevision: 0, requirement: { title: 'v1', description: 'a' } })
  await assert.rejects(service.saveRequirement(scope, { expectedRevision: 0, requirement: { title: 'v2', description: 'b' } }), /conflict/)
  assert.equal((await service.getState(scope)).requirements[0].title, 'v1')
})

test('two simultaneous first saves: one wins, one conflicts (unique index guard)', async () => {
  const { service } = store()
  const results = await Promise.allSettled([
    service.saveRequirement(scope, { expectedRevision: 0, requirement: { id: 'fixed', title: 'A', description: 'a' } }),
    service.saveRequirement(scope, { expectedRevision: 0, requirement: { id: 'fixed', title: 'B', description: 'b' } })
  ])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(results.filter(r => r.status === 'rejected').length, 1)
})

test('draft generation requires a saved requirement (real AI write, auditable)', async () => {
  const { service } = store()
  await assert.rejects(service.persistDraft(scope, draftInput(randomUUID(), randomUUID())), /not_found/)
})

test('persistDraft saves reviewable drafts and confirm transitions them to confirmed', async () => {
  const { service, requirementId } = await withRequirement()
  const requestId = randomUUID()
  const created = await service.persistDraft(scope, draftInput(requirementId, requestId))
  assert.equal(created.created, 3)
  let state = await service.getState(scope)
  assert.equal(state.cases.length, 3)
  assert.ok(state.cases.every(c => c.status === 'draft'))
  const draftIds = state.cases.map(c => c.id)
  await service.confirmCases(scope, { expectedRevision: state.revision, caseIds: [draftIds[0]] })
  state = await service.getState(scope)
  assert.equal(state.cases.find(c => c.id === draftIds[0])!.status, 'confirmed')
  assert.equal(state.cases.find(c => c.id === draftIds[1])!.status, 'draft')
})

test('replaying a failed generation with the same requestId never duplicates cases (retry idempotency)', async () => {
  const { service, requirementId } = await withRequirement()
  const requestId = 'req-1234567890'
  const first = await service.persistDraft(scope, draftInput(requirementId, requestId))
  const replay = await service.persistDraft(scope, draftInput(requirementId, requestId))
  assert.equal(first.created, 3)
  assert.equal(replay.created, 0)
  assert.equal(replay.reused, 3)
  assert.equal((await service.getState(scope)).cases.length, 3)
})

test('discard removes selected drafts; confirming unknown ids fails without writing', async () => {
  const { service, requirementId } = await withRequirement()
  await service.persistDraft(scope, draftInput(requirementId, randomUUID(), 2))
  let state = await service.getState(scope)
  const toDiscard = state.cases[0].id
  await service.discardCases(scope, { expectedRevision: state.revision, caseIds: [toDiscard] })
  state = await service.getState(scope)
  assert.equal(state.cases.length, 1)
  await assert.rejects(service.confirmCases(scope, { expectedRevision: state.revision, caseIds: ['missing'] }), /not_found/)
})

test('every scope dimension isolates one user/assistant from another (permission & data range)', async () => {
  const { service, requirementId } = await withRequirement()
  await service.persistDraft(scope, draftInput(requirementId, randomUUID()))
  for (const key of ['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId'] as const) {
    const other = await service.getState({ ...scope, [key]: 'different' })
    assert.deepEqual(other.requirements, [])
    assert.deepEqual(other.cases, [])
  }
})

test('saved document stays within the declared schema after the full loop', async () => {
  const { service, requirementId } = await withRequirement()
  await service.persistDraft(scope, draftInput(requirementId, randomUUID()))
  const state = await service.getState(scope)
  assert.doesNotThrow(() => workbenchStateSchema.parse(state))
  assert.ok(state.revision >= 1)
})
