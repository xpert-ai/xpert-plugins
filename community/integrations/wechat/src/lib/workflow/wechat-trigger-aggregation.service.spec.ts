import {
  WECHAT_INBOUND_AGGREGATE_JOB,
  WECHAT_INBOUND_FLUSH_JOB
} from '../constants.js'
import { WechatTriggerAggregationService } from './wechat-trigger-aggregation.service.js'
import { WechatTriggerAggregationState } from './wechat-trigger-aggregation.types.js'

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
    const queue = {
      client: Promise.resolve(redis),
      add: jest.fn(async (_name, _data, opts) => ({ id: opts?.jobId ?? 'job-1' }))
    }
    const service = new WechatTriggerAggregationService(queue as any)
    return { service, queue, redis }
  }

  function createState(overrides: Partial<WechatTriggerAggregationState> = {}): WechatTriggerAggregationState {
    return {
      aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      integrationId: 'integration-1',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 1,
      inputParts: ['hello'],
      currentInboundLogIds: ['log-1'],
      historyContext: '[历史上下文]',
      lastMessageAt: 1,
      tenantId: 'tenant-1',
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
    const { service, queue } = createService()
    const state = createState()

    await service.enqueueAggregate({
      aggregateKey: state.aggregateKey,
      integrationId: state.integrationId,
      xpertId: state.xpertId,
      input: 'hello',
      currentInboundLogIds: ['log-1'],
      summaryWindowSeconds: 5,
      sessionTimeoutSeconds: 3600,
      tenantId: 'tenant-1',
      latestMessage: state.latestMessage
    })
    await service.enqueueFlush(state, 5000)

    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      WECHAT_INBOUND_AGGREGATE_JOB,
      expect.objectContaining({ aggregateKey: state.aggregateKey }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^plugin_wechat_inbound_aggregate-/),
        attempts: 5
      })
    )
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      WECHAT_INBOUND_FLUSH_JOB,
      {
        aggregateKey: state.aggregateKey,
        version: state.version
      },
      expect.objectContaining({
        jobId: expect.stringMatching(/^plugin_wechat_inbound_flush-/),
        delay: 5000,
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
    await expect(service.get(state.aggregateKey)).resolves.toEqual(state)
    await service.clear(state.aggregateKey)

    expect(redis.set).toHaveBeenCalledWith(
      `plugin_wechat:trigger:aggregate:${state.aggregateKey}`,
      JSON.stringify(state),
      'PX',
      60000
    )
    expect(redis.get).toHaveBeenCalledWith(`plugin_wechat:trigger:aggregate:${state.aggregateKey}`)
    expect(redis.del).toHaveBeenCalledWith(`plugin_wechat:trigger:aggregate:${state.aggregateKey}`)
  })

  it('runs callbacks while holding the per-aggregate Redis lock', async () => {
    const { service, redis } = createService()
    const callback = jest.fn(async () => 'done')

    await expect(service.withAggregateLock('aggregate-1', callback, 3000)).resolves.toBe('done')

    expect(redis.set).toHaveBeenCalledWith(
      'plugin_wechat:lock:inbound:aggregate-1',
      expect.any(String),
      'PX',
      3000,
      'NX'
    )
    expect(callback).toHaveBeenCalledTimes(1)
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('get'"), 1, 'plugin_wechat:lock:inbound:aggregate-1', expect.any(String))
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
