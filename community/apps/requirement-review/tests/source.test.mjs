import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  segmentSource,
  validateTitle,
  hasValidEvidence
} from '../dist/domain/source.js'
import { aiDraftSchema } from '../dist/domain/contracts.js'

test('stable segments preserve source and only retain valid timestamps', () => {
  const text =
    '[03:20] Export filtered orders to CSV.\r\n\r\nColumns remain undecided.\n[03:99] Invalid timestamp.'
  const segments = segmentSource(text)
  assert.deepEqual(
    segments.map(({ id, timestamp }) => ({ id, timestamp })),
    [
      { id: 'S01', timestamp: '03:20' },
      { id: 'S02', timestamp: null },
      { id: 'S03', timestamp: null }
    ]
  )
  assert.equal(segments[0].text, '[03:20] Export filtered orders to CSV.')
  assert.equal(
    hasValidEvidence(segments, 'S01', 'Export filtered orders'),
    true
  )
  assert.equal(
    hasValidEvidence(segments, 'S02', 'Export filtered orders'),
    false
  )
  assert.equal(hasValidEvidence(segments, 'S99', 'CSV'), false)
  assert.equal(hasValidEvidence(segments, 'S01', '   '), false)
})

test('input limits reject oversized material without truncation', () => {
  assert.equal(validateTitle('  Review  '), 'Review')
  assert.throws(() => validateTitle('a'.repeat(81)), { code: 'invalid_title' })
  assert.throws(() => segmentSource('  \n'), { code: 'empty_source' })
  assert.throws(() => segmentSource('a'.repeat(12_001)), {
    code: 'source_too_long'
  })
  assert.throws(() => segmentSource(Array(101).fill('line').join('\n')), {
    code: 'too_many_segments'
  })
})

test('strict draft schema accepts no-requirement result and rejects model-owned status', () => {
  assert.deepEqual(
    aiDraftSchema.parse({ requirements: [], summary: 'No requirements.' }),
    { requirements: [], summary: 'No requirements.' }
  )
  assert.equal(
    aiDraftSchema.safeParse({
      requirements: [],
      summary: '',
      status: 'CONFIRMED'
    }).success,
    false
  )
})
