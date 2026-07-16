import { Inject, Injectable } from '@nestjs/common'
import { MANAGED_QUEUE_SERVICE_TOKEN, type ManagedQueueService, type PluginContext } from '@xpert-ai/plugin-sdk'
import { LARK_PLUGIN_NAME } from './constants.js'
import { buildLarkHistoryCleanupJobId, buildLarkHistoryMaterializeJobId } from './lark-job-id.js'
import { LARK_PLUGIN_CONTEXT } from './tokens.js'

export const LARK_HISTORY_QUEUE_NAME = 'lark-message-history'
export const LARK_HISTORY_MATERIALIZE_JOB = 'materialize-files'
export const LARK_HISTORY_CLEANUP_JOB = 'cleanup-expired'

export type LarkHistoryMaterializeJobData = {
  kind: 'materialize-files'
  integrationId: string
  xpertId: string
  tenantId?: string
  organizationId?: string
  messageLogIds: string[]
  maxSizeMb: number
  continuation?: number
}

export type LarkHistoryCleanupJobData = {
  kind: 'cleanup-expired'
  integrationId: string
  tenantId?: string
  organizationId?: string
  retentionDays: number
  /** Deterministic continuation number used to drain large expired backlogs in bounded batches. */
  continuation?: number
  /** Keyset cursor lets one cleanup run advance past rows whose workspace files could not be deleted. */
  afterCreatedAt?: string
  afterId?: string
}

export type LarkMessageHistoryJobData = LarkHistoryMaterializeJobData | LarkHistoryCleanupJobData

@Injectable()
export class LarkMessageHistoryQueueService {
  private _managedQueue?: ManagedQueueService

  constructor(
    @Inject(LARK_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get managedQueue(): ManagedQueueService {
    if (!this._managedQueue) {
      this._managedQueue = this.pluginContext.resolve(MANAGED_QUEUE_SERVICE_TOKEN)
    }
    return this._managedQueue
  }

  async enqueueMaterialize(
    payload: Omit<LarkHistoryMaterializeJobData, 'kind'>,
    delayMs = 0
  ): Promise<void> {
    const messageLogIds = this.normalizeIds(payload.messageLogIds)
    if (!messageLogIds.length) {
      return
    }
    await this.managedQueue.enqueue<LarkHistoryMaterializeJobData>({
      pluginName: LARK_PLUGIN_NAME,
      queueName: LARK_HISTORY_QUEUE_NAME,
      jobName: LARK_HISTORY_MATERIALIZE_JOB,
      payload: {
        ...payload,
        kind: 'materialize-files',
        messageLogIds
      },
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      scopeKey: this.scopeKey,
      jobId: buildLarkHistoryMaterializeJobId(
        payload.integrationId,
        messageLogIds,
        normalizeContinuation(payload.continuation)
      ),
      ...(delayMs > 0 ? { delayMs } : {}),
      attempts: 5,
      backoffMs: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: { age: 24 * 60 * 60, count: 5000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 }
    })
  }

  async scheduleCleanup(
    payload: Omit<LarkHistoryCleanupJobData, 'kind'>,
    delayMs = 24 * 60 * 60 * 1000
  ): Promise<void> {
    if (!Number.isFinite(payload.retentionDays) || payload.retentionDays <= 0) {
      return
    }
    const dueAt = new Date(Date.now() + Math.max(0, delayMs))
    const dayBucket = dueAt.toISOString().slice(0, 10)
    const continuation = normalizeContinuation(payload.continuation)
    await this.managedQueue.enqueue<LarkHistoryCleanupJobData>({
      pluginName: LARK_PLUGIN_NAME,
      queueName: LARK_HISTORY_QUEUE_NAME,
      jobName: LARK_HISTORY_CLEANUP_JOB,
      payload: {
        ...payload,
        kind: 'cleanup-expired'
      },
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      scopeKey: this.scopeKey,
      jobId: buildLarkHistoryCleanupJobId(payload.integrationId, dayBucket, continuation),
      delayMs: Math.max(0, delayMs),
      attempts: 5,
      backoffMs: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: { age: 3 * 24 * 60 * 60, count: 1000 },
      removeOnFail: { age: 14 * 24 * 60 * 60, count: 1000 }
    })
  }

  private get scopeKey(): string | undefined {
    return (this.pluginContext as { scopeKey?: string | null }).scopeKey ?? undefined
  }

  private normalizeIds(ids: string[]): string[] {
    return Array.from(
      new Set(
        (ids ?? []).map((id) => (typeof id === 'string' ? id.trim() : '')).filter((id): id is string => Boolean(id))
      )
    )
  }
}

function normalizeContinuation(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}
