import { managedOptions } from './managed-fixture.mjs'
import 'reflect-metadata'
import { test } from 'node:test'
import { RunnableLambda } from '@langchain/core/runnables'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { taskResult, resolveTaskResult, resultInstructions, deliveryPaths, outputDelivery, appendReportText } from '../dist/lib/task-result.js'
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
test('ordinary text, JSON and retired envelopes stay unchanged and never select a file', async () => {
  for (const text of ['', '中文🙂', '{"version":1,"summary":"literal JSON","items":[]}', '```xpert-task-result-file\n{"path":"secret"}\n```']) {
    const result = await resolveTaskResult(text, { mode: 'none' }, async () => assert.fail('unrequested read'))
    assert.equal(result.text, text)
    assert.equal(result.items, undefined)
    assert.equal(result.report, undefined)
  }
})
test('only the caller-selected Markdown report is read verbatim and hashed', async () => {
  const text = '# Review\n\n中文🙂 "quote" \\ path\n'
  const result = await resolveTaskResult('model names other.md', { mode: 'none', reportPath: 'output/report.md' }, async path => {
    assert.equal(path, 'output/report.md')
    return { text, sha256: 'not-trusted' }
  })
  assert.equal(result.text, text)
  assert.deepEqual(result.report, { status: 'completed', path: 'output/report.md', sha256: createHash('sha256').update(text).digest('hex') })
  assert.deepEqual(result.export, { mode: 'none', status: 'not_requested' })
  assert.equal(result.artifacts, undefined)
})
test('missing, empty, oversized and unreadable reports produce safe separate delivery failures', async () => {
  const delivery = { mode: 'none', reportPath: 'review.md' }
  for (const [reader, code] of [[undefined, 'report_unavailable'], [async () => { throw Error('private contents') }, 'report_unavailable'], [async () => ({ text: '  ' }), 'report_empty'], [async () => ({ text: '中'.repeat(1500000) }), 'report_too_large']]) {
    const result = await resolveTaskResult('The report passed!', delivery, reader)
    assert.equal(result.text, '')
    assert.deepEqual(result.report, { status: 'failed', path: 'review.md', code })
    assert.equal(JSON.stringify(result).includes('private contents'), false)
  }
  assert.equal(taskResult('success claim', delivery).text, '')
})
test('oversized replies do not become partial evidence; limits count UTF-8 bytes', async () => {
  assert.deepEqual(await resolveTaskResult('中文', { mode: 'none' }, undefined, 5), {
    text: '', textTruncated: true, export: { mode: 'none', status: 'not_requested' }
  })
  assert.equal((await resolveTaskResult('中文', { mode: 'none' }, undefined, 6)).text, '中文')
  assert.equal(taskResult('a'.repeat(2 * 1024 * 1024)).textTruncated, undefined)
  assert.equal(taskResult('a'.repeat(2 * 1024 * 1024 + 1)).textTruncated, true)
})
test('bounded streaming marks reply overflow without inventing a report failure', () => {
  const text = appendReportText('a'.repeat(4 * 1024 * 1024), 'overflow')
  assert.deepEqual(taskResult(text), { text: '', textTruncated: true, export: { mode: 'none', status: 'not_requested' } })
  assert.equal(appendReportText(text, 'later'), text)
})
test('instructions describe optional reports and only caller-authorized artifact selection', () => {
  assert.doesNotMatch(resultInstructions({ mode: 'none' }), /xpert-task-result/)
  assert.match(resultInstructions({ mode: 'none', reportPath: 'review.md' }, true), /UTF-8 Markdown/)
  assert.match(resultInstructions({ mode: 'none', reportPath: 'review.md' }), /cannot transfer/)
  assert.deepEqual(deliveryPaths({ mode: 'files', paths: ['review.md', 'code.py'], reportPath: 'review.md' }), ['review.md', 'code.py'])
  assert.deepEqual(deliveryPaths({ mode: 'files' }), [])
  assert.deepEqual(deliveryPaths({ mode: 'files', reportPath: 'review.md' }), ['review.md'])
  for (const path of ['../secret', '/etc/passwd', 'a//b', 'a\\b'])
    assert.throws(() => outputDelivery({ mode: 'none', reportPath: path }))
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
