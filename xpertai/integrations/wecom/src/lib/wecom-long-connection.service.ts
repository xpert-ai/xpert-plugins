import { randomUUID } from 'crypto'
import { createRequire } from 'module'
import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import express from 'express'
import { IIntegration, IUser } from '@metad/contracts'
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
  TIntegrationWeComOptions
} from './types.js'
import { WeComChannelStrategy } from './wecom-channel.strategy.js'

const require = createRequire(import.meta.url)

type LongSessionState = 'disconnected' | 'connecting' | 'connected' | 'error'

type PendingRequest = {
  resolve: (value: Record<string, unknown>) => void
  reject: (reason: unknown) => void
  timer: NodeJS.Timeout
}

type WeComLongSession = {
  integrationId: string
  botId: string
  secret: string
  wsOrigin: string | null
  timeoutMs: number
  shouldRun: boolean
  state: LongSessionState
  connectedAt?: number
  disconnectedAt?: number
  lastError?: string
  reconnectAttempts: number
  websocket: any | null
  pingTimer: NodeJS.Timeout | null
  reconnectTimer: NodeJS.Timeout | null
  pendingRequests: Map<string, PendingRequest>
}

export type WeComLongConnectionStatus = {
  integrationId: string
  state: LongSessionState
  connected: boolean
  shouldRun: boolean
  connectedAt?: number
  disconnectedAt?: number
  reconnectAttempts: number
  lastError?: string
}

type WeComLongCommandResult = {
  reqId: string
  errcode: number
  errmsg: string
  raw: Record<string, unknown>
}

const WECOM_LONG_WS_URL = 'wss://openws.work.weixin.qq.com'
const DEFAULT_TIMEOUT_MS = 10000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 120000
const PING_INTERVAL_MS = 30 * 1000
const MAX_RECONNECT_DELAY_MS = 30 * 1000

@Injectable()
export class WeComLongConnectionService implements OnModuleDestroy {
  private readonly logger = new Logger(WeComLongConnectionService.name)
  private readonly sessions = new Map<string, WeComLongSession>()
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    @Inject(WECOM_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext,
    @Inject(forwardRef(() => WeComChannelStrategy))
    private readonly wecomChannel: WeComChannelStrategy,
    private readonly conversationService: WeComConversationService
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  async onModuleDestroy(): Promise<void> {
    const tasks = [...this.sessions.keys()].map((integrationId) => this.disconnect(integrationId))
    await Promise.allSettled(tasks)
  }

  async connect(integrationId: string): Promise<WeComLongConnectionStatus> {
    const integration = await this.readLongIntegration(integrationId)
    const botId = this.normalizeString(integration.options?.botId)
    const secret = this.normalizeString(integration.options?.secret)
    const wsOrigin = this.normalizeString(integration.options?.wsOrigin)

    if (!botId || !secret) {
      throw new Error(`Integration ${integrationId} missing botId/secret`)
    }

    const timeoutMs = this.normalizeTimeout(integration.options?.timeoutMs, DEFAULT_TIMEOUT_MS)
    return this.connectWithConfig({
      integrationId,
      botId,
      secret,
      wsOrigin,
      timeoutMs
    })
  }

  async connectWithConfig(params: {
    integrationId: string
    botId: string
    secret: string
    wsOrigin?: string | null
    timeoutMs?: number
  }): Promise<WeComLongConnectionStatus> {
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
    const existing = this.sessions.get(integrationId)
    const shouldRestart =
      !!existing &&
      existing.state === 'connected' &&
      (existing.botId !== botId || existing.secret !== secret || existing.wsOrigin !== wsOrigin)

    if (shouldRestart) {
      await this.disconnect(integrationId)
    }

    const session = this.ensureSession({
      integrationId,
      botId,
      secret,
      wsOrigin,
      timeoutMs
    })

    if (session.state === 'connected') {
      session.shouldRun = true
      return this.buildStatus(session)
    }

    session.shouldRun = true

    await this.connectSession(session)
    return this.buildStatus(session)
  }

  async disconnect(integrationId: string): Promise<WeComLongConnectionStatus> {
    const session = this.sessions.get(integrationId)
    if (!session) {
      return {
        integrationId,
        state: 'disconnected',
        connected: false,
        shouldRun: false,
        reconnectAttempts: 0
      }
    }

    session.shouldRun = false
    this.clearPingTimer(session)
    this.clearReconnectTimer(session)

    for (const [reqId, pending] of session.pendingRequests.entries()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`Long connection is closing (integration=${integrationId}, reqId=${reqId})`))
    }
    session.pendingRequests.clear()

