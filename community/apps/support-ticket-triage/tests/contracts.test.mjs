import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { draftSchema, intakeSchema, requireScope, reviewSchema, saveDraftSchema } from '../dist/domain.js'

const id = randomUUID()
const draft = {
  category: 'access',
  priority: 'P0',
  summary: 'The support team cannot sign in.',
  rationale: 'All 12 users are affected and cannot handle tickets.',
  reply: 'We will check the login flow. Which workspace is affected?',
  needsClarification: true
}

test('ticket intake validates IDs, bounded content and identity fields', () => {
  assert.deepEqual(intakeSchema.parse({ id, title: '  Login outage  ', description: ' Login loops. ' }), {
    id, title: 'Login outage', description: 'Login loops.'
  })
  assert.equal(intakeSchema.safeParse({ id, title: '', description: 'Login loops.' }).success, false)
  assert.equal(intakeSchema.safeParse({ id: 'bad-id', title: 'Login outage', description: 'Login loops.' }).success, false)
  assert.equal(intakeSchema.safeParse({ id, title: 'Login outage', description: 'x'.repeat(4001) }).success, false)
  assert.equal(intakeSchema.safeParse({ id, title: 'Login outage', description: 'Login loops.', ownerId: 'other' }).success, false)
})

test('the middleware takes a flat draft with bounded fields and known classifications', () => {
  assert.deepEqual(saveDraftSchema.parse({ id, ...draft }), { id, ...draft })
  assert.equal(draftSchema.safeParse({ ...draft, priority: 'critical' }).success, false)
  assert.equal(draftSchema.safeParse({ ...draft, reply: ' ' }).success, false)
  assert.equal(saveDraftSchema.safeParse({ id, draft }).success, false)
})

test('the human review must name the exact draft revision', () => {
  const input = { id, draftRevision: 1, category: 'access', priority: 'P1', reply: 'Please confirm your workspace name.' }
  assert.deepEqual(reviewSchema.parse(input), input)
  assert.equal(reviewSchema.safeParse({ ...input, draftRevision: 0 }).success, false)
  assert.equal(reviewSchema.safeParse({ ...input, draftRevision: '1' }).success, false)
})

test('organization and user context are both required', () => {
  assert.throws(() => requireScope('tenant', null, 'user'), /scope_required/)
  assert.throws(() => requireScope('tenant', 'org', null), /scope_required/)
  assert.deepEqual(requireScope('tenant', 'org', 'user'), { tenantId: 'tenant', organizationId: 'org', ownerId: 'user' })
})
