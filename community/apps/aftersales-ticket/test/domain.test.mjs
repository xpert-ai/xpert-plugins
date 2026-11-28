import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateInput, requireScope, nextAnalysisAttempt, requireCurrentAttempt, confirmationReply} from '../src/domain.ts'
test('rejects blank and oversized customer inputs', () => {
  assert.throws(() => validateInput({title:' ', description:'test'}), /invalid_ticket/)
  assert.throws(() => validateInput({title:'test', description:'x'.repeat(12001)}), /invalid_ticket/)
  assert.deepEqual(validateInput({title:' A ', description:' B '}), {title:'A', description:'B'})
})
test('requires tenant, organization and acting user, with no global fallback', () => {
  for (const key of ['tenantId','organizationId','ownerId']) {
    assert.throws(() => requireScope({...{tenantId:'t',organizationId:'o',ownerId:'u'},[key]:''}), /scope_required/)
  }
})
test('retry increments attempt, but cannot duplicate active or confirmed work', () => {
  assert.equal(nextAnalysisAttempt('analysis_failed', 1), 2)
  for (const status of ['awaiting_review','confirmed']) assert.throws(() => nextAnalysisAttempt(status, 1), /analysis_not_allowed/)
  // analyzing 未超时：拒绝
  const fresh = new Date('2026-11-28T10:00:00Z')
  assert.throws(() => nextAnalysisAttempt('analyzing', 1, fresh, new Date('2026-11-28T10:01:00Z')), /analysis_not_allowed/)
  // analyzing 超时（超过 5 分钟）：允许接管
  assert.equal(nextAnalysisAttempt('analyzing', 1, fresh, new Date('2026-11-28T10:06:00Z')), 2)
  // analyzing 但没有 updatedAt：保守拒绝
  assert.throws(() => nextAnalysisAttempt('analyzing', 1), /analysis_not_allowed/)
})
test('old model responses cannot overwrite a newer attempt', () => {
  assert.throws(() => requireCurrentAttempt('analyzing', 2, 1), /stale_analysis/)
  assert.throws(() => requireCurrentAttempt('confirmed', 2, 2), /stale_analysis/)
  requireCurrentAttempt('analyzing', 2, 2)
})
test('confirmation requires current reviewed suggestion and a real reply', () => {
  assert.throws(() => confirmationReply('awaiting_review', 2, 1, 'reply'), /review_outdated/)
  assert.throws(() => confirmationReply('draft', 0, 0, 'reply'), /review_outdated/)
  assert.throws(() => confirmationReply('awaiting_review', 2, 2, ' '), /invalid_reply/)
  assert.equal(confirmationReply('awaiting_review', 2, 2, ' reply '), 'reply')
})
