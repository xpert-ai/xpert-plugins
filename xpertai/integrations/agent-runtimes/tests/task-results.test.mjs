import { managedOptions } from './managed-fixture.mjs'
import 'reflect-metadata'
import { test } from 'node:test'
import { RunnableLambda } from '@langchain/core/runnables'
import assert from 'node:assert/strict'
import { taskResult, resolveTaskResult, resultInstructions } from '../dist/lib/task-result.js'
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
const encode = (items) => '```xpert-task-result\n' + JSON.stringify({ version: 1, summary: 'Done', items }) + '\n```'
const reference = { version: 1, path: 'output/envelope.json', sha256: 'a'.repeat(64) }
const fileResult = (value = reference) => '```xpert-task-result-file\n' + JSON.stringify(value) + '\n```'
test('explicit result file preserves exact report text and existing delivery policy', async () => {
  const summary = JSON.stringify({ verdict: 'changes_required', summary: '中文🙂 "quote" \\ path\nline' })
  const result = await resolveTaskResult(fileResult(), { mode: 'none' }, async value => {
    assert.deepEqual(value, reference)
    return { version: 1, summary, items }
  })
  assert.equal(result.text, summary)
  assert.deepEqual(result.items, items)
  assert.deepEqual(result.export, { mode: 'none', status: 'not_requested' })
  assert.equal(result.artifacts, undefined)
})
test('file format is advertised only with runner support; prose and inline results do not read files', async () => {
  assert.doesNotMatch(resultInstructions({ mode: 'none' }), /result-file submission/)
  assert.match(resultInstructions({ mode: 'none' }, true), /result-file submission v1/)
  for (const text of ['created output/envelope.json', encode(items)]) {
    const result = await resolveTaskResult(text, { mode: 'none' }, async () => assert.fail('unexpected read'))
    assert.deepEqual(result, taskResult(text))
  }
})
test('invalid or unsupported explicit file submission fails without leaking data or falling back to prose', async () => {
  let reads = 0
  for (const text of [fileResult({ ...reference, path: '../secret' }), fileResult({ ...reference, sha256: 'bad' }),
    fileResult({ ...reference, extra: 'secret' }), fileResult() + '\n' + fileResult(), '```xpert-task-result-file\n{broken}\n```',
    fileResult() + '\nUnrequested trailing text']) {
    await assert.rejects(resolveTaskResult(text, { mode: 'none' }, async () => {
      reads++
      return { version: 1, summary: 'must not read', items: [] }
    }), /could not be validated/)
  }
  assert.equal(reads, 0)
  await assert.rejects(resolveTaskResult(fileResult(), { mode: 'none' }), /could not be validated/)
  await assert.rejects(resolveTaskResult(fileResult(), { mode: 'none' }, async () => {
    throw Error('private file contents')
  }), error => !error.message.includes('private file contents'))
  await assert.rejects(resolveTaskResult(fileResult(), { mode: 'none' }, async () => ({ version: 1, summary: {}, items: [] })))
})
test('inline output limits cannot hide an invalid file reference or promote a prose suffix into a read', async () => {
  let reads = 0
  const reader = async () => { reads++; return { version: 1, summary: 'must not read', items: [] } }
  await assert.rejects(resolveTaskResult(fileResult({ ...reference, sha256: 'bad'.repeat(100) }), { mode: 'none' }, reader, 64))
  const suffix = fileResult()
  const result = await resolveTaskResult('Ordinary prose mentioning this example:\n' + suffix, { mode: 'none' }, reader, suffix.length)
  assert.equal(result.text, suffix)
  assert.equal(result.items, undefined)
  assert.equal(reads, 0)
})
test('explicit typed envelope is parsed without guessing prose or permitting caller-controlled URLs', () => {
  assert.deepEqual(taskResult(encode(items)).items, items)
  assert.deepEqual(taskResult(encode(items).replace('```xpert-task-result', '```json')).items, items)
  assert.deepEqual(taskResult(JSON.stringify({ version: 1, summary: 'Done', items })).items, items)
  assert.equal(taskResult('Here is the result: ' + encode(items)).items, undefined)
  assert.equal(taskResult(JSON.stringify({ version: 2, summary: 'Done', items })).items, undefined)
  for (const text of [
    'fixed report.txt and all tests passed',
    JSON.stringify({ title: 'fake', url: 'https://example.com' })
  ])
    assert.equal(taskResult(text).items, undefined)
  for (const path of ['../secret', '/etc/passwd', 'a//b', 'a\\b', 'a\0b'])
    assert.equal(taskResult(encode([{ ...items[3], path }])).items, undefined)
  assert.equal(taskResult(encode([{ ...items[0], open: { url: 'javascript:alert(1)' } }])).items, undefined)
  assert.equal(taskResult(encode([items[0], items[0]])).items, undefined)
})
test('result resources are stable, provider-neutral and emitted only after completion', async () => {
  const task = {
    id: 'task',
    status: 'succeeded',
    result: { ...taskResult(encode(items)), artifacts: [{ id: 'artifact', name: 'report.txt' }] }
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
