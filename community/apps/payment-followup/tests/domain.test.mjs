import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const d = require('../dist/lib/domain.js')
const input = {
  customerName: 'Sample',
  invoiceNumber: 'AR-1',
  outstandingCents: 5000000,
  dueDate: '2026-10-25',
  communicationDate: '2026-10-31',
  source: '11月6日先付三万元。\n余款等验收单补齐。\n'
}
const analysis = {
  summary: '分期付款，余款待确认',
  promises: [{ amountCents: 3000000, paymentDate: '2026-11-06', condition: '', evidenceLineIds: [1] }],
  blockers: [{ description: '等待验收单', evidenceLineIds: [2] }],
  questions: ['余款日期？'],
  suggestedAction: '补齐验收单并确认余款日期'
}
const now = new Date('2026-10-31T01:00:00Z')
const confirmation = () => ({ analysis: structuredClone(analysis), nextFollowupDate: '2026-11-02', note: '已核对' })
function active() {
  const state = d.newState(input)
  d.begin(state, 0, 'attempt-1', now)
  return state
}
function review() {
  const state = active()
  d.submit(state, 'attempt-1', analysis, now)
  return state
}
const code = (expected) => (error) => error.code === expected
test('source lines preserve original text and numbering', () =>
  assert.deepEqual(d.sourceLines('a\r\n\nb'), [
    { id: 1, text: 'a' },
    { id: 2, text: '' },
    { id: 3, text: 'b' }
  ]))
test('invalid calendar dates are rejected', () => {
  assert.equal(d.dateSchema.safeParse('2026-02-29').success, false)
  assert.equal(d.dateSchema.safeParse('2028-02-29').success, true)
})
test('money must be nonnegative integer cents', () => {
  for (const n of [-1, 0, 0.1, Infinity])
    assert.equal(d.inputSchema.safeParse({ ...input, outstandingCents: n }).success, false)
})
test('unknown input fields are rejected', () =>
  assert.equal(d.inputSchema.safeParse({ ...input, tenantId: 'forged' }).success, false))
test('every scope dimension is required', () => {
  const scope = { tenantId: 't', organizationId: 'o', userId: 'u', assistantId: 'a' }
  assert.deepEqual(d.requireScope(scope), scope)
  for (const key of Object.keys(scope))
    assert.throws(() => d.requireScope({ ...scope, [key]: null }), code('missing_scope'))
})
test('new cases are persisted drafts, not confirmed payments', () => {
  const state = d.newState(input)
  assert.equal(state.status, 'draft')
  assert.equal(state.confirmedResult, null)
})
test('duplicate starts are fenced by revision', () =>
  assert.throws(() => d.begin(active(), 0, 'attempt-2', now), code('revision_conflict')))
test('active work cannot be started again even with latest revision', () =>
  assert.throws(() => d.begin(active(), 1, 'attempt-2', now), code('invalid_state')))
test('AI submit stores reviewable draft with evidence', () => {
  const state = review()
  assert.equal(state.status, 'review')
  assert.deepEqual(state.aiResult, analysis)
  assert.equal(state.confirmedResult, null)
})
test('invented evidence lines are rejected without changing state', () => {
  const state = active(),
    bad = structuredClone(analysis)
  bad.promises[0].evidenceLineIds = [999]
  assert.throws(() => d.submit(state, 'attempt-1', bad, now), code('invalid_evidence'))
  assert.equal(state.status, 'processing')
})
test('blank and duplicate evidence lines are rejected', () => {
  for (const ids of [[3], [1, 1]]) {
    const bad = structuredClone(analysis)
    bad.promises[0].evidenceLineIds = ids
    assert.throws(() => d.submit(active(), 'attempt-1', bad, now), code('invalid_evidence'))
  }
})
test('identical tool retry is idempotent', () => {
  const state = review()
  d.submit(state, 'attempt-1', analysis, now)
  assert.equal(state.revision, 2)
})
test('conflicting tool retry cannot silently replace a draft', () =>
  assert.throws(
    () => d.submit(review(), 'attempt-1', { ...analysis, summary: 'different' }, now),
    code('invalid_state')
  ))
