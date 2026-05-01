import { randomUUID } from 'crypto'
import { createRequire } from 'module'
import { hostname } from 'os'
import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
  WSClient,
  WsCmd,
  type ReplyFeedback,
  type ReplyMsgItem,
  type WSClientOptions,
  type WsFrame,
  type WsFrameHeaders
} from '@wecom/aibot-node-sdk'
import express from 'express'
import { IIntegration, IUser } from '@metad/contracts'
import { InjectRepository } from '@nestjs/typeorm'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  RequestContext,
  runWithRequestContext,
  TChatEventContext,
  TChatEventHandlers,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { WeComConversationService } from './conversation.service.js'
import { WECOM_PLUGIN_CONTEXT } from './tokens.js'
import {
  INTEGRATION_WECOM_LONG,
  TIntegrationWeComLongOptions,
  TIntegrationWeComOptions,
  TWeComLongDisabledReason,
  TWeComLongRuntimeState,
  TWeComRuntimeStatus
} from './types.js'
import { WeComChannelStrategy } from './wecom-channel.strategy.js'
import { WeComTriggerBindingEntity } from './entities/wecom-trigger-binding.entity.js'
import {
  classifyWeComLongConnectionError,
  getWeComLongConnectionLockKey,
  getWeComLongConnectionOwnerKey,
  getWeComLongConnectionRegistryKey,
  getWeComLongConnectionStatusKey
} from './wecom-long-connection.utils.js'
import { buildWeComWelcomeCard } from './wecom-conversation-action-card.js'
import { Repository } from 'typeorm'

const require = createRequire(import.meta.url)

type RedisLike = {
  set?: (...args: any[]) => Promise<any>
  get?: (key: string) => Promise<string | null>
  del?: (...keys: string[]) => Promise<any>
  sadd?: (key: string, ...members: string[]) => Promise<any>
  sAdd?: (key: string, members: string[] | string) => Promise<any>
  srem?: (key: string, ...members: string[]) => Promise<any>
  sRem?: (key: string, members: string[] | string) => Promise<any>
  smembers?: (key: string) => Promise<string[]>
  sMembers?: (key: string) => Promise<string[]>
  sismember?: (key: string, member: string) => Promise<number | boolean>
  sIsMember?: (key: string, member: string) => Promise<number | boolean>
  hset?: (key: string, ...args: string[]) => Promise<any>
  hSet?: (key: string, value: Record<string, string>) => Promise<any>
  hgetall?: (key: string) => Promise<Record<string, string>>
  hGetAll?: (key: string) => Promise<Record<string, string>>
  expire?: (key: string, seconds: number) => Promise<any>
  eval?: (...args: any[]) => Promise<any>
}

type PendingRequest = {
  resolve: (value: Record<string, unknown>) => void
  reject: (reason: unknown) => void
  timer: NodeJS.Timeout
  command: string
}

type WeComLongSession = {
  integrationId: string
  botId: string
  secret: string
  wsOrigin: string | null
  timeoutMs: number
  shouldRun: boolean
  state: TWeComLongRuntimeState
  lockId?: string | null
  ownerInstanceId?: string | null
  connectedAt?: number | null
  disconnectedAt?: number | null
  lastCallbackAt?: number | null
  lastPingAt?: number | null
  lastError?: string | null
  reconnectAttempts: number
  failureCount: number
  nextReconnectAt?: number | null
  disabledReason?: TWeComLongDisabledReason | null
  client: WSClient | null
  websocket: any | null
  pingTimer: NodeJS.Timeout | null
  watchdogTimer: NodeJS.Timeout | null
  renewTimer: NodeJS.Timeout | null
  reconnectTimer: NodeJS.Timeout | null
  pendingRequests: Map<string, PendingRequest>
  pingFailureCount: number
}

type WeComLongCommandResult = {
  reqId: string
  errcode: number
  errmsg: string
  raw: Record<string, unknown>
}

export type WeComLongConnectionStatus = {
  integrationId: string
  state: 'disconnected' | 'connecting' | 'connected' | 'error'
  connected: boolean
  shouldRun: boolean
  connectedAt?: number
  disconnectedAt?: number
  reconnectAttempts: number
  lastError?: string
  disabledReason?: TWeComLongDisabledReason | null
}

const REDIS_CLIENT_TOKEN = 'REDIS_CLIENT'
const WECOM_LONG_WS_URL = 'wss://openws.work.weixin.qq.com'
const DEFAULT_TIMEOUT_MS = 10000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 120000
const PING_INTERVAL_MS = 30 * 1000
const WATCHDOG_INTERVAL_MS = 30 * 1000
const WATCHDOG_STALE_MS = PING_INTERVAL_MS * 3
const LOCK_TTL_MS = 45_000
const RENEW_INTERVAL_MS = 15_000
const DEFAULT_RETRY_MS = 5_000
const MAX_RETRY_MS = 30_000
const MAX_UNRECOVERABLE_FAILURES = 3
const MAX_PING_FAILURES = 2
const INITIAL_CONNECT_TIMEOUT_MS = 10_000

