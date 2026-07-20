import { randomUUID } from 'crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IIntegration } from '@xpert-ai/contracts'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  MANAGED_QUEUE_SERVICE_TOKEN,
  type ManagedQueueJob,
  type ManagedQueueRedis,
  type ManagedQueueService,
  RequestContext,
  WORKSPACE_FILES_SOURCE,
  type WorkspaceFilesApi,
  type WorkspacePortableFileReference,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { In, Repository } from 'typeorm'
import {
  WECHAT_PLUGIN_NAME,
  WECHAT_OUTBOUND_QUEUE_PREFIX,
  WECHAT_OUTBOUND_QUEUE_NAME,
  WECHAT_OUTBOUND_SEND_TEXT_JOB,
  WECHAT_PROVIDER_KEY
} from './constants.js'
import {
  WechatAccountEntity,
  WechatMessageLogEntity,
  WechatMessageLogStatus
} from './entities/index.js'
import { WECHAT_PLUGIN_CONTEXT } from './tokens.js'
import {
  DEFAULT_OUTBOUND_QUEUE_OPTIONS,
  normalizeNonNegativeInt,
  normalizePositiveInt,
  normalizeString,
  normalizeTimeoutMs,
  TIntegrationWechatOptions,
  WechatOutboundQueueOptions
} from './types.js'
import type { WechatChatCallbackContext } from './handoff/wechat-chat.types.js'
import { fetchWechatImageAsBase64 } from './wechat-image.js'
import {
  WechatClient,
  WechatSendFileInput,
  WechatSendResult,
  WechatSendTextInput
} from './wechat.client.js'
import {
  resolveWechatSendFile,
  resolveWechatSendFileFromWorkspace
} from './wechat-send-file.js'

const XPERT_RUNTIME_CAPABILITIES_TOKEN = 'XPERT_RUNTIME_CAPABILITIES'

/** Minimal runtime registry contract used to discover platform capabilities. */
type RuntimeCapabilityRegistry = {
  get<T>(key: string): T | undefined
}

export type WechatOutboundQueueJobData = {
  integrationId: string
  outboundLogId: string
  tenantId?: string | null
  organizationId?: string | null
}

export type WechatQueuedSendResult = {
  success: boolean
  queued?: boolean
  queueJobId?: string
  outboundLogId?: string
  scheduledAt?: string
  messageId?: string
  error?: string
}

export type WechatOutboundSource =
  | 'agent_callback'
  | 'agent_tool'
  | 'manual'
  | 'resend'
  | 'message_reply'
  | 'scheduled_agent'

export type WechatOutboundContext = Partial<Pick<
  WechatChatCallbackContext,
  | 'tenantId'
  | 'organizationId'
  | 'integrationId'
  | 'uuid'
  | 'ownerWxid'
  | 'contactId'
  | 'chatId'
  | 'chatType'
  | 'senderId'
  | 'senderName'
  | 'xpertId'
  | 'conversationId'
  | 'conversationUserKey'
>>

export type WechatOutboundQueueTextInput = WechatSendTextInput & {
  type?: 'text'
  context?: WechatOutboundContext
  source?: WechatOutboundSource
  idempotencyKey?: string
  delayMs?: number
}

export type WechatOutboundQueueImageInput = {
  type: 'image'
  uuid: string
  contactId: string
  imageUrl: string
  context?: WechatOutboundContext
  source?: WechatOutboundSource
  idempotencyKey?: string
  delayMs?: number
}

export type WechatOutboundQueueFileInput = Pick<WechatSendFileInput, 'uuid' | 'contactId' | 'uploadToken'> & {
  type: 'file'
  filePath: string
  /** Portable workspace reference used for delayed reads and retries. */
  fileRef?: WorkspacePortableFileReference
  fileName: string
  mimeType?: string
  extension?: string
  size: number
  sha256: string
  context?: WechatOutboundContext
  source?: WechatOutboundSource
  idempotencyKey?: string
  delayMs?: number
}

export type WechatOutboundQueueInput =
  | WechatOutboundQueueTextInput
  | WechatOutboundQueueImageInput
  | WechatOutboundQueueFileInput

type WechatQueuedPayload =
  | {
      type: 'text'
      source: WechatOutboundSource
      atUsers: string[]
      idempotencyKey?: string
    }
  | {
      type: 'image'
      source: WechatOutboundSource
      imageUrl: string
      idempotencyKey?: string
    }
  | {
      type: 'file'
      source: WechatOutboundSource
      filePath: string
      /** Persisted reference; never persist file bytes in payloadSummary. */
      fileRef?: WorkspacePortableFileReference
      fileName: string
      mimeType?: string
      extension?: string
      size: number
      sha256: string
      uploadToken?: string
      idempotencyKey?: string
    }

