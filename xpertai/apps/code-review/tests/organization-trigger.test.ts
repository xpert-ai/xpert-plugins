import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { CodeReviewGitHubTrigger } from '../src/github-trigger.js'
import type { ReviewEvents } from '../src/event-subscription.js'
import type { Repositories } from '../src/repositories.js'
import type { Scope } from '../src/domain.js'

function fixture() {
  const scope: Scope = { tenantId: randomUUID(), organizationId: randomUUID(), assistantId: randomUUID(), workspaceId: randomUUID(), userId: randomUUID() }
  const executorId = randomUUID(), publisherId = randomUUID()
  let disabled = false, policies = true, saved: Partial<Scope> & { enabled?: boolean } = {}
  const events = {
    access: async (actor: Scope) => { if (actor.userId !== executorId || disabled) throw new Error('access_denied') },
    records: { findOneBy: async () => scope, upsert: async (row: typeof saved) => { saved = row } }
  } as unknown as ReviewEvents
  const repositories = {
    records: { find: async () => policies ? [{ ...scope, ownership: 'assistant' }] : [] },
    execution: async () => { if (disabled) throw new Error('disabled'); return { ...scope, userId: executorId } }
  } as unknown as Repositories
  const trigger = new CodeReviewGitHubTrigger(events, repositories)
  const params = (principal = false) => ({ xpertId: scope.assistantId, config: { enabled: true },
    scope: { tenantId: scope.tenantId, organizationId: scope.organizationId, workspaceId: scope.workspaceId,
      userId: publisherId, ...(principal ? { assistantUserId: executorId } : {}) }
  } as Parameters<CodeReviewGitHubTrigger['publish']>[0])
  return { trigger, scope, executorId, publisherId, params, disable: () => { disabled = true }, noPolicy: () => { policies = false }, state: () => saved }
}

test('bootstrap restores the same Assistant account independently of the configuring human', async () => {
  const f = fixture()
  await f.trigger.publish(f.params())
  assert.equal(f.state().enabled, true)
  assert.equal(f.state().userId, f.executorId)
})
test('a disabled Assistant cannot reactivate the subscription', async () => {
  const f = fixture(); f.disable()
  await f.trigger.publish(f.params(true))
  assert.equal(f.state().enabled, false)
})
test('publication uses the host-resolved Assistant account instead of publisher identity', async () => {
  const f = fixture(); f.noPolicy()
  await f.trigger.publish(f.params(true))
  assert.equal(f.state().userId, f.executorId)
  assert.equal(f.state().enabled, true)
  assert.notEqual(f.state().userId, f.publisherId)
})
test('a legacy subscription without an Assistant principal remains paused', async () => {
  const f = fixture(); f.noPolicy()
  await f.trigger.publish(f.params())
  assert.equal(f.state().enabled, false)
  assert.equal(f.state().userId, f.scope.userId)
})
