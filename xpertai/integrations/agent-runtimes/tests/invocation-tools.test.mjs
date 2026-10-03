import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AgentInvocationMiddleware } from '../dist/lib/invocation.middleware.js'
const id = '11111111-1111-4111-a111-111111111111'
const task = { id, status: 'running', scope: { secret: 'not-for-model' }, request: { configuration: 'private' } }
function fixture(mode = 'background') {
  const calls = []
  const api = {
    resolve: async () => ({ bindingId: id }),
    start: async () => task,
    awaitResult: async (...args) => {
      calls.push(['await', ...args])
      return { ...task, status: 'succeeded', result: { text: 'done' } }
    },
    inspect: async () => task,
    cancel: async () => ({ ...task, status: 'cancelling' }),
    waitForTasks: async (request) => {
      calls.push(['wait', request])
      return { reason: 'completed', tasks: [{ ...task, status: 'succeeded' }] }
    }
  }
  const middleware = new AgentInvocationMiddleware().createMiddleware(
    { bindings: [{ id, name: 'code_task', description: 'Delegate work', mode }] },
    { runtime: { capabilities: { require: () => api } } }
  )
  return { calls, tools: middleware.tools, api }
}
const config = { configurable: { tool_call_id: 'host-call' } }
test('background delegation exposes lifecycle tools without leaking ownership or configuration', async () => {
  const f = fixture()
  assert.deepEqual(
    f.tools.map((t) => t.name),
    ['code_task', 'task_status', 'task_cancel']
  )
  const started = JSON.parse(await f.tools[0].invoke({ prompt: 'work' }, config))
  assert.equal(started.invocationId, id)
  assert.equal(f.calls.length, 0)
  const status = JSON.parse(await f.tools[1].invoke({ taskIds: [id], timeoutMs: 0 }, config)).tasks[0]
  assert.equal(status.taskId, id)
  assert.equal(status.scope, undefined)
  assert.equal(status.request, undefined)
  const cancellation = JSON.parse(await f.tools[2].invoke({ taskId: id }))
  assert.equal(cancellation.status, 'cancelling')
})
test('auto forwards the chosen duration and task_status injects host identity and a bounded default', async () => {
  const f = fixture('auto')
  assert.equal(JSON.parse(await f.tools[0].invoke({ prompt: 'work', timeoutMs: 5000 }, config)).status, 'succeeded')
  assert.equal(f.calls[0][2].timeoutMs, 5000)
  await f.tools[1].invoke({ taskIds: [id], mode: 'any' }, config)
  assert.deepEqual(f.calls[1], ['wait', { taskIds: [id], mode: 'any', callId: 'host-call', timeoutMs: 30000 }])
})
test('model can choose a bounded window but cannot supply identity, out-of-range durations or reserved names', async () => {
  const f = fixture()
  await f.tools[1].invoke({ taskIds: [id], timeoutMs: 10000 }, config)
  assert.equal(f.calls[0][1].timeoutMs, 10000)
  await assert.rejects(f.tools[1].invoke({ taskIds: [id], callId: 'model-call' }, config))
  for (const timeoutMs of [-1, 60001]) await assert.rejects(f.tools[1].invoke({ taskIds: [id], timeoutMs }, config))
  assert.throws(() =>
    new AgentInvocationMiddleware().createMiddleware(
      { bindings: [{ id, name: 'task_status', description: 'collision' }] },
      {}
    )
  )
})
test('pending is a normal tool receipt that lets the Agent wait again', async () => {
  const f = fixture()
  f.api.waitForTasks = async () => ({ reason: 'pending', tasks: [task] })
  const receipt = JSON.parse(await f.tools[1].invoke({ taskIds: [id], timeoutMs: 1000 }, config))
  assert.equal(receipt.reason, 'pending')
  assert.equal(receipt.tasks[0].status, 'running')
  assert.equal(receipt.tasks[0].scope, undefined)
})
test('an incompatible host is rejected before resolving or starting a child task', async () => {
  const f = fixture('auto')
  let starts = 0,
    resolutions = 0
  f.api.awaitResult = undefined
  f.api.resolve = async () => {
    resolutions++
    return { bindingId: id }
  }
  f.api.start = async () => {
    starts++
    return task
  }
  await assert.rejects(f.tools[0].invoke({ prompt: 'work' }, config), /bounded task waiting/)
  assert.equal(resolutions, 0)
  assert.equal(starts, 0)
})
test('duplicate task IDs and unknown nested configuration are rejected', async () => {
  const f = fixture()
  await assert.rejects(f.tools[1].invoke({ taskIds: [id, id] }, config), /Task IDs must be unique/)
  assert.equal(f.calls.length, 0)
  for (const extra of [
    { command: 'unexpected' },
    { title: { en_US: 'Task', zh_Hans: '任务', unexpected: true } },
    { icon: { type: 'font', value: 'ri-code-line', unexpected: true } }
  ]) {
    assert.throws(
      () =>
        new AgentInvocationMiddleware().createMiddleware(
          { bindings: [{ id, name: 'code_task', description: 'Delegate work', ...extra }] },
          {}
        ),
      /Unrecognized key/
    )
  }
})
test('launch, status and cancel receipts expose typed results without adapter data', async () => {
  const f = fixture('auto')
  const publicResult = { text: 'done', items: [], artifacts: [], export: { mode: 'none', status: 'not_requested' } }
  const completed = {
    ...task,
    status: 'succeeded',
    result: { ...publicResult, data: { workingDirectory: '/private/worker', secret: 'private' } }
  }
  f.api.awaitResult = async () => completed
  f.api.waitForTasks = async () => ({ reason: 'completed', tasks: [completed] })
  f.api.cancel = async () => completed
  const receipts = [
    JSON.parse(await f.tools[0].invoke({ prompt: 'work' }, config)),
    JSON.parse(await f.tools[1].invoke({ taskIds: [id], timeoutMs: 0 }, config)).tasks[0],
    JSON.parse(await f.tools[2].invoke({ taskId: id }, config))
  ]
  for (const receipt of receipts) {
    assert.deepEqual(receipt.result, publicResult)
    assert.equal(receipt.scope, undefined)
    assert.equal(receipt.request, undefined)
  }
})
test('all lifecycle tools carry localized display metadata and optional change summaries', async () => {
  const f = fixture()
  assert.deepEqual(
    f.tools.map((t) => t.metadata.toolName.zh_Hans),
    ['委派任务', '查看任务进度', '取消任务']
  )
  for (const t of f.tools) {
    assert.equal(t.metadata.toolIcon.type, 'font')
    assert.ok(t.metadata.toolIcon.value)
    assert.ok(t.schema.shape.changeSummary)
  }
  const custom = new AgentInvocationMiddleware().createMiddleware(
    {
      bindings: [
        {
          id,
          name: 'render_task',
          description: 'Render',
          title: { en_US: 'Render video', zh_Hans: '渲染视频' },
          icon: { type: 'font', value: 'ri-film-line' },
          mode: 'background'
        }
      ]
    },
    { runtime: { capabilities: { require: () => f.api } } }
  )
  assert.equal(custom.tools[0].metadata.toolName.zh_Hans, '渲染视频')
  assert.equal(custom.tools[0].metadata.toolIcon.value, 'ri-film-line')
})
test('changeSummary updates the existing step and never enters a task execution request', async () => {
  const f = fixture()
  const events = []
  const configWithEvents = {
    ...config,
    callbacks: [
      {
        handleCustomEvent(name, data) {
          events.push({ name, data })
        }
      }
    ]
  }
  await f.tools[1].invoke({ taskIds: [id], timeoutMs: 0, changeSummary: '查看测试进度' }, configWithEvents)
  assert.equal(f.calls[0][1].changeSummary, undefined)
  assert.equal(events.length, 1)
  assert.equal(events[0].data.id, 'host-call')
  assert.equal(events[0].data.message, '查看测试进度')
  assert.equal(events[0].data.status, 'running')
  assert.equal(events[0].data.icon.type, 'font')
})