type WechatResolvedQueuedPayload =
  | {
      type: 'text'
      atUsers: string[]
    }
  | {
      type: 'image'
      imageUrl: string
    }
  | {
      type: 'file'
      filePath: string
      /** Normalized reference loaded from payloadSummary for retry processing. */
      fileRef?: WorkspacePortableFileReference
      fileName: string
      mimeType?: string
      extension?: string
      size?: number
      sha256?: string
      uploadToken?: string
    }

type RedisLike = ManagedQueueRedis

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

const PENDING_STATUSES: WechatMessageLogStatus[] = ['queued', 'deferred', 'sending', 'paused']
const TERMINAL_STATUSES: WechatMessageLogStatus[] = ['sent', 'failed', 'cancelled']
const DEFAULT_BACKOFF_MS = [60_000, 300_000, 900_000]
const MAX_OUTBOUND_EXTRA_DELAY_MS = 24 * 60 * 60_000

function normalizePayloadNumber(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : undefined
}

/**
 * Normalize a persisted queue fileRef without trusting arbitrary payload JSON.
 *
 * The queue keeps only the portable workspace reference plus size/sha256 checks;
 * base64 file content is intentionally reloaded when the job is processed.
 * This does not infer workspace scope in the plugin; it only preserves an
 * already-platform-issued reference in a safe shape after JSON serialization.
 */
function normalizeQueuedFileRef(value: unknown): WorkspacePortableFileReference | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const record = value as Record<string, unknown>
  const filePath = normalizeString(record.filePath) || normalizeString(record.workspacePath)
  if (!filePath) {
    return undefined
  }
  const catalog = normalizeWorkspaceFileCatalog(record.catalog)
  const source = normalizeString(record.source)
  if (source && source !== WORKSPACE_FILES_SOURCE) {
    return undefined
  }
  return {
    source: WORKSPACE_FILES_SOURCE,
    filePath,
    workspacePath: normalizeString(record.workspacePath) || filePath,
    ...(normalizeString(record.tenantId) ? { tenantId: normalizeString(record.tenantId) } : {}),
    ...(normalizeString(record.userId) ? { userId: normalizeString(record.userId) } : {}),
    ...(catalog ? { catalog } : {}),
    ...(normalizeString(record.scopeId) ? { scopeId: normalizeString(record.scopeId) } : {}),
    ...(normalizeString(record.projectId) ? { projectId: normalizeString(record.projectId) } : {}),
    ...(normalizeString(record.knowledgeId) ? { knowledgeId: normalizeString(record.knowledgeId) } : {}),
    ...(normalizeString(record.rootId) ? { rootId: normalizeString(record.rootId) } : {}),
    ...(normalizeString(record.xpertId) ? { xpertId: normalizeString(record.xpertId) } : {}),
    ...(typeof record.isolateByUser === 'boolean' ? { isolateByUser: record.isolateByUser } : {})
  }
}

/**
 * Accept only catalogs supported by the current portable reference contract.
 *
 * Queue payloads are JSON strings, so this guard prevents an arbitrary persisted
 * value from being replayed as a workspace catalog. Scope resolution still
 * belongs to the platform workspace-files capability.
 */
function normalizeWorkspaceFileCatalog(value: unknown): WorkspacePortableFileReference['catalog'] | undefined {
  const catalog = normalizeString(value)
  return catalog === 'projects' ||
    catalog === 'users' ||
    catalog === 'knowledges' ||
    catalog === 'skills' ||
    catalog === 'xperts'
    ? catalog
    : undefined
}

@Injectable()
export class WechatOutboundQueueService {
  private readonly logger = new Logger(WechatOutboundQueueService.name)
  private _integrationPermissionService?: IntegrationPermissionService
  private _managedQueueService?: ManagedQueueService
  private _workspaceFiles?: Pick<WorkspaceFilesApi, 'readRuntimeBuffer'> | null

