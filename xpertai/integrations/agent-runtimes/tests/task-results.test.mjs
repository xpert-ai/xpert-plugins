import { createHash } from 'node:crypto'
import { agentPrompt } from '../dist/lib/input.js'
import { managedOptions } from './managed-fixture.mjs'
import 'reflect-metadata'
import { test } from 'node:test'
import { RunnableLambda } from '@langchain/core/runnables'
import assert from 'node:assert/strict'
import { taskResult, resolveTaskResult, resultInstructions, deliveryPaths, appendReportText } from '../dist/lib/task-result.js'
import { taskResourceCards, emitTaskResults } from '../dist/lib/result-cards.js'
import { AgentInvocationMiddleware } from '../dist/lib/invocation.middleware.js'
const items = [
  { type: 'analysis', id: 'review', title: 'Review', summary: 'No issues' },
  {
    type: 'changes',
    id: 'changes',
    title: 'Code changes',
    summary: 'Added code',
    files: [{ path: 'calculator.py', change: 'created' }]
  },
  {
    type: 'tests',
    id: 'tests',
    title: 'Tests',
    summary: '3 tests passed',
    status: 'passed',
    command: 'python -m unittest'
  },
  { type: 'file', id: 'report', title: 'Report', summary: 'Results', path: 'report.txt' }
]
const markdown = '# 验收报告\n尚未完成部署。\n```json\n{"version":1,"summary":{}}\n```'
test('keeps ordinary Markdown verbatim without interpreting JSON examples or verdict words', async () => {
  const result = await resolveTaskResult(markdown, { mode: 'none' }, async () => assert.fail('unexpected file read'))
  assert.equal(result.text, markdown)
  assert.equal(result.items, undefined)
  assert.equal(result.report, undefined)
  assert.equal(resultInstructions({ mode: 'none' }), '')
  assert.equal(agentPrompt({ prompt: 'Return the value' }), 'Return the value')
})
test('reads only the preselected report path and keeps failed delivery separate from execution', async () => {
  const delivery = { mode: 'none', reportPath: 'output/report.md' }
  const sha256 = createHash('sha256').update(markdown).digest('hex')
  const result = await resolveTaskResult('brief reply', delivery, async path => {
    assert.equal(path, delivery.reportPath)
    return { text: markdown, sha256 }
  })
  assert.equal(result.text, markdown)
  assert.deepEqual(result.report, { status: 'completed', path: delivery.reportPath, sha256 })
  const failed = await resolveTaskResult('done', delivery, async () => { throw Error('secret') })
  assert.equal(failed.text, '')
  assert.deepEqual(failed.report, { status: 'failed', path: delivery.reportPath, code: 'report_unavailable' })
  assert.doesNotMatch(JSON.stringify(failed), /secret/)
})
test('ordinary empty replies and artifact-only tasks do not require a report', async () => {
  for (const text of ['', '  ']) {
    const result = await resolveTaskResult(text, { mode: 'none' }, () => assert.fail('unexpected read'))
    assert.deepEqual(result, { text, export: { mode: 'none', status: 'not_requested' } })
  }
  const result = taskResult('', { mode: 'files', paths: ['plugin.tgz'] })
  assert.equal(result.report, undefined)
  assert.equal(result.export.mode, 'files')
  assert.doesNotMatch(resultInstructions({ mode: 'files', paths: ['plugin.tgz'] }), /report|Markdown|independent evidence/)
})
test('only explicitly selected reports reject empty or oversized file content', async () => {
  for (const [text, code] of [['  ', 'report_empty'], ['a'.repeat(4 * 1024 * 1024 + 1), 'report_too_large']]) {
    const result = await resolveTaskResult('', { mode: 'none', reportPath: 'report.md' }, async () => ({ text, sha256: 'ignored' }))
    assert.equal(result.text, '')
    assert.deepEqual(result.report, { status: 'failed', path: 'report.md', code })
  }
})
test('result resources are stable, provider-neutral and emitted only after completion', async () => {
  const task = {
    id: 'task',
    status: 'succeeded',
    result: { ...taskResult('Done'), items, artifacts: [{ id: 'artifact', name: 'report.txt' }] }
  }
  const cards = taskResourceCards(task)
  assert.equal(cards.length, 4)
  assert.ok(cards.every((card) => card.open.viewKey === 'platform.agent-results__results'))
  assert.deepEqual(taskResourceCards({ ...task, status: 'running' }), [])
  const events = []
  const config = {
    callbacks: [
      {
        handleCustomEvent(name, data) {
          events.push({ name, data })
        }
      }
    ]
  }
  const runnable = RunnableLambda.from(async (_input, config) => emitTaskResults(task, config))
  await runnable.invoke({}, config)
  await runnable.invoke({}, config)
  assert.equal(events.length, 8)
  assert.deepEqual(
    events.slice(0, 4).map((e) => e.data.id),
    events.slice(4).map((e) => e.data.id)
  )
  assert.equal(events[0].data.type, 'resource_card')
  assert.equal(events[0].data.messageId, undefined)
  assert.equal(events.at(-1).data.data.resource.artifactId, 'artifact')
})
test('launch defaults to no delivery; only an explicit archive request reaches the runtime', async () => {
  let received
  const api = {
    listManaged: async () => managedOptions,
    resolveManaged: async () => ({}),
    awaitResult: async () => ({ id: 'task', status: 'running' }),
    start: async (request) => {
      received = request
      return { id: 'task', status: 'running' }
    }
  }
  const tools = new AgentInvocationMiddleware().createMiddleware(
    {},
    { runtime: { capabilities: { require: () => api } } }
  ).tools
  const config = { configurable: { tool_call_id: 'call' } }
  await tools[0].invoke({ prompt: 'Fix tests' }, config)
  assert.deepEqual(received.input.delivery, { mode: 'none' })
  await tools[0].invoke({ prompt: 'Export', delivery: { mode: 'archive', paths: ['report.txt'] } }, config)
  assert.equal(received.input.delivery.mode, 'archive')
})

test('unknown artifact paths remain recoverable even when a report path is selected', () => {
  assert.deepEqual(deliveryPaths({ mode: 'files', reportPath: 'output/report.md' }), [])
  assert.deepEqual(deliveryPaths({ mode: 'files', paths: ['plugin.tgz'], reportPath: 'output/report.md' }), ['plugin.tgz', 'output/report.md'])
})
test('bounded streaming marks reply overflow without inventing a report failure', () => {
  const text = appendReportText('a'.repeat(4 * 1024 * 1024), 'overflow')
  assert.deepEqual(taskResult(text), { text: '', textTruncated: true, export: { mode: 'none', status: 'not_requested' } })
  assert.equal(appendReportText(text, 'later'), text)
})
test('a direct adapter without a file reader cannot substitute a brief final reply for a selected report', () => {
  assert.equal(taskResult('report written', { mode: 'none', reportPath: 'report.md' }).report.code, 'report_unavailable')
})
