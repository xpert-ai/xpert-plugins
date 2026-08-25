import { randomUUID } from 'crypto'
import { createRequire } from 'module'
import { hostname } from 'os'
import { IIntegration, IUser } from '@xpert-ai/contracts'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  RequestContext,
  runWithRequestContext,
  TChatEventContext,
  TChatEventHandlers,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import axios from 'axios'
import express from 'express'
import { DingTalkConversationService } from './conversation.service.js'
import { DingTalkChannelStrategy } from './dingtalk-channel.strategy.js'
import { DINGTALK_PLUGIN_CONTEXT } from './tokens.js'
import {
  INTEGRATION_DINGTALK,
  INTEGRATION_DINGTALK_LONG,
  resolveDingTalkConnectionMode,
  TDingTalkConnectionProbeResult,
  TDingTalkLongRuntimeState,
  TDingTalkRuntimeStatus,
  TIntegrationDingTalkOptions
} from './types.js'

type DingTalkStreamDownstream = {
  specVersion?: string
  type?: 'SYSTEM' | 'EVENT' | 'CALLBACK' | string
  headers?: {
    appId?: string
    connectionId?: string
    contentType?: string
    messageId?: string
    time?: string
    topic?: string
    eventType?: string
    eventBornTime?: string
    eventId?: string
    eventCorpId?: string
    eventUnifiedAppId?: string
    [key: string]: unknown
  }
  data?: string
}

type DingTalkLongSession = {
  integrationId: string
  clientId: string
  clientSecret: string
  state: TDingTalkLongRuntimeState
  websocket: any | null
  reconnectTimer: NodeJS.Timeout | null
  connectedAt?: number | null
  disconnectedAt?: number | null
  lastCallbackAt?: number | null
  lastError?: string | null
  reconnectAttempts: number
  userDisconnected: boolean
}

type RedisLike = {
  sadd?: (key: string, ...members: string[]) => Promise<any>
  sAdd?: (key: string, members: string[] | string) => Promise<any>
  srem?: (key: string, ...members: string[]) => Promise<any>
  sRem?: (key: string, members: string[] | string) => Promise<any>
  smembers?: (key: string) => Promise<string[]>
  sMembers?: (key: string) => Promise<string[]>
  hset?: (key: string, ...args: string[]) => Promise<any>
  hSet?: (key: string, value: Record<string, string>) => Promise<any>
  hgetall?: (key: string) => Promise<Record<string, string>>
  hGetAll?: (key: string) => Promise<Record<string, string>>
  expire?: (key: string, seconds: number) => Promise<any>
  del?: (key: string) => Promise<any>
}

const REDIS_CLIENT_TOKEN = 'REDIS_CLIENT'
const DINGTALK_STREAM_REGISTRY_KEY = 'dingtalk:stream:registry'
const DINGTALK_STREAM_STATUS_TTL_SECONDS = 60 * 60 * 24
const DINGTALK_GATEWAY_URL = 'https://api.dingtalk.com/v1.0/gateway/connections/open'
const DINGTALK_STREAM_TOPIC_ROBOT = '/v1.0/im/bot/messages/get'
const DINGTALK_STREAM_TOPIC_CARD = '/v1.0/card/instances/callback'
const DINGTALK_STREAM_CONNECT_TIMEOUT_MS = 15_000
const DINGTALK_STREAM_RETRY_BASE_MS = 5_000
const DINGTALK_STREAM_RETRY_MAX_MS = 30_000
const DINGTALK_STREAM_UA_PREFIX = 'xpert-ai-plugin-dingtalk'
const DINGTALK_STREAM_SOCKET_REGISTRY = Symbol.for('@xpert-ai/plugin-dingtalk/long-connection-sockets')
const require = createRequire(import.meta.url)

type DingTalkStreamSocketRegistry = Map<string, Set<any>>