  constructor(
    private readonly client: WechatClient,
    @InjectRepository(WechatAccountEntity)
    private readonly accountRepository: Repository<WechatAccountEntity>,
    @InjectRepository(WechatMessageLogEntity)
    private readonly messageLogRepository: Repository<WechatMessageLogEntity>,
    @Inject(WECHAT_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  private get managedQueueService(): ManagedQueueService {
    if (!this._managedQueueService) {
      this._managedQueueService = this.pluginContext.resolve(MANAGED_QUEUE_SERVICE_TOKEN)
    }
    return this._managedQueueService
  }

  /** Lazily resolve the workspace-files capability for delayed file retries. */
  private get workspaceFiles(): Pick<WorkspaceFilesApi, 'readRuntimeBuffer'> | null {
    if (this._workspaceFiles === undefined) {
      try {
        const registry = this.pluginContext.resolve<RuntimeCapabilityRegistry>(XPERT_RUNTIME_CAPABILITIES_TOKEN)
        this._workspaceFiles = registry?.get<Pick<WorkspaceFilesApi, 'readRuntimeBuffer'>>(WORKSPACE_FILES_SOURCE) ?? null
      } catch {
        this._workspaceFiles = null
      }
    }
    return this._workspaceFiles
  }

  async enqueueText(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatOutboundQueueTextInput
  ): Promise<WechatQueuedSendResult> {
    const normalizedInput = {
      uuid: normalizeString(input.uuid),
      contactId: normalizeString(input.contactId),
      content: normalizeString(input.content),
      atUsers: Array.isArray(input.atUsers) ? input.atUsers.map((item) => normalizeString(item)).filter(Boolean) : [],
      idempotencyKey: normalizeString(input.idempotencyKey),
      delayMs: normalizeNonNegativeInt(input.delayMs, 0, MAX_OUTBOUND_EXTRA_DELAY_MS)
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
      delayMs: normalizedInput.delayMs,
      payload: {
        type: 'text',
        source: input.source || 'message_reply',
        atUsers: normalizedInput.atUsers,
        ...(normalizedInput.idempotencyKey ? { idempotencyKey: normalizedInput.idempotencyKey } : {})
      }
    })
  }

  async enqueueImage(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatOutboundQueueImageInput
  ): Promise<WechatQueuedSendResult> {
    const normalizedInput = {
      uuid: normalizeString(input.uuid),
      contactId: normalizeString(input.contactId),
      imageUrl: normalizeString(input.imageUrl),
      idempotencyKey: normalizeString(input.idempotencyKey),
      delayMs: normalizeNonNegativeInt(input.delayMs, 0, MAX_OUTBOUND_EXTRA_DELAY_MS)
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
      delayMs: normalizedInput.delayMs,
      payload: {
        type: 'image',
        source: input.source || 'message_reply',
        imageUrl: normalizedInput.imageUrl,
        ...(normalizedInput.idempotencyKey ? { idempotencyKey: normalizedInput.idempotencyKey } : {})
      }
    })
  }

  async enqueueFile(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: WechatOutboundQueueFileInput
  ): Promise<WechatQueuedSendResult> {
    const normalizedInput = {
      uuid: normalizeString(input.uuid),
      contactId: normalizeString(input.contactId),
      filePath: normalizeString(input.filePath),
      fileRef: normalizeQueuedFileRef(input.fileRef),
      fileName: normalizeString(input.fileName),
      mimeType: normalizeString(input.mimeType),
      extension: normalizeString(input.extension),
      size: normalizePayloadNumber(input.size),
      sha256: normalizeString(input.sha256),
      uploadToken: normalizeString(input.uploadToken),
      idempotencyKey: normalizeString(input.idempotencyKey),
      delayMs: normalizeNonNegativeInt(input.delayMs, 0, MAX_OUTBOUND_EXTRA_DELAY_MS)
    }
    if (
      !normalizedInput.uuid ||
      !normalizedInput.contactId ||
      !normalizedInput.filePath ||
      !normalizedInput.fileName ||
      !normalizedInput.size ||
      !normalizedInput.sha256
    ) {
      return {
        success: false,
        error: '发送微信文件缺少 uuid/contactId/filePath/fileName/size/sha256。'
      }
    }

    return this.enqueueOutbound(integration, {
      uuid: normalizedInput.uuid,
      contactId: normalizedInput.contactId,
      content: normalizedInput.fileName,
      context: input.context,
      delayMs: normalizedInput.delayMs,
      payload: {
        type: 'file',
        source: input.source || 'message_reply',
        filePath: normalizedInput.filePath,
        ...(normalizedInput.fileRef ? { fileRef: normalizedInput.fileRef } : {}),
        fileName: normalizedInput.fileName,
        ...(normalizedInput.mimeType ? { mimeType: normalizedInput.mimeType } : {}),
        ...(normalizedInput.extension ? { extension: normalizedInput.extension } : {}),
        size: normalizedInput.size,
        sha256: normalizedInput.sha256,
        ...(normalizedInput.uploadToken ? { uploadToken: normalizedInput.uploadToken } : {}),
        ...(normalizedInput.idempotencyKey ? { idempotencyKey: normalizedInput.idempotencyKey } : {})
      }
    })
  }

