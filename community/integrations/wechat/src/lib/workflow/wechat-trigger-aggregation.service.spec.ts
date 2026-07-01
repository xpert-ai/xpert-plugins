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
      expect.stringContaining("redis.call('get'"),
      1,
      'plugin_wechat:trigger:tenant-1:org-1:integration-1:lock:inbound:aggregate-1',
      expect.any(String)
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
