import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { IsNull } from 'typeorm'
import { parseExperimentCsv, computeExperimentStatistics } from '../dist/lib/experiment-statistics.js'
import { RfidExperimentInsightService } from '../dist/lib/rfid-experiment-insight.service.js'
import { RfidExperimentInsightMiddleware } from '../dist/lib/rfid-experiment-insight.middleware.js'
import { RfidExperimentInsightViewProvider } from '../dist/lib/rfid-experiment-insight-view.provider.js'
import { rfidExperimentInsightTemplates } from '../dist/lib/rfid-experiment-insight.templates.js'

const header = 'experiment_id,distance_m,angle_deg,environment,accuracy,rssi_std,phase_dispersion'
const csv = `${header}\na,1,0,lab,0.9,2,0.1\nb,1,0,lab,1,4,0.2\nc,3,0,lab,0.7,6,0.3`
const summary = { overallTrend: 'Trend', mostDegradedCondition: 'Condition', signalQualityObservation: 'Observation', suggestedFollowUp: 'Repeat' }
const scope = { tenantId: 'tenant-1', organizationId: 'org-1', workspaceId: 'workspace-1', userId: 'user-1' }
const attemptOf = ({ analysisId, attemptId }) => ({ analysisId, attemptId })

test('CSV supports BOM, quoted commas, escaped quotes and CRLF', () => {
  assert.equal(parseExperimentCsv(`\uFEFF${header}\r\na,1,0,"lab, ""A""",0.9,2,0.1\r\n`)[0].environment, 'lab, "A"')
})
test('CSV rejects missing/duplicate columns, empty data, invalid numbers and duplicate ids', () => {
  for (const invalid of [header, csv.replace('phase_dispersion', 'wrong'), csv.replace('angle_deg', 'accuracy'), csv.replace('0.9', '90'), csv.replace('0.9', 'NaN'), csv.replace('0.9', '0x1'), csv.replace('a,1', 'a,-1'), csv.replace('b,1', 'a,1'), csv.replace(',2,', ',,'), csv + '\n"unfinished']) assert.throws(() => parseExperimentCsv(invalid))
})
test('statistics group conditions, weight overall average and preserve signed differences', () => {
  const stats = computeExperimentStatistics(parseExperimentCsv(csv))
  assert.equal(stats.record_count, 3)
  assert.equal(stats.conditions.length, 2)
  assert.ok(Math.abs(stats.average_accuracy - 2.6 / 3) < 1e-12)
  assert.equal(stats.best_condition.distance_m, 1)
  assert.equal(stats.best_condition.record_count, 2)
  assert.equal(stats.worst_condition.distance_m, 3)
  assert.ok(Math.abs(stats.accuracy_drop_vs_best - 0.25) < 1e-12)
  assert.equal(stats.rssi_std_change, 3)
  assert.ok(Math.abs(stats.phase_dispersion_change - 0.15) < 1e-12)
  assert.deepEqual(computeExperimentStatistics(parseExperimentCsv(csv).reverse()), stats)
})
test('single condition and tied conditions yield deterministic choices without fabricated degradation', () => {
  const row = parseExperimentCsv(csv)[0]
  const stats = computeExperimentStatistics([row, { ...row, experiment_id: 'other', distance_m: 2 }])
  assert.equal(stats.accuracy_drop_vs_best, 0)
  assert.equal(stats.best_condition.distance_m, 1)
  assert.equal(stats.worst_condition.distance_m, 1)
  assert.equal(computeExperimentStatistics([row]).rssi_std_change, 0)
})

