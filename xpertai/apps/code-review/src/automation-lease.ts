// One external-I/O stage per lease; never span a repository scan, another stage, or Agent execution.
import { randomUUID } from 'node:crypto'
import type { ManagedQueueRedis } from '@xpert-ai/plugin-sdk'
import { ReviewError } from './domain.js'

export type AssertAutomationOwnership = () => Promise<void>
const leaseMs = 60_000
const renew = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end"
const release = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"

export async function withAutomationLease(redis: ManagedQueueRedis,
  scope: { tenantId: string; organizationId: string; id: string }, work: (assertOwned: AssertAutomationOwnership) => Promise<void>) {
  const key = `plugin_code_review:${scope.tenantId}:${scope.organizationId}:automation:${scope.id}`
  const token = randomUUID()
  if (await redis.set(key, token, 'PX', leaseMs, 'NX') !== 'OK') return false
  let lost = false
  let renewal: Promise<void> | undefined
  const assertOwned = async () => {
    if (lost) throw new ReviewError('automation_lease_lost')
    renewal ??= (async () => {
      try {
        if (await redis.eval(renew, 1, key, token, leaseMs) !== 1) lost = true
      } catch { lost = true }
    })().finally(() => { renewal = undefined })
    await renewal
    if (lost) throw new ReviewError('automation_lease_lost')
  }
  const timer = setInterval(() => { void assertOwned().catch(() => undefined) }, 20_000)
  timer.unref()
  try {
    await work(assertOwned)
    await assertOwned()
    return true
  } finally {
    clearInterval(timer)
    await renewal
    // A stale worker must never delete a replacement's lease; expiry handles an unavailable Redis.
    await redis.eval(release, 1, key, token).catch(() => undefined)
  }
}
