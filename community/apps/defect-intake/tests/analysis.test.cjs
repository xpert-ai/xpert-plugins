const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { emptyReport, recordSchema } = require('../dist/shared/contracts.js')
const { buildAnalysisInput, validateAnalysisOutput, mergeAnalysisReport, mergeAnswers, questionId } = require('../dist/lib/analysis/domain.js')
const { mergeLocalDraft } = require('../dist/shared/reconcile.js')
const { AnalysisService } = require('../dist/lib/analysis/analysis.service.js')
const { AnalysisProcessor } = require('../dist/lib/analysis/analysis.processor.js')
const { AnalysisAttempt } = require('../dist/lib/analysis/attempt.entity.js')
const { IntakeEntity } = require('../dist/lib/intake.entity.js')
const { analysisConfigSchema } = require('../dist/lib/analysis/config.js')

test('published platform models permit nullable options without rejecting a valid model binding', () => {
  assert.equal(analysisConfigSchema.safeParse({ model: { copilotId: randomUUID(), modelType: 'llm', model: 'deepseek-flash', referencedId: null, options: null } }).success, true)
  assert.equal(analysisConfigSchema.safeParse({ model: { copilotId: 'invalid', model: 'test', options: null } }).success, false)
})

const record = () => recordSchema.parse({ id: randomUUID(), originalFeedback: '导出订单一直转圈，没有下载文件。', supplement: 'Chrome 浏览器，约 1000 条订单。', report: emptyReport(), status: 'draft', revision: 1, confirmed: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
const output = () => ({ fields: [{ field: 'actual', value: '导出订单一直转圈，没有下载文件。', evidence: [{ sourceId: 'original', quote: '导出订单一直转圈，没有下载文件。' }] }], questions: [{ field: 'frequency', question: '同样条件下，每次导出都会出现吗？', reason: '确认是否稳定复现。' }] })
test('suggestions require real source quotes, unique bounded fields and no invented rootCause', () => {
  const input = buildAnalysisInput(record()); const id = randomUUID()
  const accepted = validateAnalysisOutput(output(), input, id, 1)
  assert.equal(accepted.fields.length, 1)
  assert.match(accepted.questions[0].id, /^q_/)
  const fakeQuote = output(); fakeQuote.fields[0].evidence[0].quote = '数据库超时'
  assert.throws(() => validateAnalysisOutput(fakeQuote, input, id, 1))
  const fakeSource = output(); fakeSource.fields[0].evidence[0].sourceId = 'production-logs'
  assert.throws(() => validateAnalysisOutput(fakeSource, input, id, 1))
  assert.throws(() => validateAnalysisOutput({ ...output(), rootCause: 'database' }, input, id, 1))
  assert.throws(() => validateAnalysisOutput({ fields: [output().fields[0], output().fields[0]], questions: [] }, input, id, 1))
  assert.throws(() => validateAnalysisOutput({ fields: [], questions: Array(4).fill(output().questions[0]) }, input, id, 1))
})
test('legacy manual fields and deliberately cleared human fields are protected', () => {
  const row = record(); row.report.actual = '人工核对后的实际表现'; row.protectedFields = ['environment']
  const input = buildAnalysisInput(row)
  const result = validateAnalysisOutput(output(), input, randomUUID(), 1)
  const merged = mergeAnalysisReport(input, result)
  assert.equal(merged.actual, row.report.actual)
  assert.equal(merged.environment, '')
  assert.equal(merged.steps, '')
  assert.equal(merged.questions, output().questions[0].question)
  assert.ok(input.sources.some(source => source.id === 'report:actual'))
})
test('saved answers retain their question and become facts for reanalysis; answered questions cannot repeat', () => {
  const row = record(); const input = buildAnalysisInput(row)
  row.aiResult = validateAnalysisOutput(output(), input, randomUUID(), 1)
  const question = row.aiResult.questions[0]
  row.answers = mergeAnswers(row, [{ questionId: question.id, text: '是的，连续三次都出现。' }])
  const next = buildAnalysisInput(row)
  assert.equal(next.sources.find(source => source.id === `answer:${question.id}`).text, '是的，连续三次都出现。')
  assert.throws(() => validateAnalysisOutput(output(), next, randomUUID(), 2))
  assert.throws(() => mergeAnswers(row, [{ questionId: questionId('title', '不存在的追问'), text: 'fake' }]))
})
test('only the exact AI commit can merge into unsaved local edits; unrelated versions remain conflicts', () => {
  const base = record(); const attemptId = randomUUID()
  base.analysis = { id: attemptId, status: 'running', sourceRevision: 1, createdAt: new Date().toISOString(), completedAt: null, errorCode: null }
  const result = validateAnalysisOutput(output(), buildAnalysisInput(base), attemptId, 1)
  const incoming = { ...base, revision: 2, report: mergeAnalysisReport(buildAnalysisInput(base), result), aiResult: result, analysis: { ...base.analysis, status: 'succeeded' } }
  const local = { ...base.report, title: '用户正在写的标题' }
  const merged = mergeLocalDraft(base, incoming, local)
  assert.equal(merged.kind, 'merged'); assert.equal(merged.report.title, local.title); assert.equal(merged.report.actual, output().fields[0].value)
  assert.equal(mergeLocalDraft(base, { ...incoming, revision: 3 }, local).kind, 'conflict')
  assert.equal(mergeLocalDraft(base, { ...incoming, aiResult: { ...result, attemptId: randomUUID() } }, local).kind, 'conflict')
  assert.equal(mergeLocalDraft(base, incoming, local, true).kind, 'conflict', 'Unsaved answers must keep their original question visible')
})

/** Transactional test double for finalization only; installed PostgreSQL is tested separately. */
function finalizationFixture() {
  const scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
  const row = { ...record(), tenantId: scope.tenantId, organizationId: scope.organizationId, ownerId: scope.userId }
  const attempt = { id: randomUUID(), recordId: row.id, tenantId: scope.tenantId, organizationId: scope.organizationId, ownerId: scope.userId, sourceRevision: 1, input: buildAnalysisInput(row), status: 'running', createdAt: new Date(), completedAt: null, errorCode: null, result: null }
  row.analysis = { id: attempt.id, status: 'running', sourceRevision: 1, createdAt: attempt.createdAt.toISOString(), completedAt: null, errorCode: null }
  const stored = new Map([[IntakeEntity, row], [AnalysisAttempt, attempt]])
  const manager = {
    async findOne(entity, options) { const candidate = stored.get(entity); return candidate && Object.entries(options.where).every(([key, value]) => candidate[key] === value) ? structuredClone(candidate) : null },
    async save(value) { stored.set(value.recordId ? AnalysisAttempt : IntakeEntity, structuredClone(value)); return value }
  }
  const service = new AnalysisService({ transaction: run => run(manager) }, {}, {})
  return { scope, row, attempt, stored, service }
}
test('late success and failure cannot overwrite a newer draft or another active attempt', async () => {
  const fixture = finalizationFixture()
  const { row, attempt, stored, scope, service } = fixture
  const result = validateAnalysisOutput(output(), attempt.input, attempt.id, 1)
  row.revision = 2; row.report.title = '用户已经保存的新标题'; row.analysis.status = 'superseded'
  await service.finish(scope, attempt.id, result, null)
  assert.equal(stored.get(IntakeEntity).report.title, row.report.title)
  assert.equal(stored.get(IntakeEntity).revision, 2)
  assert.equal(stored.get(AnalysisAttempt).status, 'superseded')
  const next = finalizationFixture(); const replacement = { ...next.row.analysis, id: randomUUID() }; next.row.analysis = replacement
  await next.service.finish(next.scope, next.attempt.id, null, 'model_timeout')
  assert.equal(next.stored.get(IntakeEntity).analysis.id, replacement.id)
})
test('out-of-scope finalization changes neither record nor attempt', async () => {
  const { scope, row, attempt, stored, service } = finalizationFixture()
  await service.finish({ ...scope, userId: randomUUID() }, attempt.id, null, 'interrupted')
  assert.equal(stored.get(IntakeEntity).revision, row.revision)
  assert.equal(stored.get(AnalysisAttempt).status, 'running')
})
test('model failure is recorded as a bounded code and preserves the saved report', async () => {
  const scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
  const id = randomUUID(); const row = record()
  const finishes = []
  const processor = new AnalysisProcessor({
    claim: async () => ({ id, input: buildAnalysisInput(row), sourceRevision: 1, deadlineAt: new Date(Date.now() + 30000) }),
    resolveRuntime: async () => ({ options: { model: { copilotId: randomUUID(), model: 'test' } }, context: { runtime: { createModelClient: async () => { throw new Error('secret transport body must not be persisted') } } } }),
    finish: async (...args) => { finishes.push(args) }
  })
  await processor.handle({ data: { attemptId: id } }, { ...scope, scopeKey: 'system:global' })
  assert.equal(finishes.length, 1); assert.equal(finishes[0][2], null); assert.equal(finishes[0][3], 'model_unavailable')
  assert.equal(row.report.title, '')
})