test('failure preserves input and can be retried', () => {
  const state = active()
  d.fail(state, 'attempt-1', 'model_failed', now)
  d.begin(state, 2, 'attempt-2', now)
  assert.equal(state.status, 'processing')
  assert.deepEqual(state.input, input)
  assert.equal(state.attempts.length, 2)
})
test('old result cannot overwrite a later retry', () => {
  const state = active()
  d.fail(state, 'attempt-1', 'model_failed', now)
  d.begin(state, 2, 'attempt-2', now)
  assert.throws(() => d.submit(state, 'attempt-1', analysis, now), code('stale_attempt'))
  assert.equal(state.attemptId, 'attempt-2')
})
test('cancellation is idempotent and rejects subsequent success', () => {
  const state = active()
  d.fail(state, 'attempt-1', 'user_cancelled', now)
  d.fail(state, 'attempt-1', 'user_cancelled', now)
  assert.equal(state.revision, 2)
  assert.throws(() => d.submit(state, 'attempt-1', analysis, now), code('invalid_state'))
})
test('timeout recovery retains source and closes attempt', () => {
  const state = active()
  assert.equal(d.recoverTimeout(state, new Date(now.getTime() + 120000)), false)
  assert.equal(d.recoverTimeout(state, new Date(now.getTime() + 120001)), true)
  assert.equal(state.error, 'analysis_timeout')
  assert.equal(state.attempts[0].status, 'failed')
  assert.deepEqual(state.input, input)
})
test('late model failure cannot erase completed AI draft', () =>
  assert.throws(() => d.fail(review(), 'attempt-1', 'model_failed', now), code('invalid_state')))
test('no promise is a valid result, with a review warning', () => {
  const state = active()
  d.submit(state, 'attempt-1', { ...analysis, promises: [] }, now)
  assert.ok(d.warnings(input, state.aiResult).includes('no_explicit_promise'))
})
test('ambiguous promise preserves null values and conditional warning', () => {
  const result = {
    ...analysis,
    promises: [{ amountCents: null, paymentDate: null, condition: '验收后', evidenceLineIds: [2] }]
  }
  d.submit(active(), 'attempt-1', result, now)
  assert.ok(d.warnings(input, result).includes('incomplete_promise'))
  assert.ok(d.warnings(input, result).includes('conditional_payment'))
})
test('human confirmation persists edits separately from AI draft', () => {
  const state = review(),
    result = confirmation()
  result.analysis.summary = '人工修订'
  d.confirm(state, 2, result, now)
  assert.equal(state.status, 'confirmed')
  assert.equal(state.aiResult.summary, analysis.summary)
  assert.equal(state.confirmedResult.analysis.summary, '人工修订')
  assert.equal(state.input.outstandingCents, input.outstandingCents)
})
test('duplicate identical confirmation is idempotent', () => {
  const state = review(),
    result = confirmation()
  d.confirm(state, 2, result, now)
  d.confirm(state, 2, result, now)
  assert.equal(state.revision, 3)
})
test('concurrent stale human edit is rejected', () =>
  assert.throws(() => d.confirm(review(), 1, confirmation(), now), code('revision_conflict')))
test('over-balance commitments cannot be confirmed', () => {
  const result = confirmation()
  result.analysis.promises[0].amountCents = 5000001
  assert.throws(() => d.confirm(review(), 2, result, now), code('amount_exceeds_balance'))
})
test('follow-up before conversation date is rejected', () => {
  const result = confirmation()
  result.nextFollowupDate = '2026-10-30'
  assert.throws(() => d.confirm(review(), 2, result, now), code('invalid_followup_date'))
})
test('confirmed case cannot be re-analyzed', () => {
  const state = review()
  d.confirm(state, 2, confirmation(), now)
  assert.throws(() => d.begin(state, 3, 'attempt-2', now), code('invalid_state'))
})
test('history is bounded while latest attempt remains available', () => {
  const state = d.newState(input)
  for (let i = 0; i < 30; i++) {
    d.begin(state, state.revision, String(i), now)
    d.fail(state, String(i), 'model_failed', now)
  }
  assert.equal(state.attempts.length, 20)
  assert.equal(state.attempts.at(-1).id, '29')
})
