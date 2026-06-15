import { randomUUID } from 'crypto'
import { Buffer } from 'buffer'
import { hostname } from 'os'
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common'
import { type PluginContext } from '@xpert-ai/plugin-sdk'
import { WECHAT_PERSONAL_PLUGIN_CONTEXT } from './tokens.js'
import { normalizeString, normalizeTimeoutMs } from './types.js'

const DEFAULT_SIDECAR_LISTEN_HOST = '127.0.0.1'
const DEFAULT_SIDECAR_LISTEN_PORT = 8088
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000
const DEFAULT_CLIENT_TIMEOUT_MS = 90000
const DEFAULT_HTTP_PORT = 8099
const MAX_FRAME_BYTES = 128 * 1024 * 1024

export type WechatPersonalTunnelMessageType =
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

export type WechatPersonalTunnelBinding = {
  uuid: string
  wxid?: string
}

export type WechatPersonalTunnelMessage = {
  type: WechatPersonalTunnelMessageType | string
  id?: string
  name?: string
  ok?: boolean
  text?: string
  bindings?: WechatPersonalTunnelBinding[]
  requestId?: string
  method?: string
  path?: string
  headers?: Record<string, string>
  body?: string
  status?: number
  opcode?: number
}

export type WechatPersonalTunnelConfig = {
  wsPath: string
  heartbeatIntervalMs: number
  clientTimeoutMs: number
}

