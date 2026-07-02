import { randomUUID } from 'crypto'
import { Buffer } from 'buffer'
import { hostname } from 'os'
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
  CONNECTION_COMMAND_ROUTER_TOKEN,
  type ConnectionCommandRouter,
  MANAGED_CONNECTION_REGISTRY_TOKEN,
  type ManagedConnectionCommandRequest,
  type ManagedConnectionDirection,
  type ManagedConnectionRecord,
  type ManagedConnectionRegistry,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { WECHAT_PLUGIN_CONTEXT } from './tokens.js'
import { normalizeString, normalizeTimeoutMs } from './types.js'
import { WECHAT_PLUGIN_NAME } from './constants.js'

const DEFAULT_SIDECAR_LISTEN_HOST = '127.0.0.1'
const DEFAULT_SIDECAR_LISTEN_PORT = 8088
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000
const DEFAULT_CLIENT_TIMEOUT_MS = 90000
const DEFAULT_HTTP_PORT = 8099
const MAX_FRAME_BYTES = 128 * 1024 * 1024
const WECHAT_TUNNEL_CONNECTION_TYPE = 'wechat_tunnel'

export type WechatTunnelMessageType =
  | 'register'
  | 'register_ack'
  | 'sync_bindings'
  | 'ping'
  | 'pong'
  | 'http_request'
  | 'http_response'
  | 'ws_open'
  | 'ws_open_ack'
  | 'ws_frame'
  | 'ws_close'

export type WechatTunnelBinding = {
  uuid: string
  wxid?: string
}

export type WechatTunnelMessage = {
  type: WechatTunnelMessageType | string
  id?: string
  name?: string
  ok?: boolean
  text?: string
  bindings?: WechatTunnelBinding[]
  requestId?: string
  method?: string
  path?: string
  headers?: Record<string, string>
  body?: string
  status?: number
  opcode?: number
}

export type WechatTunnelConfig = {
  wsPath: string
  heartbeatIntervalMs: number
  clientTimeoutMs: number
}

export type WechatTunnelSetupConfig = {
  forwardServerInfo: {
    Url: string
    TcpPort: number
    HttpPort: number
  }
  msgClientInfo: {
    Id: string
    Name: string
  }
  settingJson: string
  sidecar: {
    websocketUrl: string
    listenHost: string
    listenPort: number
    command: string
  }
}

export type WechatTunnelStatus = {
  wsPath: string
  wsUrl?: string | null
  state: 'connected' | 'disconnected'
  instanceId: string
  clientId?: string | null
  clientName?: string | null
  direction?: ManagedConnectionDirection
  connected: boolean
  remoteAddress?: string | null
  lastConnectedAt?: string | null
  lastDisconnectedAt?: string | null
  lastSeenAt?: string | null
  lastPingAt?: string | null
  lastSyncAt?: string | null
  lastError?: string | null
  bindingCount: number
  bindings: WechatTunnelBinding[]
  setup?: WechatTunnelSetupConfig
}

export type WechatTunnelClientInfo = {
  clientId: string
  clientName?: string | null
  direction?: ManagedConnectionDirection
  state: 'connected' | 'disconnected'
  connected: boolean
  instanceId: string
  remoteAddress?: string | null
  connectedAt?: string | null
  disconnectedAt?: string | null
  lastSeenAt?: string | null
  lastPingAt?: string | null
  lastSyncAt?: string | null
  lastError?: string | null
  bindingCount: number
  bindings: WechatTunnelBinding[]
}

export type WechatTunnelClientListOptions = {
  clientIds?: Array<string | null | undefined>
  includeMissing?: boolean
  tenantId?: string | null
  organizationId?: string | null
}

export type WechatTunnelHttpRequest = {
  clientId: string
  method: string
  path: string
  headers?: Record<string, string>
  body?: string | Buffer
  timeoutMs?: number
  tenantId?: string | null
  organizationId?: string | null
}

export type WechatTunnelHttpResponse = {
  status: number
  headers: Record<string, string>
  body: Buffer
  text: string
}

