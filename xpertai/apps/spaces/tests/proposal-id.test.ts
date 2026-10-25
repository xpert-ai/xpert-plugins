import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proposalMutationId } from '../src/proposal-id.js'
test('model retry keys map to stable UUIDs scoped to the actor and resource', () => {
  const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }
  const id = proposalMutationId(actor, 'document', 'mut-001-change-paragraph-a')
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
  assert.equal(proposalMutationId(actor, 'document', 'mut-001-change-paragraph-a'), id)
  assert.notEqual(proposalMutationId(actor, 'other', 'mut-001-change-paragraph-a'), id)
  assert.notEqual(proposalMutationId({ ...actor, userId: 'other' }, 'document', 'mut-001-change-paragraph-a'), id)
})
