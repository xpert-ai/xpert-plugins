import { randomUUID } from 'crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import { IIntegration } from '@xpert-ai/contracts'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  RequestContext,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { In, Repository } from 'typeorm'
import type { Job, Queue } from 'bullmq'
import {
  WECHAT_PERSONAL_OUTBOUND_QUEUE_NAME,
  WECHAT_PERSONAL_OUTBOUND_SEND_TEXT_JOB,
  WECHAT_PERSONAL_PROVIDER_KEY
} from './constants.js'
import {
  WechatPersonalAccountEntity,
  WechatPersonalMessageLogEntity,
  WechatPersonalMessageLogStatus
} from './entities/index.js'
import { WECHAT_PERSONAL_PLUGIN_CONTEXT } from './tokens.js'
import {
  normalizeNonNegativeInt,
  normalizePositiveInt,
  normalizeString,
  normalizeTimeoutMs,
  TIntegrationWechatPersonalOptions,
  WechatPersonalOutboundQueueOptions
} from './types.js'
import { WechatPersonalChatCallbackContext } from './handoff/wechat-personal-chat.types.js'
import { fetchWechatPersonalImageAsBase64 } from './wechat-personal-image.js'
import {
  WechatPersonalClient,
  WechatPersonalSendResult,
  WechatPersonalSendTextInput
} from './wechat-personal.client.js'

export type WechatPersonalOutboundQueueJobData = {
  integrationId: string
  outboundLogId: string
  tenantId?: string | null
  organizationId?: string | null
}

export type WechatPersonalQueuedSendResult = {
  success: boolean
  queued?: boolean
  queueJobId?: string
  outboundLogId?: string
  scheduledAt?: string
  messageId?: string
  error?: string
}

export type WechatPersonalOutboundSource =
  | 'agent_callback'
  | 'agent_tool'
  | 'manual'
  | 'resend'
  | 'message_reply'
  | 'scheduled_agent'

export type WechatPersonalOutboundQueueTextInput = WechatPersonalSendTextInput & {
  type?: 'text'
  context?: WechatPersonalChatCallbackContext
  source?: WechatPersonalOutboundSource
  idempotencyKey?: string
}

export type WechatPersonalOutboundQueueImageInput = {
  type: 'image'
  uuid: string
  contactId: string
  imageUrl: string
  context?: WechatPersonalChatCallbackContext
  source?: WechatPersonalOutboundSource
  idempotencyKey?: string
}

export type WechatPersonalOutboundQueueInput =
  | WechatPersonalOutboundQueueTextInput
  | WechatPersonalOutboundQueueImageInput

type WechatPersonalQueuedPayload =
  | {
      type: 'text'
      source: WechatPersonalOutboundSource
      atUsers: string[]
      idempotencyKey?: string
    }
  | {
      type: 'image'
      source: WechatPersonalOutboundSource
      imageUrl: string
      idempotencyKey?: string
    }

type WechatPersonalResolvedQueuedPayload =
  | {
      type: 'text'
      atUsers: string[]
    }
  | {
      type: 'image'
      imageUrl: string
    }

type RedisLike = {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode?: string, ttlMode?: string | number, ttlOrMode?: number | string): Promise<string | null>
  del(...keys: string[]): Promise<number>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<number>
  ttl(key: string): Promise<number>
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>
}

type NormalizedOutboundQueueOptions = {
  enabled: boolean
  initialDelayMs: number
  globalMinIntervalMs: number
  perAccountMinIntervalMs: number
  perContactMinIntervalMs: number
  perAccountMaxPerMinute: number
  perAccountMaxPerHour: number
  perAccountMaxPerDay: number
  perContactMaxPerHour: number
  maxPendingPerAccount: number
  maxPendingPerContact: number
  maxAttempts: number
  retryBackoffMs: number[]
  lockTtlMs: number
  overflowAction: 'reject' | 'pause_until_manual_resume'
  failureGuard: {
    threshold: number
    windowSeconds: number
    action: 'pause_until_manual_resume'
  }
  quietHours: Array<{
    start: string
    end: string
    timezone?: string
  }>
}

const PENDING_STATUSES: WechatPersonalMessageLogStatus[] = ['queued', 'deferred', 'sending', 'paused']
const TERMINAL_STATUSES: WechatPersonalMessageLogStatus[] = ['sent', 'failed', 'cancelled']
const DEFAULT_BACKOFF_MS = [60_000, 300_000, 900_000]