// In-memory repository models SQL equality/IS NULL and compare-and-set. Real database integration is separate.
function repository() {
  const rows = new Map()
  const matches = (record, where) => Object.entries(where).every(([key, value]) => value instanceof IsNull().constructor ? record[key] === null || record[key] === undefined : record[key] === value)
  return {
    rows,
    async find({ where, take } = {}) { return [...rows.values()].filter((row) => matches(row, where ?? {})).slice(0, take).map((row) => structuredClone(row)) },
    async findOne({ where }) { const row = [...rows.values()].find((row) => matches(row, where)); return row ? structuredClone(row) : null },
    async update(where, patch) { let affected = 0; for (const row of rows.values()) if (matches(row, where)) { Object.assign(row, structuredClone(patch)); affected++ } return { affected } },
    createQueryBuilder() {
      let input
      const builder = { insert: () => builder, into: () => builder, values: (value) => { input = value; return builder }, orIgnore: () => builder,
        execute: async () => { if (![...rows.values()].some((row) => row.importKey === input.importKey)) { const id = randomUUID(); rows.set(id, { id, ...structuredClone(input), createdAt: new Date(), updatedAt: new Date() }) } } }
      return builder
    }
  }
}
function setup() {
  const repo = repository()
  const service = new RfidExperimentInsightService(repo)
  const middleware = new RfidExperimentInsightMiddleware(service).createMiddleware({}, scope)
  return { repo, service, middleware, tools: Object.fromEntries(middleware.tools.map((tool) => [tool.name, tool])) }
}
const input = () => ({ requestId: randomUUID(), name: 'Experiment', fileName: 'test.csv', csv })
async function begin(service) {
  const record = await service.importCsv(scope, input())
  const prepared = await service.prepareAnalysis(scope, record.id)
  return { record, prepared, attempt: attemptOf(prepared) }
}