  private async enqueueOutbound(
    integration: IIntegration<TIntegrationWechatOptions>,
    input: {
      uuid: string
      contactId: string
      content: string
      context?: WechatOutboundContext
      delayMs?: number
      payload: WechatQueuedPayload
    }
  ): Promise<WechatQueuedSendResult> {
    const options = this.resolveOptions(integration.options?.outboundQueue, integration.options)
    const scope = this.resolveTenantScope(integration, input.context)
    const blocked = await this.assertCanQueue(integration.id, input.uuid, input.contactId, options, scope)
    if (blocked) {
      return blocked
    }

    const bindingContext = this.resolveBindingContext()
    const extraDelayMs = normalizeNonNegativeInt(input.delayMs, 0, MAX_OUTBOUND_EXTRA_DELAY_MS)
    const scheduledAt = new Date(Date.now() + options.initialDelayMs + extraDelayMs)
    const log = await this.messageLogRepository.save({
      integrationId: integration.id,
      uuid: input.uuid,
      ownerWxid: input.context?.ownerWxid,
      contactId: input.contactId,
      senderId: input.context?.senderId,
      senderName: input.context?.senderName,
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
        queueJobId: job.id,
        scheduledAt
      }
    )

    return {
      success: true,
      queued: true,
      queueJobId: job.id,
      outboundLogId: log.id,
      scheduledAt: scheduledAt.toISOString()
    }
  }

