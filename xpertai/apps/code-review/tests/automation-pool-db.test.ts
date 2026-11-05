import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { ReviewRepository } from '../src/automation-entities.js'
import { deferred } from './automation-lease.fixture.js'
import { fixture, url } from './automation-db.fixture.js'

test('one slow PR stage and 30 duplicates leave both the pool and unrelated PRs available', { skip: !url, timeout: 15000 }, async t => {
  const f = await fixture(t), entered = deferred(), finish = deferred()
  const run = await f.addRun(), other = await f.addRun(true, 2), samePull = await f.addRun()
  const step = await f.stepFor(run.id)
  let firstCall = true
  f.state.beforeGitHub = async () => { if (firstCall) { firstCall = false; entered.resolve(); await finish.promise } }
  const first = f.automation().processStep(step, f.context, 'first')
  try {
    await entered.promise
    const transactions: Array<{ count: number }> = await f.db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1 AND state = 'idle in transaction'", [f.schema])
    assert.equal(transactions[0].count, 0)
    await Promise.all(Array.from({ length: 30 }, () => f.automation().processStep(step, f.context, randomUUID())))
    await f.step(samePull.id)
    assert.equal(f.state.reads, 1, 'another SHA of the same PR also waits without a DB lock')
    await f.step(other.id)
    assert.equal(f.state.advances, 1, 'another PR in the SAME repository advances independently')
    await f.automation().process(f.p.id, f.context)
    assert.equal(f.state.reads, 2, 'repository scanning does no GitHub work')
    const locks = f.db.createQueryRunner()
    try {
      await locks.startTransaction()
      await locks.manager.findOneOrFail(ReviewRepository, { where: { id: f.p.id }, lock: { mode: 'pessimistic_write', onLocked: 'nowait' } })
      await locks.rollbackTransaction()
    } finally { await locks.release() }
  } finally { finish.resolve(); await first }
  assert.equal(f.state.advances, 2, 'each worker performs one phase exactly once')
})

test('short quota transactions preserve the daily cap across runs and retries', { skip: !url }, async t => {
  const f = await fixture(t)
  const first = await f.addRun(false), second = await f.addRun(false)
  await f.step(first.id)
  await f.step(second.id)
  await f.step(first.id)
  const rows = await f.runs.find({ order: { createdAt: 'ASC' } })
  assert.equal(rows.filter(row => row.startedAt).length, 1)
  assert.equal(rows.filter(row => row.status === 'skipped' && row.reason === 'daily_limit_reached').length, 1)
  assert.deepEqual(new Set(rows.map(row => row.id)), new Set([first.id, second.id]))
})

test('a contested quota row is skipped instead of queuing a connection behind its lock', { skip: !url }, async t => {
  const f = await fixture(t), run = await f.addRun(false), lock = f.db.createQueryRunner()
  await lock.startTransaction()
  try {
    await lock.manager.findOneOrFail(ReviewRepository, { where: { id: f.p.id }, lock: { mode: 'pessimistic_write' } })
    await f.step(run.id)
    assert.equal((await f.runs.findOneByOrFail({ id: run.id })).startedAt, null)
  } finally { await lock.rollbackTransaction(); await lock.release() }
  await f.step(run.id)
  assert((await f.runs.findOneByOrFail({ id: run.id })).startedAt)
})

test('ownership lost during GitHub IO stops platform dispatch and preserves the replacement lease', { skip: !url }, async t => {
  const f = await fixture(t), run = await f.addRun()
  f.state.beforeGitHub = async () => { for (const key of f.redis.values.keys()) f.redis.values.set(key, 'replacement') }
  await assert.rejects(f.step(run.id), /automation_lease_lost/)
  assert.equal(f.state.advances, 0)
  assert.equal((await f.runs.findOneByOrFail({ id: run.id })).reason, null, 'a stale owner cannot record a failure for its replacement')
  assert.deepEqual([...f.redis.values.values()], ['replacement'])
})

test('reserve, prepare and dispatch are separate recoverable jobs; stale jobs cannot advance a later phase', { skip: !url }, async t => {
  const f = await fixture(t), run = await f.addRun(false)
  const original = await f.stepFor(run.id)
  await f.step(run.id)
  assert((await f.runs.findOneByOrFail({ id: run.id })).startedAt)
  assert.equal(f.state.prepares, 0)
  assert.equal(f.state.advances, 0)
  assert(f.jobs.some(job => 'kind' in job.payload && job.payload.kind === 'review' && job.payload.phase === 'prepare' && job.delayMs === 0))
  await f.automation().processStep(original, f.context)
  assert.equal(f.state.prepares, 0)
  // Persisted phase survives a failed successor enqueue and a fresh service instance.
  f.state.queueUnavailable = true
  await assert.rejects(f.step(run.id), /Queue unavailable/)
  assert.equal(f.state.prepares, 1)
  assert((await f.runs.findOneByOrFail({ id: run.id })).reviewId)
  assert.equal(f.state.advances, 0)
  f.state.queueUnavailable = false
  await f.automation().recover()
  await f.automation().process(f.p.id, f.context)
  const dispatch = f.jobs.find(job => 'kind' in job.payload && job.payload.kind === 'review' && job.payload.id === run.id && job.payload.phase === 'dispatch')!
  assert(dispatch)
  await f.automation().processStep(dispatch.payload as Awaited<ReturnType<typeof f.stepFor>>, f.context)
  assert.equal(f.state.advances, 1)
  assert.equal(f.state.prepares, 1)
})

test('a dispatcher pages past waiting approvals without processing any external phase', { skip: !url }, async t => {
  const f = await fixture(t)
  for (let n = 1; n <= 55; n++) await f.addRun(true, n)
  await f.automation().process(f.p.id, f.context)
  const next = f.jobs.find(job => job.jobName === 'supervise')!
  assert(next && 'after' in next.payload && next.payload.after)
  await f.automation().process(f.p.id, f.context, undefined, (next.payload as { after: string }).after)
  assert.equal(new Set(f.jobs.filter(job => job.jobName === 'step').map(job => 'id' in job.payload && job.payload.id)).size, 55)
  assert.equal(f.state.reads, 0)
  assert.equal(f.redis.values.size, 0, 'scans hold no distributed lease')
})

test('a queued step cannot cross tenant, repository or execution-principal boundaries', { skip: !url }, async t => {
  const f = await fixture(t), run = await f.addRun(), step = await f.stepFor(run.id)
  await assert.rejects(f.automation().processStep(step, { ...f.context, userId: randomUUID() }), /queue_scope_mismatch/)
  await assert.rejects(f.automation().processStep(step, { ...f.context, tenantId: randomUUID() }), /queue_scope_mismatch/)
  await f.automation().processStep({ ...step, id: randomUUID() }, f.context)
  assert.equal(f.state.advances, 0)
})

test('concurrent PR stages retain the shared daily quota after removing the repository lease', { skip: !url }, async t => {
  const f = await fixture(t)
  const runs = await Promise.all(Array.from({ length: 6 }, (_, n) => f.addRun(false, n + 1)))
  await Promise.all(runs.map(run => f.step(run.id)))
  // SKIP LOCKED contenders remain recoverable and compete in a later invocation.
  for (const run of runs) if (!(await f.runs.findOneByOrFail({ id: run.id })).startedAt) await f.step(run.id)
  const saved = await f.runs.find()
  assert.equal(saved.filter(run => run.startedAt).length, 1)
  assert.equal(saved.filter(run => run.reason === 'daily_limit_reached').length, 5)
})
