import 'reflect-metadata'
import { test } from 'node:test'
import { RunnableLambda } from '@langchain/core/runnables'
import assert from 'node:assert/strict'
import { taskResult } from '../dist/lib/task-result.js'
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
    resolve: async () => ({}),
    start: async (request) => {
      received = request
      return { id: 'task', status: 'running' }
    }
  }
  const tools = new AgentInvocationMiddleware().createMiddleware(
    {
      bindings: [
        { id: '11111111-1111-4111-a111-111111111111', name: 'code_task', description: 'Code', mode: 'background' }
      ]
    },
    { runtime: { capabilities: { require: () => api } } }
  ).tools
  const config = { configurable: { tool_call_id: 'call' } }
  await tools[0].invoke({ prompt: 'Fix tests' }, config)
  assert.deepEqual(received.input.delivery, { mode: 'none' })
  await tools[0].invoke({ prompt: 'Export', delivery: { mode: 'archive', paths: ['report.txt'] } }, config)
  assert.equal(received.input.delivery.mode, 'archive')
})