    if (session.websocket) {
      try {
        session.websocket.close()
      } catch (error) {
        this.logger.warn(
          `[wecom-long] close socket failed integration=${integrationId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
      session.websocket = null
    }

    session.state = 'disconnected'
    session.disconnectedAt = Date.now()

    return this.buildStatus(session)
  }

  async status(integrationId: string): Promise<WeComLongConnectionStatus> {
    const session = this.sessions.get(integrationId)
    if (!session) {
      return {
        integrationId,
        state: 'disconnected',
        connected: false,
        shouldRun: false,
        reconnectAttempts: 0
      }
    }
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

    const response = await this.sendCommand(params.integrationId, {
      cmd: 'aibot_respond_msg',
      reqId,
      body: params.body,
      timeoutMs: params.timeoutMs,
      useProvidedReqId: true
    })

    return {
      reqId,
      errcode: response.errcode,
      errmsg: response.errmsg,
      raw: response.raw
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

    const response = await this.sendCommand(params.integrationId, {
      cmd: 'aibot_respond_update_msg',
      reqId,
      body: {
        response_type: 'update_template_card',
        template_card: params.templateCard
      },
      timeoutMs: params.timeoutMs,
      useProvidedReqId: true
    })

    return {
      reqId,
      errcode: response.errcode,
      errmsg: response.errmsg,
      raw: response.raw
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

    const response = await this.sendCommand(params.integrationId, {
      cmd: 'aibot_send_msg',
      body: {
        chatid: chatId,
        ...params.body
      },
      timeoutMs: params.timeoutMs
    })

    return {
      reqId: response.reqId,
      errcode: response.errcode,
      errmsg: response.errmsg,
      raw: response.raw
    }
  }

  private ensureSession(params: {
    integrationId: string
    botId: string
    secret: string
    wsOrigin: string | null
    timeoutMs: number
  }): WeComLongSession {
    const existing = this.sessions.get(params.integrationId)
    if (existing) {
      existing.botId = params.botId
      existing.secret = params.secret
      existing.wsOrigin = params.wsOrigin
      existing.timeoutMs = params.timeoutMs
      return existing
    }

    const created: WeComLongSession = {
      integrationId: params.integrationId,
      botId: params.botId,
      secret: params.secret,
      wsOrigin: params.wsOrigin,
      timeoutMs: params.timeoutMs,
      shouldRun: false,
      state: 'disconnected',
      reconnectAttempts: 0,
      websocket: null,
      pingTimer: null,
      reconnectTimer: null,
      pendingRequests: new Map()
    }

    this.sessions.set(params.integrationId, created)
    return created
  }

  private async connectSession(session: WeComLongSession): Promise<void> {
    if (session.state === 'connecting' || session.state === 'connected') {
      return
    }

    const WebSocketImpl = this.resolveWebSocketImpl()

    session.state = 'connecting'
    session.lastError = undefined

    let websocket: any = null
    try {
      const options = session.wsOrigin ? { origin: session.wsOrigin } : undefined
      websocket = new WebSocketImpl(WECOM_LONG_WS_URL, options)
    } catch (error) {
      session.state = 'error'
      session.lastError = error instanceof Error ? error.message : String(error)
      this.scheduleReconnect(session)
      throw error
    }

    session.websocket = websocket

    websocket.on('message', (data: unknown) => {
      const text = this.normalizeWsFrameData(data)
      if (!text) {
        return
      }
      this.handleIncomingMessage(session, text).catch((error) => {
        this.logger.error(
          `[wecom-long] handle incoming failed integration=${session.integrationId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined
        )
      })
    })

    websocket.on('close', () => {
      this.handleSocketClosed(session)
    })

    websocket.on('error', (error: unknown) => {
      const message =
        (error instanceof Error ? error.message : null) ||
        this.normalizeString((error as any)?.message) ||
        'websocket error'
      session.lastError = message
      this.logger.warn(`[wecom-long] socket error integration=${session.integrationId}: ${message}`)
    })

    await this.waitForOpen(session)

    const subscribeReqId = randomUUID()
    await this.sendCommand(session.integrationId, {
      cmd: 'aibot_subscribe',
      reqId: subscribeReqId,
      useProvidedReqId: true,
      allowConnecting: true,
      timeoutMs: session.timeoutMs,
      body: {
        bot_id: session.botId,
        secret: session.secret
      }
    })

    session.state = 'connected'
    session.connectedAt = Date.now()
    session.reconnectAttempts = 0
    this.startPing(session)
    this.logger.log(`[wecom-long] connected integration=${session.integrationId}`)
  }

  private async waitForOpen(session: WeComLongSession): Promise<void> {
    const websocket = session.websocket
    if (!websocket) {
      throw new Error('WebSocket not initialized')
    }

    if (websocket.readyState === 1) {
      return
    }

    const timeoutMs = session.timeoutMs
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
        const message =
          (event instanceof Error ? event.message : null) ||
          this.normalizeString((event as any)?.message) ||
          'websocket open failed'
        reject(new Error(message))
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

  private handleSocketClosed(session: WeComLongSession): void {
    this.clearPingTimer(session)
    for (const [reqId, pending] of session.pendingRequests.entries()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`Socket closed before response (reqId=${reqId})`))
    }
    session.pendingRequests.clear()

    session.websocket = null
    session.disconnectedAt = Date.now()
    if (session.shouldRun) {
      session.state = 'error'
      this.scheduleReconnect(session)
      this.logger.warn(`[wecom-long] disconnected integration=${session.integrationId}, schedule reconnect`)
      return
    }

    session.state = 'disconnected'
    this.logger.log(`[wecom-long] disconnected integration=${session.integrationId}`)
  }

  private scheduleReconnect(session: WeComLongSession): void {
    if (!session.shouldRun) {
      return
    }
    if (session.reconnectTimer) {
      return
    }

    session.reconnectAttempts += 1
    const delay = Math.min(1000 * Math.pow(2, session.reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS)
    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = null
      this.connectSession(session).catch((error) => {
        session.lastError = error instanceof Error ? error.message : String(error)
        this.logger.warn(
          `[wecom-long] reconnect failed integration=${session.integrationId}: ${session.lastError}`
        )
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

  private startPing(session: WeComLongSession): void {
    this.clearPingTimer(session)
    session.pingTimer = setInterval(() => {
      this.sendCommand(session.integrationId, {
        cmd: 'ping',
        timeoutMs: Math.min(3000, session.timeoutMs)
      }).catch((error) => {
        this.logger.warn(
          `[wecom-long] ping failed integration=${session.integrationId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      })
    }, PING_INTERVAL_MS)
  }

  private clearPingTimer(session: WeComLongSession): void {
    if (session.pingTimer) {
      clearInterval(session.pingTimer)
      session.pingTimer = null
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

    if (reqId) {
      this.sendAck(session, reqId)
    }

    await this.handleCallbackFrame(session, payload)
  }

  private sendAck(session: WeComLongSession, reqId: string): void {
    const websocket = session.websocket
    if (!websocket || websocket.readyState !== 1) {
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
        `[wecom-long] ack failed integration=${session.integrationId}, reqId=${reqId}: ${
          error instanceof Error ? error.message : String(error)
        }`
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
          handler(req as any, res as any).then(resolve).catch(reject)
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
    if (!websocket || websocket.readyState !== 1) {
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
        timer
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

  private buildStatus(session: WeComLongSession): WeComLongConnectionStatus {
    return {
      integrationId: session.integrationId,
      state: session.state,
      connected: session.state === 'connected',
      shouldRun: session.shouldRun,
      connectedAt: session.connectedAt,
      disconnectedAt: session.disconnectedAt,
      reconnectAttempts: session.reconnectAttempts,
      lastError: session.lastError
    }
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
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Cannot load 'ws' dependency: ${message}`)
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

  private async readLongIntegration(integrationId: string): Promise<IIntegration<TIntegrationWeComLongOptions>> {
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWeComLongOptions>>(
      integrationId,
      {
        relations: ['tenant']
      }
    )

    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`)
    }

    if (integration.provider !== INTEGRATION_WECOM_LONG) {
      throw new Error(`Integration ${integrationId} is not provider '${INTEGRATION_WECOM_LONG}'`)
    }

    return integration
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
}
