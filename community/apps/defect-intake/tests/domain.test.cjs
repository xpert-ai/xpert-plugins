const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { emptyReport, ensureConfirmable, createSchema, saveSchema } = require('../dist/shared/contracts.js')

test('feedback validation rejects blanks, excessive text and client-supplied identity', () => {
  const requestId = '7a90336a-9248-49fe-939f-84b1b64d49cd'
  assert.equal(createSchema.safeParse({ requestId, originalFeedback: '   ' }).success, false)
  assert.equal(createSchema.safeParse({ requestId, originalFeedback: 'a'.repeat(20001) }).success, false)
  assert.equal(createSchema.safeParse({ requestId, originalFeedback: 'Export spins', ownerId: 'another-user' }).success, false)
  assert.equal(createSchema.parse({ requestId, originalFeedback: '  Original text\n' }).originalFeedback, '  Original text\n')
})
test('new drafts invent no facts; confirmation requires title and actual behavior only', () => {
  const report = emptyReport()
  assert.ok(Object.values(report).every(value => value === ''))
  assert.throws(() => ensureConfirmable(report), error => error.code === 'empty_report')
  report.title = 'Order export does not finish'; report.actual = 'Spinner remains visible'
  assert.doesNotThrow(() => ensureConfirmable(report))
  assert.equal(report.environment, '')
})
test('save contract rejects missing revisions and unexpected report fields', () => {
  assert.equal(saveSchema.safeParse({ supplement: '', report: emptyReport() }).success, false)
  assert.equal(saveSchema.safeParse({ revision: 1, supplement: '', report: { ...emptyReport(), rootCause: 'database' } }).success, false)
})
test('all supported catalogs have exactly the same semantic keys', () => {
  const root = join(__dirname, '../src/remote/locales')
  const en = JSON.parse(readFileSync(join(root, 'en.json'), 'utf8'))
  const zh = JSON.parse(readFileSync(join(root, 'zh-Hans.json'), 'utf8'))
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  assert.ok(Object.values(zh).every(value => typeof value === 'string' && value.trim()))
})
test('portable template aligns identity, opener and directly required capabilities', () => {
  const { templates } = require('../dist/lib/templates.js')
  const template = templates[0]
  const draft = JSON.parse(template.dslContent)
  assert.equal(draft.team.name, template.key)
  assert.equal(draft.team.title, template.title)
  assert.equal(draft.team.description, template.description)
  assert.deepEqual(draft.team.features.opener.questions, template.startPrompts)
  const primary = draft.team.agent.key
  assert.ok(draft.nodes.some(node => node.type === 'agent' && node.key === primary))
  for (const provider of ['defect_intake.middleware', 'todoListMiddleware', 'ContextCompressionMiddleware']) {
    const node = draft.nodes.find(node => node.entity.provider === provider)
    assert.equal(node.entity.required, true)
    assert.ok(draft.connections.some(edge => edge.from === primary && edge.to === node.key && edge.required))
  }
  assert.equal(draft.team.copilotModel, undefined, 'Reusable template contains an installed model binding')
})
