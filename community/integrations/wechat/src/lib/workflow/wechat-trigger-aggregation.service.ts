import { Inject, Injectable } from '@nestjs/common'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  type ManagedQueueRedis,
  type ManagedQueueService,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import {
  WECHAT_INBOUND_AGGREGATE_JOB,
  WECHAT_INBOUND_FLUSH_JOB,
  WECHAT_INBOUND_QUEUE_NAME,
  WECHAT_INBOUND_QUEUE_PREFIX,
  WECHAT_PLUGIN_NAME
} from '../constants.js'
import { WECHAT_PLUGIN_CONTEXT } from '../tokens.js'
import {
  WechatTriggerAggregatePayload,
  WechatTriggerAggregationState,
  WechatTriggerFlushPayload
} from './wechat-trigger-aggregation.types.js'

const DEFAULT_AGGREGATION_TTL_SECONDS = 2 * 60 * 60
const DEFAULT_LOCK_TTL_MS = 5000

type RedisLike = ManagedQueueRedis
type AggregationScope = {
  integrationId?: string | null
  tenantId?: string | null
  organizationId?: string | null
}

@Injectable()
export class WechatTriggerAggregationService {
  private _managedQueueService?: ManagedQueueService

  constructor(
    @Inject(WECHAT_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get managedQueueService(): ManagedQueueService {
    if (!this._managedQueueService) {
      this._managedQueueService = this.pluginContext.resolve(MANAGED_QUEUE_SERVICE_TOKEN)
    }
    return this._managedQueueService
  }

  async enqueueAggregate(payload: WechatTriggerAggregatePayload): Promise<{ id: string }> {
    const job = await this.managedQueueService.enqueue<WechatTriggerAggregatePayload>({
      pluginName: WECHAT_PLUGIN_NAME,
      queueName: WECHAT_INBOUND_QUEUE_NAME,
      jobName: WECHAT_INBOUND_AGGREGATE_JOB,
      payload,
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      scopeKey: this.scopeKey,
      jobId: `${WECHAT_INBOUND_AGGREGATE_JOB}-${randomUUID()}`,
      attempts: 5,
      backoffMs: {
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
    })
    return { id: job.jobId }
  }

  async enqueueFlush(
    state: WechatTriggerAggregationState,
    delayMs: number
  ): Promise<{ id: string }> {
    const payload: WechatTriggerFlushPayload = {
      aggregateKey: state.aggregateKey,
      version: state.version,
      integrationId: state.integrationId,
      tenantId: state.tenantId,
      organizationId: state.organizationId
    }
    const job = await this.managedQueueService.enqueue<WechatTriggerFlushPayload>({
      pluginName: WECHAT_PLUGIN_NAME,
      queueName: WECHAT_INBOUND_QUEUE_NAME,
      jobName: WECHAT_INBOUND_FLUSH_JOB,
      payload,
      tenantId: state.tenantId,
      organizationId: state.organizationId,
      scopeKey: this.scopeKey,
      jobId: `${WECHAT_INBOUND_FLUSH_JOB}-${randomUUID()}`,
      delayMs: Math.max(0, delayMs),
      attempts: 3,
      backoffMs: {
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
    })
    return { id: job.jobId }
  }

  async save(
    state: WechatTriggerAggregationState,
    ttlSeconds: number = DEFAULT_AGGREGATION_TTL_SECONDS
  ): Promise<void> {
    await (await this.getRedis()).set(this.buildKey(state.aggregateKey, state), JSON.stringify(state), 'PX', ttlSeconds * 1000)
  }

  async get(aggregateKey: string, scope?: AggregationScope): Promise<WechatTriggerAggregationState | null> {
    const raw = await (await this.getRedis()).get(this.buildKey(aggregateKey, scope))
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw) as WechatTriggerAggregationState
    } catch {
      await this.clear(aggregateKey, scope)
      return null
    }
  }

  async clear(aggregateKey: string, scope?: AggregationScope): Promise<void> {
    await (await this.getRedis()).del(this.buildKey(aggregateKey, scope))
  }

  async withAggregateLock<T>(
    aggregateKey: string,
    callback: () => Promise<T>,
    ttlMs: number = DEFAULT_LOCK_TTL_MS,
    scope?: AggregationScope
  ): Promise<T> {
    const token = randomUUID()
    const key = this.buildLockKey(aggregateKey, scope)
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
    return this.managedQueueService.getRedis()
  }

  private get scopeKey(): string | null {
    return (this.pluginContext as { scopeKey?: string | null }).scopeKey ?? null
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

  private buildKey(aggregateKey: string, scope?: AggregationScope): string {
    const prefix = this.buildScopedPrefix(scope)
    if (!prefix) {
      return `${WECHAT_INBOUND_QUEUE_PREFIX}:trigger:aggregate:${aggregateKey}`
    }
    return `${prefix}:aggregate:${aggregateKey}`
  }

  private buildLockKey(aggregateKey: string, scope?: AggregationScope): string {
    const prefix = this.buildScopedPrefix(scope)
    if (!prefix) {
      return `${WECHAT_INBOUND_QUEUE_PREFIX}:lock:inbound:${aggregateKey}`
    }
    return `${prefix}:lock:inbound:${aggregateKey}`
  }

  private buildScopedPrefix(scope?: AggregationScope): string | null {
    const tenantId = typeof scope?.tenantId === 'string' && scope.tenantId ? scope.tenantId : null
    const integrationId = typeof scope?.integrationId === 'string' && scope.integrationId ? scope.integrationId : null
    if (!tenantId && !integrationId) {
      return null
    }
    const organizationId = typeof scope?.organizationId === 'string' && scope.organizationId ? scope.organizationId : 'org_global'
    return [
      WECHAT_INBOUND_QUEUE_PREFIX,
      'trigger',
      tenantId || 'tenant_global',
      organizationId,
      integrationId || 'integration_unknown'
    ].join(':')
  }
}