  async processSendTextJob(job: ManagedQueueJob<WechatOutboundQueueJobData>): Promise<void> {
    const data = job.data || ({} as WechatOutboundQueueJobData)
    const integration = await this.readIntegration(data.integrationId)
    if (!integration) {
      throw new Error(`WeChat integration "${data.integrationId}" was not found.`)
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
      this.logger.warn(`[wechat-outbound] missing outbound log job=${job.id}`)
      return
    }
    if (TERMINAL_STATUSES.includes(log.status)) {
      return
    }

    const options = this.resolveOptions(integration.options?.outboundQueue, integration.options)
    const paused = await this.resolvePausedReason(integration.id, log.uuid, log.contactId, scope)
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

    const delayMs = await this.resolveNextDelay(integration.id, log.uuid, log.contactId, options, scope)
    if (delayMs > 0) {
      await this.deferLog(log, delayMs, options, 'rate_limited')
      return
    }

    const lockTtlMs = Math.max(
      options.lockTtlMs,
      normalizeTimeoutMs(integration.options?.timeoutMs) +
        Math.max(options.globalMinIntervalMs, options.perAccountMinIntervalMs, options.perContactMinIntervalMs)
    )
    const globalLockKey = this.globalLockKey(integration.id, scope.tenantId)
    const accountLockKey = this.accountLockKey(integration.id, log.uuid, scope.tenantId)
    const contactLockKey = this.contactLockKey(integration.id, log.uuid, log.contactId, scope.tenantId)
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

  async handleJobFailure(job: ManagedQueueJob<WechatOutboundQueueJobData>, error: unknown): Promise<void> {
    const data = job.data || ({} as WechatOutboundQueueJobData)
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
      await this.recordFailure(integration.id, log.uuid, log.contactId, options, scope)
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
  ): Promise<{ success: boolean; message?: string; item?: WechatMessageLogEntity }> {
    const integration = await this.readIntegration(integrationId)
    if (!integration) {
      return { success: false, message: '未找到微信集成。' }
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
      await this.managedQueueService.cancel({ jobId: log.queueJobId }).catch(() => undefined)
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
  ): Promise<{ success: boolean; message?: string; item?: WechatMessageLogEntity; queueJobId?: string }> {
    const integration = await this.readIntegration(integrationId)
    if (!integration) {
      return { success: false, message: '未找到微信集成。' }
    }
    const scope = this.resolveTenantScope(integration)
    const log = await this.messageLogRepository.findOne({
      where: this.scopedWhere({ id: normalizeString(logId), integrationId: integration.id }, scope)
    })
    if (!log?.uuid || !log.contactId || !log.content) {
      return { success: false, message: '未找到可重试的出站消息。' }
    }
    if (log.status === 'sent') {
      return { success: false, message: '已发送的出站消息不能重试。', item: log }
    }
    if (['queued', 'deferred', 'sending'].includes(log.status)) {
      return { success: false, message: '该出站消息仍在队列处理中，无需重试。', item: log }
    }
    const options = this.resolveOptions(integration.options?.outboundQueue, integration.options)
    const paused = await this.resolvePausedReason(integration.id, log.uuid, log.contactId, scope)
    if (paused) {
      return { success: false, message: describeOutboundPausedReason(paused), item: log }
    }
    const scheduledAt = new Date(Date.now() + options.initialDelayMs)
    const job = await this.addSendJob(log, scheduledAt, options)
    await this.updateLog(log, {
      status: 'queued',
      queueJobId: job.id,
      scheduledAt,
      error: null
    })
    return { success: true, item: log, queueJobId: job.id }
  }

  async pauseOutboundAccount(integrationId: string, uuid: string): Promise<void> {
    const normalizedIntegrationId = normalizeString(integrationId)
    const normalizedUuid = normalizeString(uuid)
    if (!normalizedIntegrationId || !normalizedUuid) {
      throw new Error('缺少微信账号标识。')
    }
    const integration = await this.readIntegration(normalizedIntegrationId)
    const scope = integration ? this.resolveTenantScope(integration) : undefined
    await (await this.getRedis()).set(this.accountPausedKey(normalizedIntegrationId, normalizedUuid, scope?.tenantId), 'manual')
    await this.messageLogRepository.update(
      this.scopedWhere(
        {
          integrationId: normalizedIntegrationId,
          uuid: normalizedUuid,
          status: In(['queued', 'deferred', 'sending'] satisfies WechatMessageLogStatus[])
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
      throw new Error('缺少微信账号标识。')
    }
    const redis = await this.getRedis()
    const integration = await this.readIntegration(normalizedIntegrationId)
    if (!integration) {
      return 0
    }
    const scope = this.resolveTenantScope(integration)
    await redis.del(this.accountPausedKey(normalizedIntegrationId, normalizedUuid, scope.tenantId))
    const options = this.resolveOptions(integration.options?.outboundQueue, integration.options)
    const logs = await this.messageLogRepository.find({
      where: this.scopedWhere(
        {
          integrationId: normalizedIntegrationId,
          uuid: normalizedUuid,
          status: 'paused' as WechatMessageLogStatus
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
        queueJobId: job.id,
        scheduledAt,
        error: null
      })
      resumed += 1
    }
    return resumed
  }

  async getOutboundAccountPausedReason(
    integrationId: string,
    uuid: string,
    scope?: { tenantId?: string | null; organizationId?: string | null }
  ): Promise<string | null> {
    const normalizedIntegrationId = normalizeString(integrationId)
    const normalizedUuid = normalizeString(uuid)
    if (!normalizedIntegrationId || !normalizedUuid) {
      return null
    }
    const reason = await (await this.getRedis()).get(this.accountPausedKey(normalizedIntegrationId, normalizedUuid, scope?.tenantId))
    return reason ? `outbound_account_paused:${reason}` : null
  }

  private async assertCanQueue(
    integrationId: string,
    uuid: string,
    contactId: string,
    options: NormalizedOutboundQueueOptions,
    scope: { tenantId?: string | null; organizationId?: string | null }
  ): Promise<WechatQueuedSendResult | null> {
    const paused = await this.resolvePausedReason(integrationId, uuid, contactId, scope)
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
        error: '该微信账号已停用。'
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
        error: '微信出站队列积压超过限制，已停止继续入队。'
      }
    }

    return null
  }

  private async addSendJob(
    log: WechatMessageLogEntity,
    scheduledAt: Date,
    options: NormalizedOutboundQueueOptions
  ): Promise<{ id: string }> {
    const delay = Math.max(0, scheduledAt.getTime() - Date.now())
    const jobId = `${WECHAT_OUTBOUND_QUEUE_NAME}-${log.id}-${scheduledAt.getTime()}`
    const result = await this.managedQueueService.enqueue<WechatOutboundQueueJobData>({
      pluginName: WECHAT_PLUGIN_NAME,
      queueName: WECHAT_OUTBOUND_QUEUE_NAME,
      jobName: WECHAT_OUTBOUND_SEND_TEXT_JOB,
      payload: {
        integrationId: log.integrationId,
        outboundLogId: log.id,
        tenantId: log.tenantId,
        organizationId: log.organizationId
      },
      tenantId: log.tenantId,
      organizationId: log.organizationId,
      scopeKey: this.scopeKey,
      jobId,
      delayMs: delay,
      attempts: options.maxAttempts,
      backoffMs: {
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
    })
    return { id: result.jobId }
  }

  private async deferLog(
    log: WechatMessageLogEntity,
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
    log: WechatMessageLogEntity,
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
    await this.recordSuccess(integrationId, log.uuid, log.contactId, options, scope)
  }

  private async resolveNextDelay(
    integrationId: string,
    uuid: string,
    contactId: string,
    options: NormalizedOutboundQueueOptions,
    scope?: { tenantId?: string | null; organizationId?: string | null }
  ): Promise<number> {
    const quietDelay = this.resolveQuietHourDelay(options)
    if (quietDelay > 0) {
      return quietDelay
    }

    const redis = await this.getRedis()
    const now = Date.now()
    const nextGlobal = Number(await redis.get(this.globalNextKey(integrationId, scope?.tenantId)))
    const nextAccount = Number(await redis.get(this.accountNextKey(integrationId, uuid, scope?.tenantId)))
    const nextContact = Number(await redis.get(this.contactNextKey(integrationId, uuid, contactId, scope?.tenantId)))
    const slotDelay = Math.max(
      Number.isFinite(nextGlobal) ? nextGlobal - now : 0,
      Number.isFinite(nextAccount) ? nextAccount - now : 0,
      Number.isFinite(nextContact) ? nextContact - now : 0
    )
    if (slotDelay > 0) {
      return slotDelay
    }

    return this.resolveCounterDelay(redis, integrationId, uuid, contactId, options, scope?.tenantId)
  }

  private async resolveCounterDelay(
    redis: RedisLike,
    integrationId: string,
    uuid: string,
    contactId: string,
    options: NormalizedOutboundQueueOptions,
    tenantId?: string | null
  ): Promise<number> {
    const checks = [
      {
        key: this.counterKey('account', 'minute', integrationId, uuid, undefined, tenantId),
        max: options.perAccountMaxPerMinute,
        windowMs: 60_000
      },
      {
        key: this.counterKey('account', 'hour', integrationId, uuid, undefined, tenantId),
        max: options.perAccountMaxPerHour,
        windowMs: 60 * 60_000
      },
      {
        key: this.counterKey('account', 'day', integrationId, uuid, undefined, tenantId),
        max: options.perAccountMaxPerDay,
        windowMs: 24 * 60 * 60_000
      },
      {
        key: this.counterKey('contact', 'hour', integrationId, uuid, contactId, tenantId),
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
    options: NormalizedOutboundQueueOptions,
    scope?: { tenantId?: string | null; organizationId?: string | null }
  ): Promise<void> {
    const redis = await this.getRedis()
    const updates: Array<Promise<unknown>> = [
      this.incrementCounter(redis, this.counterKey('account', 'minute', integrationId, uuid, undefined, scope?.tenantId), 60),
      this.incrementCounter(redis, this.counterKey('account', 'hour', integrationId, uuid, undefined, scope?.tenantId), 60 * 60),
      this.incrementCounter(redis, this.counterKey('account', 'day', integrationId, uuid, undefined, scope?.tenantId), 24 * 60 * 60),
      this.incrementCounter(redis, this.counterKey('contact', 'hour', integrationId, uuid, contactId, scope?.tenantId), 60 * 60),
      redis.del(this.failureKey(integrationId, uuid, scope?.tenantId))
    ]
    const now = Date.now()
    if (options.globalMinIntervalMs > 0) {
      updates.push(redis.set(this.globalNextKey(integrationId, scope?.tenantId), String(now + options.globalMinIntervalMs), 'PX', options.globalMinIntervalMs))
    }
    if (options.perAccountMinIntervalMs > 0) {
      updates.push(redis.set(this.accountNextKey(integrationId, uuid, scope?.tenantId), String(now + options.perAccountMinIntervalMs), 'PX', options.perAccountMinIntervalMs))
    }
    if (options.perContactMinIntervalMs > 0) {
      updates.push(redis.set(this.contactNextKey(integrationId, uuid, contactId, scope?.tenantId), String(now + options.perContactMinIntervalMs), 'PX', options.perContactMinIntervalMs))
    }
    await Promise.all(updates)
  }

  private async recordFailure(
    integrationId: string,
    uuid: string,
    _contactId: string,
    options: NormalizedOutboundQueueOptions,
    scope?: { tenantId?: string | null; organizationId?: string | null }
  ): Promise<void> {
    const redis = await this.getRedis()
    const key = this.failureKey(integrationId, uuid, scope?.tenantId)
    const count = await redis.incr(key)
    await redis.expire(key, options.failureGuard.windowSeconds)
    if (count >= options.failureGuard.threshold) {
      await redis.set(this.accountPausedKey(integrationId, uuid, scope?.tenantId), 'failure_guard')
    }
  }

  private async incrementCounter(redis: RedisLike, key: string, ttlSeconds: number): Promise<void> {
    const value = await redis.incr(key)
    if (value === 1) {
      await redis.expire(key, ttlSeconds)
    }
  }

  private async resolvePausedReason(
    integrationId: string,
    uuid: string,
    contactId?: string,
    scope?: { tenantId?: string | null; organizationId?: string | null }
  ): Promise<string | null> {
    const redis = await this.getRedis()
    const accountReason = await redis.get(this.accountPausedKey(integrationId, uuid, scope?.tenantId))
    if (accountReason) {
      return `outbound_account_paused:${accountReason}`
    }
    if (contactId) {
      const contactReason = await redis.get(this.contactPausedKey(integrationId, uuid, contactId, scope?.tenantId))
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
    integration: IIntegration<TIntegrationWechatOptions>,
    log: WechatMessageLogEntity
  ): Promise<WechatSendResult> {
    const payload = this.resolveQueuedPayload(log)
    if (payload.type === 'image') {
      const image = await fetchWechatImageAsBase64(payload.imageUrl, {
        timeoutMs: integration.options?.timeoutMs
      })
      return this.client.sendImage(integration, {
        uuid: log.uuid,
        contactId: log.contactId,
        imageContent: image.imageContent
      })
    }
    if (payload.type === 'file') {
      const file = await this.resolveQueuedFile(log, payload)
      if (payload.size && file.size !== payload.size) {
        return {
          success: false,
          error: `微信文件发送校验失败：文件大小已变化 (${payload.size} -> ${file.size})。`
        }
      }
      if (payload.sha256 && file.sha256 !== payload.sha256) {
        return {
          success: false,
          error: '微信文件发送校验失败：文件内容已变化。'
        }
      }
      return this.client.sendFile(integration, {
        uuid: log.uuid,
        contactId: log.contactId,
        fileName: file.fileName,
        fileContent: file.fileContent,
        uploadToken: payload.uploadToken
      })
    }

    return this.client.sendText(integration, {
      uuid: log.uuid,
      contactId: log.contactId,
      content: log.content || '',
      atUsers: payload.atUsers
    })
  }

  private resolveQueuedPayload(log: WechatMessageLogEntity): WechatResolvedQueuedPayload {
    const payload = this.parsePayloadSummary(log.payloadSummary)
    if (payload?.type === 'image') {
      return {
        type: 'image',
        imageUrl: normalizeString(payload.imageUrl) || normalizeString(log.content)
      }
    }
    if (payload?.type === 'file') {
      return {
        type: 'file',
        filePath: normalizeString(payload.filePath),
        fileRef: normalizeQueuedFileRef(payload.fileRef),
        fileName: normalizeString(payload.fileName) || normalizeString(log.content),
        mimeType: normalizeString(payload.mimeType) || undefined,
        extension: normalizeString(payload.extension) || undefined,
        size: normalizePayloadNumber(payload.size),
        sha256: normalizeString(payload.sha256) || undefined,
        uploadToken: normalizeString(payload.uploadToken) || undefined
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

  /**
   * Resolve a queued file for sending.
   *
   * New queue payloads prefer the platform portable reference; older payloads
   * without `fileRef` still fall back to legacy host-path reading.
   */
  private async resolveQueuedFile(
    log: WechatMessageLogEntity,
    payload: Extract<WechatResolvedQueuedPayload, { type: 'file' }>
  ) {
    if (payload.fileRef) {
      const workspaceFiles = this.workspaceFiles
      if (!workspaceFiles?.readRuntimeBuffer) {
        throw new Error('微信文件发送无法读取 workspace 文件：platform.workspace.files capability is not available.')
      }
      return resolveWechatSendFileFromWorkspace(
        {
          fileRef: payload.fileRef,
          originalName: payload.fileName,
          mimeType: payload.mimeType,
          extension: payload.extension,
          size: payload.size
        },
        { workspaceFiles }
      )
    }

    return resolveWechatSendFile({
      path: payload.filePath,
      originalName: payload.fileName,
      mimeType: payload.mimeType,
      extension: payload.extension,
      size: payload.size
    })
  }

  private parseAtUsers(payload?: Record<string, unknown> | null): string[] {
    if (!payload) {
      return []
    }
    const value = payload.atUsers
    return Array.isArray(value) ? value.map((item) => normalizeString(item)).filter(Boolean) : []
  }

  private resolveOptions(
    rawOptions?: WechatOutboundQueueOptions,
    integrationOptions?: TIntegrationWechatOptions
  ): NormalizedOutboundQueueOptions {
    const fallbackLockTtlMs = normalizeTimeoutMs(integrationOptions?.timeoutMs) + 20_000
    return {
      enabled: true,
      initialDelayMs: normalizeNonNegativeInt(
        rawOptions?.initialDelayMs,
        DEFAULT_OUTBOUND_QUEUE_OPTIONS.initialDelayMs,
        5 * 60_000
      ),
      globalMinIntervalMs: normalizeNonNegativeInt(
        rawOptions?.globalMinIntervalMs,
        DEFAULT_OUTBOUND_QUEUE_OPTIONS.globalMinIntervalMs,
        60 * 60_000
      ),
      perAccountMinIntervalMs: normalizeNonNegativeInt(
        rawOptions?.perAccountMinIntervalMs,
        DEFAULT_OUTBOUND_QUEUE_OPTIONS.perAccountMinIntervalMs,
        60 * 60_000
      ),
      perContactMinIntervalMs: normalizeNonNegativeInt(
        rawOptions?.perContactMinIntervalMs,
        DEFAULT_OUTBOUND_QUEUE_OPTIONS.perContactMinIntervalMs,
        60 * 60_000
      ),
      perAccountMaxPerMinute: normalizePositiveInt(
        rawOptions?.perAccountMaxPerMinute,
        DEFAULT_OUTBOUND_QUEUE_OPTIONS.perAccountMaxPerMinute,
        600
      ),
      perAccountMaxPerHour: normalizePositiveInt(
        rawOptions?.perAccountMaxPerHour,
        DEFAULT_OUTBOUND_QUEUE_OPTIONS.perAccountMaxPerHour,
        10_000
      ),
      perAccountMaxPerDay: normalizePositiveInt(
        rawOptions?.perAccountMaxPerDay,
        DEFAULT_OUTBOUND_QUEUE_OPTIONS.perAccountMaxPerDay,
        100_000
      ),
      perContactMaxPerHour: normalizePositiveInt(
        rawOptions?.perContactMaxPerHour,
        DEFAULT_OUTBOUND_QUEUE_OPTIONS.perContactMaxPerHour,
        10_000
      ),
      maxPendingPerAccount: normalizePositiveInt(
        rawOptions?.maxPendingPerAccount,
        DEFAULT_OUTBOUND_QUEUE_OPTIONS.maxPendingPerAccount,
        10_000
      ),
      maxPendingPerContact: normalizePositiveInt(
        rawOptions?.maxPendingPerContact,
        DEFAULT_OUTBOUND_QUEUE_OPTIONS.maxPendingPerContact,
        10_000
      ),
      maxAttempts: normalizePositiveInt(rawOptions?.maxAttempts, DEFAULT_OUTBOUND_QUEUE_OPTIONS.maxAttempts, 20),
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

  private async readIntegration(integrationId: string): Promise<IIntegration<TIntegrationWechatOptions> | null> {
    const id = normalizeString(integrationId)
    if (!id) {
      return null
    }
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatOptions>>(id, {
      relations: ['tenant']
    })
    if (!integration || integration.provider !== WECHAT_PROVIDER_KEY) {
      return null
    }
    return integration
  }

  private async getRedis(): Promise<RedisLike> {
    return this.managedQueueService.getRedis()
  }

  private get scopeKey(): string | null {
    return (this.pluginContext as { scopeKey?: string | null }).scopeKey ?? null
  }

  private async updateLog(
    log: WechatMessageLogEntity,
    patch: Partial<
      Pick<
        WechatMessageLogEntity,
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

  private globalLockKey(integrationId: string, tenantId?: string | null): string {
    return `${this.scopePrefix(integrationId, tenantId)}:lock:outbound`
  }

  private accountLockKey(integrationId: string, uuid: string, tenantId?: string | null): string {
    return `${this.scopePrefix(integrationId, tenantId)}:lock:account:${uuid}`
  }

  private contactLockKey(integrationId: string, uuid: string, contactId: string, tenantId?: string | null): string {
    return `${this.scopePrefix(integrationId, tenantId)}:lock:contact:${uuid}:${contactId}`
  }

  private accountPausedKey(integrationId: string, uuid: string, tenantId?: string | null): string {
    return `${this.scopePrefix(integrationId, tenantId)}:paused:account:${uuid}`
  }

  private contactPausedKey(integrationId: string, uuid: string, contactId: string, tenantId?: string | null): string {
    return `${this.scopePrefix(integrationId, tenantId)}:paused:contact:${uuid}:${contactId}`
  }

  private globalNextKey(integrationId: string, tenantId?: string | null): string {
    return `${this.scopePrefix(integrationId, tenantId)}:next:outbound`
  }

  private accountNextKey(integrationId: string, uuid: string, tenantId?: string | null): string {
    return `${this.scopePrefix(integrationId, tenantId)}:next:account:${uuid}`
  }

  private contactNextKey(integrationId: string, uuid: string, contactId: string, tenantId?: string | null): string {
    return `${this.scopePrefix(integrationId, tenantId)}:next:contact:${uuid}:${contactId}`
  }

  private failureKey(integrationId: string, uuid: string, tenantId?: string | null): string {
    return `${this.scopePrefix(integrationId, tenantId)}:failures:account:${uuid}`
  }

  private counterKey(
    scope: 'account' | 'contact',
    window: string,
    integrationId: string,
    uuid: string,
    contactId?: string,
    tenantId?: string | null
  ): string {
    return [this.scopePrefix(integrationId, tenantId), 'counter', scope, window, uuid, contactId].filter(Boolean).join(':')
  }

  private scopePrefix(integrationId: string, tenantId?: string | null): string {
    return [WECHAT_OUTBOUND_QUEUE_PREFIX, tenantId || 'tenant_global', integrationId].join(':')
  }
}

function describeOutboundPausedReason(reason: string): string {
  if (reason === 'outbound_account_paused:failure_guard') {
    return '该微信账号出站已因连续发送失败自动暂停。请先确认 wx2.0 服务、Token、账号在线状态和网络已恢复，再在队列页恢复账号出站后重试。'
  }
  if (reason === 'outbound_account_paused:manual') {
    return '该微信账号出站已手动暂停。请先在队列页恢复账号出站后重试。'
  }
  if (reason.startsWith('outbound_account_paused:')) {
    return `该微信账号出站已暂停（${reason.replace('outbound_account_paused:', '')}）。请先恢复账号出站后重试。`
  }
  if (reason.startsWith('outbound_contact_paused:')) {
    return `该联系人出站已暂停（${reason.replace('outbound_contact_paused:', '')}）。请先恢复后重试。`
  }
  return reason
}
