const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DashboardSaveRequests } = require('../dist/lib/save-requests.js')
const { setup } = require('./service-fixture.cjs')
const example = require('../examples/postgres-sales.json')
function fixture() {
  const f = setup(), state = new Map(), jobs = new Map()
  Object.assign(f.context, { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), hostId: randomUUID() })
  const files = f.capabilities['platform.workspace.files'], upload = files.uploadBuffer
  files.uploadBuffer = async input => { const saved = await upload(input); return { ...saved, workspacePath: saved.filePath } }
  files.deleteFile = async ref => { f.files.delete(ref.filePath) }
  let failCompletion = false
  const redis = {
    async get(key) { return state.get(key) ?? null },
    async set(key, value) { if (failCompletion && JSON.parse(value).state === 'succeeded') { failCompletion = false; throw Error('status store disconnected') } state.set(key, value) },
    async eval(_lua, _count, dedupe, key, id, value) { const old = state.get(dedupe); if (old) return old; state.set(dedupe, id); state.set(key, value); return id }
  }
  const queue = { async getRedis() { return redis }, async enqueue(input) { if (!jobs.has(input.jobId)) jobs.set(input.jobId, { ...input, state: 'waiting' }); return { jobId: input.jobId } }, async getJob({ jobId }) { return jobs.get(jobId) } }
  const make = () => new DashboardSaveRequests(f.service, { require: key => f.capabilities[key.id] }, queue)
  const service = make(), manifest = { ...structuredClone(example), id: randomUUID() }
  return { ...f, state, jobs, service, make, manifest, failCompletion() { failCompletion = true },
    async run(request) { const job = [...jobs.values()].find(job => job.payload.requestId === request.requestId); job.state = 'active'
      try { await make().handle({ data: job.payload }, f.context); job.state = 'completed' }
      catch (error) { job.state = 'failed'; job.failedReason = error.message; throw error }
    } }
}
test('durable submit freezes input, is idempotent, restores identity and returns a receipt only after CAS', async () => {
  const f = fixture()
  const [a, b] = await Promise.all([f.service.submit(f.context, f.manifest, null, 0, 'same'), f.service.submit(f.context, f.manifest, null, 0, 'same')])
  assert.equal(a.requestId, b.requestId); assert.equal(a.terminal, false); assert.equal(a.dashboard, undefined); assert.equal(f.jobs.size, 1)
  await assert.rejects(f.service.submit(f.context, { ...f.manifest, title: 'different' }, null, 0, 'same'), /IDEMPOTENCY_CONFLICT/)
  f.manifest.title = 'mutated after submit'
  await f.run(a)
  const result = await f.make().get(f.context, a.requestId)
  assert.equal(result.terminal, true); assert.equal(result.state, 'succeeded'); assert.equal(result.dashboard.draftRevision, 1)
  assert.notEqual(result.dashboard.title, f.manifest.title)
  assert(f.calls.queries.every(call => call.actor.userId === f.context.userId))
  assert.equal([...f.files.keys()].filter(key => key.startsWith('live-dashboard-save/')).length, 0)
  assert.equal((await f.make().get(f.context, a.requestId)).cursor, result.cursor)
})
test('scope replacement and revoked data access cannot complete a background save', async () => {
  const f = fixture(), request = await f.service.submit(f.context, f.manifest, null, 0, 'access')
  for (const field of ['tenantId', 'organizationId', 'userId', 'hostId']) await assert.rejects(f.make().get({ ...f.context, [field]: randomUUID() }, request.requestId), /DENIED|UNAVAILABLE/)
  await assert.rejects(f.make().handle({ data: { requestId: request.requestId } }, { ...f.context, userId: randomUUID() }), /DENIED/)
  f.calls.denied = true
  await assert.rejects(f.run(request))
  const result = await f.make().get(f.context, request.requestId)
  assert.equal(result.state, 'failed'); assert.equal(result.dashboard, undefined); assert.equal(f.artifacts.size, 0)
})
test('cancelling a wait releases the observer while durable work continues', async () => {
  const f = fixture(), request = await f.service.submit(f.context, f.manifest, null, 0, 'wait'), controller = new AbortController()
  const waiting = f.service.wait(f.context, request.requestId, request.cursor, controller.signal)
  controller.abort()
  await assert.rejects(waiting, { name: 'AbortError' })
  await f.run(request)
  assert.equal((await f.service.get(f.context, request.requestId)).state, 'succeeded')
})
test('a successful CAS followed by status-store interruption is recovered without a second revision', async () => {
  const f = fixture(), request = await f.service.submit(f.context, f.manifest, null, 0, 'crash')
  f.failCompletion()
  await assert.rejects(f.run(request), /COMMIT_UNCONFIRMED/)
  const result = await f.make().get(f.context, request.requestId)
  assert.equal(result.state, 'succeeded'); assert.equal(result.dashboard.draftRevision, 1); assert.equal(f.artifacts.size, 1)
  assert.equal([...f.files.keys()].filter(key => key.startsWith('live-dashboard-save/')).length, 0)
})
test('queue submission interruption can re-enqueue the same job on recovery', async () => {
  const f = fixture(), request = await f.service.submit(f.context, f.manifest, null, 0, 'enqueue')
  const id = [...f.jobs.keys()][0]; f.jobs.clear()
  assert.equal((await f.make().get(f.context, request.requestId)).state, 'queued')
  assert.deepEqual([...f.jobs.keys()], [id])
})


test('failed first background save discards its empty artifact and a new request can retry', async () => {
  const f = fixture(), request = await f.service.submit(f.context, f.manifest, null, 0, 'upload-failure')
  f.calls.failUpload = true
  await assert.rejects(f.run(request), /DASHBOARD_SAVE_VALIDATION_FAILED/)
  assert.equal((await f.make().get(f.context, request.requestId)).state, 'failed')
  assert.equal(f.artifacts.size, 1)
  assert.equal([...f.artifacts.values()][0].status, 'deleted')
  assert.equal(f.drafts.size, 0)
  f.calls.failUpload = false
  const retry = await f.service.submit(f.context, f.manifest, null, 0, 'upload-retry')
  await f.run(retry)
  const result = await f.make().get(f.context, retry.requestId)
  assert.equal(result.state, 'succeeded')
  assert.equal(result.dashboard.draftRevision, 1)
  assert.equal(f.artifacts.size, 1)
})
