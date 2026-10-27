const { test } = require('node:test')
const assert = require('node:assert/strict')
const { AIMessage, SystemMessage, ToolMessage } = require('@langchain/core/messages')
const { DashboardMiddleware } = require('../dist/lib/middleware.js')
const { createPreviewRetryGuard } = require('../dist/lib/preview-retry.js')
const example = require('../examples/postgres-sales.json')

function setup() {
  let executions = 0, failure = true
  const service = {
    discover: async () => ({ items: [], queryContract: { operation: 'query', contractVersion: 1, payloadSchema: {} } }),
    preview: async () => {
      executions++
      if (failure) throw new Error('{"code":"ANALYTICS_READ_ONLY_VIOLATION","stage":"validation","retryable":false,"message":"Repair SQL"}')
      return { rows: [], completeness: { returnedRows: 0, truncated: false } }
    }
  }
  const middleware = new DashboardMiddleware(service).createMiddleware({}, { xpertId: 'assistant', tenantId: 'tenant', organizationId: 'org', userId: 'viewer' })
  const invoke = (name, args) => {
    const tool = middleware.tools.find(t => t.name === name)
    const request = { tool, toolCall: { name, args, id: 'call' }, state: { messages: [] }, runtime: {} }
    return middleware.wrapToolCall(request, r => tool.invoke({ ...r.toolCall, type: 'tool_call' }))
  }
  return { middleware, invoke, executions: () => executions, repair: () => { failure = false } }
}

test('the actual middleware blocks unchanged failed previews before a third query and permits corrected inputs', async () => {
  const s = setup(), binding = structuredClone(example.bindings[0])
  const args = { bindingJson: JSON.stringify(binding) }
  for (let i = 0; i < 2; i++) await assert.rejects(s.invoke('dashboard_preview_binding', args), /ANALYTICS_READ_ONLY_VIOLATION/)
  await assert.rejects(s.invoke('dashboard_preview_binding', args), /PREVIEW_REPEAT_BLOCKED/)
  assert.equal(s.executions(), 2)
  binding.payload = { query: 'corrected' }
  s.repair()
  const result = await s.invoke('dashboard_preview_binding', { bindingJson: JSON.stringify(binding) })
  assert.equal(result.status, 'success')
  assert.ok(JSON.parse(result.content).previewId)
  assert.equal(s.executions(), 3)
  await assert.rejects(s.invoke('dashboard_preview_binding', args), /PREVIEW_REPEAT_BLOCKED/)
  const other = setup()
  await assert.rejects(other.invoke('dashboard_preview_binding', args), /ANALYTICS_READ_ONLY_VIOLATION/)
  assert.equal(other.executions(), 1)
})

test('binding string schema failures are bounded without reaching discovery or the database', async () => {
  const s = setup(), args = { binding: JSON.stringify(example.bindings[0]) }
  for (let i = 0; i < 2; i++) await assert.rejects(s.invoke('dashboard_preview', args), /Expected object, received string/)
  await assert.rejects(s.invoke('dashboard_preview', args), /PREVIEW_REPEAT_BLOCKED/)
  assert.equal(s.executions(), 0)
})

test('six consecutive failed preview variants end tool calls even if the model ignores the stop instruction', async () => {
  const s = setup()
  for (let i = 0; i < 6; i++) {
    const binding = structuredClone(example.bindings[0]); binding.id = `failed_${i}`
    await assert.rejects(s.invoke('dashboard_preview_binding', { bindingJson: JSON.stringify(binding) }), /ANALYTICS_READ_ONLY_VIOLATION/)
  }
  const result = await s.middleware.wrapModelCall({ systemMessage: new SystemMessage('Keep caller instructions'), tools: ['original'] }, async request => {
    assert.deepEqual(request.tools, [])
    assert.equal(request.toolChoice, 'none')
    assert.match(JSON.stringify(request.systemMessage.content), /Keep caller instructions/)
    assert.match(JSON.stringify(request.systemMessage.content), /ANALYTICS_READ_ONLY_VIOLATION/)
    return new AIMessage({ content: '', tool_calls: [{ id: 'again', name: 'dashboard_preview_binding', args: {} }] })
  })
  assert.equal(result.tool_calls.length, 0)
  assert.match(result.content, /PREVIEW_RETRY_LIMIT/)
  await assert.rejects(s.invoke('dashboard_preview_binding', { bindingJson: JSON.stringify(example.bindings[0]) }), /PREVIEW_RETRY_LIMIT/)
  assert.equal(s.executions(), 6)
})

test('successful previews reset consecutive failures and repeated successes are never cached', async () => {
  const s = setup()
  for (let i = 0; i < 5; i++) await assert.rejects(s.invoke('dashboard_preview', { binding: `bad-${i}` }))
  s.repair()
  const args = { bindingJson: JSON.stringify(example.bindings[0]) }
  await s.invoke('dashboard_preview_binding', args)
  await s.invoke('dashboard_preview_binding', args)
  assert.equal(s.executions(), 2)
  await s.middleware.wrapModelCall({ systemMessage: new SystemMessage(''), tools: [] }, async request => {
    assert.notEqual(request.toolChoice, 'none')
    return new AIMessage('done')
  })
})

test('concurrent duplicates do not multiply database calls', async () => {
  const guard = createPreviewRetryGuard()
  const request = { toolCall: { name: 'dashboard_preview', args: { binding: {} } } }
  let release, calls = 0
  const handler = async () => { calls++; await new Promise(resolve => { release = resolve }); throw new Error('failed') }
  const first = guard.run(request, handler)
  await assert.rejects(guard.run(request, handler), /PREVIEW_IN_PROGRESS/)
  release()
  await assert.rejects(first, /failed/)
  assert.equal(calls, 1)
})

test('error ToolMessages and key-reordered identical arguments count toward the same limit', async () => {
  const guard = createPreviewRetryGuard()
  const args = [{ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 1, b: 2 }]
  let calls = 0
  const invoke = input => guard.run({ toolCall: { name: 'dashboard_test_filter', args: input } }, async () => {
    calls++
    return new ToolMessage({ status: 'error', content: 'filter failed', tool_call_id: 'test' })
  })
  await invoke(args[0]); await invoke(args[1])
  await assert.rejects(invoke(args[2]), /PREVIEW_REPEAT_BLOCKED/)
  assert.equal(calls, 2)
})
