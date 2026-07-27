jest.mock('@xpert-ai/plugin-sdk', () => ({
  MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE'
}))

import {
  WECHAT_INBOUND_AGGREGATE_JOB,
  WECHAT_INBOUND_FLUSH_JOB,
  WECHAT_INBOUND_QUEUE_NAME,
  WECHAT_PLUGIN_NAME
} from '../constants.js'
import { WechatTriggerAggregationService } from './wechat-trigger-aggregation.service.js'
import type { WechatTriggerAggregationState } from './wechat-trigger-aggregation.types.js'

describe('WechatTriggerAggregationService', () => {
  function createRedis(overrides: Record<string, jest.Mock> = {}) {
    return {
      get: jest.fn(async () => null),
      set: jest.fn(async () => 'OK'),
      del: jest.fn(async () => 1),
      eval: jest.fn(async () => 1),
      ...overrides
    }
  }

  function createService(redis = createRedis()) {
    const managedQueue = {
      enqueue: jest.fn(async (input: any) => ({ jobId: input?.jobId ?? 'job-1' })),
      getRedis: jest.fn(async () => redis)
    }
    const pluginContext = {
      scopeKey: 'org:org-1',
      resolve: jest.fn(() => managedQueue)
    }
    const service = new WechatTriggerAggregationService(pluginContext as any)
    return { service, managedQueue, redis }
  }

  function createState(overrides: Partial<WechatTriggerAggregationState> = {}): WechatTriggerAggregationState {
    return {
      aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 1,
      inputParts: ['hello'],
      currentInboundLogIds: ['log-1'],
      historyContext: '[历史上下文]',
      lastMessageAt: 1,
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latestMessage: {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend'
      },
      ...overrides
    }
  }

  it('adds aggregate and flush jobs with plugin-prefixed ids', async () => {
    const { service, managedQueue } = createService()
    const state = createState()

    await service.enqueueAggregate({
      aggregateKey: state.aggregateKey,
      integrationId: state.integrationId,
      accountUuid: state.accountUuid,
      xpertId: state.xpertId,
      input: 'hello',
      currentInboundLogIds: ['log-1'],
      summaryWindowSeconds: 5,
      sessionTimeoutSeconds: 3600,
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latestMessage: state.latestMessage
    })
    await service.enqueueFlush(state, 5000)

    expect(managedQueue.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        pluginName: WECHAT_PLUGIN_NAME,
        queueName: WECHAT_INBOUND_QUEUE_NAME,
        jobName: WECHAT_INBOUND_AGGREGATE_JOB,
        payload: expect.objectContaining({ aggregateKey: state.aggregateKey }),
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        scopeKey: 'org:org-1',
        jobId: expect.stringMatching(/^plugin_wechat_inbound_aggregate-/),
        attempts: 5
      })
    )
    expect(managedQueue.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        pluginName: WECHAT_PLUGIN_NAME,
        queueName: WECHAT_INBOUND_QUEUE_NAME,
        jobName: WECHAT_INBOUND_FLUSH_JOB,
        payload: {
          aggregateKey: state.aggregateKey,
          version: state.version,
          integrationId: 'integration-1',
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        },
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        scopeKey: 'org:org-1',
        jobId: expect.stringMatching(/^plugin_wechat_inbound_flush-/),
        delayMs: 5000,
        attempts: 3
      })
    )
  })

  it('stores aggregation state under plugin-prefixed Redis keys', async () => {
    const state = createState()
    const redis = createRedis({
      get: jest.fn(async () => JSON.stringify(state))
    })
    const { service } = createService(redis)

    await service.save(state, 60)
    await expect(service.get(state.aggregateKey, state)).resolves.toEqual(state)
    await service.clear(state.aggregateKey, state)

    expect(redis.set).toHaveBeenCalledWith(
      `plugin_wechat:trigger:tenant-1:org-1:integration-1:aggregate:${state.aggregateKey}`,
      JSON.stringify(state),
      'PX',
      60000
    )
    expect(redis.get).toHaveBeenCalledWith(`plugin_wechat:trigger:tenant-1:org-1:integration-1:aggregate:${state.aggregateKey}`)
    expect(redis.del).toHaveBeenCalledWith(`plugin_wechat:trigger:tenant-1:org-1:integration-1:aggregate:${state.aggregateKey}`)
  })

  it('runs callbacks while holding the per-aggregate Redis lock', async () => {
    const { service, redis } = createService()
    const callback = jest.fn(async () => 'done')

    await expect(service.withAggregateLock('aggregate-1', callback, 3000, {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      integrationId: 'integration-1'
    })).resolves.toBe('done')

    expect(redis.set).toHaveBeenCalledWith(
      'plugin_wechat:trigger:tenant-1:org-1:integration-1:lock:inbound:aggregate-1',
      expect.any(String),
      'PX',
      3000,
      'NX'
    )
    expect(callback).toHaveBeenCalledTimes(1)
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('pexpire'"),
      1,
      'plugin_wechat:trigger:tenant-1:org-1:integration-1:lock:inbound:aggregate-1',
      expect.any(String),
      '3000'
    )
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('get'"),
      1,
      'plugin_wechat:trigger:tenant-1:org-1:integration-1:lock:inbound:aggregate-1',
      expect.any(String)
    )
  })

  it('clears aggregate state only while the lock token is still owned', async () => {
    const { service, redis } = createService()
    const scope = {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      integrationId: 'integration-1'
    }

    await expect(
      service.withAggregateLock('aggregate-1', async (lease) => {
        await lease.clearStateIfOwned()
      }, 3000, scope)
    ).resolves.toBeUndefined()

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('del', KEYS[2])"),
      2,
      'plugin_wechat:trigger:tenant-1:org-1:integration-1:lock:inbound:aggregate-1',
      'plugin_wechat:trigger:tenant-1:org-1:integration-1:aggregate:aggregate-1',
      expect.any(String)
    )
  })

  it('does not clear aggregate state after lock ownership is lost', async () => {
    let lockToken = ''
    let aggregateState = 'version-2'
    const redis = createRedis({
      set: jest.fn(async (_key: string, token: string) => {
        lockToken = token
        return 'OK'
      }),
      eval: jest.fn(async (script: string, _keyCount: number, ...args: string[]) => {
        if (script.includes("redis.call('del', KEYS[2])")) {
          if (lockToken !== args[2]) {
            return -1
          }
          aggregateState = ''
          return 1
        }
        if (script.includes("redis.call('pexpire'")) {
          return lockToken === args[1] ? 1 : 0
        }
        return lockToken === args[1] ? 1 : 0
      })
    })
    const { service } = createService(redis)

    await expect(
      service.withAggregateLock('aggregate-1', async (lease) => {
        lockToken = 'new-owner-token'
        aggregateState = 'version-3'
        await lease.clearStateIfOwned()
      })
    ).rejects.toThrow('inbound_aggregate_lock_lost')

    expect(aggregateState).toBe('version-3')
  })

  it('renews the per-aggregate lock while the callback is still running', async () => {
    jest.useFakeTimers()
    try {
      const { service, redis } = createService()
      let finishCallback!: () => void
      const callbackGate = new Promise<void>((resolve) => {
        finishCallback = resolve
      })
      let notifyCallbackStarted!: () => void
      const callbackStarted = new Promise<void>((resolve) => {
        notifyCallbackStarted = resolve
      })

      const result = service.withAggregateLock(
        'aggregate-1',
        async () => {
          notifyCallbackStarted()
          await callbackGate
          return 'done'
        },
        3000
      )
      await callbackStarted
      await jest.advanceTimersByTimeAsync(7000)

      const evalCalls = redis.eval.mock.calls as unknown[][]
      const renewCalls = evalCalls.filter(([script]) => String(script).includes("redis.call('pexpire'"))
      expect(renewCalls.length).toBeGreaterThanOrEqual(2)

      finishCallback()
      await expect(result).resolves.toBe('done')
    } finally {
      jest.useRealTimers()
    }
  })

  it('rejects the callback result when aggregate lock ownership is lost', async () => {
    const redis = createRedis({
      eval: jest.fn(async (script: string) => script.includes("redis.call('pexpire'") ? 0 : 1)
    })
    const { service } = createService(redis)

    await expect(service.withAggregateLock('aggregate-1', async () => 'done')).rejects.toThrow(
      'inbound_aggregate_lock_lost'
    )
  })

  it('rejects when another worker owns the per-aggregate lock', async () => {
    const redis = createRedis({
      set: jest.fn(async () => null)
    })
    const { service } = createService(redis)
    const callback = jest.fn(async () => undefined)

    await expect(service.withAggregateLock('aggregate-1', callback)).rejects.toThrow('inbound_aggregate_lock_unavailable')

    expect(callback).not.toHaveBeenCalled()
  })
})
