import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { PythonClient, FundsError } from '../dist/lib/python-client.js'
import { FundsService } from '../dist/lib/service.js'
import { FundsView } from '../dist/lib/view.js'
import { FundsMiddleware, middlewareScope } from '../dist/lib/middleware.js'
import { runInput } from '../dist/lib/schemas.js'
import { workbenchSchema } from '../dist/shared/result-schema.js'
import plugin from '../dist/index.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const python =
  process.env.FUNDS_QUERY_PYTHON ||
  join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const scope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a' }
const context = { ...scope, hostType: 'agent', hostId: 'assistant-a', slots: [] }
const directory = await mkdtemp(join(tmpdir(), 'funds-integration-'))
const client = new PythonClient({
  pythonExecutable: python,
  dataDirectory: directory,
  timeoutMs: 30000,
  debug: false
})
const service = new FundsService(client),
  view = new FundsView(service)
let datasetId, queryId

test.after(async () => {
  await rm(directory, { recursive: true, force: true })
})
test('native metadata, appConfig and packaged template are aligned', () => {
  assert.equal(plugin.meta.name, '@xpert-ai/plugin-funds-query')
  assert.equal(plugin.meta.level, 'tenant')
  assert.equal(plugin.meta.artifactNamespace, 'funds_query')
  const app = plugin.meta.targetAppMeta.xpert.marketplace.contents.find((c) => c.type === 'app')
  assert.equal(app.appConfig.assistantTemplateKey, plugin.templates[0].key)
  assert.match(plugin.templates[0].dslContent, /sandbox:\s+enabled: false/)
  assert.match(plugin.templates[0].dslContent, /max_tokens: 16384/)
})
test('workbench manifest declares the exact bridge command and feature', () => {
  const [manifest] = view.getViewManifests(context, 'agent.workbench.main')
  assert.equal(manifest.view.runtime, 'vue')
  assert.equal(manifest.workbench.composerOwner, 'view')
  assert.deepEqual(manifest.activation.requiredFeatures, ['funds_query.analysis'])
  assert.deepEqual(
    manifest.clientCommands.map((c) => c.key),
    ['assistant.chat.send_message', 'assistant.chat.get_context', 'workbench.navigation.open']
  )
  assert.deepEqual(view.getViewManifests({ ...context, hostType: 'project' }, 'project.tabs'), [])
})
test('imports the real workbook through the view file action and Python process', async () => {
  const buffer = await readFile(join(root, 'examples/交易明细-标准样例.xlsx'))
  const result = await view.executeViewFileAction(
    context,
    'funds_query.workbench',
    'import',
    {},
    { buffer, originalname: '标准.xlsx', size: buffer.length }
  )
  assert.equal(result.success, true)
  assert.equal(result.data.dataset.rowCount, 12)
  datasetId = result.data.dataset.id
  const duplicate = await service.import(scope, '改名.xlsx', buffer)
  assert.equal(duplicate.reused, true)
  assert.equal(duplicate.dataset.id, datasetId)
})
test('bad import exposes actionable row numbers but never partially imports', async () => {
  const buffer = await readFile(join(root, 'examples/交易明细-错误样例.xlsx'))
  const result = await view.executeViewFileAction(
    context,
    'funds_query.workbench',
    'import',
    {},
    { buffer, originalname: '错误.xlsx' }
  )
  assert.equal(result.success, false)
  assert.equal(result.data.errorCode, 'validation_failed')
  assert.equal(result.data.details.issueCount, 3)
  const c = await service.context(scope)
  assert.equal(c.datasets.total, 1)
})
test('real pending, completed and failed query payloads pass the browser contract', async () => {
  const prepared = await service.prepare(scope, {
    datasetId, question: '状态切换回归', operationId: 'pending-contract-regression'
  })
  const load = async () => {
    const data = await view.getViewData(context, 'funds_query.workbench', {
      parameters: { operation: 'home', datasetId, queryId: prepared.queryId }
    })
    return workbenchSchema.parse(data.meta.workbench)
  }
  const pending = await load()
  assert.equal(pending.result.status, 'pending')
  assert.equal(pending.result.error, undefined)
  await service.run(scope, {
    datasetId, queryId: prepared.queryId,
    plan: { accountName: '张三', period: 'custom', startDate: '2026-10-01', endDate: '2026-10-31' }
  })
  const completed = await load()
  assert.equal(completed.result.status, 'completed')
  assert.equal(completed.result.amount, '90000.13')
  const failed = await service.prepare(scope, {
    datasetId, question: '发送失败回归', operationId: 'failed-contract-regression'
  })
  await service.dispatchFailed(scope, { datasetId, queryId: failed.queryId })
  const failureData = await view.getViewData(context, 'funds_query.workbench', {
    parameters: { operation: 'result', datasetId, queryId: failed.queryId }
  })
  const failure = workbenchSchema.parse(failureData.meta.workbench).result
  assert.equal(failure.status, 'failed')
  assert.match(failure.error, /未确认助手收到请求/)
  assert.equal(workbenchSchema.safeParse({
    ...failureData.meta.workbench, result: { ...failure, error: 123 }
  }).success, false)
})
test('home reload shows the latest pending or failed question instead of an older completed result', async () => {
  const prepared = await service.prepare(scope, {
    datasetId, question: '刷新恢复最新状态', operationId: 'reload-latest-status'
  })
  const home = async () => workbenchSchema.parse((await view.getViewData(context, 'funds_query.workbench', {
    parameters: { operation: 'home', datasetId }
  })).meta.workbench)
  const pending = await home()
  assert.equal(pending.result.queryId, prepared.queryId)
  assert.equal(pending.result.status, 'pending')
  await service.dispatchFailed(scope, { datasetId, queryId: prepared.queryId })
  const failed = await home()
  assert.equal(failed.result.queryId, prepared.queryId)
  assert.equal(failed.result.status, 'failed')
})
test('AI tool schema rejects SQL and unexpected identity injection', () => {
  for (const input of [
    { question: 'hi', plan: { sql: 'DROP TABLE' } },
    { question: 'hi', tenantId: 'other', plan: {} },
    { question: 'hi', plan: { limit: 1000 } }
  ])
    assert.equal(runInput.safeParse(input).success, false)
  assert.equal(
    runInput.safeParse({
      question: '张三上个月收款',
      plan: { accountName: '张三', period: 'last_month' }
    }).success,
    true
  )
  assert.throws(() => middlewareScope({ ...scope, organizationId: '' }))
})
test('middleware invokes real Python analytics and persists exact evidence', async () => {
  const middleware = new FundsMiddleware(service).createMiddleware(
    {},
    { ...scope, tools: new Map(), node: {}, runtime: {}, executionId: 'test-execution' }
  )
  assert.equal(middleware.name, 'FundsQueryMiddleware')
  assert.equal(middleware.tools.length, 4)
  const run = middleware.tools.find((t) => t.name === 'funds_query_run')
  const result = JSON.parse(
    await run.invoke({
      question: '2026年10月张三收款',
      plan: {
        accountName: '张三',
        period: 'custom',
        startDate: '2026-10-01',
        endDate: '2026-10-31'
      }
    })
  )
  assert.equal(result.amount, '90000.13')
  assert.equal(result.count, 4)
  queryId = result.queryId
  assert.equal(result.evidence.items[0].sourceRow, 3)
  assert.equal(result.dataset.id, datasetId)
})
test('saved result pagination and reload retain source evidence', async () => {
  const data = await view.getViewData(context, 'funds_query.workbench', {
    parameters: { operation: 'result', datasetId, queryId },
    page: 2,
    pageSize: 2
  })
  assert.equal(data.meta.workbench.result.evidence.total, 4)
  assert.deepEqual(
    data.meta.workbench.result.evidence.items.map((r) => r.transactionId),
    ['T005', 'T009']
  )
  const fresh = new FundsService(new PythonClient({ ...client.config }))
  assert.equal((await fresh.context(scope)).currentDataset.id, datasetId)
})
test('dataset collection is paginated by the Python store', async () => {
  const data = await view.getViewData(context, 'funds_query.workbench', {
    parameters: { operation: 'datasets' },
    page: 1,
    pageSize: 1
  })
  assert.equal(data.meta.workbench.context.datasets.pageSize, 1)
  assert.equal(data.meta.workbench.context.datasets.items.length, 1)
  assert.equal(data.meta.workbench.context.datasets.total, 1)
})
test('forged dataset and query identifiers cannot cross user or organization boundaries', async () => {
  for (const other of [
    { ...scope, userId: 'other' },
    { ...scope, organizationId: 'other' }
  ]) {
    assert.equal((await service.context(other)).datasets.total, 0)
    await assert.rejects(
      service.result(other, { datasetId, queryId }),
      (e) => e instanceof FundsError && e.code === 'dataset_not_found'
    )
  }
})
test('question dispatch is idempotent and contains explicit dataset and query identity', async () => {
  const request = {
    input: {
      datasetId,
      question: '按天展示收款',
      operationId: '00000000-0000-4000-8000-000000000001'
    }
  }
  const a = await view.executeViewAction(context, 'funds_query.workbench', 'prepare', request)
  const b = await view.executeViewAction(context, 'funds_query.workbench', 'prepare', request)
  assert.equal(a.success, true)
  assert.equal(a.data.queryId, b.data.queryId)
  assert.ok(a.data.prompt.includes(datasetId))
  assert.ok(a.data.prompt.includes(a.data.queryId))
})
test('missing Python and processing timeout are typed retryable failures', async () => {
  const missing = new PythonClient({
    ...client.config,
    pythonExecutable: join(directory, 'missing-python')
  })
  await assert.rejects(missing.call(scope, 'context'), (e) => e.code === 'python_unavailable')
  const timeout = new PythonClient({ ...client.config, timeoutMs: 1 })
  await assert.rejects(timeout.call(scope, 'context'), (e) => e.code === 'worker_timeout')
})
test('remote component uses actual built Vue assets and contains no web storage access', async () => {
  const entry = await view.getRemoteComponentEntry(context, 'funds_query.workbench', {
    entry: 'funds-query',
    isolation: 'iframe'
  })
  assert.match(entry.html, /资金交易问数/)
  const source = await readFile(join(root, 'src/remote/bridge.ts'), 'utf8')
  assert.doesNotMatch(source, /localStorage|sessionStorage/)
  assert.match(source, /event.source !== parent/)
})
test('large Unicode evidence survives Python stdout chunk boundaries', async () => {
  const program = `import io,sys\nfrom openpyxl import Workbook\nb=Workbook();s=b.active;s.append(['交易编号','交易时间','付款账号','付款方名称','收款账号','收款方名称','交易金额','交易摘要'])\nfor i in range(50):s.append([f'U{i:03d}','2026-10-01 00:00:00','A','付款方','B','收款方','1.23','中文证据'*120])\nf=io.BytesIO();b.save(f);sys.stdout.buffer.write(f.getvalue())`
  const generated = spawnSync(python, ['-c', program], { maxBuffer: 1024 * 1024 })
  assert.equal(generated.status, 0)
  const imported = await service.import(scope, '长摘要.xlsx', generated.stdout)
  const page = await client.call(scope, 'preview', { datasetId: imported.dataset.id, pageSize: 50 })
  assert.equal(page.items.length, 50)
  for (const row of page.items) assert.equal(row.summary, '中文证据'.repeat(120))
})
test('chat View and middleware persist the real reply and platform thread binding', async () => {
  const session = await service.createSession(scope, {datasetId, operationId: randomUUID()})
  const prepared = await service.prepare(scope, {datasetId, sessionId: session.id, question: '张三十月收款', operationId: randomUUID()})
  const runtime = {...scope, conversationId: randomUUID(), threadId: randomUUID(), executionId: randomUUID(), tools: new Map(), node: {}, runtime: {}}
  const middleware = new FundsMiddleware(service).createMiddleware({}, runtime)
  await middleware.tools.find(t => t.name === 'funds_query_context').invoke({queryId: prepared.queryId})
  await middleware.tools.find(t => t.name === 'funds_query_run').invoke({queryId: prepared.queryId, question: prepared.question,
    plan: {accountName: '张三', period: 'custom', startDate: '2026-10-01', endDate: '2026-10-31'}})
  const read = async () => workbenchSchema.parse((await view.getViewData(context, 'funds_query.workbench', {
    parameters: {operation: 'chat', datasetId, sessionId: session.id}
  })).meta.workbench)
  let data = await read()
  assert.equal(data.turns.items[0].result.amount, '90000.13')
  assert.equal(data.turns.items[0].replyStatus, 'pending')
  await middleware.wrapModelCall({runtime: {}}, async () => new AIMessage('实际模型的最终回复。\n\n这是下一段，支持正常换行。'))
  await middleware.afterAgent({Agent_FundsQuery: {messages: []}}, {})
  data = await read()
  assert.equal(data.session.conversationId, runtime.conversationId)
  assert.equal(data.session.threadId, runtime.threadId)
  assert.equal(data.turns.items[0].replyStatus, 'completed')
  assert.equal(data.turns.items[0].reply, '实际模型的最终回复。\n\n这是下一段，支持正常换行。')
})
test('same-session followups restore context while new sessions start without old filters', async () => {
  const session = await service.createSession(scope, {datasetId, operationId: randomUUID()})
  const first = await service.prepare(scope, {datasetId, sessionId: session.id, question: '超过五万', operationId: randomUUID()})
  await service.run(scope, {datasetId, queryId: first.queryId, question: first.question,
    plan: {accountName: '张三', period: 'custom', startDate: '2026-10-01', endDate: '2026-10-31', minAmount: '50000', minExclusive: true}})
  const follow = await service.prepare(scope, {datasetId, sessionId: session.id, question: '看交易明细', operationId: randomUUID()})
  assert.equal(follow.baseQueryId, first.queryId)
  const followResult = await service.run(scope, {datasetId, queryId: follow.queryId, question: follow.question, plan: {kind: 'transactions'}})
  assert.equal(followResult.amount, '60000.00')
  const other = await service.createSession(scope, {datasetId, operationId: randomUUID()})
  const independent = await service.prepare(scope, {datasetId, sessionId: other.id, question: '全部收款', operationId: randomUUID()})
  assert.equal(independent.baseQueryId, null)
  const result = await service.run(scope, {datasetId, queryId: independent.queryId, question: independent.question,
    plan: {accountName: '张三', period: 'custom', startDate: '2026-10-01', endDate: '2026-10-31'}})
  assert.equal(result.amount, '90000.13')
})
test('middleware refuses a query bound to a different platform conversation', async () => {
  const session = await service.createSession(scope, {datasetId, operationId: randomUUID()})
  const prepared = await service.prepare(scope, {datasetId, sessionId: session.id, question: '绑定校验', operationId: randomUUID()})
  const runtime = {...scope, conversationId: randomUUID(), threadId: randomUUID(), executionId: randomUUID(), tools: new Map(), node: {}, runtime: {}}
  const first = new FundsMiddleware(service).createMiddleware({}, runtime)
  await first.tools.find(t => t.name === 'funds_query_context').invoke({queryId: prepared.queryId})
  const wrong = new FundsMiddleware(service).createMiddleware({}, {...runtime, conversationId: randomUUID(), threadId: randomUUID()})
  await assert.rejects(wrong.tools.find(t => t.name === 'funds_query_context').invoke({queryId: prepared.queryId}), e => e.code === 'session_context_mismatch')
})
test('final reply cannot be copied from a previous user turn when this turn has no answer', async () => {
  const session = await service.createSession(scope, {datasetId, operationId: randomUUID()})
  const prepared = await service.prepare(scope, {datasetId, sessionId: session.id, question: '新问题', operationId: randomUUID()})
  const runtime = {...scope, conversationId: randomUUID(), threadId: randomUUID(), executionId: randomUUID(), tools: new Map(), node: {}, runtime: {}}
  const middleware = new FundsMiddleware(service).createMiddleware({}, runtime)
  await middleware.tools.find(t => t.name === 'funds_query_context').invoke({queryId: prepared.queryId})
  await middleware.afterAgent({messages: [new HumanMessage('上一题'), new AIMessage('上一题的答案'), new HumanMessage('新问题')]}, {})
  const data = await service.view(scope, 'chat', {datasetId, sessionId: session.id})
  assert.equal(data.turns.items[0].reply, '')
  assert.equal(data.turns.items[0].status, 'failed')
  assert.match(data.turns.items[0].result.error, /未返回可显示的回答/)
})
test('host invocation config supplies execution identity and root afterAgent state is supported', async () => {
  const session = await service.createSession(scope, {datasetId, operationId: randomUUID()})
  const prepared = await service.prepare(scope, {datasetId, sessionId: session.id, question: '实际宿主上下文', operationId: randomUUID()})
  const hostContext = {...scope, conversationId: randomUUID(), threadId: randomUUID(), tools: new Map(), node: {}, runtime: {}}
  const config = {configurable: {thread_id: hostContext.threadId, executionId: randomUUID()}}
  const middleware = new FundsMiddleware(service).createMiddleware({}, hostContext)
  await middleware.beforeAgent({}, config)
  await middleware.beforeModel({messages: []}, config)
  await middleware.tools.find(t => t.name === 'funds_query_context').invoke({queryId: prepared.queryId}, config)
  await middleware.tools.find(t => t.name === 'funds_query_run').invoke({queryId: prepared.queryId, question: prepared.question,
    plan: {accountName: '张三', period: 'custom', startDate: '2026-10-01', endDate: '2026-10-31'}}, config)
  const response = new AIMessage('来自本轮模型调用的回答。')
  assert.equal(await middleware.wrapModelCall({runtime: config}, async () => response), response)
  await middleware.afterAgent({Agent_FundsQuery: {messages: [response]}}, config)
  const data = await service.view(scope, 'chat', {datasetId, sessionId: session.id})
  assert.equal(data.turns.items[0].reply, '来自本轮模型调用的回答。')
  assert.equal(data.turns.items[0].result.amount, '90000.13')
  assert.equal(data.session.threadId, hostContext.threadId)
})
test('missing execution identity still fails closed and model input cannot supply identity', async () => {
  const session = await service.createSession(scope, {datasetId, operationId: randomUUID()})
  const prepared = await service.prepare(scope, {datasetId, sessionId: session.id, question: '缺少执行编号', operationId: randomUUID()})
  const middleware = new FundsMiddleware(service).createMiddleware({}, {...scope, conversationId: randomUUID(), threadId: randomUUID(), tools: new Map(), node: {}, runtime: {}})
  const read = middleware.tools.find(t => t.name === 'funds_query_context')
  await assert.rejects(read.invoke({queryId: prepared.queryId}), e => e.code === 'runtime_required')
  await assert.rejects(read.invoke({queryId: prepared.queryId, executionId: randomUUID()}))
})
