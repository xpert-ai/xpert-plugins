/** Opt-in local two-account acceptance; synthetic records remain inspectable. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

const api = (process.env.XPERT_API_URL || 'http://localhost:3000/api').replace(/\/$/, '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(api).hostname), 'Local acceptance only')
for (const key of ['XPERT_USERNAME', 'XPERT_PASSWORD', 'XPERT_SECOND_USERNAME', 'XPERT_SECOND_PASSWORD', 'XPERT_ORG_ID', 'XPERT_ASSISTANT_ID']) assert.ok(process.env[key], `Set ${key}`)
async function login(email, password) {
  const response = await fetch(api + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15000) })
  assert.ok(response.ok, 'Account login failed')
  const session = await response.json()
  return { id: session.user.id, tenantId: session.user.tenantId, role: session.user.role?.name, headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}`, 'tenant-id': session.user.tenantId, 'organization-id': process.env.XPERT_ORG_ID, 'x-scope-level': 'organization' } }
}
const first = await login(process.env.XPERT_USERNAME, process.env.XPERT_PASSWORD)
const second = await login(process.env.XPERT_SECOND_USERNAME, process.env.XPERT_SECOND_PASSWORD)
assert.notEqual(first.id, second.id)
assert.equal(first.tenantId, second.tenantId, 'Use two different users in the same tenant and organization')
assert.equal(second.role, 'APP_USER', 'Use an ordinary end user for the second actor')
async function raw(actor, path, method = 'GET', body) {
  const response = await fetch(api + path, { method, headers: actor.headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) })
  const data = await response.json()
  return { ok: response.ok, status: response.status, data }
}
async function request(actor, path, method = 'GET', body) {
  const result = await raw(actor, path, method, body)
  assert.ok(result.ok, `Local request HTTP ${result.status}`)
  return result.data
}
const host = `/view-hosts/agent/${process.env.XPERT_ASSISTANT_ID}`
const views = await request(first, host + '/slots/agent.workbench.fixed/views')
const view = views.find(item => item.source.plugin === '@community/apps-defect-intake')
assert.ok(view)
assert.ok((await request(second, host + '/slots/agent.workbench.fixed/views')).some(item => item.key === view.key))
const base = host + '/views/' + encodeURIComponent(view.key)
const action = (actor, key, record, input) => request(actor, `${base}/actions/${key}`, 'POST', { targetId: record?.id || null, input })
const query = (actor, parameters = {}, search) => raw(actor, `${base}/data?` + new URLSearchParams({ parameters: JSON.stringify(parameters), ...(search ? { search } : {}) }))
const marker = '【虚构双用户隔离验收】' + randomUUID().slice(0, 8)
async function create(actor, label) {
  const created = await action(actor, 'create', null, { requestId: randomUUID(), originalFeedback: `${marker} ${label}：测试环境点击订单导出后持续转圈，无下载文件。` })
  assert.equal(created.success, true)
  const saved = await action(actor, 'save', created.data, { revision: created.data.revision, supplement: `${marker} ${label} 仅用于本地验收。`, report: { ...created.data.report, title: `${marker} ${label}`, actual: '用户人工核对：持续转圈，没有下载文件。' } })
  assert.equal(saved.success, true)
  return saved.data
}
const a = await create(first, '用户 A')
const b = await create(second, '用户 B')
for (const [actor, own, other] of [[first, a, b], [second, b, a]]) {
  const ownRead = await query(actor, { recordId: own.id })
  assert.equal(ownRead.data.item.id, own.id, 'Positive own-record read required')
  const listed = await query(actor, {}, marker)
  assert.ok(listed.data.items.some(item => item.id === own.id))
  assert.ok(!listed.data.items.some(item => item.id === other.id), 'List exposed another owner')
  const denied = await query(actor, { recordId: other.id })
  const absent = await query(actor, { recordId: randomUUID() })
  assert.equal(denied.ok, false, 'Cross-owner detail read must fail')
  assert.equal(denied.status, absent.status, 'Existence must not be disclosed by a different status')
  assert.ok(!JSON.stringify(denied.data).includes(other.originalFeedback))
  assert.ok(!JSON.stringify(denied.data).includes(other.report.title))
  for (const [key, input] of [
    ['save', { revision: other.revision, supplement: 'cross-owner edit', report: { ...other.report, title: 'cross-owner overwrite' } }],
    ['analyze', { revision: other.revision, requestId: randomUUID() }],
    ['confirm', { revision: other.revision }]
  ]) {
    const result = await action(actor, key, other, input)
    assert.equal(result.success, false, `Cross-owner ${key} was accepted`)
    assert.equal(result.data.code, 'not_found')
    assert.ok(!JSON.stringify(result).includes(other.originalFeedback))
  }
}
assert.deepEqual((await query(first, { recordId: a.id })).data.item, a, 'Cross-owner actions changed A')
assert.deepEqual((await query(second, { recordId: b.id })).data.item, b, 'Cross-owner actions changed B')
const spoof = await action(second, 'save', b, { revision: b.revision, supplement: '', report: b.report, ownerId: first.id })
assert.equal(spoof.success, false)
assert.equal(spoof.data.code, 'invalid_input')
// A real positive analysis proves denials were not simply an unusable end-user runtime.
let final
const failures = []
// Exercise the public manual-retry action once if the real provider fails validation.
for (let attempt = 0; attempt < 2; attempt++) {
  const current = final || b
  const started = await action(second, 'analyze', current, { revision: current.revision, requestId: randomUUID() })
  assert.equal(started.success, true)
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    final = (await query(second, { recordId: b.id })).data.item
    if (!['queued', 'running'].includes(final.analysis?.status)) break
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  if (final.analysis.status === 'succeeded') break
  failures.push(final.analysis.errorCode)
  assert.equal(final.report.title, b.report.title)
  assert.equal(final.report.actual, b.report.actual)
}
assert.equal(final.analysis.status, 'succeeded', `Ordinary user's own analysis failed: ${final.analysis.errorCode}`)
assert.equal(final.report.title, b.report.title)
assert.equal(final.report.actual, b.report.actual)
const confirmed = await action(second, 'confirm', final, { revision: final.revision })
assert.equal(confirmed.success, true)
assert.equal(confirmed.data.status, 'confirmed')
assert.deepEqual((await query(first, { recordId: a.id })).data.item, a)
const summary = { passed: true, sameTenantAndOrganization: true, secondUserRole: second.role, directionsTested: 2, listReadSaveAnalyzeConfirmIsolated: true, spoofRejected: true, ordinaryUserModelAnalysisAndConfirmation: true, modelFailuresBeforeRetry: failures, timestamp: new Date().toISOString() }
if (process.env.XPERT_ACCESS_LIVE_RECEIPT) await writeFile(process.env.XPERT_ACCESS_LIVE_RECEIPT, JSON.stringify({ ...summary, firstRecordId: a.id, secondRecordId: b.id }, null, 2), { mode: 0o600 })
console.log(JSON.stringify(summary))