@Injectable()
export class WechatPersonalOutboundQueueService {
  private readonly logger = new Logger(WechatPersonalOutboundQueueService.name)
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    private readonly client: WechatPersonalClient,
    @InjectQueue(WECHAT_PERSONAL_OUTBOUND_QUEUE_NAME)
    private readonly outboundQueue: Queue<WechatPersonalOutboundQueueJobData>,
    @InjectRepository(WechatPersonalAccountEntity)
    private readonly accountRepository: Repository<WechatPersonalAccountEntity>,
    @InjectRepository(WechatPersonalMessageLogEntity)
    private readonly messageLogRepository: Repository<WechatPersonalMessageLogEntity>,
    @Inject(WECHAT_PERSONAL_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  async enqueueText(
    integration: IIntegration<TIntegrationWechatPersonalOptions>,
    input: WechatPersonalOutboundQueueTextInput
  ): Promise<WechatPersonalQueuedSendResult> {
    const normalizedInput = {
      uuid: normalizeString(input.uuid),
      contactId: normalizeString(input.contactId),
      content: normalizeString(input.content),
      atUsers: Array.isArray(input.atUsers) ? input.atUsers.map((item) => normalizeString(item)).filter(Boolean) : [],
      idempotencyKey: normalizeString(input.idempotencyKey)
    }
    if (!normalizedInput.uuid || !normalizedInput.contactId || !normalizedInput.content) {
      return {
        success: false,
        error: '发送微信消息缺少 uuid/contactId/content。'
      }
    }

    return this.enqueueOutbound(integration, {
      uuid: normalizedInput.uuid,
      contactId: normalizedInput.contactId,
      content: normalizedInput.content,
      context: input.context,
      payload: {
        type: 'text',
        source: input.source || 'message_reply',
        atUsers: normalizedInput.atUsers,
        ...(normalizedInput.idempotencyKey ? { idempotencyKey: normalizedInput.idempotencyKey } : {})
      }
    })
  }

  async enqueueImage(
    integration: IIntegration<TIntegrationWechatPersonalOptions>,
    input: WechatPersonalOutboundQueueImageInput
  ): Promise<WechatPersonalQueuedSendResult> {
    const normalizedInput = {
      uuid: normalizeString(input.uuid),
      contactId: normalizeString(input.contactId),
      imageUrl: normalizeString(input.imageUrl),
      idempotencyKey: normalizeString(input.idempotencyKey)
    }
    if (!normalizedInput.uuid || !normalizedInput.contactId || !normalizedInput.imageUrl) {
      return {
        success: false,
        error: '发送微信图片缺少 uuid/contactId/imageUrl。'
      }
    }

    return this.enqueueOutbound(integration, {
      uuid: normalizedInput.uuid,
      contactId: normalizedInput.contactId,
      content: normalizedInput.imageUrl,
      context: input.context,
      payload: {
        type: 'image',
        source: input.source || 'message_reply',
        imageUrl: normalizedInput.imageUrl,
        ...(normalizedInput.idempotencyKey ? { idempotencyKey: normalizedInput.idempotencyKey } : {})
      }
    })
  }

  private async enqueueOutbound(
    integration: IIntegration<TIntegrationWechatPersonalOptions>,
    input: {
      uuid: string
      contactId: string
      content: string
      context?: WechatPersonalChatCallbackContext
      payload: WechatPersonalQueuedPayload
    }
  ): Promise<WechatPersonalQueuedSendResult> {
    const options = this.resolveOptions(integration.options?.outboundQueue, integration.options)
    const scope = this.resolveTenantScope(integration, input.context)
    const blocked = await this.assertCanQueue(integration.id, input.uuid, input.contactId, options, scope)
    if (blocked) {
      return blocked
    }

    const bindingContext = this.resolveBindingContext()
    const scheduledAt = new Date(Date.now() + options.initialDelayMs)
    const log = await this.messageLogRepository.save({
      integrationId: integration.id,
      uuid: input.uuid,
      ownerWxid: input.context?.ownerWxid,
      contactId: input.contactId,
      senderId: input.context?.senderId,
      chatType: input.context?.chatType,
      isSelf: false,
      direction: 'outbound',
      status: 'queued',
      content: input.content,
      payloadSummary: JSON.stringify(input.payload),
      xpertId: input.context?.xpertId,
      conversationId: input.context?.conversationId,
      conversationUserKey: input.context?.conversationUserKey,
      tenantId: scope.tenantId ?? null,
      organizationId: scope.organizationId ?? null,
      createdById: bindingContext.createdById ?? null,
      updatedById: bindingContext.updatedById ?? null,
      scheduledAt
    })

    const job = await this.addSendJob(log, scheduledAt, options)
    await this.messageLogRepository.update(
      this.scopedWhere({ id: log.id }, scope),
      {
        queueJobId: String(job.id),
        scheduledAt
      }
    )

    return {
      success: true,
      queued: true,
      queueJobId: String(job.id),
      outboundLogId: log.id,
      scheduledAt: scheduledAt.toISOString()
    }
  }

  async processSendTextJob(job: Job<WechatPersonalOutboundQueueJobData>): Promise<void> {
    const data = job.data || ({} as WechatPersonalOutboundQueueJobData)
    const integration = await this.readIntegration(data.integrationId)
    if (!integration) {
      throw new Error(`Personal WeChat integration "${data.integrationId}" was not found.`)
    }
    const scope = this.resolveTenantScope(integration, data)
    const log = await this.messageLogRepository.findOne({
      where: this.scopedWhere(
        {
          id: normalizeString(data.outboundLogId),
          integrationId: integration.id,
          direction: 'outbound' as const
        },
        scope
      )
    })
    if (!log) {
      this.logger.warn(`[wechat-personal-outbound] missing outbound log job=${job.id}`)
      return
    }
    if (TERMINAL_STATUSES.includes(log.status)) {
      return
    }

    const options = this.resolveOptions(integration.options?.outboundQueue, integration.options)
    const paused = await this.resolvePausedReason(integration.id, log.uuid, log.contactId)
    if (paused) {
      await this.updateLog(log, {
        status: 'paused',
        error: paused
      })
      return
    }

    const account = await this.accountRepository.findOne({
      where: this.scopedWhere(
        {
          integrationId: integration.id,
          uuid: log.uuid
        },
        scope
      )
    })
    if (account?.enabled === false) {
      await this.updateLog(log, {
        status: 'paused',
        error: 'account_disabled'
      })
      return
    }

    const delayMs = await this.resolveNextDelay(integration.id, log.uuid, log.contactId, options)
    if (delayMs > 0) {
      await this.deferLog(log, delayMs, options, 'rate_limited')
      return
    }

    const lockTtlMs = Math.max(
      options.lockTtlMs,
      normalizeTimeoutMs(integration.options?.timeoutMs) +
        Math.max(options.globalMinIntervalMs, options.perAccountMinIntervalMs, options.perContactMinIntervalMs)
    )
    const globalLockKey = this.globalLockKey()
    const accountLockKey = this.accountLockKey(integration.id, log.uuid)
    const contactLockKey = this.contactLockKey(integration.id, log.uuid, log.contactId)
    const token = randomUUID()
    const acquiredGlobal = await this.acquireLock(globalLockKey, token, lockTtlMs)
    const acquiredAccount = acquiredGlobal ? await this.acquireLock(accountLockKey, token, lockTtlMs) : false
    const acquiredContact = acquiredAccount ? await this.acquireLock(contactLockKey, token, lockTtlMs) : false
    if (!acquiredGlobal || !acquiredAccount || !acquiredContact) {
      if (acquiredContact) {
        await this.releaseLock(contactLockKey, token)
      }
      if (acquiredAccount) {
        await this.releaseLock(accountLockKey, token)
      }
      if (acquiredGlobal) {
        await this.releaseLock(globalLockKey, token)
      }
      await this.deferLog(
        log,
        Math.max(options.globalMinIntervalMs, options.perAccountMinIntervalMs, 1000),
        options,
        'lock_unavailable'
      )
      return
    }

    try {
      await this.updateLog(log, {
        status: 'sending',
        queueJobId: String(job.id),
        error: null
      })
      const result = await this.sendQueuedLog(integration, log)
      if (!result.success) {
        throw new Error(result.error || 'wx2.0 outbound send failed')
      }

      const sentAt = new Date()
      await this.markSuccess(integration.id, log, result.messageId, sentAt, scope, options)
    } finally {
      await Promise.all([
        this.releaseLock(globalLockKey, token),
        this.releaseLock(accountLockKey, token),
        this.releaseLock(contactLockKey, token)
      ])
    }
  }

  async handleJobFailure(job: Job<WechatPersonalOutboundQueueJobData>, error: unknown): Promise<void> {
    const data = job.data || ({} as WechatPersonalOutboundQueueJobData)
    const integration = await this.readIntegration(data.integrationId)
    if (!integration) {
      return
    }
    const scope = this.resolveTenantScope(integration, data)
    const log = await this.messageLogRepository.findOne({
      where: this.scopedWhere(
        {
          id: normalizeString(data.outboundLogId),
          integrationId: integration.id,
          direction: 'outbound' as const
        },
        scope
      )
    })
    if (!log || TERMINAL_STATUSES.includes(log.status)) {
      return
    }

    const options = this.resolveOptions(integration.options?.outboundQueue, integration.options)
    const message = error instanceof Error ? error.message : String(error || 'send failed')
    const attempts = normalizePositiveInt(job.opts?.attempts, options.maxAttempts)
    const isFinalAttempt = job.attemptsMade + 1 >= attempts
    await this.updateLog(log, {
      status: isFinalAttempt ? 'failed' : 'deferred',
      error: message
    })

    if (isFinalAttempt) {
      await this.recordFailure(integration.id, log.uuid, log.contactId, options)
      await this.accountRepository.update(
        this.scopedWhere({ integrationId: integration.id, uuid: log.uuid }, scope),
        {
          status: 'error',
          lastError: message
        }
      )
    }
  }

  async cancelOutboundQueueItem(
    integrationId: string,
    logId: string
  ): Promise<{ success: boolean; message?: string; item?: WechatPersonalMessageLogEntity }> {
    const integration = await this.readIntegration(integrationId)
    if (!integration) {
      return { success: false, message: '未找到个人微信集成。' }
    }
    const scope = this.resolveTenantScope(integration)
    const log = await this.messageLogRepository.findOne({
      where: this.scopedWhere({ id: normalizeString(logId), integrationId: integration.id }, scope)
    })
    if (!log) {
      return { success: false, message: '未找到出站队列消息。' }
    }
    if (log.status === 'cancelled') {
      return { success: true, message: '出站队列消息已取消。', item: log }
    }
    if (!['queued', 'deferred', 'paused'].includes(log.status)) {
      return { success: false, message: '只有 queued/deferred/paused 状态的出站消息可以取消。', item: log }
    }
    if (log.queueJobId) {
      const job = await this.outboundQueue.getJob(log.queueJobId)
      if (job) {
        await job.remove().catch(() => undefined)
      }
    }
    await this.updateLog(log, {
      status: 'cancelled',
      error: 'cancelled_by_user'
    })
    return { success: true, item: log }
  }

  async retryOutboundQueueItem(
    integrationId: string,
    logId: string
  ): Promise<{ success: boolean; message?: string; item?: WechatPersonalMessageLogEntity; queueJobId?: string }> {
    const integration = await this.readIntegration(integrationId)
    if (!integration) {
      return { success: false, message: '未找到个人微信集成。' }
    }
    const scope = this.resolveTenantScope(integration)
    const log = await this.messageLogRepository.findOne({
      where: this.scopedWhere({ id: normalizeString(logId), integrationId: integration.id }, scope)
    })
    if (!log?.uuid || !log.contactId || !log.content) {
      return { success: false, message: '未找到可重试的出站文本消息。' }
    }
    if (log.status === 'sent') {
      return { success: false, message: '已发送的出站消息不能重试。', item: log }
    }
    if (['queued', 'deferred', 'sending'].includes(log.status)) {
      return { success: false, message: '该出站消息仍在队列处理中，无需重试。', item: log }
    }
    const options = this.resolveOptions(integration.options?.outboundQueue, integration.options)
    const scheduledAt = new Date(Date.now() + options.initialDelayMs)
    const job = await this.addSendJob(log, scheduledAt, options)
    await this.updateLog(log, {
      status: 'queued',
      queueJobId: String(job.id),
      scheduledAt,
      error: null
    })
    return { success: true, item: log, queueJobId: String(job.id) }
  }

  async pauseOutboundAccount(integrationId: string, uuid: string): Promise<void> {
    const normalizedIntegrationId = normalizeString(integrationId)
    const normalizedUuid = normalizeString(uuid)
    if (!normalizedIntegrationId || !normalizedUuid) {
      throw new Error('缺少个人微信账号标识。')
    }
    await (await this.getRedis()).set(this.accountPausedKey(normalizedIntegrationId, normalizedUuid), 'manual')
    const integration = await this.readIntegration(normalizedIntegrationId)
    const scope = integration ? this.resolveTenantScope(integration) : undefined
    await this.messageLogRepository.update(
      this.scopedWhere(
        {
          integrationId: normalizedIntegrationId,
          uuid: normalizedUuid,
          status: In(['queued', 'deferred', 'sending'] satisfies WechatPersonalMessageLogStatus[])
        },
        scope
      ),
      {
        status: 'paused',
        error: 'paused_by_user'
      }
    )
  }

  async resumeOutboundAccount(integrationId: string, uuid: string): Promise<number> {
    const normalizedIntegrationId = normalizeString(integrationId)
    const normalizedUuid = normalizeString(uuid)
    if (!normalizedIntegrationId || !normalizedUuid) {
      throw new Error('缺少个人微信账号标识。')
    }
    const redis = await this.getRedis()
    await redis.del(this.accountPausedKey(normalizedIntegrationId, normalizedUuid))
    const integration = await this.readIntegration(normalizedIntegrationId)
    if (!integration) {
      return 0
    }
    const scope = this.resolveTenantScope(integration)
    const options = this.resolveOptions(integration.options?.outboundQueue, integration.options)
    const logs = await this.messageLogRepository.find({
      where: this.scopedWhere(
        {
          integrationId: normalizedIntegrationId,
          uuid: normalizedUuid,
          status: 'paused' as WechatPersonalMessageLogStatus
        },
        scope
      ),
      order: { createdAt: 'ASC' },
      take: 100
    })
    let resumed = 0
    for (const log of logs) {
      if (!log.contactId || !log.content) {
        continue
      }
      const scheduledAt = new Date(Date.now() + options.initialDelayMs)
      const job = await this.addSendJob(log, scheduledAt, options)
      await this.updateLog(log, {
        status: 'queued',
        queueJobId: String(job.id),
        scheduledAt,
        error: null
      })
      resumed += 1
    }
    return resumed
  }

  private async assertCanQueue(
    integrationId: string,
    uuid: string,
    contactId: string,
    options: NormalizedOutboundQueueOptions,
    scope: { tenantId?: string | null; organizationId?: string | null }
  ): Promise<WechatPersonalQueuedSendResult | null> {
    const paused = await this.resolvePausedReason(integrationId, uuid, contactId)
    if (paused) {
      return {
        success: false,
        error: paused
      }
    }

    const account = await this.accountRepository.findOne({
      where: this.scopedWhere({ integrationId, uuid }, scope)
    })
    if (account?.enabled === false) {
      return {
        success: false,
        error: '该个人微信账号已停用。'
      }
    }

    const accountPending = await this.messageLogRepository.count({
      where: this.scopedWhere(
        {
          integrationId,
          uuid,
          direction: 'outbound' as const,
          status: In(PENDING_STATUSES)
        },
        scope
      )
    })
    const contactPending = await this.messageLogRepository.count({
      where: this.scopedWhere(
        {
          integrationId,
          uuid,
          contactId,
          direction: 'outbound' as const,
          status: In(PENDING_STATUSES)
        },
        scope
      )
    })

    if (accountPending >= options.maxPendingPerAccount || contactPending >= options.maxPendingPerContact) {
      if (options.overflowAction === 'pause_until_manual_resume') {
        await this.pauseOutboundAccount(integrationId, uuid)
      }
      return {
        success: false,
        error: '个人微信出站队列积压超过限制，已停止继续入队。'
      }
    }

    return null
  }

  private async addSendJob(
    log: WechatPersonalMessageLogEntity,
    scheduledAt: Date,
    options: NormalizedOutboundQueueOptions
  ): Promise<Job<WechatPersonalOutboundQueueJobData>> {
    const delay = Math.max(0, scheduledAt.getTime() - Date.now())
    const jobId = `plugin_wechat_personal_outbound-${log.id}-${scheduledAt.getTime()}`
    return this.outboundQueue.add(
      WECHAT_PERSONAL_OUTBOUND_SEND_TEXT_JOB,
      {
        integrationId: log.integrationId,
        outboundLogId: log.id,
        tenantId: log.tenantId,
        organizationId: log.organizationId
      },
      {
        jobId,
        delay,
        attempts: options.maxAttempts,
        backoff: {
          type: 'fixed',
          delay: options.retryBackoffMs[0] || DEFAULT_BACKOFF_MS[0]
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
    )
  }

  private async deferLog(
    log: WechatPersonalMessageLogEntity,
    delayMs: number,
    options: NormalizedOutboundQueueOptions,
    reason: string
  ): Promise<void> {
    const scheduledAt = new Date(Date.now() + Math.max(delayMs, 1000))
    const job = await this.addSendJob(log, scheduledAt, options)
    await this.updateLog(log, {
      status: 'deferred',
      queueJobId: String(job.id),
      scheduledAt,
      error: reason
    })
  }

  private async markSuccess(
    integrationId: string,
    log: WechatPersonalMessageLogEntity,
    messageId: string | undefined,
    sentAt: Date,
    scope: { tenantId?: string | null; organizationId?: string | null },
    options: NormalizedOutboundQueueOptions
  ): Promise<void> {
    await this.updateLog(log, {
      status: 'sent',
      messageId,
      error: null,
      sentAt
    })
    await this.accountRepository.update(
      this.scopedWhere({ integrationId, uuid: log.uuid }, scope),
      {
        lastSendAt: sentAt,
        status: 'online',
        lastError: null
      }
    )
    await this.recordSuccess(integrationId, log.uuid, log.contactId, options)
  }

  private async resolveNextDelay(
    integrationId: string,
    uuid: string,
    contactId: string,
    options: NormalizedOutboundQueueOptions
  ): Promise<number> {
    const quietDelay = this.resolveQuietHourDelay(options)
    if (quietDelay > 0) {
      return quietDelay
    }

    const redis = await this.getRedis()
    const now = Date.now()
    const nextGlobal = Number(await redis.get(this.globalNextKey()))
    const nextAccount = Number(await redis.get(this.accountNextKey(integrationId, uuid)))
    const nextContact = Number(await redis.get(this.contactNextKey(integrationId, uuid, contactId)))
    const slotDelay = Math.max(
      Number.isFinite(nextGlobal) ? nextGlobal - now : 0,
      Number.isFinite(nextAccount) ? nextAccount - now : 0,
      Number.isFinite(nextContact) ? nextContact - now : 0
    )
    if (slotDelay > 0) {
      return slotDelay
    }

    return this.resolveCounterDelay(redis, integrationId, uuid, contactId, options)
  }

  private async resolveCounterDelay(
    redis: RedisLike,
    integrationId: string,
    uuid: string,
    contactId: string,
    options: NormalizedOutboundQueueOptions
  ): Promise<number> {
    const checks = [
      {
        key: this.counterKey('account', 'minute', integrationId, uuid),
        max: options.perAccountMaxPerMinute,
        windowMs: 60_000
      },
      {
        key: this.counterKey('account', 'hour', integrationId, uuid),
        max: options.perAccountMaxPerHour,
        windowMs: 60 * 60_000
      },
      {
        key: this.counterKey('account', 'day', integrationId, uuid),
        max: options.perAccountMaxPerDay,
        windowMs: 24 * 60 * 60_000
      },
      {
        key: this.counterKey('contact', 'hour', integrationId, uuid, contactId),
        max: options.perContactMaxPerHour,
        windowMs: 60 * 60_000
      }
    ]

    let delayMs = 0
    for (const check of checks) {
      if (!check.max || check.max <= 0) {
        continue
      }
      const current = Number(await redis.get(check.key))
      if (Number.isFinite(current) && current >= check.max) {
        const ttlSeconds = await redis.ttl(check.key)
        delayMs = Math.max(delayMs, ttlSeconds > 0 ? ttlSeconds * 1000 : check.windowMs)
      }
    }
    return delayMs
  }

  private async recordSuccess(
    integrationId: string,
    uuid: string,
    contactId: string,
    options: NormalizedOutboundQueueOptions
  ): Promise<void> {
    const redis = await this.getRedis()
    const updates: Array<Promise<unknown>> = [
      this.incrementCounter(redis, this.counterKey('account', 'minute', integrationId, uuid), 60),
      this.incrementCounter(redis, this.counterKey('account', 'hour', integrationId, uuid), 60 * 60),
      this.incrementCounter(redis, this.counterKey('account', 'day', integrationId, uuid), 24 * 60 * 60),
      this.incrementCounter(redis, this.counterKey('contact', 'hour', integrationId, uuid, contactId), 60 * 60),
      redis.del(this.failureKey(integrationId, uuid))
    ]
    const now = Date.now()
    if (options.globalMinIntervalMs > 0) {
      updates.push(redis.set(this.globalNextKey(), String(now + options.globalMinIntervalMs), 'PX', options.globalMinIntervalMs))
    }
    if (options.perAccountMinIntervalMs > 0) {
      updates.push(redis.set(this.accountNextKey(integrationId, uuid), String(now + options.perAccountMinIntervalMs), 'PX', options.perAccountMinIntervalMs))
    }
    if (options.perContactMinIntervalMs > 0) {
      updates.push(redis.set(this.contactNextKey(integrationId, uuid, contactId), String(now + options.perContactMinIntervalMs), 'PX', options.perContactMinIntervalMs))
    }
    await Promise.all(updates)
  }

  private async recordFailure(
    integrationId: string,
    uuid: string,
    _contactId: string,
    options: NormalizedOutboundQueueOptions
  ): Promise<void> {
    const redis = await this.getRedis()
    const key = this.failureKey(integrationId, uuid)
    const count = await redis.incr(key)
    await redis.expire(key, options.failureGuard.windowSeconds)
    if (count >= options.failureGuard.threshold) {
      await redis.set(this.accountPausedKey(integrationId, uuid), 'failure_guard')
    }
  }

  private async incrementCounter(redis: RedisLike, key: string, ttlSeconds: number): Promise<void> {
    const value = await redis.incr(key)
    if (value === 1) {
      await redis.expire(key, ttlSeconds)
    }
  }

  private async resolvePausedReason(integrationId: string, uuid: string, contactId?: string): Promise<string | null> {
    const redis = await this.getRedis()
    const accountReason = await redis.get(this.accountPausedKey(integrationId, uuid))
    if (accountReason) {
      return `outbound_account_paused:${accountReason}`
    }
    if (contactId) {
      const contactReason = await redis.get(this.contactPausedKey(integrationId, uuid, contactId))
      if (contactReason) {
        return `outbound_contact_paused:${contactReason}`
      }
    }
    return null
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

  private async sendQueuedLog(
    integration: IIntegration<TIntegrationWechatPersonalOptions>,
    log: WechatPersonalMessageLogEntity
  ): Promise<WechatPersonalSendResult> {
    const payload = this.resolveQueuedPayload(log)
    if (payload.type === 'image') {
      const image = await fetchWechatPersonalImageAsBase64(payload.imageUrl, {
        timeoutMs: integration.options?.timeoutMs
      })
      return this.client.sendImage(integration, {
        uuid: log.uuid,
        contactId: log.contactId,
        imageContent: image.imageContent
      })
    }

    return this.client.sendText(integration, {
      uuid: log.uuid,
      contactId: log.contactId,
      content: log.content || '',
      atUsers: payload.atUsers
    })
  }

  private resolveQueuedPayload(log: WechatPersonalMessageLogEntity): WechatPersonalResolvedQueuedPayload {
    const payload = this.parsePayloadSummary(log.payloadSummary)
    if (payload?.type === 'image') {
      return {
        type: 'image',
        imageUrl: normalizeString(payload.imageUrl) || normalizeString(log.content)
      }
    }

    return {
      type: 'text',
      atUsers: this.parseAtUsers(payload)
    }
  }

  private parsePayloadSummary(payloadSummary?: string): Record<string, unknown> | null {
    if (!payloadSummary) {
      return null
    }
    try {
      const payload = JSON.parse(payloadSummary)
      return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null
    } catch {
      return null
    }
  }

  private parseAtUsers(payload?: Record<string, unknown> | null): string[] {
    if (!payload) {
      return []
    }
    const value = payload.atUsers
    return Array.isArray(value) ? value.map((item) => normalizeString(item)).filter(Boolean) : []
  }

  private resolveOptions(
    rawOptions?: WechatPersonalOutboundQueueOptions,
    integrationOptions?: TIntegrationWechatPersonalOptions
  ): NormalizedOutboundQueueOptions {
    const fallbackLockTtlMs = normalizeTimeoutMs(integrationOptions?.timeoutMs) + 20_000
    return {
      enabled: rawOptions?.enabled !== false,
      initialDelayMs: normalizeNonNegativeInt(rawOptions?.initialDelayMs, 3000, 5 * 60_000),
      globalMinIntervalMs: normalizeNonNegativeInt(rawOptions?.globalMinIntervalMs, 3000, 60 * 60_000),
      perAccountMinIntervalMs: normalizeNonNegativeInt(rawOptions?.perAccountMinIntervalMs, 10_000, 60 * 60_000),
      perContactMinIntervalMs: normalizeNonNegativeInt(rawOptions?.perContactMinIntervalMs, 20_000, 60 * 60_000),
      perAccountMaxPerMinute: normalizePositiveInt(rawOptions?.perAccountMaxPerMinute, 6, 600),
      perAccountMaxPerHour: normalizePositiveInt(rawOptions?.perAccountMaxPerHour, 80, 10_000),
      perAccountMaxPerDay: normalizePositiveInt(rawOptions?.perAccountMaxPerDay, 500, 100_000),
      perContactMaxPerHour: normalizePositiveInt(rawOptions?.perContactMaxPerHour, 20, 10_000),
      maxPendingPerAccount: normalizePositiveInt(rawOptions?.maxPendingPerAccount, 100, 10_000),
      maxPendingPerContact: normalizePositiveInt(rawOptions?.maxPendingPerContact, 20, 10_000),
      maxAttempts: normalizePositiveInt(rawOptions?.maxAttempts, 4, 20),
      retryBackoffMs: this.normalizeBackoff(rawOptions?.retryBackoffMs),
      lockTtlMs: normalizePositiveInt(rawOptions?.lockTtlMs, fallbackLockTtlMs, 10 * 60_000),
      overflowAction: rawOptions?.overflowAction === 'reject' ? 'reject' : 'pause_until_manual_resume',
      failureGuard: {
        threshold: normalizePositiveInt(rawOptions?.failureGuard?.threshold, 5, 1000),
        windowSeconds: normalizePositiveInt(rawOptions?.failureGuard?.windowSeconds, 900, 24 * 60 * 60),
        action: 'pause_until_manual_resume'
      },
      quietHours: Array.isArray(rawOptions?.quietHours) ? rawOptions.quietHours : []
    }
  }

  private normalizeBackoff(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return DEFAULT_BACKOFF_MS
    }
    const normalized = value
      .map((item) => normalizePositiveInt(item, 0, 24 * 60 * 60_000))
      .filter((item) => item > 0)
    return normalized.length ? normalized : DEFAULT_BACKOFF_MS
  }

  private resolveQuietHourDelay(options: NormalizedOutboundQueueOptions): number {
    const now = new Date()
    for (const window of options.quietHours) {
      const start = this.parseClockMinutes(window.start)
      const end = this.parseClockMinutes(window.end)
      if (start === null || end === null || start === end) {
        continue
      }
      const current = this.getClockMinutes(now, window.timezone)
      const inQuiet = start < end ? current >= start && current < end : current >= start || current < end
      if (!inQuiet) {
        continue
      }
      const minutesUntilEnd = end > current ? end - current : 24 * 60 - current + end
      return minutesUntilEnd * 60_000
    }
    return 0
  }

  private parseClockMinutes(value: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(normalizeString(value))
    if (!match) {
      return null
    }
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null
    }
    return hour * 60 + minute
  }

  private getClockMinutes(date: Date, timezone?: string): number {
    if (!timezone) {
      return date.getHours() * 60 + date.getMinutes()
    }
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(date)
      const hour = Number(parts.find((part) => part.type === 'hour')?.value)
      const minute = Number(parts.find((part) => part.type === 'minute')?.value)
      return (Number.isFinite(hour) ? hour : date.getHours()) * 60 + (Number.isFinite(minute) ? minute : date.getMinutes())
    } catch {
      return date.getHours() * 60 + date.getMinutes()
    }
  }

  private async readIntegration(integrationId: string): Promise<IIntegration<TIntegrationWechatPersonalOptions> | null> {
    const id = normalizeString(integrationId)
    if (!id) {
      return null
    }
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatPersonalOptions>>(id, {
      relations: ['tenant']
    })
    if (!integration || integration.provider !== WECHAT_PERSONAL_PROVIDER_KEY) {
      return null
    }
    return integration
  }

  private async getRedis(): Promise<RedisLike> {
    return (await (this.outboundQueue as unknown as { client: Promise<RedisLike> }).client) as RedisLike
  }

  private async updateLog(
    log: WechatPersonalMessageLogEntity,
    patch: Partial<
      Pick<
        WechatPersonalMessageLogEntity,
        'status' | 'error' | 'queueJobId' | 'scheduledAt' | 'sentAt' | 'messageId'
      >
    >
  ): Promise<void> {
    await this.messageLogRepository.update(
      this.scopedWhere(
        {
          id: log.id
        },
        {
          tenantId: log.tenantId,
          organizationId: log.organizationId
        }
      ),
      patch
    )
  }

  private scopedWhere<T extends Record<string, unknown>>(
    where: T,
    scope?: { tenantId?: string | null; organizationId?: string | null } | null
  ): T & { tenantId?: string; organizationId?: string } {
    const scoped = { ...where } as T & { tenantId?: string; organizationId?: string }
    if (scope?.tenantId) {
      scoped.tenantId = scope.tenantId
    }
    if (scope?.organizationId) {
      scoped.organizationId = scope.organizationId
    }
    return scoped
  }

  private resolveTenantScope(
    primary?: { tenantId?: string | null; organizationId?: string | null },
    fallback?: { tenantId?: string | null; organizationId?: string | null }
  ): { tenantId?: string | null; organizationId?: string | null } {
    return {
      tenantId: primary?.tenantId ?? fallback?.tenantId ?? RequestContext.currentTenantId() ?? null,
      organizationId: primary?.organizationId ?? fallback?.organizationId ?? RequestContext.getOrganizationId() ?? null
    }
  }

  private resolveBindingContext(): { createdById?: string | null; updatedById?: string | null } {
    const userId = RequestContext.currentUserId()
    return {
      createdById: userId ?? null,
      updatedById: userId ?? null
    }
  }

  private globalLockKey(): string {
    return 'plugin_wechat_personal:lock:outbound'
  }

  private accountLockKey(integrationId: string, uuid: string): string {
    return `plugin_wechat_personal:lock:account:${integrationId}:${uuid}`
  }

  private contactLockKey(integrationId: string, uuid: string, contactId: string): string {
    return `plugin_wechat_personal:lock:contact:${integrationId}:${uuid}:${contactId}`
  }

  private accountPausedKey(integrationId: string, uuid: string): string {
    return `plugin_wechat_personal:paused:account:${integrationId}:${uuid}`
  }

  private contactPausedKey(integrationId: string, uuid: string, contactId: string): string {
    return `plugin_wechat_personal:paused:contact:${integrationId}:${uuid}:${contactId}`
  }

  private globalNextKey(): string {
    return 'plugin_wechat_personal:next:outbound'
  }

  private accountNextKey(integrationId: string, uuid: string): string {
    return `plugin_wechat_personal:next:account:${integrationId}:${uuid}`
  }

  private contactNextKey(integrationId: string, uuid: string, contactId: string): string {
    return `plugin_wechat_personal:next:contact:${integrationId}:${uuid}:${contactId}`
  }

  private failureKey(integrationId: string, uuid: string): string {
    return `plugin_wechat_personal:failures:account:${integrationId}:${uuid}`
  }

  private counterKey(scope: 'account' | 'contact', window: string, integrationId: string, uuid: string, contactId?: string): string {
    return ['plugin_wechat_personal:counter', scope, window, integrationId, uuid, contactId].filter(Boolean).join(':')
  }
}