export type WechatPersonalTunnelSetupConfig = {
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

export type WechatPersonalTunnelStatus = {
  wsPath: string
  wsUrl?: string | null
  state: 'connected' | 'disconnected'
  instanceId: string
  clientId?: string | null
  clientName?: string | null
  connected: boolean
  remoteAddress?: string | null
  lastConnectedAt?: string | null
  lastDisconnectedAt?: string | null
  lastSeenAt?: string | null
  lastPingAt?: string | null
  lastSyncAt?: string | null
  lastError?: string | null
  bindingCount: number
  bindings: WechatPersonalTunnelBinding[]
  setup?: WechatPersonalTunnelSetupConfig
}

export type WechatPersonalTunnelHttpRequest = {
  clientId: string
  method: string
  path: string
  headers?: Record<string, string>
  body?: string | Buffer
  timeoutMs?: number
}

export type WechatPersonalTunnelHttpResponse = {
  status: number
  headers: Record<string, string>
  body: Buffer
  text: string
}

type PendingRequest = {
  resolve: (response: WechatPersonalTunnelHttpResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type TunnelSession = {
  transport: WechatPersonalTunnelTransport
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
  bindings: WechatPersonalTunnelBinding[]
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
  bindings: WechatPersonalTunnelBinding[]
}

export type WechatPersonalTunnelTransport = {
  remoteAddress: string
  writable: boolean
  destroyed: boolean
  write(data: Buffer): void
  destroy(): void
  on(event: 'data', listener: (chunk: Buffer) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  on(event: 'close', listener: () => void): void
}

export function encodeWechatPersonalTunnelMessage(message: WechatPersonalTunnelMessage): Buffer {
  const payload = Buffer.from(JSON.stringify(message), 'utf8')
  if (payload.byteLength > MAX_FRAME_BYTES) {
    throw new Error(`Tunnel frame exceeds ${MAX_FRAME_BYTES} bytes`)
  }
  const frame = Buffer.allocUnsafe(4 + payload.byteLength)
  frame.writeUInt32BE(payload.byteLength, 0)
  payload.copy(frame, 4)
  return frame
}

export function decodeWechatPersonalTunnelFrames(buffer: Buffer): {
  messages: WechatPersonalTunnelMessage[]
  rest: Buffer
} {
  const messages: WechatPersonalTunnelMessage[] = []
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
    const parsed = JSON.parse(raw) as WechatPersonalTunnelMessage
    messages.push(parsed)
    offset += 4 + length
  }

  return {
    messages,
    rest: buffer.subarray(offset)
  }
}

@Injectable()
export class WechatPersonalTunnelBrokerService implements OnModuleDestroy {
  private static readonly processInstanceId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`
  private static readonly processSessions = new Map<string, TunnelSession>()
  private static readonly processSnapshots = new Map<string, TunnelClientSnapshot>()
  private readonly instanceId = WechatPersonalTunnelBrokerService.processInstanceId

  constructor(
    @Inject(WECHAT_PERSONAL_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get sessions(): Map<string, TunnelSession> {
    return WechatPersonalTunnelBrokerService.processSessions
  }

  private get snapshots(): Map<string, TunnelClientSnapshot> {
    return WechatPersonalTunnelBrokerService.processSnapshots
  }

  async onModuleDestroy(): Promise<void> {
    for (const session of [...this.sessions.values()]) {
      this.closeSession(session, 'broker shutting down')
    }
  }

  async sendHttpRequest(request: WechatPersonalTunnelHttpRequest): Promise<WechatPersonalTunnelHttpResponse> {
    const config = this.getConfig()
    const clientId = normalizeString(request.clientId)
    if (!clientId) {
      throw new Error('wechat reverse tunnel client id is required')
    }

    const session = this.sessions.get(clientId)
    if (!session || session.transport.destroyed || !session.transport.writable) {
      throw new Error(
        `wechat reverse tunnel client "${clientId}" is not connected on broker ${this.instanceId}; ` +
          `connected clients: ${this.getConnectedClientIds().join(', ') || 'none'}`
      )
    }

    const requestId = randomUUID()
    const timeoutMs = normalizeTimeoutMs(request.timeoutMs, config.clientTimeoutMs)
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from(request.body ?? '', 'utf8')

    return new Promise<WechatPersonalTunnelHttpResponse>((resolve, reject) => {
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

  getStatus(clientId?: string | null, setup?: { clientName?: string | null }): WechatPersonalTunnelStatus {
    const config = this.getConfig()
    const normalizedClientId = normalizeString(clientId)
    const session = normalizedClientId ? this.sessions.get(normalizedClientId) : undefined
    const snapshot = normalizedClientId ? this.snapshots.get(normalizedClientId) : undefined
    const anySession = session ?? [...this.sessions.values()][0]
    const source = session ?? snapshot
    const connected = Boolean(session && !session.transport.destroyed)
    const state: WechatPersonalTunnelStatus['state'] = connected ? 'connected' : 'disconnected'
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

  buildSetupConfig(clientId?: string | null, clientName?: string | null): WechatPersonalTunnelSetupConfig {
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
    const websocketUrl = this.buildWebsocketUrl(normalizedClientId) || '<wss://xpert-public-host/api/wechat-personal/tunnel/ws/tunnelClientId>'
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

  attachTransport(transport: WechatPersonalTunnelTransport, options: { expectedClientId?: string } = {}): void {
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
        const decoded = decodeWechatPersonalTunnelFrames(session.readBuffer)
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

  private handleMessage(session: TunnelSession, message: WechatPersonalTunnelMessage): void {
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
      return
    }

    if (message.type === 'pong') {
      session.lastPingAt = new Date()
      this.snapshotSession(session)
      return
    }

    if (message.type === 'http_response') {
      this.handleHttpResponse(session, message)
    }
  }

  private handleRegister(session: TunnelSession, message: WechatPersonalTunnelMessage): void {
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
    this.writeMessage(session, {
      type: 'register_ack',
      ok: true,
      text: 'registered'
    })
    this.startHeartbeat(session)
  }

  private handleHttpResponse(session: TunnelSession, message: WechatPersonalTunnelMessage): void {
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

  private writeMessage(session: TunnelSession, message: WechatPersonalTunnelMessage): void {
    session.transport.write(encodeWechatPersonalTunnelMessage(message))
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
      bindings: this.cloneBindings(session.bindings)
    })
  }

  private normalizePath(path: string): string {
    const normalized = normalizeString(path)
    if (!normalized) {
      return '/'
    }
    return normalized.startsWith('/') ? normalized : `/${normalized}`
  }

  private cloneBindings(bindings: WechatPersonalTunnelBinding[]): WechatPersonalTunnelBinding[] {
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

  private getConfig(): WechatPersonalTunnelConfig {
    const root = (((this.pluginContext as any)?.config ?? {}) as Record<string, unknown>) || {}
    const legacyTunnel = ((root.tunnel ?? {}) as Record<string, unknown>) || {}
    return {
      wsPath: this.normalizePath(
        normalizeString(root.tunnelWsPath ?? legacyTunnel.wsPath) || '/api/wechat-personal/tunnel/ws'
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
