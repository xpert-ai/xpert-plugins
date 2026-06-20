import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import type { Job, Queue } from 'bullmq'
import { randomUUID } from 'crypto'
import {
  WECHAT_PERSONAL_INBOUND_AGGREGATE_JOB,
  WECHAT_PERSONAL_INBOUND_FLUSH_JOB,
  WECHAT_PERSONAL_INBOUND_QUEUE_NAME
} from '../constants.js'
import {
  WechatPersonalTriggerAggregatePayload,
  WechatPersonalTriggerAggregationState,
  WechatPersonalTriggerFlushPayload
} from './wechat-personal-trigger-aggregation.types.js'

const DEFAULT_AGGREGATION_TTL_SECONDS = 2 * 60 * 60
const DEFAULT_LOCK_TTL_MS = 5000

type RedisLike = {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode?: string, ttlMode?: string | number, ttlOrMode?: number | string): Promise<string | null>
  del(...keys: string[]): Promise<number>
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>
}

@Injectable()
export class WechatPersonalTriggerAggregationService {
  constructor(
    @InjectQueue(WECHAT_PERSONAL_INBOUND_QUEUE_NAME)
    private readonly inboundQueue: Queue<WechatPersonalTriggerAggregatePayload | WechatPersonalTriggerFlushPayload>
  ) {}

  async enqueueAggregate(payload: WechatPersonalTriggerAggregatePayload): Promise<Job<WechatPersonalTriggerAggregatePayload>> {
    return this.inboundQueue.add(WECHAT_PERSONAL_INBOUND_AGGREGATE_JOB, payload, {
      jobId: `plugin_wechat_personal_inbound_aggregate-${randomUUID()}`,
      attempts: 5,
      backoff: {
        type: 'fixed',
        delay: 1000
      },
      removeOnComplete: {
        age: 24 * 60 * 60,
        count: 5000
      },
      removeOnFail: {
        age: 7 * 24 * 60 * 60,
        count: 5000
      }
    }) as Promise<Job<WechatPersonalTriggerAggregatePayload>>
  }

  async enqueueFlush(
    state: WechatPersonalTriggerAggregationState,
    delayMs: number
  ): Promise<Job<WechatPersonalTriggerFlushPayload>> {
    return this.inboundQueue.add(
      WECHAT_PERSONAL_INBOUND_FLUSH_JOB,
      {
        aggregateKey: state.aggregateKey,
        version: state.version
      },
      {
        jobId: `plugin_wechat_personal_inbound_flush-${randomUUID()}`,
        delay: Math.max(0, delayMs),
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 1000
        },
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 5000
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60,
          count: 5000
        }
      }
    ) as Promise<Job<WechatPersonalTriggerFlushPayload>>
  }

  async save(
    state: WechatPersonalTriggerAggregationState,
    ttlSeconds: number = DEFAULT_AGGREGATION_TTL_SECONDS
  ): Promise<void> {
    await (await this.getRedis()).set(this.buildKey(state.aggregateKey), JSON.stringify(state), 'PX', ttlSeconds * 1000)
  }

  async get(aggregateKey: string): Promise<WechatPersonalTriggerAggregationState | null> {
    const raw = await (await this.getRedis()).get(this.buildKey(aggregateKey))
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw) as WechatPersonalTriggerAggregationState
    } catch {
      await this.clear(aggregateKey)
      return null
    }
  }

  async clear(aggregateKey: string): Promise<void> {
    await (await this.getRedis()).del(this.buildKey(aggregateKey))
  }

  async withAggregateLock<T>(
    aggregateKey: string,
    callback: () => Promise<T>,
    ttlMs: number = DEFAULT_LOCK_TTL_MS
  ): Promise<T> {
    const token = randomUUID()
    const key = this.buildLockKey(aggregateKey)
    const acquired = await this.acquireLock(key, token, ttlMs)
    if (!acquired) {
      throw new Error('inbound_aggregate_lock_unavailable')
    }

    try {
      return await callback()
    } finally {
      await this.releaseLock(key, token)
    }
  }

  private async getRedis(): Promise<RedisLike> {
    return (await (this.inboundQueue as unknown as { client: Promise<RedisLike> }).client) as RedisLike
  }

  private async acquireLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    const result = await (await this.getRedis()).set(key, token, 'PX', ttlMs, 'NX')
    return result === 'OK'
  }

  private async releaseLock(key: string, token: string): Promise<void> {
    await (await this.getRedis()).eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      token
    )
  }

  private buildKey(aggregateKey: string): string {
    return `plugin_wechat_personal:trigger:aggregate:${aggregateKey}`
  }

  private buildLockKey(aggregateKey: string): string {
    return `plugin_wechat_personal:lock:inbound:${aggregateKey}`
  }
}