function getDingTalkStreamSocketRegistry(): DingTalkStreamSocketRegistry {
  const globalObject = globalThis as Record<PropertyKey, unknown>
  const existing = globalObject[DINGTALK_STREAM_SOCKET_REGISTRY]
  if (existing instanceof Map) {
    return existing as DingTalkStreamSocketRegistry
  }

  const registry: DingTalkStreamSocketRegistry = new Map()
  globalObject[DINGTALK_STREAM_SOCKET_REGISTRY] = registry
  return registry
}

function getDingTalkStreamStatusKey(integrationId: string): string {
  return `dingtalk:stream:status:${integrationId}`
}

@Injectable()
export class DingTalkLongConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DingTalkLongConnectionService.name)
  private readonly instanceId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`
  private readonly sessions = new Map<string, DingTalkLongSession>()
  private readonly socketRegistry = getDingTalkStreamSocketRegistry()
  private _integrationPermissionService: IntegrationPermissionService
  private _redis: RedisLike | null | undefined

  constructor(
    @Inject(DINGTALK_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext,
    private readonly dingtalkChannel: DingTalkChannelStrategy,
    private readonly conversation: DingTalkConversationService
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
      `[dingtalk-stream] bootstrapping Stream Mode sessions for integrations: [${integrationIds.join(', ')}]`
    )
    this.restoreBootstrapSessions(integrationIds)
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnectAll()
  }

  async connect(integrationId: string): Promise<TDingTalkRuntimeStatus> {
    const integration = await this.safeReadIntegration(integrationId)
    if (!integration) {
      await this.unregisterIntegration(integrationId)
      await this.removeSession(integrationId)
      await this.clearStatus(integrationId)
      return this.buildDetachedStatus(integrationId)
    }

    if (!this.isLongConnectionIntegration(integration)) {
      await this.unregisterIntegration(integrationId)
      await this.removeSession(integrationId)
      await this.clearStatus(integrationId)
      return this.buildDetachedStatus(integrationId)
    }

    await this.registerIntegration(integrationId)
    const session = this.ensureSession(integration)
    if (session.state === 'connected' && this.isSocketOpen(session.websocket)) {
      this.closeRegisteredSockets(integration.id, session.websocket)
      await this.writeStatus(session)
      return this.buildStatus(session)
    }

    await this.startSession(session, integration)
    return this.buildStatus(session)
  }

  async reconnect(integrationId: string): Promise<TDingTalkRuntimeStatus> {
    const session = this.sessions.get(integrationId)
    if (session) {
      await this.stopSession(session)
      session.state = 'idle'
      session.lastError = null
      session.reconnectAttempts = 0
      session.userDisconnected = false
    }
    return this.connect(integrationId)
  }

  async disconnect(integrationId: string): Promise<TDingTalkRuntimeStatus> {
    await this.unregisterIntegration(integrationId)
    await this.removeSession(integrationId)
    await this.clearStatus(integrationId)
    return this.buildDetachedStatus(integrationId)
  }

  async disconnectAll(): Promise<void> {
    await Promise.allSettled([...this.sessions.values()].map((session) => this.stopSession(session)))
    this.sessions.clear()
    this.closeRegisteredSockets()
  }

  async status(integrationId: string): Promise<TDingTalkRuntimeStatus> {
    const session = this.sessions.get(integrationId)
    if (!session) {
      return this.readStoredStatus(integrationId)
    }
    if (session.state === 'connected' && !this.isSocketOpen(session.websocket)) {
      session.state = 'idle'
      session.disconnectedAt = Date.now()
    }
    await this.writeStatus(session)
    return this.buildStatus(session)
  }

  async probeConfig(config: TIntegrationDingTalkOptions): Promise<TDingTalkConnectionProbeResult> {
    const checkedAt = Date.now()
    const clientId = this.normalizeString(config?.clientId)
    const clientSecret = this.normalizeString(config?.clientSecret)
    if (!clientId || !clientSecret) {
      return {
        connectionMode: 'long_connection',
        connected: false,
        state: 'failed',
        checkedAt,
        lastError: 'clientId/clientSecret are required'
      }
    }

    let websocket: any | null = null
    try {
      const connectUrl = await this.getConnectUrl(clientId, clientSecret)
      websocket = await this.openWebSocket(connectUrl, DINGTALK_STREAM_CONNECT_TIMEOUT_MS)
      return {
        connectionMode: 'long_connection',
        connected: true,
        state: 'connected',
        checkedAt,
        lastError: null
      }
    } catch (error) {
      return {
        connectionMode: 'long_connection',
        connected: false,
        state: 'failed',
        checkedAt,
        lastError: this.stringifyError(error)
      }
    } finally {
      this.closeSocket(websocket)
    }
  }

  private restoreBootstrapSessions(integrationIds: string[]): void {
    void Promise.allSettled(integrationIds.map((integrationId) => this.connect(integrationId))).then((results) => {
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.warn(
            `[dingtalk-long] bootstrap restore failed integration=${integrationIds[index]}: ${this.stringifyError(result.reason)}`
          )
        }
      })
    })
  }

  private ensureSession(integration: IIntegration<TIntegrationDingTalkOptions>): DingTalkLongSession {
    const options = integration.options || ({} as TIntegrationDingTalkOptions)
    const clientId = this.normalizeString(options.clientId)
    const clientSecret = this.normalizeString(options.clientSecret)
    if (!clientId || !clientSecret) {
      throw new Error(`Integration ${integration.id} missing clientId/clientSecret`)
    }

    const existing = this.sessions.get(integration.id)
    if (existing && existing.clientId === clientId && existing.clientSecret === clientSecret) {
      return existing
    }

    if (existing) {
      void this.stopSession(existing)
    }

    const session: DingTalkLongSession = {
      integrationId: integration.id,
      clientId,
      clientSecret,
      state: 'idle',
      websocket: null,
      reconnectTimer: null,
      connectedAt: null,
      disconnectedAt: null,
      lastCallbackAt: null,
      lastError: null,
      reconnectAttempts: 0,
      userDisconnected: false
    }
    this.sessions.set(integration.id, session)
    return session
  }

  private async startSession(
    session: DingTalkLongSession,
    integration: IIntegration<TIntegrationDingTalkOptions>
  ): Promise<void> {
    await this.stopClient(session)
    this.closeRegisteredSockets(session.integrationId)

    session.state = 'connecting'
    session.userDisconnected = false
    session.lastError = null

    try {
      const connectUrl = await this.getConnectUrl(session.clientId, session.clientSecret)
      const websocket = await this.openWebSocket(connectUrl, DINGTALK_STREAM_CONNECT_TIMEOUT_MS)
      session.websocket = websocket
      this.registerSocket(session.integrationId, websocket)
      this.bindSocketEvents(session, websocket)
      session.state = 'connected'
      session.connectedAt = Date.now()
      session.disconnectedAt = null
      session.reconnectAttempts = 0
      session.lastError = null
      await this.writeStatus(session)
      this.logger.log(`[dingtalk-long] connected integration=${integration.id} instance=${this.instanceId}`)
    } catch (error) {
      session.state = 'unhealthy'
      session.disconnectedAt = Date.now()
      session.reconnectAttempts += 1
      session.lastError = this.stringifyError(error)
      await this.writeStatus(session)
      this.logger.warn(`[dingtalk-long] connect failed integration=${integration.id}: ${session.lastError}`)
    }
  }

  private async getConnectUrl(clientId: string, clientSecret: string): Promise<string> {
    const response = await axios.post(
      DINGTALK_GATEWAY_URL,
      {
        clientId,
        clientSecret,
        ua: `${DINGTALK_STREAM_UA_PREFIX}/${this.instanceId}`,
        subscriptions: [
          {
            type: 'CALLBACK',
            topic: DINGTALK_STREAM_TOPIC_ROBOT
          },
          {
            type: 'CALLBACK',
            topic: DINGTALK_STREAM_TOPIC_CARD
          }
        ]
      },
      {
        headers: {
          Accept: 'application/json'
        },
        timeout: 10_000
      }
    )

    const endpoint = this.normalizeString(response?.data?.endpoint)
    const ticket = this.normalizeString(response?.data?.ticket)
    if (!endpoint || !ticket) {
      throw new Error('DingTalk stream endpoint or ticket is empty')
    }

    return `${endpoint}?ticket=${ticket}`
  }

  private async openWebSocket(connectUrl: string, timeoutMs: number): Promise<any> {
    const WebSocketCtor = this.resolveWebSocketCtor()
    const websocket = new WebSocketCtor(connectUrl)

    await new Promise<void>((resolve, reject) => {
      let settled = false

      const cleanup = () => {
        clearTimeout(timer)
        websocket.off?.('open', onOpen)
        websocket.off?.('error', onError)
        websocket.off?.('close', onClose)
      }

      const settle = (callback: () => void) => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        callback()
      }

      const onOpen = () => settle(resolve)
      const onError = (error: Error) =>
        settle(() => {
          this.closeSocket(websocket)
          reject(error)
        })
      const onClose = () => settle(() => reject(new Error('DingTalk stream websocket closed before open')))

      const timer = setTimeout(() => {
        settle(() => {
          this.closeSocket(websocket)
          reject(new Error(`DingTalk stream websocket open timeout (${timeoutMs}ms)`))
        })
      }, timeoutMs)

      websocket.on('open', onOpen)
      websocket.on('error', onError)
      websocket.on('close', onClose)
    })

    return websocket
  }

  private bindSocketEvents(session: DingTalkLongSession, websocket: any): void {
    websocket.on('message', (data: unknown) => {
      this.handleSocketMessage(session, websocket, data)
    })
    websocket.on('close', () => {
      this.unregisterSocket(websocket)
      if (session.websocket !== websocket) {
        return
      }
      session.websocket = null
      session.disconnectedAt = Date.now()
      session.state = session.userDisconnected ? 'idle' : 'retrying'
      void this.writeStatus(session).catch((error) => {
        this.logger.warn(`[dingtalk-long] write status failed integration=${session.integrationId}: ${this.stringifyError(error)}`)
      })
      if (!session.userDisconnected) {
        this.scheduleReconnect(session)
      }
    })
    websocket.on('error', (error: Error) => {
      if (session.websocket !== websocket) {
        return
      }
      session.lastError = this.stringifyError(error)
      void this.writeStatus(session).catch((writeError) => {
        this.logger.warn(
          `[dingtalk-long] write status failed integration=${session.integrationId}: ${this.stringifyError(writeError)}`
        )
      })
      this.logger.warn(`[dingtalk-long] socket error integration=${session.integrationId}: ${session.lastError}`)
    })
  }

  private handleSocketMessage(session: DingTalkLongSession, websocket: any, data: unknown): void {
    const downstream = this.parseDownstream(data)
    if (!downstream?.type) {
      this.logger.log(
        `[dingtalk-long] inbound raw frame ignored integration=${session.integrationId} summary=${this.summarizeRawFrame(data)}`
      )
      return
    }

    const frameSummary = this.summarizeDownstreamFrame(downstream)
    if (downstream.type === 'SYSTEM' && this.normalizeString(downstream.headers?.topic) === 'ping') {
      this.logger.log(`[dingtalk-long] inbound frame integration=${session.integrationId} ${frameSummary}`)
    } else {
      this.logger.log(`[dingtalk-long] inbound frame integration=${session.integrationId} ${frameSummary}`)
    }

    if (downstream.type === 'SYSTEM') {
      this.handleSystemMessage(websocket, downstream)
      return
    }

    if (downstream.type !== 'EVENT' && downstream.type !== 'CALLBACK') {
      return
    }

    const messageId = this.normalizeString(downstream.headers?.messageId)
    if (messageId) {
      this.sendStreamAck(websocket, messageId)
    }

    session.lastCallbackAt = Date.now()
    void this.writeStatus(session).catch((error) => {
      this.logger.warn(`[dingtalk-long] write status failed integration=${session.integrationId}: ${this.stringifyError(error)}`)
    })
    void this.handleDownstreamEvent(session, downstream).catch((error) => {
      session.lastError = this.stringifyError(error)
      void this.writeStatus(session).catch((writeError) => {
        this.logger.warn(
          `[dingtalk-long] write status failed integration=${session.integrationId}: ${this.stringifyError(writeError)}`
        )
      })
      this.logger.warn(
        `[dingtalk-long] inbound event failed integration=${session.integrationId}: ${session.lastError}`
      )
    })
  }

  private handleSystemMessage(websocket: any, downstream: DingTalkStreamDownstream): void {
    const topic = this.normalizeString(downstream.headers?.topic)
    if (topic !== 'ping') {
      return
    }

    this.sendSocketResponse(websocket, {
      code: 200,
      headers: downstream.headers,
      message: 'OK',
      data: downstream.data
    })
  }

  private sendStreamAck(websocket: any, messageId: string): void {
    this.sendSocketResponse(websocket, {
      code: 200,
      headers: {
        contentType: 'application/json',
        messageId
      },
      message: 'OK',
      data: JSON.stringify({
        status: 'SUCCESS'
      })
    })
  }

  private sendSocketResponse(websocket: any, payload: Record<string, unknown>): void {
    if (!this.isSocketOpen(websocket)) {
      return
    }

    try {
      websocket.send(JSON.stringify(payload))
    } catch (error) {
      this.logger.warn(`[dingtalk-long] ack failed: ${this.stringifyError(error)}`)
    }
  }

  private async handleDownstreamEvent(
    session: DingTalkLongSession,
    message: DingTalkStreamDownstream
  ): Promise<void> {
    const integration = await this.safeReadIntegration(session.integrationId)
    if (!integration) {
      await this.unregisterIntegration(session.integrationId)
      await this.removeSession(session.integrationId)
      await this.clearStatus(session.integrationId)
      return
    }

    if (!this.isLongConnectionIntegration(integration)) {
      await this.unregisterIntegration(session.integrationId)
      await this.removeSession(session.integrationId)
      await this.clearStatus(session.integrationId)
      return
    }

    const payload = this.normalizeDownstreamPayload(message)
    if (!payload) {
      return
    }

    const contextUser = (RequestContext.currentUser() as IUser) ?? {
      id: `dingtalk-long:${integration.id}:system`,
      tenantId: integration.tenantId,
      organizationId: integration.organizationId
    }

    const requestHeaders: Record<string, string> = {
      ['organization-id']: integration.organizationId,
      ['tenant-id']: integration.tenantId
    }
    if (integration.options?.preferLanguage) {
      requestHeaders['language'] = integration.options.preferLanguage
    }

    const ctx: TChatEventContext<TIntegrationDingTalkOptions> = {
      integration,
      tenantId: integration.tenantId,
      organizationId: integration.organizationId
    }

    const handlers: TChatEventHandlers = {
      onMessage: async (inboundMessage, eventCtx) => {
        await this.conversation.handleMessage(inboundMessage, eventCtx)
      },
      onMention: async (inboundMessage, eventCtx) => {
        await this.conversation.handleMessage(inboundMessage, eventCtx)
      },
      onCardAction: async (action, eventCtx) => {
        await this.conversation.handleCardAction(action, eventCtx)
      }
    }

    const handler = this.dingtalkChannel.createEventHandler(ctx, handlers)
    const req = {
      body: payload,
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

  private normalizeDownstreamPayload(message: DingTalkStreamDownstream): Record<string, unknown> | null {
    const data = this.parseJsonRecord(message.data)
    if (!data) {
      return null
    }

    const topic = this.normalizeString(message.headers?.topic)
    const eventType =
      this.normalizeString(data.EventType) ||
      this.normalizeString(data.eventType) ||
      this.normalizeString(message.headers?.eventType) ||
      (topic === DINGTALK_STREAM_TOPIC_CARD ? 'chatbot_card_callback' : '')

    return {
      ...data,
      ...(eventType ? { eventType } : {}),
      headers: message.headers,
      raw_stream_frame: message
    }
  }

  private parseDownstream(value: unknown): DingTalkStreamDownstream | null {
    const text = Buffer.isBuffer(value)
      ? value.toString('utf8')
      : typeof value === 'string'
        ? value
        : value == null
          ? ''
          : String(value)
    if (!text) {
      return null
    }

    try {
      const parsed = JSON.parse(text)
      return parsed && typeof parsed === 'object' ? (parsed as DingTalkStreamDownstream) : null
    } catch {
      return null
    }
  }

  private parseJsonRecord(value: unknown): Record<string, unknown> | null {
    if (!value) {
      return null
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
    if (typeof value !== 'string') {
      return null
    }
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return {
        content: value
      }
    }
  }

  private summarizeDownstreamFrame(message: DingTalkStreamDownstream): string {
    const data = this.parseJsonRecord(message.data)
    const dataKeys = data ? Object.keys(data).slice(0, 20).join(',') : ''
    return [
      `type=${message.type || 'unknown'}`,
      `topic=${this.normalizeString(message.headers?.topic) || 'unknown'}`,
      `eventType=${this.normalizeString(message.headers?.eventType) || this.normalizeString(data?.eventType) || this.normalizeString(data?.EventType) || 'unknown'}`,
      `messageId=${this.normalizeString(message.headers?.messageId) || 'unknown'}`,
      `dataKeys=${dataKeys || 'none'}`
    ].join(' ')
  }

  private summarizeRawFrame(value: unknown): string {
    if (Buffer.isBuffer(value)) {
      return `buffer:${value.length}`
    }
    if (typeof value === 'string') {
      return `string:${value.length}`
    }
    if (value == null) {
      return 'empty'
    }
    return typeof value
  }

  private scheduleReconnect(session: DingTalkLongSession): void {
    if (session.reconnectTimer || session.userDisconnected) {
      return
    }

    session.reconnectAttempts += 1
    const delayMs = Math.min(
      DINGTALK_STREAM_RETRY_BASE_MS * Math.max(1, session.reconnectAttempts),
      DINGTALK_STREAM_RETRY_MAX_MS
    )
    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = null
      void this.connect(session.integrationId)
    }, delayMs)
  }

  private async registerIntegration(integrationId: string): Promise<void> {
    const redis = this.redis
    if (!redis) {
      return
    }
    if (typeof redis.sadd === 'function') {
      await redis.sadd(DINGTALK_STREAM_REGISTRY_KEY, integrationId)
      return
    }
    if (typeof redis.sAdd === 'function') {
      await redis.sAdd(DINGTALK_STREAM_REGISTRY_KEY, integrationId)
    }
  }

  private async unregisterIntegration(integrationId: string): Promise<void> {
    const redis = this.redis
    if (!redis) {
      return
    }
    if (typeof redis.srem === 'function') {
      await redis.srem(DINGTALK_STREAM_REGISTRY_KEY, integrationId)
      return
    }
    if (typeof redis.sRem === 'function') {
      await redis.sRem(DINGTALK_STREAM_REGISTRY_KEY, integrationId)
    }
  }

  private async writeStatus(session: DingTalkLongSession): Promise<void> {
    const redis = this.redis
    if (!redis) {
      return
    }

    const payload = {
      state: session.state,
      connectionMode: 'long_connection',
      connected: session.state === 'connected' && this.isSocketOpen(session.websocket) ? 'true' : 'false',
      ownerInstanceId: this.instanceId,
      lastConnectedAt: session.connectedAt ? String(session.connectedAt) : '',
      lastDisconnectedAt: session.disconnectedAt ? String(session.disconnectedAt) : '',
      lastCallbackAt: session.lastCallbackAt ? String(session.lastCallbackAt) : '',
      lastError: session.lastError || '',
      reconnectAttempts: String(session.reconnectAttempts ?? 0)
    }

    const statusKey = getDingTalkStreamStatusKey(session.integrationId)
    if (typeof redis.hset === 'function') {
      await redis.hset(statusKey, ...Object.entries(payload).flat())
    } else if (typeof redis.hSet === 'function') {
      await redis.hSet(statusKey, payload)
    }
    if (typeof redis.expire === 'function') {
      await redis.expire(statusKey, DINGTALK_STREAM_STATUS_TTL_SECONDS)
    }
  }

  private async clearStatus(integrationId: string): Promise<void> {
    await this.redis?.del?.(getDingTalkStreamStatusKey(integrationId))
  }

  private async readStoredStatus(integrationId: string): Promise<TDingTalkRuntimeStatus> {
    const redis = this.redis
    const statusKey = getDingTalkStreamStatusKey(integrationId)
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
      connectionMode: data.connectionMode === 'webhook' ? 'webhook' : 'long_connection',
      connected: data.connected === 'true',
      state: (data.state as TDingTalkLongRuntimeState) || 'idle',
      lastConnectedAt: data.lastConnectedAt ? Number(data.lastConnectedAt) : null,
      lastDisconnectedAt: data.lastDisconnectedAt ? Number(data.lastDisconnectedAt) : null,
      lastError: data.lastError || null,
      reconnectAttempts: data.reconnectAttempts ? Number(data.reconnectAttempts) : 0,
      lastCallbackAt: data.lastCallbackAt ? Number(data.lastCallbackAt) : null
    }
  }

  private async loadRegistry(): Promise<string[]> {
    const redis = this.redis
    if (!redis) {
      return []
    }
    if (typeof redis.smembers === 'function') {
      return (await redis.smembers(DINGTALK_STREAM_REGISTRY_KEY)) ?? []
    }
    if (typeof redis.sMembers === 'function') {
      return (await redis.sMembers(DINGTALK_STREAM_REGISTRY_KEY)) ?? []
    }
    return []
  }

  private async loadBootstrapIntegrationIds(): Promise<string[]> {
    try {
      const permissionService = this.integrationPermissionService as unknown as {
        findAll?: (
          options?: Record<string, unknown>
        ) => Promise<{ items?: Array<IIntegration<TIntegrationDingTalkOptions>> }>
      }

      if (typeof permissionService.findAll !== 'function') {
        return this.loadRegistry()
      }

      const [longResult, legacyResult] = await Promise.all([
        permissionService.findAll({
          where: {
            provider: INTEGRATION_DINGTALK_LONG
          },
          relations: ['tenant']
        }),
        permissionService.findAll({
          where: {
            provider: INTEGRATION_DINGTALK
          },
          relations: ['tenant']
        })
      ])
      const items = [
        ...(longResult?.items ?? []),
        ...(legacyResult?.items ?? []).filter((item) => this.isLongConnectionIntegration(item))
      ]
      for (const item of items) {
        await this.registerIntegration(item.id)
      }
      return items.map((item) => item.id)
    } catch (error) {
      this.logger.warn(`[dingtalk-long] load from integration service failed: ${this.stringifyError(error)}`)
    }

    return this.loadRegistry()
  }

  private async safeReadIntegration(
    integrationId: string
  ): Promise<IIntegration<TIntegrationDingTalkOptions> | null> {
    try {
      return await this.integrationPermissionService.read<IIntegration<TIntegrationDingTalkOptions>>(integrationId, {
        relations: ['tenant']
      })
    } catch (error) {
      this.logger.warn(`[dingtalk-long] read integration=${integrationId} failed: ${this.stringifyError(error)}`)
      return null
    }
  }

  private isLongConnectionIntegration(integration: IIntegration<TIntegrationDingTalkOptions>): boolean {
    return resolveDingTalkConnectionMode(integration.options, integration.provider) === 'long_connection'
  }

  private async removeSession(integrationId: string): Promise<void> {
    const session = this.sessions.get(integrationId)
    if (!session) {
      return
    }
    await this.stopSession(session)
    this.sessions.delete(integrationId)
  }

  private async stopSession(session: DingTalkLongSession): Promise<void> {
    session.userDisconnected = true
    await this.stopClient(session)
    session.state = 'idle'
    session.disconnectedAt = Date.now()
    await this.writeStatus(session)
  }

  private async stopClient(session: DingTalkLongSession): Promise<void> {
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer)
      session.reconnectTimer = null
    }
    this.closeSocket(session.websocket)
    session.websocket = null
  }

  private registerSocket(integrationId: string, websocket: any): void {
    this.unregisterSocket(websocket)
    let sockets = this.socketRegistry.get(integrationId)
    if (!sockets) {
      sockets = new Set()
      this.socketRegistry.set(integrationId, sockets)
    }
    sockets.add(websocket)
  }

  private unregisterSocket(websocket: any | null): void {
    if (!websocket) {
      return
    }

    for (const [integrationId, sockets] of this.socketRegistry.entries()) {
      sockets.delete(websocket)
      if (sockets.size === 0) {
        this.socketRegistry.delete(integrationId)
      }
    }
  }

  private closeRegisteredSockets(integrationId?: string, except?: any | null): void {
    const entries = integrationId
      ? ([[integrationId, this.socketRegistry.get(integrationId)]] as Array<[string, Set<any> | undefined]>)
      : [...this.socketRegistry.entries()]

    for (const [, sockets] of entries) {
      for (const websocket of [...(sockets ?? [])]) {
        if (websocket !== except) {
          this.closeSocket(websocket)
        }
      }
    }
  }

  private closeSocket(websocket: any | null): void {
    if (!websocket) {
      return
    }

    try {
      const shouldClose = this.isSocketOpen(websocket) || websocket.readyState === 0 || websocket.readyState === 2
      this.unregisterSocket(websocket)
      websocket.removeAllListeners?.()
      if (shouldClose) {
        websocket.close?.()
        websocket.terminate?.()
      }
    } catch (error) {
      this.logger.warn(`[dingtalk-long] close socket failed: ${this.stringifyError(error)}`)
    }
  }

  private isSocketOpen(websocket: any | null): boolean {
    return !!websocket && websocket.readyState === 1
  }

  private resolveWebSocketCtor(): any {
    const wsModule = require('ws')
    const WebSocketCtor = wsModule?.WebSocket || wsModule?.default || wsModule
    if (!WebSocketCtor) {
      throw new Error('WebSocket implementation is empty')
    }
    return WebSocketCtor
  }

  private buildStatus(session: DingTalkLongSession): TDingTalkRuntimeStatus {
    return {
      integrationId: session.integrationId,
      connectionMode: 'long_connection',
      connected: session.state === 'connected' && this.isSocketOpen(session.websocket),
      state: session.state,
      lastConnectedAt: session.connectedAt ?? null,
      lastDisconnectedAt: session.disconnectedAt ?? null,
      lastError: session.lastError ?? null,
      reconnectAttempts: session.reconnectAttempts,
      lastCallbackAt: session.lastCallbackAt ?? null
    }
  }

  private buildDetachedStatus(integrationId: string): TDingTalkRuntimeStatus {
    return {
      integrationId,
      connectionMode: 'webhook',
      connected: false,
      state: 'idle',
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastError: null,
      reconnectAttempts: 0,
      lastCallbackAt: null
    }
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

  private normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
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
