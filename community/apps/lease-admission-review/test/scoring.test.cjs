const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  scoreReview,
  percentUnits,
  windowStart,
  validDate
} = require('../dist/lib/scoring.js')
const { source, fields, inputs } = require('./fixture.cjs')
const evaluate = (patch = {}, factPatch = {}) =>
  scoreReview(
    source,
    fields.map((f) => ({ ...f, ...factPatch[f.key] })),
    { ...inputs, ...patch }
  )

test('management bands and leap-year windows are deterministic', () => {
  for (const [count, score] of [
    [0, 2],
    [1, 1],
    [2, 1],
    [3, 0]
  ])
    assert.equal(
      evaluate({ departureCount: String(count) }).items[0].score,
      score
    )
  assert.equal(windowStart('2024-02-29'), '2023-02-28')
  assert.equal(windowStart('2025-02-28'), '2024-02-28')
  assert.equal(validDate('2025-02-29'), false)
  for (const departureCount of ['', '-1', '1.5', 'NaN'])
    assert.equal(evaluate({ departureCount }).total, null)
  assert.equal(evaluate({ managementStart: '2025-01-01' }).total, null)
})
test('all percentage boundaries use unrounded fixed point', () => {
  for (const [value, pledge, debt] of [
    ['0', 5, 8],
    ['39.9999', 5, 8],
    ['40', 5, 8],
    ['40.0001', 4, 6],
    ['49.9999', 4, 6],
    ['50', 4, 6],
    ['50.0001', 3, 4],
    ['59.9999', 3, 4],
    ['60', 3, 4],
    ['60.0001', 1, 2],
    ['69.9999', 1, 2],
    ['70', 1, 2],
    ['70.0001', 0, 0],
    ['79.9999', 0, 0],
    ['80', 0, 0],
    ['80.0001', 0, 0],
    ['100', 0, 0]
  ]) {
    const result = evaluate(
      {},
      { pledgeRatio: { value }, debtAssetRatio: { value } }
    )
    assert.equal(result.items[1].score, pledge, value)
    assert.equal(result.items[2].score, debt, value)
    assert.equal(result.total, 2 + pledge + debt)
    assert.equal(result.veto, Number(value) > 80 ? 'hit' : 'clear')
  }
  assert.equal(evaluate({}, { debtAssetRatio: { value: '120%' } }).veto, 'hit')
  assert.equal(evaluate({}, { pledgeRatio: { value: '100.0001' } }).total, null)
})
test('explicit units, invalid numbers and precision are checked', () => {
  assert.equal(percentUnits('80%', null), 800000n)
  assert.equal(percentUnits('80', '百分比'), 800000n)
  assert.equal(percentUnits('0.8', '%'), 8000n)
  for (const [v, u] of [
    ['80', null],
    ['1e2', '%'],
    ['-1', '%'],
    ['1.00001', '%'],
    ['80%', '元'],
    ['Infinity', '%'],
    ['1,000', '%']
  ])
    assert.equal(percentUnits(v, u), null)
})
test('missing, ambiguous scopes, dates and evidence block totals; veto is independent', () => {
  for (const status of ['missing', 'conflict', 'not_applicable']) {
    const result = evaluate({}, { managementStability: { status } })
    assert.equal(result.total, null)
    assert.equal(result.veto, 'clear')
  }
  for (const patch of [
    { evaluationDate: '' },
    { pledgeDate: '2025-06-30' },
    { managementScopeVerified: false },
    { pledgeScopeVerified: false }
  ])
    assert.equal(evaluate(patch).total, null)
  assert.equal(evaluate({ debtDate: '2024-12-31' }).veto, 'insufficient')
  assert.equal(evaluate({ debtScopeVerified: false }).veto, 'insufficient')
  assert.equal(
    evaluate({}, { debtAssetRatio: { evidence: ['fabricated'] } }).veto,
    'insufficient'
  )
  assert.equal(evaluate({}, { pledgeRatio: { period: null } }).total, null)
  const hit = evaluate(
    { managementScopeVerified: false },
    { debtAssetRatio: { value: '80.0001%' } }
  )
  assert.equal(hit.total, null)
  assert.equal(hit.veto, 'hit')
})
