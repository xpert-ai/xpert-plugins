const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  fieldsSchema,
  validateEvidence,
  saveCandidateSchema
} = require('../dist/lib/contracts.js')
const { assistantDraft, templates } = require('../dist/lib/templates.js')
const { TOOLS, MIDDLEWARE } = require('../dist/lib/constants.js')
const { source, fields } = require('./fixture.cjs')
test('zero remains present and exact evidence validates', () => {
  assert.equal(fieldsSchema.parse(fields)[1].value, '0')
  validateEvidence(source, fields)
})
test('missing is not zero and evidence cannot be fabricated', () => {
  assert.equal(
    fieldsSchema.safeParse(
      fields.map((f, i) =>
        i === 1 ? { ...f, status: 'missing', value: '0' } : f
      )
    ).success,
    false
  )
  assert.throws(
    () =>
      validateEvidence(
        source,
        fields.map((f, i) =>
          i === 1 ? { ...f, evidence: ['Pledge 10%.'] } : f
        )
      ),
    /invalid_evidence/
  )
})
test('all three unique facts, bounded values and strict properties', () => {
  assert.equal(
    fieldsSchema.safeParse([fields[0], fields[0], fields[2]]).success,
    false
  )
  assert.equal(
    fieldsSchema.safeParse(fields.map((f) => ({ ...f, tenantId: 'injected' })))
      .success,
    false
  )
  assert.equal(
    saveCandidateSchema.safeParse({ attemptId: 'current', fields }).success,
    false
  )
})
test('template owns exact tools and primary defaults without model secrets', () => {
  const d = JSON.parse(templates[0].dslContent)
  assert.deepEqual(d, assistantDraft)
  assert.equal(d.team.name, templates[0].key)
  assert.deepEqual(d.team.features.opener.questions, templates[0].startPrompts)
  assert.deepEqual(
    d.nodes.filter((n) => n.type === 'workflow').map((n) => n.entity.provider),
    ['ContextCompressionMiddleware', 'todoListMiddleware', MIDDLEWARE]
  )
  assert.equal(Object.keys(TOOLS).length, 3)
  assert.equal(d.team.copilotModel, undefined)
  for (const c of d.connections) assert.ok(d.nodes.some((n) => n.key === c.to))
})
