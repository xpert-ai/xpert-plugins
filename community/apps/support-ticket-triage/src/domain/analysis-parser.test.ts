import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAnalysis } from './analysis-parser.ts'

test('normalizes confidence and evidence', () => {
  const result = normalizeAnalysis({
    category: '  refund ', priority: 'high', summary: ' duplicate charge ', suggestedReply: ' refund within 3 days ',
    confidence: 1.4, evidence: ['charged twice', 'charged twice', '  ']
  })
  assert.deepEqual(result, {
    category: 'refund', priority: 'high', summary: 'duplicate charge', suggestedReply: 'refund within 3 days',
    confidence: 1, evidence: ['charged twice']
  })
})

test('rejects incomplete model output', () => {
  assert.throws(() => normalizeAnalysis({ category: '', priority: 'low', summary: 'x', suggestedReply: 'y', confidence: 0.5, evidence: [] }), /requires category/)
})