@Injectable()
export class WeComLongConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WeComLongConnectionService.name)
  private readonly instanceId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`
  private readonly sessions = new Map<string, WeComLongSession>()
  private _integrationPermissionService: IntegrationPermissionService
  private _redis: RedisLike | null | undefined

  constructor(
    @Inject(WECOM_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext,
    @Inject(forwardRef(() => WeComChannelStrategy))
    private readonly wecomChannel: WeComChannelStrategy,
    private readonly conversationService: WeComConversationService,
    @InjectRepository(WeComTriggerBindingEntity)
    private readonly triggerBindingRepository: Repository<WeComTriggerBindingEntity>
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  private get redis(): RedisLike | null {
    if (this._redis === undefined) {
      try {
        this._redis = this.pluginContext.resolve(REDIS_CLIENT_TOKEN) as RedisLike
      } catch {
        this._redis = null
      }
    }
    return this._redis
  }

  async onModuleInit(): Promise<void> {
    const integrationIds = await this.loadBootstrapIntegrationIds()
    this.logger.debug(
      `[wecom-long] bootstrapping long connection sessions for integrations: [${integrationIds.join(', ')}]`
    )
    await Promise.allSettled(integrationIds.map((integrationId) => this.connect(integrationId)))
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.sessions.values()].map((session) => this.stopSession(session, true)))
  }

  async connect(integrationId: string): Promise<TWeComRuntimeStatus> {
    const integration = await this.safeReadLongIntegration(integrationId)
    if (!integration) {
      await this.dropMissingIntegration(integrationId)
      return this.readStoredStatus(integrationId)
    }

    const skipReason = await this.resolveRestoreSkipReason(integration)
    if (skipReason) {
      await this.unregisterIntegration(integrationId)
      await this.removeSession(integrationId)
      await this.writeDetachedStatus(integrationId, skipReason, {
            shouldRun: false,
            lastError:
          skipReason === 'integration_disabled'
            ? 'Integration is disabled'
            : skipReason === 'xpert_unbound'
            ? 'WeCom trigger binding is missing'
            : 'Restore skipped'
      })
      return this.readStoredStatus(integrationId)
    }

    await this.registerIntegration(integrationId)
    const session = this.ensureSession(integration)

    if (session.state === 'unhealthy') {
      await this.writeStatus(session)
      return this.buildStatus(session)
    }

    if (session.state === 'connected' && this.isSocketOpen(session.websocket)) {
      this.refreshSessionState(session)
      await this.writeStatus(session)
      return this.buildStatus(session)
    }

    await this.startSession(session)
    return this.buildStatus(session)
  }

  async connectWithConfig(params: {
    integrationId: string
    botId: string
    secret: string
    wsOrigin?: string | null
    timeoutMs?: number
  }): Promise<TWeComRuntimeStatus> {
    const integrationId = this.normalizeString(params.integrationId)
    const botId = this.normalizeString(params.botId)
    const secret = this.normalizeString(params.secret)
    const wsOrigin = this.normalizeString(params.wsOrigin)

    if (!integrationId) {
      throw new Error('integrationId is required')
    }
    if (!botId || !secret) {
      throw new Error(`Integration ${integrationId} missing botId/secret`)
    }

    const timeoutMs = this.normalizeTimeout(params.timeoutMs, DEFAULT_TIMEOUT_MS)
    await this.registerIntegration(integrationId)

    const existing = this.sessions.get(integrationId)
    const shouldRestart =
      !!existing &&
      existing.state === 'connected' &&
      (existing.botId !== botId || existing.secret !== secret || existing.wsOrigin !== wsOrigin)

    if (shouldRestart) {
      await this.disconnect(integrationId, {
        reason: 'runtime_error',
        unregister: false
      })
    }

    const session = this.ensureSession({
      id: integrationId,
      tenantId: '',
      organizationId: '',
      provider: INTEGRATION_WECOM_LONG,
      options: {
        botId,
        secret,
        wsOrigin: wsOrigin || undefined,
        timeoutMs
      }
    } as IIntegration<TIntegrationWeComLongOptions>)

    session.shouldRun = true

    if (session.state === 'unhealthy') {
      this.resetSessionForReconnect(session)
      await this.writeStatus(session)
      await this.stopSession(session, true)
      await this.startSession(session)
      return this.buildStatus(session)
    }

    if (session.state === 'connected' && this.isSocketOpen(session.websocket)) {
      await this.writeStatus(session)
      return this.buildStatus(session)
    }

    await this.startSession(session)
    return this.buildStatus(session)
  }

  async reconnect(integrationId: string): Promise<TWeComRuntimeStatus> {
    const integration = await this.safeReadLongIntegration(integrationId)
    if (!integration) {
      await this.dropMissingIntegration(integrationId)
      return this.readStoredStatus(integrationId)
    }

    const skipReason = await this.resolveRestoreSkipReason(integration)
    if (skipReason) {
      await this.disconnect(integrationId, {
        reason: skipReason,
        unregister: true
      })
      return this.readStoredStatus(integrationId)
    }

    await this.registerIntegration(integrationId)
    const session = this.ensureSession(integration)
    this.resetSessionForReconnect(session)
    await this.writeStatus(session)
    await this.stopSession(session, true)
    await this.startSession(session)
    return this.buildStatus(session)
  }

  async disconnect(
    integrationId: string,
    options?: {
      reason?: TWeComLongDisabledReason | null
      unregister?: boolean
      clearStatus?: boolean
    }
  ): Promise<TWeComRuntimeStatus> {
    const reason = options?.reason ?? 'manual_disconnect'
    const unregister = options?.unregister !== false
    const clearStatus = options?.clearStatus === true

    if (unregister) {
      await this.unregisterIntegration(integrationId)
    }

    const session = this.sessions.get(integrationId)
    if (session) {
      session.shouldRun = false
      session.disabledReason = reason
      session.nextReconnectAt = null
      session.ownerInstanceId = null
      session.disconnectedAt = Date.now()
      session.state = 'idle'
      session.lastError = session.lastError ?? this.describeDisabledReason(reason)
      await this.stopSession(session, true)
      this.sessions.delete(integrationId)
    }

    if (clearStatus) {
      await this.clearStatus(integrationId)
      return this.buildDetachedStatus(integrationId)
    }

    await this.writeDetachedStatus(integrationId, reason, {
      shouldRun: false,
      lastError: reason ? this.describeDisabledReason(reason) : null,
      lastDisconnectedAt: Date.now()
    })

    return this.readStoredStatus(integrationId)
  }

  async status(integrationId: string): Promise<TWeComRuntimeStatus> {
    const integration = await this.safeReadLongIntegration(integrationId)
    if (!integration) {
      await this.dropMissingIntegration(integrationId)
      return this.readStoredStatus(integrationId)
    }

    const skipReason = await this.resolveRestoreSkipReason(integration)
    if (skipReason) {
      await this.unregisterIntegration(integrationId)
      await this.removeSession(integrationId)
      await this.writeDetachedStatus(integrationId, skipReason, {
        shouldRun: false,
        lastError: this.describeDisabledReason(skipReason)
      })
      return this.readStoredStatus(integrationId)
    }

    const session = this.sessions.get(integrationId)
    if (!session) {
      if (await this.isRegistered(integrationId)) {
        void this.connect(integrationId).catch((error) => {
          this.logger.warn(
            `[wecom-long] lazy connect failed integration=${integrationId}: ${this.stringifyError(error)}`
          )
        })
      }
      return this.readStoredStatus(integrationId)
    }

    this.refreshSessionState(session)
    await this.writeStatus(session)
    return this.buildStatus(session)
  }

  async sendRespondMessage(params: {
    integrationId: string
    reqId: string
    body: Record<string, unknown>
    timeoutMs?: number
  }): Promise<WeComLongCommandResult> {
    const reqId = this.normalizeString(params.reqId)
    if (!reqId) {
      throw new Error('Missing reqId for aibot_respond_msg')
    }

    const client = await this.ensureConnectedClient(params.integrationId)
    const response = await client.reply(this.createFrameHeaders(reqId), params.body)

    return {
      reqId,
      errcode: Number(response.errcode) || 0,
      errmsg: this.normalizeString(response.errmsg) || 'ok',
      raw: response as unknown as Record<string, unknown>
    }
  }

  async sendUpdateMessage(params: {
    integrationId: string
    reqId: string
    templateCard: Record<string, unknown>
    timeoutMs?: number
  }): Promise<WeComLongCommandResult> {
    const reqId = this.normalizeString(params.reqId)
    if (!reqId) {
      throw new Error('Missing reqId for aibot_respond_update_msg')
    }

    const client = await this.ensureConnectedClient(params.integrationId)
    const response = await client.reply(
      this.createFrameHeaders(reqId),
      {
        response_type: 'update_template_card',
        template_card: params.templateCard
      },
      WsCmd.RESPONSE_UPDATE
    )

    return {
      reqId,
      errcode: Number(response.errcode) || 0,
      errmsg: this.normalizeString(response.errmsg) || 'ok',
      raw: response as unknown as Record<string, unknown>
    }
  }

  async sendActiveMessage(params: {
    integrationId: string
    chatId: string
    body: Record<string, unknown>
    timeoutMs?: number
  }): Promise<WeComLongCommandResult> {
    const chatId = this.normalizeString(params.chatId)
    if (!chatId) {
      throw new Error('Missing chatId for aibot_send_msg')
    }

    const client = await this.ensureConnectedClient(params.integrationId)
    const response = await client.sendMessage(chatId, params.body as any)

    return {
      reqId: this.normalizeString(response.headers?.req_id) || randomUUID(),
      errcode: Number(response.errcode) || 0,
      errmsg: this.normalizeString(response.errmsg) || 'ok',
      raw: response as unknown as Record<string, unknown>
    }
  }

  async sendReplyStream(params: {
    integrationId: string
    reqId: string
    streamId: string
    content: string
    finish?: boolean
    msgItem?: Array<Record<string, unknown>>
    feedback?: Record<string, unknown>
    nonBlocking?: boolean
    timeoutMs?: number
  }): Promise<WeComLongCommandResult> {
    const reqId = this.normalizeString(params.reqId)
    const streamId = this.normalizeString(params.streamId)
    if (!reqId) {
      throw new Error('Missing reqId for replyStream')
    }
    if (!streamId) {
      throw new Error('Missing streamId for replyStream')
    }

    const client = await this.ensureConnectedClient(params.integrationId)
    const content = this.truncateStreamContent(params.content, {
      integrationId: params.integrationId,
      reqId,
      streamId
    })
    const startedAt = Date.now()
    const response =
      params.nonBlocking === true && params.finish !== true
        ? await client.replyStreamNonBlocking(
            this.createFrameHeaders(reqId),
            streamId,
            content,
            false,
            params.msgItem as unknown as ReplyMsgItem[] | undefined,
            params.feedback as unknown as ReplyFeedback | undefined
          )
        : await client.replyStream(
            this.createFrameHeaders(reqId),
            streamId,
            content,
            params.finish === true,
            params.msgItem as unknown as ReplyMsgItem[] | undefined,
            params.feedback as unknown as ReplyFeedback | undefined
          )

    if (response === 'skipped') {
      this.logger.debug(
        `[wecom-long] replyStream skipped integration=${params.integrationId} reqId=${reqId} streamId=${streamId} finish=${
          params.finish === true
        } contentLen=${content.length} elapsedMs=${Date.now() - startedAt}`
      )
      return {
        reqId,
        errcode: 0,
        errmsg: 'skipped',
        raw: {
          skipped: true
        }
      }
    }

    const result = {
      reqId,
      errcode: Number(response.errcode) || 0,
      errmsg: this.normalizeString(response.errmsg) || 'ok',
      raw: response as unknown as Record<string, unknown>
    }
    this.logger.debug(
      `[wecom-long] replyStream ack integration=${params.integrationId} reqId=${reqId} streamId=${streamId} finish=${
        params.finish === true
      } nonBlocking=${params.nonBlocking === true} errcode=${result.errcode} elapsedMs=${Date.now() - startedAt}`
    )
    return result
  }

  private ensureSession(integration: IIntegration<TIntegrationWeComLongOptions>): WeComLongSession {
    const botId = this.normalizeString(integration.options?.botId)
    const secret = this.normalizeString(integration.options?.secret)
    if (!botId || !secret) {
      throw new Error(`Integration ${integration.id} missing botId/secret`)
    }

    const existing = this.sessions.get(integration.id)
    if (existing) {
      existing.botId = botId
      existing.secret = secret
      existing.wsOrigin = this.normalizeString(integration.options?.wsOrigin)
      existing.timeoutMs = this.normalizeTimeout(integration.options?.timeoutMs, DEFAULT_TIMEOUT_MS)
      return existing
    }

    const created: WeComLongSession = {
      integrationId: integration.id,
      botId,
      secret,
      wsOrigin: this.normalizeString(integration.options?.wsOrigin),
      timeoutMs: this.normalizeTimeout(integration.options?.timeoutMs, DEFAULT_TIMEOUT_MS),
      shouldRun: false,
      state: 'idle',
      lockId: null,
      ownerInstanceId: null,
      connectedAt: null,
      disconnectedAt: null,
      lastCallbackAt: null,
      lastPingAt: null,
      lastError: null,
      reconnectAttempts: 0,
      failureCount: 0,
      nextReconnectAt: null,
      disabledReason: null,
      client: null,
      websocket: null,
      pingTimer: null,
      watchdogTimer: null,
      renewTimer: null,
      reconnectTimer: null,
      pendingRequests: new Map(),
      pingFailureCount: 0
    }

    this.sessions.set(integration.id, created)
    return created
  }

  private async startSession(session: WeComLongSession): Promise<void> {
    if (session.state === 'connecting' || session.state === 'connected' || session.state === 'unhealthy') {
      await this.writeStatus(session)
      return
    }

    if (!session.shouldRun) {
      session.state = 'idle'
      await this.writeStatus(session)
      return
    }

    const lockKey = getWeComLongConnectionLockKey({ botId: session.botId })
    const ownerKey = getWeComLongConnectionOwnerKey({ botId: session.botId })
    const lockId = await this.acquireLock(lockKey, LOCK_TTL_MS)
    if (!lockId) {
      session.state = 'retrying'
      session.disabledReason = 'lease_conflict'
      session.lastError = 'Waiting for long-connection ownership from another instance'
      session.ownerInstanceId = await this.readOwnerInstanceId(ownerKey)
      this.scheduleReconnect(session, DEFAULT_RETRY_MS)
      await this.writeStatus(session)
      return
    }

    session.lockId = lockId
    session.ownerInstanceId = this.instanceId
    session.state = 'connecting'
    session.lastError = null
    session.disabledReason = null
    session.nextReconnectAt = null
    await this.writeOwner(session, ownerKey)
    await this.writeStatus(session)

    try {
      const client = this.createClient(session)
      session.client = client
      session.websocket = client as any
      this.bindClientEvents(session, client)
      client.connect()
      await this.waitForInitialAuthentication(session, client)
      this.logger.log(`[wecom-long] connected integration=${session.integrationId}`)
    } catch (error) {
      await this.handleStartFailure(session, error)
      return
    }
  }

  private createClient(session: WeComLongSession): WSClient {
    const logger = {
      debug: (message: string, ...args: any[]) => this.logger.debug(`[wecom-sdk] ${message}`, ...args),
      info: (message: string, ...args: any[]) => this.logger.log(`[wecom-sdk] ${message}`, ...args),
      warn: (message: string, ...args: any[]) => this.logger.warn(`[wecom-sdk] ${message}`, ...args),
      error: (message: string, ...args: any[]) => this.logger.error(`[wecom-sdk] ${message}`, ...args)
    }
    const options: WSClientOptions = {
      botId: session.botId,
      secret: session.secret,
      reconnectInterval: 1000,
      maxReconnectAttempts: -1,
      maxAuthFailureAttempts: MAX_UNRECOVERABLE_FAILURES,
      requestTimeout: session.timeoutMs,
      logger
    }
    if (session.wsOrigin) {
      options.wsOptions = {
        origin: session.wsOrigin
      }
    }

    return new WSClient(options)
  }

  private bindClientEvents(session: WeComLongSession, client: WSClient): void {
    client.on('authenticated', () => {
      void this.handleClientAuthenticated(session, client)
    })
    client.on('event.enter_chat', (frame: WsFrame) => {
      void this.handleEnterChatEvent(session, client, frame)
    })
    client.on('message', (frame: WsFrame) => {
      void this.handleClientCallbackFrame(session, client, frame)
    })
    client.on('event', (frame: WsFrame) => {
      void this.handleClientCallbackFrame(session, client, frame)
    })
    client.on('reconnecting', (attempt: number) => {
      void this.handleClientReconnecting(session, client, attempt)
    })
    client.on('disconnected', (reason: string) => {
      void this.handleClientDisconnected(session, client, reason)
    })
    client.on('error', (error: Error) => {
      void this.handleClientError(session, client, error)
    })
  }

  private async waitForInitialAuthentication(session: WeComLongSession, client: WSClient): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timeoutMs = session.timeoutMs || INITIAL_CONNECT_TIMEOUT_MS
      let timer: NodeJS.Timeout

      const cleanup = () => {
        clearTimeout(timer)
        client.off('authenticated', onAuthenticated)
        client.off('error', onError)
        client.off('disconnected', onDisconnected)
      }

      const settle = (callback: () => void) => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        callback()
      }

      const onAuthenticated = () => {
        settle(resolve)
      }

      const onError = (error: Error) => {
        settle(() => reject(error))
      }

      const onDisconnected = (reason: string) => {
        if (client.isConnected) {
          return
        }
        settle(() => reject(new Error(reason || 'Long connection disconnected before authentication')))
      }

      timer = setTimeout(() => {
        settle(() => reject(new Error(`Long connection authentication timeout (${timeoutMs}ms)`)))
      }, timeoutMs)

      client.on('authenticated', onAuthenticated)
      client.on('error', onError)
      client.on('disconnected', onDisconnected)
    })
  }

  private async handleClientAuthenticated(session: WeComLongSession, client: WSClient): Promise<void> {
    if (session.client !== client || this.sessions.get(session.integrationId) !== session) {
      return
    }

    session.state = 'connected'
    session.connectedAt = Date.now()
    session.disconnectedAt = null
    session.reconnectAttempts = 0
    session.failureCount = 0
    session.pingFailureCount = 0
    session.disabledReason = null
    session.lastError = null
    session.nextReconnectAt = null
    this.startRenew(session)
    await this.writeStatus(session)
  }

  private async handleClientCallbackFrame(session: WeComLongSession, client: WSClient, frame: WsFrame): Promise<void> {
    if (session.client !== client || this.sessions.get(session.integrationId) !== session) {
      return
    }

    session.lastCallbackAt = Date.now()
    await this.writeStatus(session)
    await this.handleCallbackFrame(session, frame as unknown as Record<string, unknown>)
  }

  private async handleEnterChatEvent(session: WeComLongSession, client: WSClient, frame: WsFrame): Promise<void> {
    if (session.client !== client || this.sessions.get(session.integrationId) !== session) {
      return
    }

    const body = this.normalizeRecord(frame.body)
    const event = this.normalizeRecord(body?.event)
    const eventType = this.normalizeString(event?.eventtype)
    const chatType = this.normalizeString(body?.chattype)

    if (eventType !== 'enter_chat') {
      return
    }
    if (chatType && chatType !== 'single') {
      return
    }

    const integration = await this.readLongIntegration(session.integrationId)
    try {
      await client.replyWelcome(frame, {
        msgtype: 'template_card',
        template_card: buildWeComWelcomeCard(this.normalizeString(integration.options?.preferLanguage)) as any
      })
    } catch (error) {
      this.logger.warn(
        `[wecom-long] failed to send welcome card integration=${session.integrationId}: ${this.stringifyError(error)}`
      )
    }
  }

  private async handleClientReconnecting(session: WeComLongSession, client: WSClient, attempt: number): Promise<void> {
    if (session.client !== client || this.sessions.get(session.integrationId) !== session || !session.shouldRun) {
      return
    }

    session.state = 'retrying'
    session.reconnectAttempts = attempt
    session.nextReconnectAt = Date.now() + this.getSdkReconnectDelay(attempt)
    await this.writeStatus(session)
  }

  private async handleClientDisconnected(session: WeComLongSession, client: WSClient, reason: string): Promise<void> {
    if (session.client !== client || this.sessions.get(session.integrationId) !== session) {
      return
    }

    session.disconnectedAt = Date.now()
    this.clearRenewTimer(session)
    session.lastError = this.normalizeString(reason) || session.lastError

    if (!session.shouldRun) {
      session.state = 'idle'
      session.nextReconnectAt = null
      await this.writeStatus(session)
      return
    }

    session.state = 'retrying'
    await this.writeStatus(session)
  }

  private async handleClientError(session: WeComLongSession, client: WSClient, error: unknown): Promise<void> {
    if (session.client !== client || this.sessions.get(session.integrationId) !== session) {
      return
    }

    const classification = classifyWeComLongConnectionError(error)
    session.lastError = classification.reason

    if (!classification.recoverable) {
      session.failureCount += 1
      if (session.failureCount >= MAX_UNRECOVERABLE_FAILURES) {
        session.state = 'unhealthy'
        session.disabledReason = classification.disabledReason
        session.nextReconnectAt = null
        session.shouldRun = false
        await this.unregisterIntegration(session.integrationId)
        await this.stopSession(session, true)
        await this.writeStatus(session)
        this.logger.error(
          `[wecom-long] unhealthy integration=${session.integrationId} bot=${session.botId}: ${session.lastError}`
        )
        return
      }
    }

    await this.writeStatus(session)
    this.logger.warn(
      `[wecom-long] sdk error integration=${session.integrationId} recoverable=${classification.recoverable}: ${session.lastError}`
    )
  }

  private getSdkReconnectDelay(attempt: number): number {
    const safeAttempt = Math.max(attempt - 1, 0)
    return Math.min(1000 * Math.pow(2, safeAttempt), MAX_RETRY_MS)
  }

  private async waitForOpen(session: WeComLongSession): Promise<void> {
    const websocket = session.websocket
    if (!websocket) {
      throw new Error('WebSocket not initialized')
    }

    if (this.isSocketOpen(websocket)) {
      return
    }

    const timeoutMs = session.timeoutMs || INITIAL_CONNECT_TIMEOUT_MS
    await new Promise<void>((resolve, reject) => {
      let resolved = false
      let timer: NodeJS.Timeout

      const onOpen = () => {
        if (resolved) {
          return
        }
        resolved = true
        cleanup()
        clearTimeout(timer)
        resolve()
      }

      const onError = (event: any) => {
        if (resolved) {
          return
        }
        resolved = true
        cleanup()
        clearTimeout(timer)
        reject(new Error(this.stringifyError(event) || 'websocket open failed'))
      }

      const cleanup = () => {
        if (typeof websocket.off === 'function') {
          websocket.off('open', onOpen)
          websocket.off('error', onError)
          return
        }
        if (typeof websocket.removeListener === 'function') {
          websocket.removeListener('open', onOpen)
          websocket.removeListener('error', onError)
        }
      }

      timer = setTimeout(() => {
        if (resolved) {
          return
        }
        resolved = true
        cleanup()
        reject(new Error(`WebSocket open timeout (${timeoutMs}ms)`))
      }, timeoutMs)

      websocket.once('open', onOpen)
      websocket.once('error', onError)
    })
  }

  private async handleStartFailure(session: WeComLongSession, error: unknown): Promise<void> {
    const classification = classifyWeComLongConnectionError(error)
    session.lastError = classification.reason
    session.connectedAt = null
    session.ownerInstanceId = null

    if (!classification.recoverable) {
      session.failureCount += 1
    }

    if (!classification.recoverable && session.failureCount >= MAX_UNRECOVERABLE_FAILURES) {
      session.state = 'unhealthy'
      session.disabledReason = classification.disabledReason
      session.nextReconnectAt = null
      session.shouldRun = false
      await this.unregisterIntegration(session.integrationId)
      await this.stopSession(session, true)
      await this.writeStatus(session)
      this.logger.error(
        `[wecom-long] unhealthy integration=${session.integrationId} bot=${session.botId}: ${session.lastError}`
      )
      return
    }

    session.state = 'retrying'
    session.disabledReason = classification.disabledReason
    await this.stopSession(session, true)
    this.scheduleReconnect(session, DEFAULT_RETRY_MS)
    await this.writeStatus(session)
    this.logger.warn(
      `[wecom-long] connect failed integration=${session.integrationId} recoverable=${classification.recoverable}: ${session.lastError}`
    )
  }

  private async handleSocketClosed(session: WeComLongSession): Promise<void> {
    if (this.sessions.get(session.integrationId) !== session) {
      return
    }

    this.clearPingTimer(session)
    this.clearWatchdogTimer(session)
    this.clearRenewTimer(session)
    for (const [reqId, pending] of session.pendingRequests.entries()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`Socket closed before response (reqId=${reqId})`))
    }
    session.pendingRequests.clear()

    session.websocket = null
    const previousLockId = session.lockId
    session.lockId = null
    session.ownerInstanceId = null
    if (previousLockId) {
      await this.releaseLock(getWeComLongConnectionLockKey({ botId: session.botId }), previousLockId)
      await this.clearOwner(session)
    }
    session.disconnectedAt = Date.now()
    if (session.shouldRun) {
      session.state = 'retrying'
      session.disabledReason = session.disabledReason || 'runtime_error'
      this.scheduleReconnect(session, DEFAULT_RETRY_MS)
      await this.writeStatus(session)
      this.logger.warn(`[wecom-long] disconnected integration=${session.integrationId}, schedule reconnect`)
      return
    }

    session.state = 'idle'
    await this.writeStatus(session)
    this.logger.log(`[wecom-long] disconnected integration=${session.integrationId}`)
  }

  private scheduleReconnect(session: WeComLongSession, delayOverrideMs?: number): void {
    if (!session.shouldRun || session.state === 'unhealthy' || session.reconnectTimer) {
      return
    }

    session.state = 'retrying'
    session.reconnectAttempts += 1
    const delay =
      delayOverrideMs ?? Math.min(1000 * Math.pow(2, Math.max(session.reconnectAttempts - 1, 0)), MAX_RETRY_MS)
    session.nextReconnectAt = Date.now() + delay
    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = null
      void this.startSession(session).catch((error) => {
        session.lastError = this.stringifyError(error)
        this.logger.warn(`[wecom-long] reconnect failed integration=${session.integrationId}: ${session.lastError}`)
        this.scheduleReconnect(session)
      })
    }, delay)
  }

  private clearReconnectTimer(session: WeComLongSession): void {
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer)
      session.reconnectTimer = null
    }
  }

  private startRenew(session: WeComLongSession): void {
    this.clearRenewTimer(session)
    session.renewTimer = setInterval(() => {
      void this.renewOwnership(session)
    }, RENEW_INTERVAL_MS)
  }

  private clearRenewTimer(session: WeComLongSession): void {
    if (session.renewTimer) {
      clearInterval(session.renewTimer)
      session.renewTimer = null
    }
  }

  private async renewOwnership(session: WeComLongSession): Promise<void> {
    if (!session.lockId) {
      return
    }

    const lockKey = getWeComLongConnectionLockKey({ botId: session.botId })
    const ownerKey = getWeComLongConnectionOwnerKey({ botId: session.botId })
    const renewed = await this.renewLock(lockKey, session.lockId, LOCK_TTL_MS)
    if (!renewed) {
      session.lastError = 'Lost long-connection ownership'
      session.disabledReason = 'lease_conflict'
      await this.stopSession(session, true)
      this.scheduleReconnect(session, DEFAULT_RETRY_MS)
      await this.writeStatus(session)
      return
    }

    await this.writeOwner(session, ownerKey)
    this.refreshSessionState(session)
    await this.writeStatus(session)
  }

  private startPing(session: WeComLongSession): void {
    this.clearPingTimer(session)
    session.pingTimer = setInterval(() => {
      this.sendCommand(session.integrationId, {
        cmd: 'ping',
        timeoutMs: Math.min(3000, session.timeoutMs)
      })
        .then(async () => {
          session.lastPingAt = Date.now()
          session.pingFailureCount = 0
          await this.writeStatus(session)
        })
        .catch((error) => {
          session.lastError = this.stringifyError(error)
          session.pingFailureCount += 1
          this.logger.warn(`[wecom-long] ping failed integration=${session.integrationId}: ${session.lastError}`)
          if (session.pingFailureCount < MAX_PING_FAILURES || !session.websocket) {
            return
          }

          try {
            session.disabledReason = 'runtime_error'
            session.websocket.terminate?.()
            session.websocket.close?.()
          } catch {
            //
          }
        })
    }, PING_INTERVAL_MS)
  }

  private clearPingTimer(session: WeComLongSession): void {
    if (session.pingTimer) {
      clearInterval(session.pingTimer)
      session.pingTimer = null
    }
  }

  private startWatchdog(session: WeComLongSession): void {
    this.clearWatchdogTimer(session)
    session.watchdogTimer = setInterval(() => {
      if (session.state !== 'connected') {
        return
      }

      if (!this.isSocketOpen(session.websocket)) {
        session.lastError = 'Long connection websocket is no longer open'
        session.disabledReason = 'runtime_error'
        try {
          session.websocket?.terminate?.()
          session.websocket?.close?.()
        } catch {
          //
        }
        return
      }

      if (session.lastPingAt && Date.now() - session.lastPingAt > WATCHDOG_STALE_MS) {
        session.lastError = 'Long connection ping heartbeat is stale'
        session.disabledReason = 'runtime_error'
        try {
          session.websocket?.terminate?.()
          session.websocket?.close?.()
        } catch {
          //
        }
      }
    }, WATCHDOG_INTERVAL_MS)
  }

  private clearWatchdogTimer(session: WeComLongSession): void {
    if (session.watchdogTimer) {
      clearInterval(session.watchdogTimer)
      session.watchdogTimer = null
    }
  }

  private async handleIncomingMessage(session: WeComLongSession, rawData: string): Promise<void> {
    if (!rawData?.trim()) {
      return
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawData) as Record<string, unknown>
    } catch {
      this.logger.warn(`[wecom-long] non-json frame ignored integration=${session.integrationId}`)
      return
    }

    const headers = this.normalizeRecord(payload.headers)
    const reqId = this.normalizeString(headers?.req_id) || this.normalizeString(headers?.reqId)
    const errcode = Number(payload.errcode)

    if (reqId && session.pendingRequests.has(reqId) && Number.isFinite(errcode)) {
      const pending = session.pendingRequests.get(reqId)
      if (pending) {
        session.pendingRequests.delete(reqId)
        clearTimeout(pending.timer)
        if (errcode === 0) {
          pending.resolve(payload)
        } else {
          const errmsg = this.normalizeString(payload.errmsg) || 'unknown'
          pending.reject(new Error(`errcode=${errcode}, errmsg=${errmsg}`))
        }
      }
      return
    }

    const cmd = this.normalizeString(payload.cmd)
    if (!cmd) {
      return
    }

    if (cmd !== 'aibot_msg_callback' && cmd !== 'aibot_event_callback') {
      return
    }

    session.lastCallbackAt = Date.now()
    await this.writeStatus(session)

    if (reqId) {
      this.sendAck(session, reqId)
    }

    await this.handleCallbackFrame(session, payload)
  }

  private sendAck(session: WeComLongSession, reqId: string): void {
    const websocket = session.websocket
    if (!websocket || !this.isSocketOpen(websocket)) {
      return
    }

    try {
      websocket.send(
        JSON.stringify({
          headers: {
            req_id: reqId
          },
          errcode: 0,
          errmsg: 'ok'
        })
      )
    } catch (error) {
      this.logger.warn(
        `[wecom-long] ack failed integration=${session.integrationId}, reqId=${reqId}: ${this.stringifyError(error)}`
      )
    }
  }

  private async handleCallbackFrame(session: WeComLongSession, frame: Record<string, unknown>): Promise<void> {
    const integration = await this.readLongIntegration(session.integrationId)
    const contextUser = (RequestContext.currentUser() as IUser) ?? {
      id: `wecom-long:${integration.id}:system`,
      tenantId: integration.tenantId,
      organizationId: integration.organizationId
    }

    const requestHeaders: Record<string, string> = {
      ['organization-id']: integration.organizationId,
      ['tenant-id']: integration.tenantId
    }

    const preferLanguage = this.normalizeString(integration.options?.preferLanguage)
    if (preferLanguage) {
      requestHeaders['language'] = preferLanguage
    }

    const body = this.normalizeRecord(frame.body) || {}
    const headers = this.normalizeRecord(frame.headers)
    const reqId = this.normalizeString(headers?.req_id) || this.normalizeString(headers?.reqId)

    const eventPayload: Record<string, unknown> = {
      ...body,
      cmd: this.normalizeString(frame.cmd),
      req_id: reqId,
      reqId,
      headers,
      raw_frame: frame
    }

    const ctx: TChatEventContext<TIntegrationWeComOptions> = {
      integration,
      tenantId: integration.tenantId,
      organizationId: integration.organizationId
    }

    const handlers: TChatEventHandlers = {
      onMessage: async (message, eventCtx) => {
        await this.conversationService.handleMessage(message, eventCtx)
      },
      onMention: async (message, eventCtx) => {
        await this.conversationService.handleMessage(message, eventCtx)
      }
    }

    const handler = this.wecomChannel.createEventHandler(ctx, handlers)
    const req = {
      body: eventPayload,
      user: contextUser
    } as express.Request
    const res = this.createInternalResponse()

    await new Promise<void>((resolve, reject) => {
      runWithRequestContext(
        {
          user: contextUser,
          headers: requestHeaders
        },
        {},
        () => {
          handler(req as any, res as any)
            .then(resolve)
            .catch(reject)
        }
      )
    })
  }

  private createInternalResponse() {
    const response = {
      statusCode: 200,
      body: '',
      status(code: number) {
        this.statusCode = code
        return this
      },
      send(payload: unknown) {
        this.body = typeof payload === 'string' ? payload : JSON.stringify(payload)
        return this
      },
      json(payload: unknown) {
        this.body = JSON.stringify(payload)
        return this
      }
    }
    return response
  }

  private async sendCommand(
    integrationId: string,
    params: {
      cmd: string
      body?: Record<string, unknown>
      reqId?: string
      timeoutMs?: number
      useProvidedReqId?: boolean
      allowConnecting?: boolean
    }
  ): Promise<{ reqId: string; errcode: number; errmsg: string; raw: Record<string, unknown> }> {
    const session = params.allowConnecting
      ? await this.ensureSessionReady(integrationId)
      : await this.ensureConnected(integrationId)
    const websocket = session.websocket
    if (!websocket || !this.isSocketOpen(websocket)) {
      throw new Error(`Long connection is not ready for integration ${integrationId}`)
    }

    const reqId = params.useProvidedReqId
      ? this.normalizeString(params.reqId)
      : this.normalizeString(params.reqId) || randomUUID()
    if (!reqId) {
      throw new Error('req_id is required')
    }

    const timeoutMs = this.normalizeTimeout(params.timeoutMs, session.timeoutMs)

    const responsePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pendingRequests.delete(reqId)
        reject(new Error(`Command timeout: cmd=${params.cmd}, req_id=${reqId}`))
      }, timeoutMs)
      session.pendingRequests.set(reqId, {
        resolve,
        reject,
        timer,
        command: params.cmd
      })
    })

    try {
      websocket.send(
        JSON.stringify({
          cmd: params.cmd,
          headers: {
            req_id: reqId
          },
          ...(params.body ? { body: params.body } : {})
        })
      )
    } catch (error) {
      const pending = session.pendingRequests.get(reqId)
      if (pending) {
        clearTimeout(pending.timer)
        session.pendingRequests.delete(reqId)
      }
      throw error
    }

    const raw = await responsePromise
    return {
      reqId,
      errcode: Number(raw.errcode) || 0,
      errmsg: this.normalizeString(raw.errmsg) || 'ok',
      raw
    }
  }

  private async ensureConnected(integrationId: string): Promise<WeComLongSession> {
    const status = await this.connect(integrationId)
    if (!status.connected) {
      throw new Error(`Long connection is not connected for integration ${integrationId}`)
    }

    const session = this.sessions.get(integrationId)
    if (!session) {
      throw new Error(`Long connection session missing for integration ${integrationId}`)
    }
    return session
  }

  private async ensureConnectedClient(integrationId: string): Promise<WSClient> {
    const session = await this.ensureConnected(integrationId)
    if (!session.client) {
      throw new Error(`Long connection client missing for integration ${integrationId}`)
    }
    return session.client
  }

  private async ensureSessionReady(integrationId: string): Promise<WeComLongSession> {
    const session = this.sessions.get(integrationId)
    if (!session) {
      throw new Error(`Long connection session missing for integration ${integrationId}`)
    }
    if (session.state !== 'connecting' && session.state !== 'connected') {
      throw new Error(`Long connection is not ready for integration ${integrationId}`)
    }
    return session
  }

  private refreshSessionState(session: WeComLongSession): void {
    if (this.isSocketOpen(session.websocket)) {
      session.state = 'connected'
      session.disabledReason = null
      session.nextReconnectAt = null
      return
    }

    if (session.websocket && session.state === 'connected') {
      session.state = 'retrying'
      session.disabledReason = session.disabledReason || 'runtime_error'
      session.nextReconnectAt = Date.now() + DEFAULT_RETRY_MS
    }
  }

  private resetSessionForReconnect(session: WeComLongSession): void {
    session.failureCount = 0
    session.reconnectAttempts = 0
    session.pingFailureCount = 0
    session.disabledReason = null
    session.lastError = null
    session.nextReconnectAt = null
    session.state = 'idle'
    session.shouldRun = true
  }

  private createFrameHeaders(reqId: string): WsFrameHeaders {
    return {
      headers: {
        req_id: reqId
      }
    }
  }

  private truncateStreamContent(
    value: unknown,
    context: {
      integrationId: string
      reqId: string
      streamId: string
    }
  ): string {
    const text = typeof value === 'string' ? value : String(value ?? '')
    const maxBytes = 20480
    if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
      return text
    }

    let low = 0
    let high = text.length
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      if (Buffer.byteLength(text.slice(0, mid), 'utf8') <= maxBytes) {
        low = mid
      } else {
        high = mid - 1
      }
    }

    const truncated = text.slice(0, low)
    this.logger.warn(
      `[wecom-long] replyStream content truncated integration=${context.integrationId} reqId=${context.reqId} streamId=${context.streamId}`
    )
    return truncated
  }

  private async stopSession(session: WeComLongSession, clearOwnership: boolean): Promise<void> {
    this.clearPingTimer(session)
    this.clearWatchdogTimer(session)
    this.clearRenewTimer(session)
    this.clearReconnectTimer(session)

    for (const [reqId, pending] of session.pendingRequests.entries()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`Long connection is closing (integration=${session.integrationId}, reqId=${reqId})`))
    }
    session.pendingRequests.clear()

    const client = session.client
    const websocket = session.websocket
    session.client = null
    session.websocket = null
    if (client) {
      try {
        client.removeAllListeners()
        client.disconnect()
      } catch (error) {
        this.logger.warn(
          `[wecom-long] disconnect client failed integration=${session.integrationId}: ${this.stringifyError(error)}`
        )
      }
    }
    if (websocket) {
      try {
        if (websocket !== client) {
          websocket.terminate?.()
          websocket.close?.()
        }
      } catch (error) {
        this.logger.warn(
          `[wecom-long] close socket failed integration=${session.integrationId}: ${this.stringifyError(error)}`
        )
      }
    }

    if (clearOwnership && session.lockId) {
      await this.releaseLock(getWeComLongConnectionLockKey({ botId: session.botId }), session.lockId)
      session.lockId = null
      session.ownerInstanceId = null
      await this.clearOwner(session)
    }
  }

  private async registerIntegration(integrationId: string): Promise<void> {
    const redis = this.redis
    if (!redis) {
      return
    }
    const registryKey = getWeComLongConnectionRegistryKey()
    if (typeof redis.sadd === 'function') {
      await redis.sadd(registryKey, integrationId)
      return
    }
    if (typeof redis.sAdd === 'function') {
      await redis.sAdd(registryKey, integrationId)
    }
  }

  private async unregisterIntegration(integrationId: string): Promise<void> {
    const redis = this.redis
    if (!redis) {
      return
    }
    const registryKey = getWeComLongConnectionRegistryKey()
    if (typeof redis.srem === 'function') {
      await redis.srem(registryKey, integrationId)
      return
    }
    if (typeof redis.sRem === 'function') {
      await redis.sRem(registryKey, integrationId)
    }
  }

  private async isRegistered(integrationId: string): Promise<boolean> {
    const redis = this.redis
    if (!redis) {
      return false
    }
    const registryKey = getWeComLongConnectionRegistryKey()
    if (typeof redis.sismember === 'function') {
      return Boolean(await redis.sismember(registryKey, integrationId))
    }
    if (typeof redis.sIsMember === 'function') {
      return Boolean(await redis.sIsMember(registryKey, integrationId))
    }
    const members = await this.loadRegistry()
    return members.includes(integrationId)
  }

  private async loadRegistry(): Promise<string[]> {
    const redis = this.redis
    if (!redis) {
      return []
    }
    const registryKey = getWeComLongConnectionRegistryKey()
    if (typeof redis.smembers === 'function') {
      return (await redis.smembers(registryKey)) ?? []
    }
    if (typeof redis.sMembers === 'function') {
      return (await redis.sMembers(registryKey)) ?? []
    }
    return []
  }

  private async loadBootstrapIntegrationIds(): Promise<string[]> {
    try {
      const findAll = (
        this.integrationPermissionService as unknown as {
          findAll?: (
            options?: Record<string, unknown>
          ) => Promise<{ items?: Array<IIntegration<TIntegrationWeComLongOptions>> }>
        }
      ).findAll

      if (!findAll) {
        return this.loadRegistry()
      }

      const result = await findAll({
        where: {
          provider: INTEGRATION_WECOM_LONG
        },
        relations: ['tenant']
      })
      const evaluatedItems = await Promise.all(
        (result?.items ?? []).map(async (item) => ({
          item,
          skipReason: await this.resolveRestoreSkipReason(item)
        }))
      )
      const items = evaluatedItems.filter(({ skipReason }) => !skipReason).map(({ item }) => item)
      for (const item of items) {
        await this.registerIntegration(item.id)
      }
      return items.map((item) => item.id)
    } catch (error) {
      this.logger.warn(`[wecom-long] load from integration service failed: ${this.stringifyError(error)}`)
    }

    return this.loadRegistry()
  }

  private async writeOwner(session: WeComLongSession, ownerKey: string): Promise<void> {
    const redis = this.redis
    if (!redis || typeof redis.set !== 'function') {
      return
    }

    const value = JSON.stringify({
      instanceId: this.instanceId,
      integrationId: session.integrationId,
      botId: session.botId
    })
    await this.setWithTtl(ownerKey, value, LOCK_TTL_MS)
  }

  private async readOwnerInstanceId(ownerKey: string): Promise<string | null> {
    const redis = this.redis
    if (!redis || typeof redis.get !== 'function') {
      return null
    }
    const value = await redis.get(ownerKey)
    if (!value) {
      return null
    }
    try {
      const payload = JSON.parse(value) as Record<string, unknown>
      return this.normalizeString(payload.instanceId)
    } catch {
      return null
    }
  }

  private async clearOwner(session: WeComLongSession): Promise<void> {
    await this.redis?.del?.(getWeComLongConnectionOwnerKey({ botId: session.botId }))
  }

  private async writeStatus(session: WeComLongSession): Promise<void> {
    const redis = this.redis
    if (!redis) {
      return
    }

    const payload = {
      state: session.state,
      connectionMode: 'long_connection',
      connected: session.state === 'connected' ? 'true' : 'false',
      shouldRun: session.shouldRun ? 'true' : 'false',
      ownerInstanceId: session.ownerInstanceId || '',
      lastConnectedAt: session.connectedAt ? String(session.connectedAt) : '',
      lastDisconnectedAt: session.disconnectedAt ? String(session.disconnectedAt) : '',
      lastCallbackAt: session.lastCallbackAt ? String(session.lastCallbackAt) : '',
      lastPingAt: session.lastPingAt ? String(session.lastPingAt) : '',
      lastError: session.lastError || '',
      failureCount: String(session.failureCount ?? 0),
      reconnectAttempts: String(session.reconnectAttempts ?? 0),
      nextReconnectAt: session.nextReconnectAt ? String(session.nextReconnectAt) : '',
      disabledReason: session.disabledReason || ''
    }

    const statusKey = getWeComLongConnectionStatusKey(session.integrationId)
    if (typeof redis.hset === 'function') {
      await redis.hset(statusKey, ...Object.entries(payload).flat())
    } else if (typeof redis.hSet === 'function') {
      await redis.hSet(statusKey, payload)
    }
    if (typeof redis.expire === 'function') {
      await redis.expire(statusKey, 60 * 60 * 24)
    }
  }

  private async writeDetachedStatus(
    integrationId: string,
    reason: TWeComLongDisabledReason | null,
    overrides?: {
      shouldRun?: boolean
      lastError?: string | null
      lastConnectedAt?: number | null
      lastDisconnectedAt?: number | null
      lastCallbackAt?: number | null
      lastPingAt?: number | null
      reconnectAttempts?: number
      failureCount?: number
      nextReconnectAt?: number | null
    }
  ): Promise<void> {
    const redis = this.redis
    if (!redis) {
      return
    }

    const payload = {
      state: 'idle',
      connectionMode: 'long_connection',
      connected: 'false',
      shouldRun: overrides?.shouldRun ? 'true' : 'false',
      ownerInstanceId: '',
      lastConnectedAt: overrides?.lastConnectedAt ? String(overrides.lastConnectedAt) : '',
      lastDisconnectedAt: overrides?.lastDisconnectedAt ? String(overrides.lastDisconnectedAt) : '',
      lastCallbackAt: overrides?.lastCallbackAt ? String(overrides.lastCallbackAt) : '',
      lastPingAt: overrides?.lastPingAt ? String(overrides.lastPingAt) : '',
      lastError: overrides?.lastError || '',
      failureCount: String(overrides?.failureCount ?? 0),
      reconnectAttempts: String(overrides?.reconnectAttempts ?? 0),
      nextReconnectAt: overrides?.nextReconnectAt ? String(overrides.nextReconnectAt) : '',
      disabledReason: reason || ''
    }

    const statusKey = getWeComLongConnectionStatusKey(integrationId)
    if (typeof redis.hset === 'function') {
      await redis.hset(statusKey, ...Object.entries(payload).flat())
    } else if (typeof redis.hSet === 'function') {
      await redis.hSet(statusKey, payload)
    }
    if (typeof redis.expire === 'function') {
      await redis.expire(statusKey, 60 * 60 * 24)
    }
  }

  private async clearStatus(integrationId: string): Promise<void> {
    await this.redis?.del?.(getWeComLongConnectionStatusKey(integrationId))
  }

  private async dropMissingIntegration(integrationId: string): Promise<void> {
    await this.unregisterIntegration(integrationId)
    await this.removeSession(integrationId)
    await this.clearStatus(integrationId)
  }

  private async removeSession(integrationId: string): Promise<void> {
    const session = this.sessions.get(integrationId)
    if (!session) {
      return
    }
    await this.stopSession(session, true)
    this.sessions.delete(integrationId)
  }

  private async readStoredStatus(integrationId: string): Promise<TWeComRuntimeStatus> {
    const redis = this.redis
    const statusKey = getWeComLongConnectionStatusKey(integrationId)
    const data =
      (redis && typeof redis.hgetall === 'function'
        ? await redis.hgetall(statusKey)
        : redis && typeof redis.hGetAll === 'function'
        ? await redis.hGetAll(statusKey)
        : {}) ?? {}

    if (!Object.keys(data).length) {
      return this.buildDetachedStatus(integrationId)
    }

    return {
      integrationId,
      connectionMode: 'long_connection',
      connected: data.connected === 'true',
      shouldRun: data.shouldRun === 'true',
      state: (data.state as TWeComLongRuntimeState) || 'idle',
      ownerInstanceId: data.ownerInstanceId || null,
      lastConnectedAt: data.lastConnectedAt ? Number(data.lastConnectedAt) : null,
      lastDisconnectedAt: data.lastDisconnectedAt ? Number(data.lastDisconnectedAt) : null,
      lastCallbackAt: data.lastCallbackAt ? Number(data.lastCallbackAt) : null,
      lastPingAt: data.lastPingAt ? Number(data.lastPingAt) : null,
      lastError: data.lastError || null,
      failureCount: data.failureCount ? Number(data.failureCount) : 0,
      reconnectAttempts: data.reconnectAttempts ? Number(data.reconnectAttempts) : 0,
      nextReconnectAt: data.nextReconnectAt ? Number(data.nextReconnectAt) : null,
      disabledReason: (data.disabledReason as TWeComLongDisabledReason) || null
    }
  }

  private buildStatus(session: WeComLongSession): TWeComRuntimeStatus {
    return {
      integrationId: session.integrationId,
      connectionMode: 'long_connection',
      connected: session.state === 'connected',
      shouldRun: session.shouldRun,
      state: session.state,
      ownerInstanceId: session.ownerInstanceId ?? null,
      lastConnectedAt: session.connectedAt ?? null,
      lastDisconnectedAt: session.disconnectedAt ?? null,
      lastCallbackAt: session.lastCallbackAt ?? null,
      lastPingAt: session.lastPingAt ?? null,
      lastError: session.lastError ?? null,
      failureCount: session.failureCount,
      reconnectAttempts: session.reconnectAttempts,
      nextReconnectAt: session.nextReconnectAt ?? null,
      disabledReason: session.disabledReason ?? null
    }
  }

  private buildDetachedStatus(integrationId: string, overrides?: Partial<TWeComRuntimeStatus>): TWeComRuntimeStatus {
    return {
      integrationId,
      connectionMode: 'long_connection',
      connected: false,
      shouldRun: false,
      state: 'idle',
      ownerInstanceId: null,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastCallbackAt: null,
      lastPingAt: null,
      lastError: null,
      failureCount: 0,
      reconnectAttempts: 0,
      nextReconnectAt: null,
      disabledReason: null,
      ...overrides
    }
  }

  private async safeReadLongIntegration(
    integrationId: string
  ): Promise<IIntegration<TIntegrationWeComLongOptions> | null> {
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWeComLongOptions>>(
      integrationId,
      {
        relations: ['tenant']
      }
    )

    if (!integration || integration.provider !== INTEGRATION_WECOM_LONG) {
      return null
    }

    return integration
  }

  private async readLongIntegration(integrationId: string): Promise<IIntegration<TIntegrationWeComLongOptions>> {
    const integration = await this.safeReadLongIntegration(integrationId)
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`)
    }
    return integration
  }

  async hasRoutingTarget(params: { integrationId: string }): Promise<boolean> {
    const integrationId = this.normalizeString(params.integrationId)
    if (!integrationId) {
      return false
    }

    const binding = await this.triggerBindingRepository.findOne({
      where: {
        integrationId
      }
    })
    return Boolean(this.normalizeString(binding?.xpertId))
  }

  private async resolveRestoreSkipReason(
    integration: IIntegration<TIntegrationWeComLongOptions>
  ): Promise<TWeComLongDisabledReason | null> {
    const enabled = (integration as unknown as Record<string, unknown>)?.enabled
    if (enabled === false) {
      return 'integration_disabled'
    }

    const hasRoutingTarget = await this.hasRoutingTarget({
      integrationId: integration.id
    })
    if (!hasRoutingTarget) {
      return 'xpert_unbound'
    }

    return null
  }

  private describeDisabledReason(reason: TWeComLongDisabledReason | null): string | null {
    switch (reason) {
      case 'manual_disconnect':
        return 'Long connection was disconnected manually'
      case 'integration_disabled':
        return 'Integration is disabled'
      case 'xpert_unbound':
        return 'WeCom trigger binding is missing'
      case 'config_invalid':
        return 'Long connection configuration is invalid'
      case 'lease_conflict':
        return 'Long connection ownership is held by another instance'
      case 'runtime_error':
        return 'Long connection runtime error'
      case 'restore_skipped':
        return 'Long connection restore was skipped'
      default:
        return null
    }
  }

  private async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const redis = this.redis
    if (!redis || typeof redis.set !== 'function') {
      return randomUUID()
    }

    const lockId = randomUUID()
    const result = await redis.set(key, lockId, { PX: ttlMs, NX: true })
    return result === 'OK' ? lockId : null
  }

  private async renewLock(key: string, lockId: string, ttlMs: number): Promise<boolean> {
    const redis = this.redis
    if (!redis || typeof redis.eval !== 'function') {
      return true
    }

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1]
      then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `
    const result = await this.evalRedisScript(redis, script, [key], [lockId, String(ttlMs)])
    return result === 1
  }

  private async releaseLock(key: string, lockId: string): Promise<boolean> {
    const redis = this.redis
    if (!redis || typeof redis.eval !== 'function') {
      return true
    }

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1]
      then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `
    const result = await this.evalRedisScript(redis, script, [key], [lockId])
    return result === 1
  }

  private async setWithTtl(key: string, value: string, ttlMs: number): Promise<void> {
    const redis = this.redis
    if (!redis || typeof redis.set !== 'function') {
      return
    }
    await redis.set(key, value, { PX: ttlMs })
  }

  private async evalRedisScript(redis: RedisLike, script: string, keys: string[], args: string[]): Promise<any> {
    try {
      return await redis.eval?.(script, keys.length, ...keys, ...args)
    } catch {
      return await redis.eval?.(script, { keys, arguments: args })
    }
  }

  private isSocketOpen(websocket: any | null | undefined): boolean {
    if (!websocket) {
      return false
    }
    if (typeof websocket.isConnected === 'boolean') {
      return websocket.isConnected
    }
    return websocket.readyState === 1
  }

  private resolveWebSocketImpl(): any {
    try {
      const wsModule = require('ws')
      const WebSocketImpl = wsModule?.WebSocket || wsModule?.default || wsModule
      if (!WebSocketImpl) {
        throw new Error('WebSocket implementation is empty')
      }
      return WebSocketImpl
    } catch (error) {
      throw new Error(`Cannot load 'ws' dependency: ${this.stringifyError(error)}`)
    }
  }

  private normalizeWsFrameData(data: unknown): string {
    if (!data) {
      return ''
    }
    if (typeof data === 'string') {
      return data
    }
    if (Buffer.isBuffer(data)) {
      return data.toString('utf8')
    }
    if (Array.isArray(data)) {
      try {
        const chunks = data
          .map((chunk) => {
            if (Buffer.isBuffer(chunk)) {
              return chunk
            }
            if (typeof chunk === 'string') {
              return Buffer.from(chunk)
            }
            if (chunk instanceof ArrayBuffer) {
              return Buffer.from(chunk)
            }
            if (ArrayBuffer.isView(chunk)) {
              return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
            }
            return Buffer.alloc(0)
          })
          .filter((chunk) => chunk.length > 0)
        return Buffer.concat(chunks).toString('utf8')
      } catch {
        return ''
      }
    }
    if (data instanceof ArrayBuffer) {
      return Buffer.from(data).toString('utf8')
    }
    if (ArrayBuffer.isView(data)) {
      return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
    }
    return ''
  }

  private normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null
    }
    const text = value.trim()
    return text || null
  }

  private normalizeRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null
    }
    return value as Record<string, unknown>
  }

  private normalizeTimeout(value: unknown, fallback: number): number {
    const timeout = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(timeout)) {
      return fallback
    }
    return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(timeout)))
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }
    if (typeof error === 'string') {
      return error
    }
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
}
