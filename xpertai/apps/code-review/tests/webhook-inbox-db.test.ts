import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHmac, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { ReviewDelivery, ReviewRepository } from '../src/automation-entities.js'
import { WorkflowDiagnosis } from '../src/workflow-entity.js'
import { fixture, url } from './automation-db.fixture.js'
import { deferred } from './automation-lease.fixture.js'

const pull = { action: 'opened', installation: { id: 1 }, repository: { id: 2, name: 'repo', owner: { login: 'fixture' } },
  pull_request: { number: 1, title: 'Fixture', state: 'open', draft: false, head: { sha: 'a'.repeat(40) }, base: { ref: 'main' }, user: { login: 'fixture', type: 'User' } } }
const workflow = { action: 'completed', installation: { id: 1 }, repository: { id: 2 }, workflow_run: {
  id: 25, run_attempt: 1, head_sha: 'a'.repeat(40), head_branch: 'main', name: 'CI', conclusion: 'failure', status: 'completed', html_url: 'https://github.com/fixture/repo/actions/runs/25' } }
function signed(secret: string, body: object = pull) {
  const raw = Buffer.from(JSON.stringify(body))
  return { raw, signature: 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex') }
}

for (const event of ['pull_request', 'workflow_run'] as const) {
  test(`${event}: lock contention and queue outage preserve an acknowledged event for restart recovery`, { skip: !url }, async t => {
    const f = await fixture(t), deliveries = f.db.getRepository(ReviewDelivery)
    f.p.settings.onWorkflowFailure = true
    await f.records.save(f.p)
    const packet = signed(f.application.webhookSecret!, event === 'pull_request' ? pull : workflow), deliveryId = randomUUID()
    const lock = f.db.createQueryRunner()
    await lock.startTransaction()
    f.state.queueUnavailable = true
    try {
      await lock.manager.findOneOrFail(ReviewRepository, { where: { id: f.p.id }, lock: { mode: 'pessimistic_write' } })
      assert.deepEqual(await f.automation().receive(packet.raw, packet.signature, deliveryId, event), { accepted: true })
      const pending = await deliveries.findOneByOrFail({ deliveryId })
      assert.equal(pending.status, 'received')
      assert(pending.payload)
      // A fresh service instance has only persisted input; NOWAIT must not consume the second connection waiting.
      await f.drainInbox(await f.repositories.execution(f.p), async () => {})
      const retry = await deliveries.findOneByOrFail({ deliveryId })
      assert.equal(retry.status, 'received'); assert.equal(retry.attempts, 1); assert(retry.payload)
      assert.equal(await f.runs.count(), 0)
      assert.equal(await f.db.getRepository(WorkflowDiagnosis).count(), 0)
      await f.db.query('SELECT 1')
      assert.equal(await f.automation().recover(), false)
    } finally { await lock.rollbackTransaction(); await lock.release() }
    f.state.queueUnavailable = false
    assert.equal(await f.automation().recover(), true)
    assert(f.state.scheduled > 0)
    await deliveries.update({ deliveryId }, { retryAt: new Date(0) })
    await f.drainInbox(await f.repositories.execution(f.p), async () => {})
    const processed = await deliveries.findOneByOrFail({ deliveryId })
    assert.equal(processed.status, 'processed'); assert.equal(processed.payload, null); assert.equal(processed.errorCode, null)
    assert(processed.runId)
    assert.equal(await (event === 'pull_request' ? f.runs : f.db.getRepository(WorkflowDiagnosis)).count(), 1)
    await f.automation().receive(packet.raw, packet.signature, deliveryId, event)
    await f.drainInbox(await f.repositories.execution(f.p), async () => {})
    assert.equal(await (event === 'pull_request' ? f.runs : f.db.getRepository(WorkflowDiagnosis)).count(), 1)
  })
}

test('webhook authentication, concurrent duplicates and payload mismatch preserve one immutable receipt', { skip: !url }, async t => {
  const f = await fixture(t), deliveries = f.db.getRepository(ReviewDelivery), deliveryId = randomUUID()
  const packet = signed(f.application.webhookSecret!, { ...pull, ignoredSecret: 'must-not-be-stored' })
  await assert.rejects(f.inbox().accept(packet.raw, 'sha256=' + '0'.repeat(64), deliveryId, 'pull_request'), /invalid_webhook_signature/)
  assert.equal(await deliveries.count(), 0)
  await Promise.all(Array.from({ length: 12 }, () => f.inbox().accept(packet.raw, packet.signature, deliveryId, 'pull_request')))
  assert.equal(await deliveries.count(), 1)
  assert.doesNotMatch(JSON.stringify((await deliveries.findOneByOrFail({ deliveryId })).payload), /must-not-be-stored|webhookSecret|signature/)
  const changed = signed(f.application.webhookSecret!, { ...pull, action: 'reopened' })
  await assert.rejects(f.inbox().accept(changed.raw, changed.signature, deliveryId, 'pull_request'), /delivery_payload_mismatch/)
  await f.inbox().accept(packet.raw, packet.signature, randomUUID(), 'pull_request')
  await Promise.all([f.drainInbox(await f.repositories.execution(f.p), async () => {}), f.drainInbox(await f.repositories.execution(f.p), async () => {})])
  await deliveries.update({ status: 'received' }, { retryAt: new Date(0) })
  await f.drainInbox(await f.repositories.execution(f.p), async () => {})
  assert.equal(await f.runs.count(), 1)
  assert.equal(await deliveries.countBy({ status: 'processed' }), 2)
})

test('run creation and inbox acknowledgement roll back together and remain retryable', { skip: !url }, async t => {
  const f = await fixture(t), deliveries = f.db.getRepository(ReviewDelivery), packet = signed(f.application.webhookSecret!), deliveryId = randomUUID()
  await f.inbox().accept(packet.raw, packet.signature, deliveryId, 'pull_request')
  await f.db.query(`CREATE FUNCTION reject_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.status = 'processed' THEN RAISE EXCEPTION 'fixture ack failure'; END IF; RETURN NEW; END $$`)
  await f.db.query('CREATE TRIGGER reject_ack BEFORE UPDATE ON plugin_code_review_delivery FOR EACH ROW EXECUTE FUNCTION reject_ack()')
  await f.drainInbox(await f.repositories.execution(f.p), async () => {})
  assert.equal(await f.runs.count(), 0)
  assert.equal((await deliveries.findOneByOrFail({ deliveryId })).status, 'received')
  assert.equal((await f.records.findOneByOrFail({ id: f.p.id })).lastEventAt, null)
  await f.db.query('DROP TRIGGER reject_ack ON plugin_code_review_delivery')
  await deliveries.update({ deliveryId }, { retryAt: new Date(0) })
  await f.drainInbox(await f.repositories.execution(f.p), async () => {})
  assert.equal(await f.runs.count(), 1)
  assert.equal((await deliveries.findOneByOrFail({ deliveryId })).status, 'processed')
})

test('slow authorization holds no transaction and a changed policy cannot consume an old checked revision', { skip: !url }, async t => {
  const f = await fixture(t), packet = signed(f.application.webhookSecret!), deliveryId = randomUUID(), entered = deferred(), release = deferred()
  await f.inbox().accept(packet.raw, packet.signature, deliveryId, 'pull_request')
  const execution = await f.repositories.execution(f.p)
  t.mock.method(f.repositories, 'execution', async () => { entered.resolve(); await release.promise; return execution })
  const processing = f.drainInbox(execution, async () => {})
  try {
    await entered.promise
    const [activity] = await f.db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1 AND state = 'idle in transaction'", [f.schema])
    assert.equal(activity.count, 0)
    await f.records.update(f.p.id, { revision: 2, executionRevision: 2 })
  } finally { release.resolve(); await processing }
  const deliveries = f.db.getRepository(ReviewDelivery)
  assert.equal(await f.runs.count(), 0)
  assert.equal((await deliveries.findOneByOrFail({ deliveryId })).status, 'received')
  await deliveries.update({ deliveryId }, { retryAt: new Date(0) })
  await f.drainInbox(await f.records.findOneByOrFail({ id: f.p.id }), async () => {})
  assert.equal((await deliveries.findOneByOrFail({ deliveryId })).errorCode, 'webhook_binding_changed')
  assert.equal(await f.runs.count(), 0)
})

test('an App switch invalidates a pending delivery without dispatching it under the replacement App', { skip: !url }, async t => {
  const f = await fixture(t), packet = signed(f.application.webhookSecret!), deliveryId = randomUUID()
  await f.inbox().accept(packet.raw, packet.signature, deliveryId, 'pull_request')
  f.application.appId = '4'
  await f.drainInbox(await f.repositories.execution(f.p), async () => {})
  assert.equal(await f.runs.count(), 0)
  assert.equal((await f.db.getRepository(ReviewDelivery).findOneByOrFail({ deliveryId })).errorCode, 'webhook_binding_changed')
})

test('a transient authorization failure retains the event instead of marking it skipped', { skip: !url }, async t => {
  const f = await fixture(t), packet = signed(f.application.webhookSecret!), deliveryId = randomUUID()
  await f.inbox().accept(packet.raw, packet.signature, deliveryId, 'pull_request')
  const original = f.repositories.execution.bind(f.repositories)
  const unavailable = t.mock.method(f.repositories, 'execution', async () => { throw new Error('host connection unavailable') })
  await f.drainInbox(f.p, async () => {})
  const deliveries = f.db.getRepository(ReviewDelivery)
  assert.equal((await deliveries.findOneByOrFail({ deliveryId })).status, 'received')
  assert.equal(await f.runs.count(), 0)
  unavailable.mock.restore()
  await deliveries.update({ deliveryId }, { retryAt: new Date(0) })
  await f.drainInbox(await original(f.p), async () => {})
  assert.equal(await f.runs.count(), 1)
})

test('inbox migration is additive and replayable for legacy processed deliveries', { skip: !url }, async t => {
  const f = await fixture(t), deliveries = f.db.getRepository(ReviewDelivery)
  const legacy = await deliveries.save({ deliveryId: randomUUID(), event: 'pull_request', digest: 'legacy', status: 'processed' })
  await f.db.query('ALTER TABLE plugin_code_review_delivery DROP COLUMN "repositoryPolicyId", DROP COLUMN payload, DROP COLUMN attempts, DROP COLUMN "retryAt", DROP COLUMN "errorCode"')
  const migration = await readFile(new URL('../migrations/20261105-webhook-inbox.sql', import.meta.url), 'utf8')
  await f.db.query(migration); await f.db.query(migration)
  const upgraded = await deliveries.findOneByOrFail({ id: legacy.id })
  assert.equal(upgraded.status, 'processed'); assert.equal(upgraded.digest, 'legacy'); assert.equal(upgraded.payload, null)
  const packet = signed(f.application.webhookSecret!)
  await f.inbox().accept(packet.raw, packet.signature, randomUUID(), 'pull_request')
  await f.drainInbox(await f.repositories.execution(f.p), async () => {})
  assert.equal(await f.runs.count(), 1)
})

test('a delivery job acknowledges one receipt and hands off to its review stage without draining its neighbors', { skip: !url }, async t => {
  const f = await fixture(t)
  for (const number of [1, 2]) {
    const packet = signed(f.application.webhookSecret!, { ...pull, pull_request: { ...pull.pull_request, number } })
    await f.inbox().accept(packet.raw, packet.signature, randomUUID(), 'pull_request')
  }
  await f.automation().process(f.p.id, f.context)
  const job = f.jobs.find(job => 'kind' in job.payload && job.payload.kind === 'delivery')!
  assert(job && 'kind' in job.payload)
  if (!('kind' in job.payload)) throw new Error('Expected delivery job')
  await f.automation().processStep(job.payload, f.context)
  assert.equal(await f.db.getRepository(ReviewDelivery).countBy({ status: 'received' }), 1)
  assert.equal(await f.runs.count(), 1)
  assert.equal(f.state.reads, 0, 'intake never performs a review stage')
  assert(f.jobs.some(job => 'kind' in job.payload && job.payload.kind === 'review' && job.payload.phase === 'reserve'))
  assert.equal(f.redis.values.size, 0, 'handoff does not retain the delivery lease')
})
