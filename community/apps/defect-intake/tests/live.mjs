/** Explicit local acceptance: leaves one clearly labelled synthetic record. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const api = (process.env.XPERT_API_URL || 'http://localhost:3000/api').replace(/\/$/, '')
const address = new URL(api)
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(address.hostname), 'Use an explicit local test environment')
for (const name of ['XPERT_USERNAME', 'XPERT_PASSWORD', 'XPERT_ORG_ID', 'XPERT_ASSISTANT_ID']) assert.ok(process.env[name], `Set ${name} in the process environment`)
const packageMeta = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const login = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.XPERT_USERNAME, password: process.env.XPERT_PASSWORD }) })
assert.equal(login.status, 200, 'Local test login failed')
const session = await login.json()
const headers = { authorization: `Bearer ${session.token}`, 'content-type': 'application/json', 'tenant-id': session.user.tenantId, 'organization-id': process.env.XPERT_ORG_ID, 'x-scope-level': 'organization' }
async function request(method, path, input) {
  const response = await fetch(`${api}${path}`, { method, headers, ...(input ? { body: JSON.stringify(input) } : {}) })
  assert.ok(response.ok, `Local endpoint returned HTTP ${response.status}`)
  return response.json()
}
const host = `/view-hosts/agent/${encodeURIComponent(process.env.XPERT_ASSISTANT_ID)}`
const views = await request('GET', `${host}/slots/agent.workbench.fixed/views`)
const view = views.find(item => item.source.plugin === packageMeta.name)
assert.ok(view, 'Installed domain Workbench is missing')
const base = `${host}/views/${encodeURIComponent(view.key)}`
const action = (key, targetId, input) => request('POST', `${base}/actions/${key}`, { targetId, input })
const invalid = await action('create', null, { requestId: randomUUID(), originalFeedback: '  ' })
assert.equal(invalid.success, false)
const requestId = randomUUID()
const originalFeedback = '  【虚构自动验收】导出订单一直转圈。\n'
const created = await action('create', null, { requestId, originalFeedback })
assert.equal(created.success, true)
const duplicate = await action('create', null, { requestId, originalFeedback })
assert.equal(duplicate.data.id, created.data.id, 'Create retry duplicated the record')
assert.equal(created.data.originalFeedback, originalFeedback, 'Original text was changed')
assert.ok(Object.values(created.data.report).every(value => value === ''))
const spoof = await action('create', null, { requestId: randomUUID(), originalFeedback, ownerId: randomUUID() })
assert.equal(spoof.success, false, 'Client-owned scope was accepted')
const id = created.data.id
const report = { ...created.data.report, title: '【虚构自动验收】订单导出无下载结果', actual: '持续显示加载动画，未下载文件。', questions: '请补充环境和出现频率。' }
const saved = await action('save', id, { revision: created.data.revision, supplement: '【虚构】用户补充：约 1000 条订单。', report })
assert.equal(saved.success, true)
const stale = await action('save', id, { revision: created.data.revision, supplement: 'stale writer', report })
assert.equal(stale.success, false)
assert.equal(stale.data.code, 'revision_conflict')
const confirmed = await action('confirm', id, { revision: saved.data.revision })
assert.equal(confirmed.success, true)
const repeat = await action('confirm', id, { revision: saved.data.revision })
assert.equal(repeat.success, true)
assert.equal(repeat.data.revision, confirmed.data.revision, 'Confirmation retry created another revision')
const edited = await action('save', id, { revision: confirmed.data.revision, supplement: saved.data.supplement, report: { ...report, title: '【虚构自动验收】编辑中的新草稿' } })
assert.equal(edited.success, true)
assert.equal(edited.data.status, 'draft')
assert.deepEqual(edited.data.confirmed.report, confirmed.data.report, 'Editing changed the confirmation snapshot')
const recovered = await request('GET', `${base}/data?parameters=${encodeURIComponent(JSON.stringify({ recordId: id }))}`)
assert.deepEqual(recovered.item, edited.data, 'Fresh request did not recover the saved record')
const mismatchedId = await action('save', randomUUID(), { revision: 1, supplement: '', report })
assert.equal(mismatchedId.success, false)
assert.equal(mismatchedId.data.code, 'not_found')
console.log('PASS: installed Workbench, blank validation, unchanged source, scope spoof rejection, create deduplication, save/recovery, stale-write rejection, confirmation retry and immutable snapshot.')
