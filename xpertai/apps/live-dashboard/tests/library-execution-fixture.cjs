const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { setup } = require('./service-fixture.cjs')
const { services, entities } = require('./library-v2-fixture.cjs')
const { normalizeAnalyticsResult } = require('@xpert-ai/plugin-sdk/analytics')
const { AnalyticsDefinitionAuthoringCapability } = require('@xpert-ai/plugin-sdk')
const { DashboardSaveRequests } = require('../dist/lib/save-requests.js')
const { LibraryExecutionResolution } = require('../dist/lib/library/execution-resolution.js')
const { LibraryDatasetBindingService } = require('../dist/lib/library/dataset-binding.service.js')
const { LibraryTaskPreparationService } = require('../dist/lib/library/task-preparation.service.js')
const { LibraryTemplateExecutionService } = require('../dist/lib/library/template-execution.service.js')
const { encodePackage } = require('../dist/lib/library/archive.js')
const { buildExecutionPackage } = require('./library-execution-package.cjs')
const source = require('../examples/postgres-sales.json').bindings[0].source

async function executionFixture(db, packageBytes = encodePackage(buildExecutionPackage())) {
  const f = services(db), host = setup(), jobs = new Map(), redisState = new Map(), definitions = new Map()
  Object.assign(f.context, { workspaceId: randomUUID() }); Object.assign(host.context, f.context)
  let failSubmit = false
  const queue = { async getRedis() { return {
    async get(key) { return redisState.get(key) ?? null }, async set(key, value) { redisState.set(key, value) },
    async eval(_script, _n, dedupe, key, id, value) { if (redisState.has(dedupe)) return redisState.get(dedupe); redisState.set(dedupe, id); redisState.set(key, value); return id }
  } }, async enqueue(input) { if (failSubmit) { failSubmit = false; throw Error('ENQUEUE_INTERRUPTED') }
    jobs.set(input.jobId, { ...input, state: 'waiting' }); return { jobId: input.jobId } }, async getJob({ jobId }) { return jobs.get(jobId) } }
  const hostFiles = host.capabilities['platform.workspace.files'], upload = hostFiles.uploadBuffer
  hostFiles.uploadBuffer = async input => { const result = await upload(input); return { ...result, workspacePath: result.filePath } }
  hostFiles.deleteFile = async ref => { host.files.delete(ref.filePath) }
  const authoring = { async catalog() { return [{ providerId: 'file.table', connectionKey: 'workspace' }] },
    async register(scope, input) {
      const ref = await scope.files.resolveRuntimeReference(input.definition.path)
      assert.equal(ref.source, 'platform.workspace.files')
      await assert.rejects(scope.files.resolveRuntimeReference('/workspace/other.json'), /PATH_INVALID/)
      const definition = { ...input.definition, ref }
      const previous = definitions.get(input.requestId)
      if (previous) assert.deepEqual(previous, definition)
      definitions.set(input.requestId, definition)
      return { discoveryRequest: { source, providerId: 'file.table', request: { id: input.requestId } } }
    } }
  const analytics = {
    async list() { return [{ source, providers: [{ id: 'file.table' }] }] },
    async discover(_actor, request) {
      const d = definitions.get(request.request.id)
      return { items: [{ id: request.request.id, ...request.request.inspect ? { metadata: { binding: {
        operation: 'query', contractVersion: 1, id: 'data', source, providerId: 'file.table', parameters: [],
        payload: { id: request.request.id }, output: { datasetId: 'data', grain: [], fields: d.columns.map(c => ({ id: c.key, sourceField: c.key,
          label: c.label, logicalType: c.logicalType, nullable: c.nullable, role: c.role })) }
      } } } : { inspectRequest: { ...request.request, inspect: true } } }], queryContract: { payloadSchema: {}, instructions: '' } }
    },
    async query(actor, input) {
      if (host.calls.denied) throw Error('SOURCE_ACCESS_REVOKED')
      const d = definitions.get(input.binding.payload.id)
      const rows = JSON.parse(f.runtime.state.files.get(d.ref.filePath).toString())
      return normalizeAnalyticsResult(input.binding, { columns: d.columns.map(c => ({ key: c.key })), rows,
        sourceFetchedAt: new Date().toISOString(), completeness: { returnedRows: rows.length, totalRows: rows.length,
          totalAccuracy: 'exact', scope: 'full_query_result', truncated: false } }, randomUUID(), 10000)
    }
  }
  f.runtime.capabilities[AnalyticsDefinitionAuthoringCapability.id] = authoring
  f.runtime.capabilities['platform.analytics'] = analytics
  host.capabilities['platform.analytics'] = analytics
  const runtime = { require: token => host.capabilities[token.id] }
  const saves = new DashboardSaveRequests(host.service, runtime, queue)
  const resolution = new LibraryExecutionResolution(f.catalog, f.runtime)
  const custom = new Map()
  const bindings = new LibraryDatasetBindingService(f.catalog, host.service, { async open(_context, id) {
    const record = custom.get(id); if (!record) throw Error('DATASET_DENIED'); return record
  } }, f.runtime)
  const tasks = new LibraryTaskPreparationService(resolution, bindings, f.runtime)
  const make = () => new LibraryTemplateExecutionService(db.getRepository(entities.LibraryExecutionRecord), resolution, bindings, saves, host.service)
  const prepared = await f.transfers.prepare(f.context, packageBytes, 'reuse', randomUUID())
  await f.transfers.commit(f.context, prepared.importId)
  const task = (await f.catalog.list(f.context, { kind: 'example-task' })).items[0]
  return { ...f, host, definitions, resolution, bindings, tasks, saves, jobs, redisState, custom, make, task, execution: make(),
    request() { return { releaseId: task.releaseId, requestId: randomUUID(), title: 'Synthetic sales analysis' } },
    failSubmit() { failSubmit = true },
    async run(result) {
      const job = [...jobs.values()].find(job => job.payload.requestId === result.requestId)
      assert.ok(job); job.state = 'active'
      try { await saves.handle({ data: job.payload }, f.context); job.state = 'completed' } catch (error) { job.state = 'failed'; throw error }
    }
  }
}
module.exports = { executionFixture }
