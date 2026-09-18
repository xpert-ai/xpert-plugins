/**
 * Deterministic risk-phrase check: pure function tests, no service/repository involved.
 *
 * The point of this module is that the same conversation text always produces the same risk
 * hits regardless of which model backs the assistant, so these tests only need to check
 * input -> output, not any agent or persistence behaviour.
 *
 *   node --test tests/rule-check.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'

const require = createRequire(import.meta.url)
const {
  checkDeterministicRisks,
  mergeDeterministicRisks,
  RULE_VERSION,
  getRuleDisclosure
} = require('../dist/lib/rule-check.js')

describe('RULE_VERSION', () => {
  it('is a non-empty, stable identifier for the current RULES list', () => {
    assert.equal(typeof RULE_VERSION, 'string')
    assert.ok(RULE_VERSION.length > 0)
  })
})

describe('getRuleDisclosure', () => {
  it('never leaks the underlying RegExp to the client', () => {
    const catalog = getRuleDisclosure()
    assert.ok(catalog.length > 0)
    for (const rule of catalog) {
      assert.equal(rule.pattern, undefined)
      assert.ok(Array.isArray(rule.examples) && rule.examples.length > 0)
      assert.equal(typeof rule.label, 'string')
      assert.ok(rule.label.length > 0)
    }
  })

  it('every listed example is actually caught by the rule it is attached to', () => {
    for (const rule of getRuleDisclosure()) {
      for (const example of rule.examples) {
        const hits = checkDeterministicRisks(`销售：${example}。`)
        assert.ok(
          hits.some((hit) => hit.category === rule.category),
          `expected "${example}" to be caught under ${rule.category}`
        )
      }
    }
  })
})

describe('checkDeterministicRisks', () => {
  it('returns nothing for empty or missing text', () => {
    assert.deepEqual(checkDeterministicRisks(''), [])
    assert.deepEqual(checkDeterministicRisks(undefined), [])
    assert.deepEqual(checkDeterministicRisks(null), [])
  })

  it('flags an over-promise phrase with the sentence as evidence, tagged as a rule hit', () => {
    const hits = checkDeterministicRisks('销售：这个绝对没问题，我们下周就能上线。\n客户：好的。')
    assert.equal(hits.length, 1)
    assert.equal(hits[0].category, 'over_promise')
    assert.equal(hits[0].severity, 'high')
    assert.equal(hits[0].source, 'rule')
    assert.equal(hits[0].evidence, '销售：这个绝对没问题，我们下周就能上线')
  })

  it('runs the same input twice with identical output', () => {
    const text = '销售：给你打个骨折价，肯定按时交付，行业第一的产品。'
    assert.deepEqual(checkDeterministicRisks(text), checkDeterministicRisks(text))
  })

  it('does not report the same category and sentence twice', () => {
    const hits = checkDeterministicRisks('销售：绝对没问题，绝对没问题，我保证。')
    const overPromiseHits = hits.filter((hit) => hit.category === 'over_promise')
    assert.equal(overPromiseHits.length, 1)
  })

  it('finds multiple distinct categories in one conversation', () => {
    const hits = checkDeterministicRisks(
      '销售：这个绝对没问题。\n销售：给你打个骨折价。\n销售：我们是行业第一。'
    )
    const categories = hits.map((hit) => hit.category).sort()
    assert.deepEqual(categories, ['over_promise', 'unauthorized_discount', 'unverified_claim'])
  })

  it('leaves an ordinary conversation with no hits', () => {
    assert.deepEqual(checkDeterministicRisks('客户：预算大概多少？销售：需要看具体配置再报价。'), [])
  })
})

describe('mergeDeterministicRisks', () => {
  it('appends a rule hit the model did not already report', () => {
    const merged = mergeDeterministicRisks(
      [{ category: 'price', severity: 'high', detail: '价格顾虑', evidence: '太贵了', source: 'model' }],
      [{ category: 'over_promise', severity: 'high', detail: '规则命中', evidence: '绝对没问题', source: 'rule' }]
    )
    assert.equal(merged.length, 2)
    assert.equal(merged[1].source, 'rule')
  })

  it('does not duplicate a hit the model already reported under the same category and evidence', () => {
    const merged = mergeDeterministicRisks(
      [{ category: 'over_promise', severity: 'high', detail: '过度承诺', evidence: '绝对没问题', source: 'model' }],
      [{ category: 'over_promise', severity: 'high', detail: '规则命中', evidence: '绝对没问题', source: 'rule' }]
    )
    assert.equal(merged.length, 1)
    // The model's own entry is kept as-is rather than overwritten by the rule's.
    assert.equal(merged[0].source, 'model')
  })

  it('returns the model risks unchanged when there are no rule hits', () => {
    const modelRisks = [{ category: 'other', severity: 'low', detail: 'x', evidence: 'y', source: 'model' }]
    assert.equal(mergeDeterministicRisks(modelRisks, []), modelRisks)
  })

  it('produces a risks array even when the model reported none at all', () => {
    const merged = mergeDeterministicRisks(undefined, [
      { category: 'over_promise', severity: 'high', detail: '规则命中', evidence: '绝对没问题', source: 'rule' }
    ])
    assert.equal(merged.length, 1)
  })
})
