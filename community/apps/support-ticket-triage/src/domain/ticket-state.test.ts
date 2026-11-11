import assert from 'node:assert/strict'
import test from 'node:test'
import { canRetry, transitionTicket } from './ticket-state.ts'

test('happy path requires human review before approval', () => {
  const reviewed = transitionTicket('pending_ai', 'analysis_succeeded')
  assert.equal(reviewed, 'awaiting_review')
  assert.equal(transitionTicket(reviewed, 'approved'), 'approved')
})

test('only failed tickets can retry', () => {
  assert.equal(canRetry('failed'), true)
  assert.equal(canRetry('pending_ai'), false)
  assert.equal(transitionTicket('failed', 'retry_requested'), 'pending_ai')
})

test('terminal tickets reject duplicate approval', () => {
  assert.throws(() => transitionTicket('approved', 'approved'), /Invalid ticket transition/)
})
