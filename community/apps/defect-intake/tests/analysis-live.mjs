/** Opt-in real model calls through an installed local Xpert; all feedback is synthetic. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
const api = (process.env.XPERT_API_URL || 'http://localhost:3000/api').replace(/\/$/, '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(api).hostname))
for (const key of ['XPERT_USERNAME', 'XPERT_PASSWORD', 'XPERT_ORG_ID', 'XPERT_ASSISTANT_ID']) assert.ok(process.env[key], `Set ${key}`)
const login = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.XPERT_USERNAME, password: process.env.XPERT_PASSWORD }) })
assert.ok(login.ok)
const session = await login.json()
const headers = { authorization: `Bearer ${session.token}`, 'content-type': 'application/json', 'tenant-id': session.user.tenantId, 'organization-id': process.env.XPERT_ORG_ID, 'x-scope-level': 'organization' }
async function request(method, path, input) {
  const response = await fetch(`${api}${path}`, { method, headers, ...(input ? { body: JSON.stringify(input) } : {}) })
  assert.ok(response.ok, `Installed endpoint HTTP ${response.status}`)
  return response.json()
}
const host = `/view-hosts/agent/${process.env.XPERT_ASSISTANT_ID}`
const views = await request('GET', `${host}/slots/agent.workbench.fixed/views`)
const view = views.find(item => item.source.plugin === '@community/apps-defect-intake')
assert.ok(view)
const base = `${host}/views/${encodeURIComponent(view.key)}`
const action = async (key, record, input) => {
  const result = await request('POST', `${base}/actions/${key}`, { targetId: record?.id || null, input })
  assert.equal(result.success, true, `Action rejected: ${result.data?.code}`)
  return result.data
}
const get = async id => (await request('GET', `${base}/data?parameters=${encodeURIComponent(JSON.stringify({ recordId: id }))}`)).item
const wait = async id => {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const record = await get(id)
    if (!['queued', 'running'].includes(record.analysis?.status)) return record
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  throw new Error('Analysis did not reach a terminal state in 120 seconds')
}
let record = await action('create', null, { requestId: randomUUID(), originalFeedback: '【虚构 AI 验收】订单列表点击导出后一直转圈，没有下载文件。' })
const title = '【人工保留】订单导出问题'
record = await action('save', record, { revision: record.revision, supplement: '', report: { ...record.report, title } })
const requestId = randomUUID()
const [first, duplicate] = await Promise.all([action('analyze', record, { revision: record.revision, requestId }), action('analyze', record, { revision: record.revision, requestId })])
assert.equal(first.analysis.id, duplicate.analysis.id, 'Duplicate click started another attempt')
record = await wait(record.id)
assert.equal(record.analysis.status, 'succeeded', `First real analysis: ${record.analysis.errorCode}`)
assert.equal(record.report.title, title)
assert.equal(record.report.environment, '', 'Missing environment was invented')
assert.ok(record.aiResult.fields.length > 0)
assert.ok(record.aiResult.questions.length > 0 && record.aiResult.questions.length <= 3)
const firstQuestions = record.aiResult.questions.map(item => item.question)
const firstAttempt = record.analysis.id
const answersByField = {
  title, entry: '订单列表页面的导出按钮。', environment: '测试环境，Windows 11，Chrome 124。',
  steps: '打开订单列表，保持默认筛选，点击导出，等待两分钟。', expected: '应下载一个包含订单的文件。',
  actual: '等待两分钟仍然只有加载动画，没有文件。', occurredAt: '2026 年 11 月 3 日 14:30 左右。',
  frequency: '相同条件下连续三次都出现。', impact: '目前仅确认本人本次导出受影响。'
}
const answers = record.aiResult.questions.map(question => ({ questionId: question.id, text: `【虚构补充】${answersByField[question.field]}` }))
const humanActual = '人工核对：点击导出后等待两分钟，仍显示加载动画且没有下载文件。'
record = await action('save', record, { revision: record.revision, supplement: '【虚构补充】测试环境、Windows 11、Chrome 124，默认筛选下导出约 1000 条订单。', report: { ...record.report, actual: humanActual }, answers })
const savedRevision = record.revision
await action('analyze', record, { revision: record.revision, requestId: randomUUID() })
record = await wait(record.id)
assert.equal(record.analysis.status, 'succeeded', `Second real analysis: ${record.analysis.errorCode}`)
assert.notEqual(record.analysis.id, firstAttempt)
assert.equal(record.report.title, title)
assert.equal(record.report.actual, humanActual)
assert.equal(record.aiResult.sourceRevision, savedRevision)
assert.ok(record.answers.every(answer => answer.text.startsWith('【虚构补充】')))
assert.ok(record.aiResult.questions.every(question => !firstQuestions.includes(question.question)), 'Answered question repeated')
assert.ok(record.aiResult.questions.every(question => question.field !== 'environment'), 'Known environment was asked again')
const recovered = await get(record.id)
assert.deepEqual(recovered, record)
if (process.env.XPERT_AI_LIVE_RECEIPT) await writeFile(process.env.XPERT_AI_LIVE_RECEIPT, JSON.stringify({ passed: true, recordId: record.id, firstAttemptId: firstAttempt, finalAttemptId: record.analysis.id, knownFields: record.aiResult.fields.map(item => item.field), questionCount: record.aiResult.questions.length, timestamp: new Date().toISOString() }, null, 2), { mode: 0o600 })
console.log('PASS: two real model analyses, queue deduplication, facts with sources, sparse input, saved answers, no repeated answered questions, human title/actual preserved, fresh-request recovery.')
