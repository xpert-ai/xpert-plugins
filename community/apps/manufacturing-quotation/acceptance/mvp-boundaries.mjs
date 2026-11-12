import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { assistantId, client, receipt, request, requiredEnv, saveLocal, view } from './api.mjs'

// Dedicated local MVP only. Passwords and login tokens remain in this process.
const withBrowser = process.argv.includes('--browser')
if (withBrowser) requiredEnv('XPERT_ORG_NAME')
const base = `/view-hosts/agent/${assistantId}/views/${view}`
const inquiry = '玛钢 90°弯头，规格 25，1 箱；玛钢三通，规格 25，1 箱。'
const runId = randomUUID()
const users = []
const checks = []
const cleanup = []
const drafts = {}
const pass = (name, detail = {}) => { checks.push({ name, ...detail }); console.log(`PASS ${name}`) }
const roles = await request('/roles')
const viewer = (roles.items ?? roles).find(({ name }) => name === 'VIEWER')
assert.ok(viewer?.id)
const originalSharing = await request(`/xpert/${assistantId}/sharing`)
assert.equal(originalSharing.organization?.id, receipt.organization.id)
assert.ok(originalSharing.capabilities?.canManageAccess, 'Use a test Assistant whose sharing this administrator can manage')
await request(base + '/data')

async function newUser(label, shared) {
  const password = randomBytes(24).toString('base64url') + 'Aa1!'
  const email = `mvp-${runId.slice(0, 8)}-${label}@xpert.local`
  const created = await request('/user', { method: 'POST', body: {
    email, firstName: `MVP ${label}`, roleId: viewer.id, hash: password, preferredLanguage: 'zh-CN'
  } })
  assert.ok(created.id)
  const account = { id: created.id, grantAttempted: false, email, password }
  users.push(account)
  await request('/user-organization', { method: 'POST', body: {
    userId: account.id, organizationId: receipt.organization.id, isActive: true, isDefault: true
  } })
  if (shared) {
    account.grantAttempted = true
    await request(`/xpert/${assistantId}/sharing/users`, { method: 'POST', body: { userIds: [account.id] } })
  }
  const login = await client(null, '/auth/login', { method: 'POST', body: { email, password } })
  assert.equal(login.status, 200, `normal login ${label}`)
  assert.equal(login.data?.user?.role?.name, 'VIEWER')
  assert.ok(login.data.token)
  account.call = (path, options) => client(login.data.token, path, options)
  return account
}
async function action(user, name, input) {
  const result = await user.call(`${base}/actions/${name}`, { method: 'POST', body: { input } })
  assert.ok(result.ok, `${name} transport HTTP ${result.status}`)
  return result.data
}
function succeeded(result) {
  assert.equal(result.success, true, `action failed: ${result.data?.errorCode}`)
  return result.data.draft
}
async function get(user, id) {
  const result = await user.call(`${base}/data?parameters=${encodeURIComponent(JSON.stringify({ draftId: id }))}`)
  assert.equal(result.status, 200)
  return result.data.summary.selected
}
async function create(user, name, text = inquiry, requestId = randomUUID()) {
  return succeeded(await action(user, 'create', { title: `MVP ${runId.slice(0, 8)} ${name}`, inquiry: text, requestId }))
}
async function upload(user, bytes, mimeType, name) {
  const form = new FormData()
  form.set('input', JSON.stringify({ title: `MVP ${runId.slice(0, 8)} ${name}`, requestId: randomUUID() }))
  form.set('file', new Blob([bytes], { type: mimeType }), name)
  return user.call(`${base}/actions/create_image/file`, { method: 'POST', body: form })
}
async function run(user, message) {
  const thread = await user.call('/ai/threads', { method: 'POST', body: {
    assistant_id: assistantId, if_exists: 'raise', metadata: { title: `MVP ${runId.slice(0, 8)}` }
  } })
  assert.equal(thread.status, 201, 'create user thread')
  const id = thread.data.thread_id
  assert.ok(id)
  const result = await user.call(`/ai/threads/${id}/runs/stream`, { method: 'POST', body: {
    assistant_id: assistantId, input: { action: 'send', message: { clientMessageId: randomUUID(), input: { input: message } } },
    stream_mode: ['messages'], stream_subgraphs: false
  } })
  assert.ok(result.ok, `assistant run transport HTTP ${result.status}`)
  return { threadId: id, text: result.text }
}
async function analyze(user, draft) {
  const started = await action(user, 'analyze', { id: draft.id, revision: draft.revision })
  succeeded(started)
  const execution = await run(user, started.data.chatMessage)
  return { draft: await get(user, draft.id), ...execution }
}
function oneWriter(results) {
  assert.equal(results.filter(({ success }) => success).length, 1)
  assert.deepEqual(results.filter(({ success }) => !success).map(({ data }) => data.errorCode), ['conflict'])
}

