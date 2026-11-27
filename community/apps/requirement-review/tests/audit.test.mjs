import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReviewAudit } from '../dist/domain/audit.js'
import { makeEditable } from '../dist/domain/policy.js'

const aiDraft = {
  summary: '合成测试',
  requirements: [
    {
      title: '保留需求',
      description: 'AI 描述',
      evidence: [{ segmentId: 'S01', quote: '原文证据' }],
      acceptance: [{ text: 'AI 条件', basis: 'proposal' }],
      openQuestions: ['需要确认吗？']
    },
    {
      title: '排除需求',
      description: '本期未定',
      evidence: [{ segmentId: 'S02', quote: '本期未定' }],
      acceptance: [],
      openQuestions: []
    }
  ]
}

test('audit summarizes human edits and confirmation without confirmer identity', () => {
  const editable = makeEditable(aiDraft)
  editable.requirements[0].description = '人工描述'
  editable.requirements[0].openQuestions = []
  editable.requirements[1].included = false
  const snapshot = {
    draft: { requirements: [structuredClone(editable.requirements[0])] },
    confirmedBy: 'secret-user-id',
    confirmedAt: '2026-09-16T12:00:00.000Z',
    sourceVersion: 3
  }
  const audit = buildReviewAudit(aiDraft, editable, snapshot)
  assert.deepEqual(audit.humanChanges, [
    {
      requirementNumber: 1,
      title: '保留需求',
      fields: ['description', 'openQuestions']
    },
    {
      requirementNumber: 2,
      title: '排除需求',
      fields: ['included']
    }
  ])
  assert.deepEqual(audit.confirmation, {
    confirmedAt: snapshot.confirmedAt,
    sourceVersion: 3,
    includedCount: 1,
    excludedCount: 1
  })
  assert.equal(JSON.stringify(audit).includes('secret-user-id'), false)
})

test('audit is unavailable until both AI and editable drafts exist', () => {
  assert.equal(buildReviewAudit(null, null, null), null)
  assert.equal(buildReviewAudit(aiDraft, null, null), null)
})
