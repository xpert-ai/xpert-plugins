import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withAutomationLease } from '../src/automation-lease.js'
import { LeaseRedis, deferred } from './automation-lease.fixture.js'

const scope = { tenantId: 'tenant', organizationId: 'org', id: 'repo' }
test('duplicate stages exit immediately while unrelated resources continue', async () => {
  const redis = new LeaseRedis(), entered = deferred(), finish = deferred()
  const first = withAutomationLease(redis, scope, async () => { entered.resolve(); await finish.promise })
  await entered.promise
  try {
    const duplicates = await Promise.all(Array.from({ length: 30 }, () => withAutomationLease(redis, scope, async () => assert.fail('duplicate work'))))
    assert(duplicates.every(result => result === false))
    assert.equal(await withAutomationLease(redis, { ...scope, id: 'another' }, async () => {}), true)
  } finally { finish.resolve(); await first }
  assert.equal(redis.values.size, 0)
})

test('a stale owner stops and cannot delete a replacement lease', async () => {
  const redis = new LeaseRedis()
  await assert.rejects(withAutomationLease(redis, scope, async assertOwned => {
    const key = [...redis.values.keys()][0]
    redis.values.set(key, 'replacement')
    await assert.rejects(assertOwned(), /automation_lease_lost/)
  }), /automation_lease_lost/)
  assert.deepEqual([...redis.values.values()], ['replacement'])
})

test('a failed renewal remains failed even if Redis later recovers', async () => {
  const redis = new LeaseRedis()
  await assert.rejects(withAutomationLease(redis, scope, async assertOwned => {
    redis.unavailable = true
    await assert.rejects(assertOwned(), /automation_lease_lost/)
    redis.unavailable = false
    await assert.rejects(assertOwned(), /automation_lease_lost/)
  }), /automation_lease_lost/)
  assert.equal(redis.values.size, 0)
})

test('a failed operation releases its own lease for a retry', async () => {
  const redis = new LeaseRedis()
  await assert.rejects(withAutomationLease(redis, scope, async () => { throw new Error('transient failure') }), /transient failure/)
  assert.equal(await withAutomationLease(redis, scope, async () => {}), true)
})