let failure
try {
  const a = await newUser('a', true)
  const b = await newUser('b', true)
  const outsider = await newUser('outsider', false)
  for (const user of [a, b]) {
    const result = await user.call(base + '/data')
    assert.equal(result.status, 200)
    assert.equal(result.data.summary.records.length, 0)
  }
  pass('ordinary users can access the same shared Assistant')
  const first = await create(a, 'owner A')
  const second = await create(b, 'owner B')
  drafts.a = first.id
  drafts.b = second.id
  const expiring = await create(a, 'expired attempt')
  const oldAttempt = await action(a, 'analyze', { id: expiring.id, revision: expiring.revision })
  succeeded(oldAttempt)
  // Wait from the response using a monotonic clock; the host and API wall clocks can differ.
  const expiryWaitUntil = performance.now() + 120_000

  for (const [user, own, other] of [[a, first, second], [b, second, first]]) {
    const list = (await user.call(base + '/data')).data.summary.records
    assert.ok(list.some(({ id }) => id === own.id))
    assert.ok(!list.some(({ id }) => id === other.id))
    const wrongRead = await user.call(`${base}/data?selectionId=${other.id}`)
    assert.ok(!wrongRead.ok)
    assert.ok(!wrongRead.text.includes(other.inquiry))
    for (const name of ['analyze', 'retry', 'save_inquiry', 'retry_ocr', 'save_lines', 'confirm']) {
      const input = { id: other.id, revision: other.revision }
      if (name === 'save_inquiry') input.inquiry = inquiry
      if (['save_lines', 'confirm'].includes(name)) input.lines = [{ category: '玛钢', productName: '90°弯头', specification: '25',
        quantityCartons: 1, priceMarker: 'b', gradeRaw: '', evidence: inquiry }]
      const result = await action(user, name, input)
      assert.equal(result.success, false)
      assert.equal(result.data.errorCode, 'not_found', `${name} ownership gate`)
    }
    assert.deepEqual(await get(user, own.id), own)
  }
  pass('cross-user list, detail and all six existing-record mutations are isolated')
  const denied = await outsider.call(base + '/data')
  assert.ok([403, 404].includes(denied.status))
  const unauthenticated = await client(null, base + '/data')
  assert.equal(unauthenticated.status, 401)
  const scopeResults = []
  for (const headers of [{ 'organization-id': randomUUID() }, { 'tenant-id': randomUUID() }]) {
    const result = await a.call(base + '/data', { headers })
    if (result.ok) {
      assert.ok(result.data.summary.records.every(({ id }) => [first.id, expiring.id].includes(id)))
      const attack = await a.call(`${base}/actions/analyze`, { method: 'POST', headers,
        body: { input: { id: second.id, revision: second.revision } } })
      assert.equal(attack.data?.data?.errorCode, 'not_found')
    } else assert.ok([400, 403, 404].includes(result.status), `forged scope HTTP ${result.status}`)
    scopeResults.push({ header: Object.keys(headers)[0], status: result.status, isolated: true })
  }
  pass('unshared and unauthenticated access rejected; forged headers cannot change record ownership', { scopeResults })

  const replayId = randomUUID()
  const repeated = await Promise.all(Array.from({ length: 4 }, () => create(a, 'create replay', inquiry, replayId)))
  assert.ok(repeated.every(({ id, revision }) => id === replayId && revision === 1))
  const count = (await a.call(base + '/data')).data.summary.records.filter(({ id }) => id === replayId).length
  assert.equal(count, 1)
  const collision = randomUUID()
  oneWriter(await Promise.all(['first payload', 'second payload'].map((title) => action(a, 'create', { title, inquiry, requestId: collision }))))
  const parallel = await Promise.all(Array.from({ length: 5 }, (_, index) => create(index % 2 ? b : a, `parallel ${index}`)))
  assert.equal(new Set(parallel.map(({ id }) => id)).size, 5)
  pass('PostgreSQL concurrent create: replay deduplicated, payload conflict rejected, five independent requests saved')

  const [analysisA, analysisB] = await Promise.all([analyze(a, first), analyze(b, second)])
  assert.equal(analysisA.draft.status, 'review', `A analysis: ${analysisA.draft.errorCode}`)
  assert.equal(analysisB.draft.status, 'review', `B analysis: ${analysisB.draft.errorCode}`)
  assert.equal(analysisA.draft.lines.length, 2)
  assert.equal(analysisB.draft.lines.length, 2)
  const otherThread = await b.call(`/ai/threads/${analysisA.threadId}`)
  assert.ok([403, 404].includes(otherThread.status))
  const beforeAgentAttack = await get(a, expiring.id)
  await run(b, oldAttempt.data.chatMessage)
  assert.deepEqual(await get(a, expiring.id), beforeAgentAttack)
  pass('two ordinary users complete real DeepSeek candidate runs; thread and model-tool ownership enforced')

  const review = analysisA.draft
  const raced = await Promise.all([2, 3].map((quantityCartons) => action(a, 'save_lines', {
    id: review.id, revision: review.revision, lines: review.lines.map((line, index) => index ? line :
      { ...line, quantityCartons, correctionReason: '合成验收：人工确认箱数' })
  })))
  oneWriter(raced)
  const saved = await get(a, review.id)
  assert.equal(saved.revision, review.revision + 1)
  assert.deepEqual(saved.lines, raced.find(({ success }) => success).data.draft.lines)
  const stale = await action(a, 'confirm', { id: review.id, revision: review.revision, lines: review.lines })
  assert.equal(stale.data.errorCode, 'conflict')
  const confirmInput = { id: saved.id, revision: saved.revision, lines: saved.lines }
  const confirms = await Promise.all([action(a, 'confirm', confirmInput), action(a, 'confirm', confirmInput)])
  assert.ok(confirms.some(({ success }) => success))
  assert.ok(confirms.every((result) => result.success || result.data.errorCode === 'conflict'))
  const quoted = await get(a, saved.id)
  assert.equal(quoted.status, 'quoted')
  assert.equal(quoted.revision, saved.revision + 1)
  assert.deepEqual(succeeded(await action(a, 'confirm', confirmInput)), quoted)
  pass('concurrent edits have one winner; stale confirm rejected; duplicate confirm cannot double-write', { revision: quoted.revision })

  const beforeInvalid = await get(b, second.id)
  for (const lines of [
    beforeInvalid.lines.map((line, index) => index ? line : { ...line, quantityCartons: 0 }),
    beforeInvalid.lines.map((line, index) => index ? line : { ...line, unitPrice: '0.01' })
  ]) {
    const invalid = await action(b, 'confirm', { id: second.id, revision: beforeInvalid.revision, lines })
    assert.equal(invalid.success, false)
    assert.equal(invalid.data.errorCode, 'invalid_input')
  }
  assert.deepEqual(await get(b, second.id), beforeInvalid)
  const empty = await action(b, 'create', { title: 'empty', inquiry: ' ', requestId: randomUUID() })
  assert.equal(empty.data.errorCode, 'invalid_input')
  pass('empty input, invalid quantity and forged price are rejected without changing records')

  for (const [bytes, mimeType, code] of [[Buffer.from('not a PNG'), 'image/png', 'invalid_image'],
    [Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png', 'image_too_large']]) {
    const invalid = await upload(a, bytes, mimeType, 'invalid.png')
    if (!invalid.ok && code === 'image_too_large') assert.equal(invalid.status, 413)
    else {
      assert.ok(invalid.ok, `invalid upload HTTP ${invalid.status}`)
      assert.equal(invalid.data.success, false)
      assert.equal(invalid.data.data.errorCode, code)
    }
  }
  const imageBytes = await readFile(new URL('./fixtures/synthetic-inquiry.png', import.meta.url))
  const image = succeeded((await upload(a, imageBytes, 'image/png', 'synthetic-inquiry.png')).data)
  assert.equal(image.status, 'draft')
  const hiddenImage = await b.call(`${base}/data?selectionId=${image.id}`)
  assert.ok(!hiddenImage.ok)
  assert.ok(!hiddenImage.text.includes(image.source.sha256) && !hiddenImage.text.includes('data:image/'))
  const imageAttempt = await action(a, 'analyze', { id: image.id, revision: image.revision })
  succeeded(imageAttempt)
  await Promise.all([run(a, imageAttempt.data.chatMessage), run(a, imageAttempt.data.chatMessage)])
  const imageReview = await get(a, image.id)
  assert.equal(imageReview.status, 'review', `duplicate image run: ${imageReview.errorCode}`)
  assert.equal(imageReview.source.sha256, image.source.sha256)
  assert.equal(imageReview.source.ocrText, image.source.ocrText)
  assert.equal(imageReview.revision, imageAttempt.data.draft.revision + 1)
  drafts.image = image.id
  pass('invalid/oversized uploads rejected; original image isolated; duplicate real DeepSeek image runs preserve the winning review')

  const missing = await create(b, 'missing cartons', '玛钢 90°弯头，规格 25，箱数未提供。')
  const failed = (await analyze(b, missing)).draft
  assert.equal(failed.status, 'failed')
  assert.ok(['analysis_failed', 'invalid_proposal'].includes(failed.errorCode), `Expected unresolved quantity, got ${failed.errorCode}`)
  assert.equal(failed.inquiry, missing.inquiry)
  assert.equal(failed.quote, null)
  let recoveredQuote
  if (withBrowser) {
    const { verifyRecoveryBrowser } = await import('./mvp-recovery-browser.mjs')
    const browser = await verifyRecoveryBrowser({ email: b.email, password: b.password, draftId: failed.id, inquiry })
    pass('ordinary-user browser corrects the failed draft, confirms quotation and restores it after refresh', browser)
    recoveredQuote = await get(b, failed.id)
  } else {
    const corrected = succeeded(await action(b, 'save_inquiry', { id: failed.id, revision: failed.revision, inquiry }))
    const recovered = (await analyze(b, corrected)).draft
    assert.equal(recovered.status, 'review')
    recoveredQuote = succeeded(await action(b, 'confirm', { id: recovered.id, revision: recovered.revision, lines: recovered.lines }))
  }
  assert.equal(recoveredQuote.quote.total, '15.51')
  assert.deepEqual(await get(b, missing.id), recoveredQuote)
  drafts.recovered = missing.id
  pass('real DeepSeek missing-quantity failure preserves inquiry; correction and retry produce a persisted quote on the same draft')

  while (performance.now() <= expiryWaitUntil) {
    console.log('Waiting for the original 120-second attempt to expire')
    await setTimeout(Math.min(30000, expiryWaitUntil - performance.now() + 100))
  }
  await run(a, oldAttempt.data.chatMessage)
  assert.deepEqual(await get(a, expiring.id), beforeAgentAttack, 'Expired attempt must leave the complete record unchanged')
  const restarted = await action(a, 'retry', { id: expiring.id, revision: oldAttempt.data.draft.revision })
  succeeded(restarted)
  assert.notEqual(restarted.data.chatMessage, oldAttempt.data.chatMessage)
  await run(a, oldAttempt.data.chatMessage)
  assert.deepEqual(await get(a, expiring.id), restarted.data.draft, 'Superseded attempt must leave the complete record unchanged')
  await run(a, restarted.data.chatMessage)
  assert.equal((await get(a, expiring.id)).status, 'review')
  pass('expired and superseded attempts cannot write; same-draft retry recovers')
} catch (error) {
  failure = error.message.split('\n')[0]
  console.error(`FAIL ${failure}`)
  process.exitCode = 1
} finally {
  for (const user of users.reverse()) {
    const result = { userId: user.id, grantRemoved: !user.grantAttempted, userSoftDeleted: false }
    try {
      if (user.grantAttempted) {
        await request(`/xpert/${assistantId}/sharing/users/${user.id}`, { method: 'DELETE' })
        result.grantRemoved = true
      }
    } catch (error) { result.revokeError = error.message }
    try {
      const deletion = await request(`/user/${user.id}`, { method: 'DELETE' })
      assert.equal(deletion?.affected, 1, 'Expected one temporary user to be soft deleted')
      result.userSoftDeleted = true
    } catch (error) { result.deleteError = error.message }
    cleanup.push(result)
  }
  let sharingRestored = false
  try {
    assert.deepEqual(await request(`/xpert/${assistantId}/sharing`), originalSharing)
    sharingRestored = true
  } catch { /* Report the failed readback without exposing sharing details. */ }
  if (!sharingRestored) { failure ??= 'Assistant sharing did not return to its original state'; process.exitCode = 1 }
  if (cleanup.some(({ grantRemoved, userSoftDeleted }) => !grantRemoved || !userSoftDeleted)) {
    failure ??= 'Temporary account cleanup did not finish'
    process.exitCode = 1
  }
  await saveLocal('mvp-boundaries.json', { runId, assistantId, completedAt: new Date().toISOString(),
    success: !failure, checks, drafts, cleanup, sharingRestored, failure })
  console.log(JSON.stringify({ completedChecks: checks.length, cleanupCount: cleanup.length, success: !process.exitCode }))
}