type PendingRequest = {
  resolve: (response: WechatTunnelHttpResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type TunnelSession = {
  transport: WechatTunnelTransport
  readBuffer: Buffer
  expectedClientId?: string
  clientId?: string
  clientName?: string
  remoteAddress: string
  connectedAt: Date
  lastSeenAt: Date
  lastPingAt?: Date
  lastSyncAt?: Date
  lastError?: string
  tenantId?: string | null
  organizationId?: string | null
  bindings: WechatTunnelBinding[]
  pending: Map<string, PendingRequest>
  heartbeatTimer?: ReturnType<typeof setInterval>
}

type TunnelClientSnapshot = {
  clientId: string
  clientName?: string
  remoteAddress?: string
  connectedAt?: Date
  disconnectedAt?: Date
  lastSeenAt?: Date
  lastPingAt?: Date
  lastSyncAt?: Date
  lastError?: string
  tenantId?: string | null
  organizationId?: string | null
  bindings: WechatTunnelBinding[]
}

export type WechatTunnelTransport = {
  remoteAddress: string
  writable: boolean
  destroyed: boolean
  write(data: Buffer): void
  destroy(): void
  on(event: 'data', listener: (chunk: Buffer) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  on(event: 'close', listener: () => void): void
}

export function encodeWechatTunnelMessage(message: WechatTunnelMessage): Buffer {
  const payload = Buffer.from(JSON.stringify(message), 'utf8')
  if (payload.byteLength > MAX_FRAME_BYTES) {
    throw new Error(`Tunnel frame exceeds ${MAX_FRAME_BYTES} bytes`)
  }
  const frame = Buffer.allocUnsafe(4 + payload.byteLength)
  frame.writeUInt32BE(payload.byteLength, 0)
  payload.copy(frame, 4)
  return frame
}

export function decodeWechatTunnelFrames(buffer: Buffer): {
  messages: WechatTunnelMessage[]
  rest: Buffer
} {
  const messages: WechatTunnelMessage[] = []
  let offset = 0

  while (buffer.byteLength - offset >= 4) {
    const length = buffer.readUInt32BE(offset)
    if (length > MAX_FRAME_BYTES) {
      throw new Error(`Tunnel frame exceeds ${MAX_FRAME_BYTES} bytes`)
    }
    if (buffer.byteLength - offset - 4 < length) {
      break
    }
    const raw = buffer.subarray(offset + 4, offset + 4 + length).toString('utf8')
    const parsed = JSON.parse(raw) as WechatTunnelMessage
    messages.push(parsed)
    offset += 4 + length
  }

  return {
    messages,
    rest: buffer.subarray(offset)
  }
}

@Injectable()
export class WechatTunnelBrokerService implements OnModuleInit, OnModuleDestroy {
  private static readonly processInstanceId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`
  private static readonly processSessions = new Map<string, TunnelSession>()
  private static readonly processSnapshots = new Map<string, TunnelClientSnapshot>()
  private readonly instanceId = WechatTunnelBrokerService.processInstanceId
  private managedRegistryResolved = false
  private managedRegistryValue: ManagedConnectionRegistry | null = null
  private commandRouterResolved = false
  private commandRouterValue: ConnectionCommandRouter | null = null

  constructor(
    @Inject(WECHAT_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get sessions(): Map<string, TunnelSession> {
    return WechatTunnelBrokerService.processSessions
  }

  private get snapshots(): Map<string, TunnelClientSnapshot> {
    return WechatTunnelBrokerService.processSnapshots
  }

  private get managedRegistry(): ManagedConnectionRegistry | null {
    if (!this.managedRegistryResolved) {
      this.managedRegistryResolved = true
      try {
        this.managedRegistryValue = this.pluginContext.resolve(MANAGED_CONNECTION_REGISTRY_TOKEN)
      } catch {
        this.managedRegistryValue = null
      }
    }
    return this.managedRegistryValue
  }

  private get commandRouter(): ConnectionCommandRouter | null {
    if (!this.commandRouterResolved) {
      this.commandRouterResolved = true
      try {
        this.commandRouterValue = this.pluginContext.resolve(CONNECTION_COMMAND_ROUTER_TOKEN)
      } catch {
        this.commandRouterValue = null
      }
    }
    return this.commandRouterValue
  }

  onModuleInit(): void {
    this.commandRouter?.registerHandler(WECHAT_TUNNEL_CONNECTION_TYPE, (request) => this.handleManagedCommand(request))
  }

  async onModuleDestroy(): Promise<void> {
    for (const session of [...this.sessions.values()]) {
      this.closeSession(session, 'broker shutting down')
    }
  }

  async sendHttpRequest(request: WechatTunnelHttpRequest): Promise<WechatTunnelHttpResponse> {
    const clientId = normalizeString(request.clientId)
    if (!clientId) {
      throw new Error('wechat reverse tunnel client id is required')
    }

    const scope = this.normalizeRequestScope(request)
    const session = this.sessions.get(clientId)
    if (session && !session.transport.destroyed && session.transport.writable && this.sessionMatchesScope(session, scope)) {
      return this.sendLocalHttpRequest(request)
    }

    const router = this.commandRouter
    if (router) {
      const result = await router.invokeOwner(
        WECHAT_TUNNEL_CONNECTION_TYPE,
        clientId,
        'http_request',
        this.serializeHttpRequest(request),
        {
          pluginName: WECHAT_PLUGIN_NAME,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          timeoutMs: normalizeTimeoutMs(request.timeoutMs, this.getConfig().clientTimeoutMs) + 1000
        }
      )
      return this.deserializeHttpResponse(result)
    }

    throw new Error(
      `wechat reverse tunnel client "${clientId}" is not connected on broker ${this.instanceId}; ` +
        `connected clients: ${this.getConnectedClientIds().join(', ') || 'none'}`
    )
  }

  async disconnectManagedClient(
    clientId?: string | null,
    reason = 'disconnected by WeChat workbench administrator'
  ): Promise<boolean> {
    const normalizedClientId = normalizeString(clientId)
    if (!normalizedClientId) {
      return false
    }

    if (this.sessions.has(normalizedClientId)) {
      return this.disconnectClient(normalizedClientId, reason)
    }

    const router = this.commandRouter
    if (!router) {
      return false
    }

    const result = await router.invokeOwner(
      WECHAT_TUNNEL_CONNECTION_TYPE,
      normalizedClientId,
      'disconnect',
      { reason },
      {
        pluginName: WECHAT_PLUGIN_NAME
      }
    )
    return this.isDisconnectResult(result)
  }

  async listManagedClients(options: WechatTunnelClientListOptions = {}): Promise<WechatTunnelClientInfo[]> {
    const registry = this.managedRegistry
    if (!registry) {
      return this.listClients(options)
    }

    try {
      const records = await registry.list({
        pluginName: WECHAT_PLUGIN_NAME,
        connectionType: WECHAT_TUNNEL_CONNECTION_TYPE,
        direction: 'inbound',
        tenantId: options.tenantId,
        organizationId: options.organizationId,
        limit: 1000
      })
      const requestedClientIds = new Set((options.clientIds ?? []).map((clientId) => normalizeString(clientId)).filter(Boolean))
      const byClientId = new Map<string, WechatTunnelClientInfo>()

      for (const record of records) {
        const client = this.managedRecordToClientInfo(record)
        if (client) {
          byClientId.set(client.clientId, client)
        }
      }
      for (const client of this.listClients()) {
        byClientId.set(client.clientId, client)
      }
      if (options.includeMissing) {
        for (const clientId of requestedClientIds) {
          if (!byClientId.has(clientId)) {
            const client = this.tunnelStatusToClientInfo(this.getStatus(clientId))
            if (client) {
              byClientId.set(clientId, client)
            }
          }
        }
      }

      return [...byClientId.values()]
        .filter((client) => !requestedClientIds.size || requestedClientIds.has(client.clientId))
        .sort((left, right) => {
          if (left.connected !== right.connected) {
            return left.connected ? -1 : 1
          }
          return this.clientActivityTime(right) - this.clientActivityTime(left)
        })
    } catch {
      return this.listClients(options)
    }
  }

  async getManagedStatus(
    clientId?: string | null,
    setup?: { clientName?: string | null; tenantId?: string | null; organizationId?: string | null }
  ): Promise<WechatTunnelStatus> {
    const normalizedClientId = normalizeString(clientId)
    if (!normalizedClientId) {
      return this.getStatus(clientId, setup)
    }
    const local = this.getStatus(normalizedClientId, setup)
    if (local.connected) {
      return local
    }
    const [client] = await this.listManagedClients({
      clientIds: [normalizedClientId],
      tenantId: setup?.tenantId,
      organizationId: setup?.organizationId
    })
    if (!client) {
      return local
    }
    return {
      wsPath: local.wsPath,
      wsUrl: local.wsUrl,
      state: client.state,
      instanceId: client.instanceId,
      clientId: client.clientId,
      clientName: client.clientName || setup?.clientName || client.clientId,
      direction: client.direction ?? 'inbound',
      connected: client.connected,
      remoteAddress: client.remoteAddress ?? null,
      lastConnectedAt: client.connectedAt ?? null,
      lastDisconnectedAt: client.disconnectedAt ?? null,
      lastSeenAt: client.lastSeenAt ?? null,
      lastPingAt: client.lastPingAt ?? null,
      lastSyncAt: client.lastSyncAt ?? null,
      lastError: client.lastError ?? null,
      bindingCount: client.bindingCount,
      bindings: client.bindings,
      setup: this.buildSetupConfig(client.clientId, client.clientName || setup?.clientName)
    }
  }

  async syncManagedClientScope(
    clientId?: string | null,
    scope: {
      tenantId?: string | null
      organizationId?: string | null
      integrationId?: string | null
      integrationName?: string | null
    } = {}
  ): Promise<void> {
    const normalizedClientId = normalizeString(clientId)
    const registry = this.managedRegistry
    if (!normalizedClientId) {
      return
    }
    const session = this.sessions.get(normalizedClientId)
    if (session) {
      session.tenantId = scope.tenantId ?? null
      session.organizationId = scope.organizationId ?? null
      this.snapshotSession(session)
    }
    if (!registry) {
      return
    }
    await registry.syncMetadata({
      pluginName: WECHAT_PLUGIN_NAME,
      connectionType: WECHAT_TUNNEL_CONNECTION_TYPE,
      connectionKey: normalizedClientId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      metadata: {
        integrationId: scope.integrationId ?? null,
        integrationName: scope.integrationName ?? null
      },
      leaseTtlMs: this.getManagedLeaseTtlMs()
    }).catch(() => undefined)
  }

  private async sendLocalHttpRequest(request: WechatTunnelHttpRequest): Promise<WechatTunnelHttpResponse> {
    const config = this.getConfig()
    const clientId = normalizeString(request.clientId)
    if (!clientId) {
      throw new Error('wechat reverse tunnel client id is required')
    }
    const scope = this.normalizeRequestScope(request)

    const session = this.sessions.get(clientId)
    if (
      !session ||
      session.transport.destroyed ||
      !session.transport.writable ||
      !this.sessionMatchesScope(session, scope)
    ) {
      throw new Error(
        `wechat reverse tunnel client "${clientId}" is not connected on broker ${this.instanceId}; ` +
          `connected clients: ${this.getConnectedClientIds().join(', ') || 'none'}`
      )
    }

    const requestId = randomUUID()
    const timeoutMs = normalizeTimeoutMs(request.timeoutMs, config.clientTimeoutMs)
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from(request.body ?? '', 'utf8')

    return new Promise<WechatTunnelHttpResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pending.delete(requestId)
        reject(new Error(`wechat reverse tunnel request ${requestId} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      session.pending.set(requestId, {
        resolve,
        reject,
        timer
      })

      try {
        this.writeMessage(session, {
          type: 'http_request',
          requestId,
          method: normalizeString(request.method).toUpperCase() || 'GET',
          path: this.normalizePath(request.path),
          headers: request.headers ?? {},
          body: body.toString('base64')
        })
      } catch (error) {
        clearTimeout(timer)
        session.pending.delete(requestId)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  disconnectClient(clientId?: string | null, reason = 'wechat reverse tunnel client disconnected'): boolean {
    const normalizedClientId = normalizeString(clientId)
    if (!normalizedClientId) {
      return false
    }

    const session = this.sessions.get(normalizedClientId)
    if (!session) {
      return false
    }

    this.closeSession(session, reason)
    return true
  }

  listClients(options: WechatTunnelClientListOptions = {}): WechatTunnelClientInfo[] {
    const requestedClientIds = new Set((options.clientIds ?? []).map((clientId) => normalizeString(clientId)).filter(Boolean))
    const clientIds = new Set<string>()
    const scope = this.normalizeRequestScope(options)

    for (const clientId of this.snapshots.keys()) {
      clientIds.add(clientId)
    }
    for (const clientId of this.sessions.keys()) {
      clientIds.add(clientId)
    }
    if (options.includeMissing) {
      for (const clientId of requestedClientIds) {
        clientIds.add(clientId)
      }
    }

    return [...clientIds]
      .filter((clientId) => !requestedClientIds.size || requestedClientIds.has(clientId))
      .map((clientId) => this.toClientInfo(clientId, this.sessions.get(clientId), this.snapshots.get(clientId), scope))
      .filter((client): client is WechatTunnelClientInfo => Boolean(client))
      .sort((left, right) => {
        if (left.connected !== right.connected) {
          return left.connected ? -1 : 1
        }
        return this.clientActivityTime(right) - this.clientActivityTime(left)
      })
  }

  getStatus(
    clientId?: string | null,
    setup?: { clientName?: string | null; tenantId?: string | null; organizationId?: string | null }
  ): WechatTunnelStatus {
    const config = this.getConfig()
    const normalizedClientId = normalizeString(clientId)
    const scope = this.normalizeRequestScope(setup ?? {})
    const rawSession = normalizedClientId ? this.sessions.get(normalizedClientId) : undefined
    const rawSnapshot = normalizedClientId ? this.snapshots.get(normalizedClientId) : undefined
    const session = rawSession && this.sessionMatchesScope(rawSession, scope) ? rawSession : undefined
    const snapshot = rawSnapshot && this.snapshotMatchesScope(rawSnapshot, scope) ? rawSnapshot : undefined
    const anySession = session ?? [...this.sessions.values()].find((item) => this.sessionMatchesScope(item, scope))
    const source = session ?? snapshot
    const connected = Boolean(session && !session.transport.destroyed)
    const state: WechatTunnelStatus['state'] = connected ? 'connected' : 'disconnected'
    const bindings = this.cloneBindings(source?.bindings ?? anySession?.bindings ?? [])
    const effectiveClientId = normalizedClientId || source?.clientId || anySession?.clientId || null
    const effectiveClientName = setup?.clientName || source?.clientName || anySession?.clientName || null

    return {
      wsPath: config.wsPath,
      wsUrl: this.buildWebsocketUrl(effectiveClientId),
      state,
      instanceId: this.instanceId,
      clientId: effectiveClientId,
      clientName: effectiveClientName,
      direction: 'inbound',
      connected,
      remoteAddress: source?.remoteAddress ?? anySession?.remoteAddress ?? null,
      lastConnectedAt: this.toIso(source?.connectedAt ?? anySession?.connectedAt),
      lastDisconnectedAt: this.toIso(snapshot?.disconnectedAt),
      lastSeenAt: this.toIso(source?.lastSeenAt ?? anySession?.lastSeenAt),
      lastPingAt: this.toIso(source?.lastPingAt ?? anySession?.lastPingAt),
      lastSyncAt: this.toIso(source?.lastSyncAt ?? anySession?.lastSyncAt),
      lastError: source?.lastError ?? anySession?.lastError ?? null,
      bindingCount: bindings.length,
      bindings,
      setup: this.buildSetupConfig(effectiveClientId, effectiveClientName)
    }
  }

  buildSetupConfig(clientId?: string | null, clientName?: string | null): WechatTunnelSetupConfig {
    const normalizedClientId = normalizeString(clientId) || '<tunnelClientId>'
    const forwardServerInfo = {
      Url: DEFAULT_SIDECAR_LISTEN_HOST,
      TcpPort: DEFAULT_SIDECAR_LISTEN_PORT,
      HttpPort: DEFAULT_HTTP_PORT
    }
    const msgClientInfo = {
      Id: normalizedClientId,
      Name: normalizeString(clientName) || 'wechat'
    }
    const websocketUrl = this.buildWebsocketUrl(normalizedClientId) || '<wss://xpert-public-host/api/wechat/tunnel/ws/tunnelClientId>'
    const sidecarCommand =
      `node scripts/wechat-tunnel-sidecar.mjs --xpert-url "${websocketUrl}" --listen-host ${DEFAULT_SIDECAR_LISTEN_HOST} --listen-port ${DEFAULT_SIDECAR_LISTEN_PORT}`
    return {
      forwardServerInfo,
      msgClientInfo,
      settingJson: JSON.stringify(
        {
          ForwardServerInfo: forwardServerInfo,
          MsgClientInfo: msgClientInfo
        },
        null,
        2
      ),
      sidecar: {
        websocketUrl,
        listenHost: DEFAULT_SIDECAR_LISTEN_HOST,
        listenPort: DEFAULT_SIDECAR_LISTEN_PORT,
        command: sidecarCommand
      }
    }
  }

  attachTransport(transport: WechatTunnelTransport, options: { expectedClientId?: string } = {}): void {
    const session: TunnelSession = {
      transport,
      readBuffer: Buffer.alloc(0),
      expectedClientId: normalizeString(options.expectedClientId) || undefined,
      remoteAddress: transport.remoteAddress,
      connectedAt: new Date(),
      lastSeenAt: new Date(),
      bindings: [],
      pending: new Map()
    }

    transport.on('data', (chunk) => {
      try {
        session.readBuffer = Buffer.concat([session.readBuffer, chunk])
        const decoded = decodeWechatTunnelFrames(session.readBuffer)
        session.readBuffer = decoded.rest
        for (const message of decoded.messages) {
          this.handleMessage(session, message)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        session.lastError = message
        this.closeSession(session, message)
      }
    })
    transport.on('error', (error) => {
      session.lastError = error.message
      this.snapshotSession(session, error.message)
    })
    transport.on('close', () => {
      this.closeSession(session, session.lastError)
    })
  }

  private handleMessage(session: TunnelSession, message: WechatTunnelMessage): void {
    session.lastSeenAt = new Date()

    if (message.type === 'register') {
      this.handleRegister(session, message)
      return
    }

    if (!session.clientId) {
      this.writeMessage(session, {
        type: 'register_ack',
        ok: false,
        text: 'register required'
      })
      this.closeSession(session, 'message received before register')
      return
    }

    if (message.type === 'sync_bindings') {
      session.bindings = this.cloneBindings(message.bindings ?? [])
      session.lastSyncAt = new Date()
      this.snapshotSession(session)
      void this.syncManagedSession(session)
      return
    }

    if (message.type === 'pong') {
      session.lastPingAt = new Date()
      this.snapshotSession(session)
      void this.heartbeatManagedSession(session)
      return
    }

    if (message.type === 'http_response') {
      this.handleHttpResponse(session, message)
    }
  }

  private handleRegister(session: TunnelSession, message: WechatTunnelMessage): void {
    const clientId = normalizeString(message.id)
    if (!clientId) {
      this.writeMessage(session, {
        type: 'register_ack',
        ok: false,
        text: 'client id is required'
      })
      this.closeSession(session, 'empty client id')
      return
    }
    if (session.expectedClientId && session.expectedClientId !== clientId) {
      this.writeMessage(session, {
        type: 'register_ack',
        ok: false,
        text: 'client id does not match websocket path'
      })
      this.closeSession(session, `client id mismatch: expected ${session.expectedClientId}, got ${clientId}`)
      return
    }

    const existing = this.sessions.get(clientId)
    if (existing && existing !== session) {
      this.closeSession(existing, 'replaced by a new connection')
    }

    session.clientId = clientId
    session.clientName = normalizeString(message.name) || undefined
    session.connectedAt = new Date()
    session.lastSeenAt = new Date()
    this.sessions.set(clientId, session)
    this.snapshotSession(session)
    void this.registerManagedSession(session)
    this.writeMessage(session, {
      type: 'register_ack',
      ok: true,
      text: 'registered'
    })
    this.startHeartbeat(session)
  }

  private handleHttpResponse(session: TunnelSession, message: WechatTunnelMessage): void {
    const requestId = normalizeString(message.requestId)
    const pending = requestId ? session.pending.get(requestId) : undefined
    if (!pending) {
      return
    }

    clearTimeout(pending.timer)
    session.pending.delete(requestId)
    const status = typeof message.status === 'number' && Number.isFinite(message.status) ? message.status : 0
    const body = Buffer.from(normalizeString(message.body), 'base64')
    pending.resolve({
      status,
      headers: message.headers ?? {},
      body,
      text: body.toString('utf8')
    })
  }

  private startHeartbeat(session: TunnelSession): void {
    if (session.heartbeatTimer) {
      clearInterval(session.heartbeatTimer)
    }

    const config = this.getConfig()
    session.heartbeatTimer = setInterval(() => {
      if (session.transport.destroyed || !session.transport.writable) {
        this.closeSession(session, 'socket not writable')
        return
      }
      if (Date.now() - session.lastSeenAt.getTime() > config.clientTimeoutMs) {
        this.closeSession(session, 'client heartbeat timed out')
        return
      }
      try {
        this.writeMessage(session, { type: 'ping' })
      } catch (error) {
        this.closeSession(session, error instanceof Error ? error.message : String(error))
      }
    }, config.heartbeatIntervalMs)
  }

  private writeMessage(session: TunnelSession, message: WechatTunnelMessage): void {
    session.transport.write(encodeWechatTunnelMessage(message))
  }

  private closeSession(session: TunnelSession, reason?: string): void {
    if (session.heartbeatTimer) {
      clearInterval(session.heartbeatTimer)
      session.heartbeatTimer = undefined
    }
    if (reason) {
      session.lastError = reason
    }
    if (session.clientId && this.sessions.get(session.clientId) === session) {
      this.sessions.delete(session.clientId)
    }
    this.snapshotSession(session, reason, true)
    void this.markManagedSessionDisconnected(session, reason)
    for (const [requestId, pending] of session.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error(reason || `wechat reverse tunnel client "${session.clientId ?? 'unknown'}" disconnected`))
      session.pending.delete(requestId)
    }
    if (!session.transport.destroyed) {
      session.transport.destroy()
    }
  }

  private snapshotSession(session: TunnelSession, reason?: string, disconnected = false): void {
    const clientId = session.clientId
    if (!clientId) {
      return
    }
    this.snapshots.set(clientId, {
      clientId,
      clientName: session.clientName,
      remoteAddress: session.remoteAddress,
      connectedAt: session.connectedAt,
      disconnectedAt: disconnected ? new Date() : this.snapshots.get(clientId)?.disconnectedAt,
      lastSeenAt: session.lastSeenAt,
      lastPingAt: session.lastPingAt,
      lastSyncAt: session.lastSyncAt,
      lastError: reason ?? session.lastError,
      tenantId: session.tenantId ?? null,
      organizationId: session.organizationId ?? null,
      bindings: this.cloneBindings(session.bindings)
    })
  }

  private async handleManagedCommand(request: ManagedConnectionCommandRequest): Promise<unknown> {
    if (request.command === 'disconnect') {
      const reason = this.getPayloadString(request.payload, 'reason') || 'wechat reverse tunnel client disconnected by owner command'
      return {
        disconnected: this.disconnectClient(request.connectionKey, reason)
      }
    }

    if (request.command === 'http_request') {
      const response = await this.sendLocalHttpRequest(this.deserializeHttpRequestPayload(request.connectionKey, request.payload))
      return this.serializeHttpResponse(response)
    }

    throw new Error(`Unsupported WeChat tunnel command "${request.command}"`)
  }

  private async registerManagedSession(session: TunnelSession): Promise<void> {
    const registry = this.managedRegistry
    if (!session.clientId || !registry) {
      return
    }
    await registry.register({
      pluginName: WECHAT_PLUGIN_NAME,
      connectionType: WECHAT_TUNNEL_CONNECTION_TYPE,
      connectionKey: session.clientId,
      transportType: 'socket_io',
      direction: 'inbound',
      tenantId: session.tenantId,
      organizationId: session.organizationId,
      remoteAddress: session.remoteAddress,
      metadata: this.buildManagedMetadata(session),
      leaseTtlMs: this.getManagedLeaseTtlMs()
    }).catch(() => undefined)
  }

  private async heartbeatManagedSession(session: TunnelSession): Promise<void> {
    const registry = this.managedRegistry
    if (!session.clientId || !registry) {
      return
    }
    await registry.heartbeat({
      pluginName: WECHAT_PLUGIN_NAME,
      connectionType: WECHAT_TUNNEL_CONNECTION_TYPE,
      connectionKey: session.clientId,
      tenantId: session.tenantId,
      organizationId: session.organizationId,
      remoteAddress: session.remoteAddress,
      metadata: this.buildManagedMetadata(session),
      leaseTtlMs: this.getManagedLeaseTtlMs()
    }).catch(() => undefined)
  }

  private async syncManagedSession(session: TunnelSession): Promise<void> {
    const registry = this.managedRegistry
    if (!session.clientId || !registry) {
      return
    }
    await registry.syncMetadata({
      pluginName: WECHAT_PLUGIN_NAME,
      connectionType: WECHAT_TUNNEL_CONNECTION_TYPE,
      connectionKey: session.clientId,
      tenantId: session.tenantId,
      organizationId: session.organizationId,
      metadata: this.buildManagedMetadata(session),
      leaseTtlMs: this.getManagedLeaseTtlMs()
    }).catch(() => undefined)
  }

  private async markManagedSessionDisconnected(session: TunnelSession, reason?: string): Promise<void> {
    const registry = this.managedRegistry
    if (!session.clientId || !registry) {
      return
    }
    const current = this.sessions.get(session.clientId)
    if (current && current !== session) {
      return
    }
    await registry.markDisconnected(
      {
        pluginName: WECHAT_PLUGIN_NAME,
        connectionType: WECHAT_TUNNEL_CONNECTION_TYPE,
        connectionKey: session.clientId,
        tenantId: session.tenantId,
        organizationId: session.organizationId
      },
      reason
    ).catch(() => undefined)
  }

  private buildManagedMetadata(session: TunnelSession): Record<string, unknown> {
    const bindings = this.cloneBindings(session.bindings)
    return {
      clientName: session.clientName ?? null,
      localInstanceId: this.instanceId,
      connectedAt: this.toIso(session.connectedAt),
      lastSeenAt: this.toIso(session.lastSeenAt),
      lastPingAt: this.toIso(session.lastPingAt),
      lastSyncAt: this.toIso(session.lastSyncAt),
      bindingCount: bindings.length,
      bindings,
      tenantId: session.tenantId ?? null,
      organizationId: session.organizationId ?? null,
      lastError: session.lastError ?? null
    }
  }

  private managedRecordToClientInfo(record: ManagedConnectionRecord): WechatTunnelClientInfo | null {
    const clientId = normalizeString(record.connectionKey)
    if (!clientId) {
      return null
    }
    const metadata = this.objectPayload(record.metadata)
    const bindings = this.normalizeManagedBindings(metadata.bindings)
    const leaseExpiresAt = this.toDateTime(record.leaseExpiresAt)
    const connected = record.status === 'connected' && (!leaseExpiresAt || leaseExpiresAt > Date.now())
    return {
      clientId,
      clientName: this.stringValue(metadata.clientName) || clientId,
      direction: record.direction ?? 'inbound',
      state: connected ? 'connected' : 'disconnected',
      connected,
      instanceId: record.ownerInstanceId,
      remoteAddress: record.remoteAddress ?? null,
      connectedAt: this.toIsoValue(record.connectedAt ?? metadata.connectedAt),
      disconnectedAt: this.toIsoValue(record.disconnectedAt),
      lastSeenAt: this.toIsoValue(record.lastSeenAt ?? metadata.lastSeenAt),
      lastPingAt: this.toIsoValue(metadata.lastPingAt),
      lastSyncAt: this.toIsoValue(metadata.lastSyncAt),
      lastError: record.lastError ?? this.stringValue(metadata.lastError) ?? null,
      bindingCount: this.numberValue(metadata.bindingCount) ?? bindings.length,
      bindings
    }
  }

  private tunnelStatusToClientInfo(status: WechatTunnelStatus): WechatTunnelClientInfo | null {
    const clientId = normalizeString(status.clientId)
    if (!clientId) {
      return null
    }
    return {
      clientId,
      clientName: status.clientName ?? null,
      direction: status.direction ?? 'inbound',
      state: status.state,
      connected: status.connected,
      instanceId: status.instanceId,
      remoteAddress: status.remoteAddress ?? null,
      connectedAt: status.lastConnectedAt ?? null,
      disconnectedAt: status.lastDisconnectedAt ?? null,
      lastSeenAt: status.lastSeenAt ?? null,
      lastPingAt: status.lastPingAt ?? null,
      lastSyncAt: status.lastSyncAt ?? null,
      lastError: status.lastError ?? null,
      bindingCount: status.bindingCount,
      bindings: status.bindings
    }
  }

  private serializeHttpRequest(request: WechatTunnelHttpRequest): Record<string, unknown> {
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from(request.body ?? '', 'utf8')
    const result: Record<string, unknown> = {
      clientId: normalizeString(request.clientId),
      method: normalizeString(request.method).toUpperCase() || 'GET',
      path: this.normalizePath(request.path),
      headers: request.headers ?? {},
      body: body.toString('base64'),
      timeoutMs: request.timeoutMs
    }
    if (request.tenantId !== undefined) {
      result.tenantId = request.tenantId ?? null
    }
    if (request.organizationId !== undefined) {
      result.organizationId = request.organizationId ?? null
    }
    return result
  }

  private deserializeHttpRequestPayload(clientId: string, payload: unknown): WechatTunnelHttpRequest {
    const data = this.objectPayload(payload)
    return {
      clientId,
      method: this.stringValue(data.method) || 'GET',
      path: this.stringValue(data.path) || '/',
      headers: this.stringRecord(data.headers),
      body: Buffer.from(this.stringValue(data.body) || '', 'base64'),
      timeoutMs: this.numberValue(data.timeoutMs) ?? undefined,
      tenantId: this.stringValue(data.tenantId),
      organizationId: this.stringValue(data.organizationId)
    }
  }

  private serializeHttpResponse(response: WechatTunnelHttpResponse): Record<string, unknown> {
    return {
      status: response.status,
      headers: response.headers,
      body: response.body.toString('base64')
    }
  }

  private deserializeHttpResponse(payload: unknown): WechatTunnelHttpResponse {
    const data = this.objectPayload(payload)
    const status = this.numberValue(data.status) ?? 0
    const body = Buffer.from(this.stringValue(data.body) || '', 'base64')
    return {
      status,
      headers: this.stringRecord(data.headers),
      body,
      text: body.toString('utf8')
    }
  }

  private isDisconnectResult(result: unknown): boolean {
    const data = this.objectPayload(result)
    return data.disconnected === true
  }

  private getManagedLeaseTtlMs(): number {
    const config = this.getConfig()
    return Math.max(config.clientTimeoutMs + config.heartbeatIntervalMs, config.clientTimeoutMs * 2)
  }

  private normalizeManagedBindings(value: unknown): WechatTunnelBinding[] {
    if (!Array.isArray(value)) {
      return []
    }
    return this.cloneBindings(value as WechatTunnelBinding[])
  }

  private objectPayload(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  }

  private stringRecord(value: unknown): Record<string, string> {
    const source = this.objectPayload(value)
    const output: Record<string, string> = {}
    for (const [key, item] of Object.entries(source)) {
      if (typeof item === 'string') {
        output[key] = item
      }
    }
    return output
  }

  private getPayloadString(payload: unknown, key: string): string | null {
    return this.stringValue(this.objectPayload(payload)[key])
  }

  private stringValue(value: unknown): string | null {
    const normalized = normalizeString(value)
    return normalized || null
  }

  private normalizeRequestScope(value: { tenantId?: unknown; organizationId?: unknown }): {
    tenantId?: string | null
    organizationId?: string | null
  } {
    const scope: { tenantId?: string | null; organizationId?: string | null } = {}
    if (Object.prototype.hasOwnProperty.call(value, 'tenantId')) {
      scope.tenantId = this.stringValue(value.tenantId) ?? null
    }
    if (Object.prototype.hasOwnProperty.call(value, 'organizationId')) {
      scope.organizationId = this.stringValue(value.organizationId) ?? null
    }
    return scope
  }

  private hasExplicitScope(scope: { tenantId?: string | null; organizationId?: string | null }): boolean {
    return scope.tenantId !== undefined || scope.organizationId !== undefined
  }

  private sessionMatchesScope(
    session: Pick<TunnelSession, 'tenantId' | 'organizationId'>,
    scope: { tenantId?: string | null; organizationId?: string | null }
  ): boolean {
    if (!this.hasExplicitScope(scope)) {
      return true
    }
    if (scope.tenantId !== undefined && (session.tenantId ?? null) !== scope.tenantId) {
      return false
    }
    if (scope.organizationId !== undefined && (session.organizationId ?? null) !== scope.organizationId) {
      return false
    }
    return true
  }

  private snapshotMatchesScope(
    snapshot: Pick<TunnelClientSnapshot, 'tenantId' | 'organizationId'>,
    scope: { tenantId?: string | null; organizationId?: string | null }
  ): boolean {
    return this.sessionMatchesScope(snapshot, scope)
  }

  private numberValue(value: unknown): number | null {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? number : null
  }

  private toDateTime(value: unknown): number | null {
    if (value instanceof Date) {
      return value.getTime()
    }
    if (typeof value === 'string') {
      const time = Date.parse(value)
      return Number.isFinite(time) ? time : null
    }
    return null
  }

  private toIsoValue(value: unknown): string | null {
    if (value instanceof Date) {
      return value.toISOString()
    }
    if (typeof value === 'string') {
      const time = Date.parse(value)
      return Number.isFinite(time) ? new Date(time).toISOString() : value
    }
    return null
  }

  private normalizePath(path: string): string {
    const normalized = normalizeString(path)
    if (!normalized) {
      return '/'
    }
    return normalized.startsWith('/') ? normalized : `/${normalized}`
  }

  private cloneBindings(bindings: WechatTunnelBinding[]): WechatTunnelBinding[] {
    return (bindings ?? [])
      .map((binding) => ({
        uuid: normalizeString(binding?.uuid),
        wxid: normalizeString(binding?.wxid) || undefined
      }))
      .filter((binding) => Boolean(binding.uuid))
  }

  private getConnectedClientIds(): string[] {
    return [...this.sessions.entries()]
      .filter(([, session]) => !session.transport.destroyed && session.transport.writable)
      .map(([clientId]) => clientId)
  }

  private toClientInfo(
    clientId: string,
    session?: TunnelSession,
    snapshot?: TunnelClientSnapshot,
    scope: { tenantId?: string | null; organizationId?: string | null } = {}
  ): WechatTunnelClientInfo | null {
    const scopedSession = session && this.sessionMatchesScope(session, scope) ? session : undefined
    const scopedSnapshot = snapshot && this.snapshotMatchesScope(snapshot, scope) ? snapshot : undefined
    if (this.hasExplicitScope(scope) && !scopedSession && !scopedSnapshot) {
      return null
    }
    const connected = Boolean(scopedSession && !scopedSession.transport.destroyed && scopedSession.transport.writable)
    const source = scopedSession ?? scopedSnapshot
    const bindings = this.cloneBindings(source?.bindings ?? [])
    return {
      clientId,
      clientName: source?.clientName ?? null,
      direction: 'inbound',
      state: connected ? 'connected' : 'disconnected',
      connected,
      instanceId: this.instanceId,
      remoteAddress: source?.remoteAddress ?? null,
      connectedAt: this.toIso(source?.connectedAt),
      disconnectedAt: connected ? null : this.toIso(snapshot?.disconnectedAt),
      lastSeenAt: this.toIso(source?.lastSeenAt),
      lastPingAt: this.toIso(source?.lastPingAt),
      lastSyncAt: this.toIso(source?.lastSyncAt),
      lastError: source?.lastError ?? null,
      bindingCount: bindings.length,
      bindings
    }
  }

  private clientActivityTime(client: WechatTunnelClientInfo): number {
    const value = client.lastSeenAt || client.connectedAt || client.disconnectedAt || ''
    const time = Date.parse(value)
    return Number.isFinite(time) ? time : 0
  }

  private getConfig(): WechatTunnelConfig {
    const root = (((this.pluginContext as any)?.config ?? {}) as Record<string, unknown>) || {}
    const legacyTunnel = ((root.tunnel ?? {}) as Record<string, unknown>) || {}
    return {
      wsPath: this.normalizePath(
        normalizeString(root.tunnelWsPath ?? legacyTunnel.wsPath) || '/api/wechat/tunnel/ws'
      ),
      heartbeatIntervalMs: normalizeTimeoutMs(
        root.tunnelHeartbeatIntervalMs ?? legacyTunnel.heartbeatIntervalMs,
        DEFAULT_HEARTBEAT_INTERVAL_MS
      ),
      clientTimeoutMs: normalizeTimeoutMs(root.tunnelClientTimeoutMs ?? legacyTunnel.clientTimeoutMs, DEFAULT_CLIENT_TIMEOUT_MS)
    }
  }

  private buildWebsocketUrl(clientId?: string | null): string | null {
    const normalizedClientId = normalizeString(clientId)
    const raw = normalizeString(process.env.API_BASE_URL)
    if (!raw || !normalizedClientId) {
      return null
    }
    try {
      const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`)
      url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
      url.pathname = `${this.getConfig().wsPath.replace(/\/+$/, '')}/${encodeURIComponent(normalizedClientId)}`
      url.search = ''
      return url.toString()
    } catch {
      return null
    }
  }

  private toIso(value?: Date): string | null {
    return value instanceof Date ? value.toISOString() : null
  }
}
