import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

// Opt-in integration test against a configured local Xpert. No model call or secret output.
const api = (process.env.XPERT_API_URL ?? 'http://localhost:3000').replace(/\/$/, '') + '/api'
const assistantId = process.env.XPERT_ASSISTANT_ID
const tenantId = process.env.XPERT_TENANT_ID
const organizationId = process.env.XPERT_ORG_ID
if (!assistantId || !tenantId || !organizationId) throw new Error('Set XPERT_ASSISTANT_ID, XPERT_TENANT_ID and XPERT_ORG_ID')
let token = process.env.XPERT_TOKEN?.replace(/^Bearer\s+/i, '')
if (!token) {
  if (!process.env.XPERT_TEST_EMAIL || !process.env.XPERT_TEST_PASSWORD) throw new Error('Set a login token or test login environment variables')
  const response = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.XPERT_TEST_EMAIL, password: process.env.XPERT_TEST_PASSWORD }) })
  assert.equal(response.ok, true, 'Test login must succeed')
  const auth = await response.json()
  token = auth.token
}
assert.ok(token, 'Authenticated token required')
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'tenant-id': tenantId, 'organization-id': organizationId, 'x-scope-level': 'organization' }
async function request(path, body) {
  const response = await fetch(api + path, { headers, method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) })
  assert.equal(response.ok, true, `${path}: HTTP ${response.status}`)
  const value = await response.json()
  return typeof value === 'string' ? JSON.parse(value) : value
}
const views = await request(`/view-hosts/agent/${assistantId}/slots/agent.workbench/views`)
const view = views.find(item => item.key.endsWith('__shadow_research.workbench'))
assert.ok(view, 'Published Assistant must expose the Research Lab')
const prefix = `/view-hosts/agent/${assistantId}/views/${encodeURIComponent(view.key)}`
const tools = await request('/xpert-agent/middlewares/ShadowResearchMiddleware/tools', { xpertId: assistantId })
assert.deepEqual(tools.tools.map(item => item.name).sort(), ['shadow_get_task', 'shadow_begin', 'shadow_search_market', 'shadow_get_financials', 'shadow_submit_review', 'shadow_report_failure'].sort())
const before = await request(prefix + '/data')
const snapshot = JSON.parse(await readFile(new URL('../examples/synthetic-snapshot.json', import.meta.url), 'utf8'))
const input = { title: '验收故障任务（模拟故障 非模型结果）', objective: '验证真实平台业务工具的失败状态与原快照重试，不生成投资结论。', snapshot, requestKey: randomUUID() }
const invalid = await request(prefix + '/actions/create', { input: { ...input, snapshot: { ...snapshot, stocks: [] } } })
assert.equal(invalid.success, false)
assert.equal(invalid.data.code, 'invalid_input')
const created = await request(prefix + '/actions/create', { input })
assert.equal(created.success, true)
const taskId = created.data.taskId
const again = await request(prefix + '/actions/create', { input })
assert.equal(again.data.taskId, taskId, 'Same request key must not duplicate tasks')
async function tool(name, parameters) {
  return request(`/xpert-agent/middlewares/ShadowResearchMiddleware/tools/${name}/test`, { xpertId: assistantId, parameters })
}
const original = (await request(prefix + '/data?parameters=' + encodeURIComponent(JSON.stringify({ taskId })))).item
const begun = await tool('shadow_begin', { taskId })
assert.equal(begun.success, true)
const failed = await tool('shadow_report_failure', { taskId, reason: 'tool_failed' })
assert.equal(failed.success, true)
const failedTask = (await request(prefix + '/data?parameters=' + encodeURIComponent(JSON.stringify({ taskId })))).item
assert.equal(failedTask.status, 'failed')
assert.equal(failedTask.failureCode, 'tool_failed')
const retried = await request(prefix + '/actions/retry', { input: { taskId, expectedRevision: failedTask.revision } })
assert.equal(retried.success, true)
const restored = (await request(prefix + '/data?parameters=' + encodeURIComponent(JSON.stringify({ taskId })))).item
assert.equal(restored.id, taskId)
assert.equal(restored.status, 'draft')
assert.equal(restored.snapshotHash, original.snapshotHash)
assert.equal(restored.attempts.length, 1)
assert.equal(restored.attempts[0].failureCode, 'tool_failed')
const after = await request(prefix + '/data')
assert.equal(after.item.total, before.item.total + 1)
const anonymous = await fetch(api + prefix + '/data')
assert.ok([401, 403].includes(anonymous.status), 'Anonymous reads must be rejected')
console.log(JSON.stringify({ status: 'passed', inputValidation: true, createIdempotency: true, registeredTools: tools.tools.length, controlledToolFailure: true, retryPreservesIdAndSnapshot: true, attemptHistoryPersisted: true, anonymousAccessDenied: true, modelExecution: 'not performed by this test; fault injected through official middleware tool test API' }, null, 2))