test('upload replay is idempotent; completed interpretation requires explicit human confirmation', async () => {
  const { repo, service } = setup()
  const upload = input(), record = await service.importCsv(scope, upload)
  assert.equal((await service.importCsv(scope, upload)).id, record.id)
  await assert.rejects(service.confirmAnalysis(scope, record.id, true))
  const attempt = attemptOf(await service.prepareAnalysis(scope, record.id))
  const result = await service.saveInterpretation(scope, attempt, summary)
  assert.equal(result.status, 'COMPLETED')
  assert.equal(result.confirmedAt, null)
  await assert.rejects(service.confirmAnalysis(scope, record.id, false))
  await service.confirmAnalysis(scope, record.id, true)
  const restored = new RfidExperimentInsightService(repo)
  assert.ok((await restored.getWorkbenchData(scope, record.id)).item.confirmedAt)
  assert.equal(repo.rows.size, 1)
})
test('tenant/user/organization/workspace/project boundaries isolate analyses', async () => {
  const { service } = setup(), { record } = await begin(service)
  for (const changed of [{ tenantId: 'other' }, { userId: 'other' }, { organizationId: null }, { workspaceId: 'other' }, { projectId: 'other' }]) await assert.rejects(service.getWorkbenchData({ ...scope, ...changed }, record.id))
  await assert.rejects(service.getWorkbenchData({ ...scope, userId: '' }, record.id))
})
test('Workbench → Assistant command → Middleware statistics → save tool preserves review boundary', async () => {
  const { service, tools, middleware } = setup()
  const view = new RfidExperimentInsightViewProvider(service)
  const context = { ...scope, hostType: 'agent', hostId: 'assistant-1' }
  const record = await service.importCsv(scope, input())
  const response = await view.executeViewAction(context, 'workbench', 'analyze_experiment', { input: { analysisId: record.id } })
  assert.equal(response.success, true)
  const prepared = response.data
  assert.equal(prepared.command.type, 'assistant-message')
  assert.equal(prepared.command.commandKey, 'assistant.chat.send_message')
  assert.ok(prepared.command.payload.text.includes(prepared.attemptId))
  const attempt = attemptOf(prepared)
  assert.deepEqual(JSON.parse(await tools.analyze_experiment.invoke(attempt)).statistics, record.statistics)
  const completed = JSON.parse(await tools.save_analysis.invoke({ ...attempt, aiSummary: summary }))
  await middleware.afterAgent()
  assert.equal(completed.status, 'COMPLETED')
  assert.equal(completed.confirmedAt, null)
  assert.deepEqual((await service.getWorkbenchData(scope, record.id)).item.aiSummary, summary)
})
test('model failure hook persists FAILED without leaking provider messages; retry reuses record', async () => {
  const { repo, service, tools, middleware } = setup(), { record, attempt } = await begin(service)
  await tools.analyze_experiment.invoke(attempt)
  await assert.rejects(middleware.wrapModelCall({}, async () => { throw new Error('provider secret-token') }))
  const failed = (await service.getWorkbenchData(scope, record.id)).item
  assert.equal(failed.status, 'FAILED')
  assert.ok(!failed.errorMessage.includes('secret-token'))
  assert.deepEqual(failed.statistics, record.statistics)
  const retry = attemptOf(await service.prepareAnalysis(scope, record.id))
  assert.notEqual(retry.attemptId, attempt.attemptId)
  await service.saveInterpretation(scope, retry, summary)
  assert.equal(repo.rows.size, 1)
})
test('Assistant finishing without saving transitions to FAILED', async () => {
  const { service, tools, middleware } = setup(), { record, attempt } = await begin(service)
  await tools.analyze_experiment.invoke(attempt)
  await middleware.afterAgent()
  assert.equal((await service.getWorkbenchData(scope, record.id)).item.status, 'FAILED')
})
test('malformed or extra tool fields are rejected; duplicate saves do not replace reviewed output', async () => {
  const { service, tools } = setup(), { attempt } = await begin(service)
  await assert.rejects(tools.analyze_experiment.invoke({ ...attempt, tenantId: 'other' }))
  await assert.rejects(tools.save_analysis.invoke({ ...attempt, aiSummary: { overallTrend: 'incomplete' } }))
  await service.saveInterpretation(scope, attempt, summary)
  assert.deepEqual((await service.saveInterpretation(scope, attempt, { ...summary, overallTrend: 'replace' })).aiSummary, summary)
})
test('concurrent starts create one active attempt and stale callbacks cannot overwrite retry', async () => {
  const { repo, service } = setup(), record = await service.importCsv(scope, input())
  const results = await Promise.allSettled([service.prepareAnalysis(scope, record.id), service.prepareAnalysis(scope, record.id)])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  const old = attemptOf(results.find((result) => result.status === 'fulfilled').value)
  await service.reportFailure(scope, old, 'dispatch')
  const retry = attemptOf(await service.prepareAnalysis(scope, record.id))
  await assert.rejects(service.saveInterpretation(scope, old, summary))
  await service.reportFailure(scope, old, 'model')
  assert.equal((await service.getWorkbenchData(scope, record.id)).item.status, 'ANALYZING')
  await service.saveInterpretation(scope, retry, summary)
  assert.equal(repo.rows.size, 1)
})
test('expiry recovers interrupted work after restart, including failures before the first Tool call', async () => {
  const { repo, service } = setup(), { record, attempt } = await begin(service)
  repo.rows.get(record.id).attemptDeadline = '1'
  const restarted = new RfidExperimentInsightService(repo)
  const recovered = (await restarted.getWorkbenchData(scope, record.id)).item
  assert.equal(recovered.status, 'FAILED')
  assert.deepEqual(recovered.statistics, record.statistics)
  await assert.rejects(restarted.saveInterpretation(scope, attempt, summary))
})
test('view file action validates bytes and reports dispatch failure on the same attempt', async () => {
  const { service } = setup(), view = new RfidExperimentInsightViewProvider(service)
  const context = { ...scope, hostType: 'agent', hostId: 'assistant-1' }
  const uploaded = await view.executeViewFileAction(context, 'workbench', 'upload_csv', { input: { requestId: randomUUID(), name: 'CSV experiment' } }, { originalname: 'test.csv', buffer: Buffer.from(csv) })
  assert.equal(uploaded.success, true)
  const prepared = await service.prepareAnalysis(scope, uploaded.data.id)
  const failed = await view.executeViewAction(context, 'workbench', 'report_dispatch_failure', { input: attemptOf(prepared) })
  assert.equal(failed.success, true)
  assert.equal((await service.getWorkbenchData(scope, uploaded.data.id)).item.status, 'FAILED')
  const invalid = await view.executeViewFileAction(context, 'workbench', 'upload_csv', { input: {} }, { buffer: Buffer.from([0xff]) })
  assert.equal(invalid.success, false)
})
test('Assistant template binds the registered middleware and interpretation tools', () => {
  const template = rfidExperimentInsightTemplates[0]
  assert.ok(template.dslContent.includes('provider: RfidExperimentInsightMiddleware'))
  assert.ok(template.dslContent.includes('analyze_experiment'))
  assert.ok(template.dslContent.includes('save_analysis'))
  assert.ok(!template.dslContent.includes('procurement'))
})
