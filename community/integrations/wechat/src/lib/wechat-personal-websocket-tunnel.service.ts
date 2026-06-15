import { Buffer } from 'buffer'
import { EventEmitter } from 'events'
import { Logger } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway
} from '@nestjs/websockets'
import { Socket } from 'socket.io'
import { normalizeString } from './types.js'
import {
  WechatPersonalTunnelBrokerService,
  WechatPersonalTunnelTransport
} from './wechat-personal-tunnel-broker.service.js'

const WECHAT_PERSONAL_TUNNEL_NAMESPACE = /^\/api\/wechat-personal\/tunnel\/ws\/[^/]+$/
const WECHAT_PERSONAL_TUNNEL_NAMESPACE_PREFIX = '/api/wechat-personal/tunnel/ws/'

@WebSocketGateway({
  namespace: WECHAT_PERSONAL_TUNNEL_NAMESPACE,
  cors: {
    origin: '*'
  },
  transports: ['websocket']
})
export class WechatPersonalWebsocketTunnelService implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WechatPersonalWebsocketTunnelService.name)
  private readonly transports = new WeakMap<Socket, SocketIoTunnelTransport>()

  constructor(private readonly broker: WechatPersonalTunnelBrokerService) {}

  handleConnection(client: Socket): void {
    const expectedClientId = this.extractClientId(client)
    const transport = new SocketIoTunnelTransport(client)
    this.transports.set(client, transport)
    this.broker.attachTransport(transport, { expectedClientId })
    this.logger.log(
      `[wechat-personal-tunnel-ws] socket.io connected ${transport.remoteAddress} clientId=${expectedClientId || '<register>'}`
    )
  }

  handleDisconnect(client: Socket): void {
    const transport = this.transports.get(client)
    transport?.closeFromGateway()
  }

  @SubscribeMessage('tunnel')
  handleTunnelFrame(@MessageBody() data: unknown, @ConnectedSocket() client: Socket): void {
    const transport = this.transports.get(client)
    if (!transport) {
      return
    }
    const chunk = this.toBuffer(data)
    if (!chunk.byteLength) {
      return
    }
    transport.accept(chunk)
  }

  private extractClientId(client: Socket): string | undefined {
    const namespaceName = normalizeString(client.nsp?.name)
    if (namespaceName.startsWith(WECHAT_PERSONAL_TUNNEL_NAMESPACE_PREFIX)) {
      return decodeURIComponent(namespaceName.slice(WECHAT_PERSONAL_TUNNEL_NAMESPACE_PREFIX.length))
    }

    const query = client.handshake?.query ?? {}
    const auth = (client.handshake?.auth ?? {}) as Record<string, unknown>
    return normalizeString(query.clientId ?? auth.clientId) || undefined
  }

  private toBuffer(data: unknown): Buffer {
    if (Buffer.isBuffer(data)) {
      return data
    }
    if (data instanceof ArrayBuffer) {
      return Buffer.from(data)
    }
    if (ArrayBuffer.isView(data)) {
      return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    }
    if (typeof data === 'string') {
      return Buffer.from(data, 'base64')
    }
    return Buffer.alloc(0)
  }
}

class SocketIoTunnelTransport extends EventEmitter implements WechatPersonalTunnelTransport {
  private closed = false

  constructor(private readonly socket: Socket) {
    super()
  }

  get remoteAddress(): string {
    return normalizeString(this.socket.handshake?.address) || this.socket.conn?.remoteAddress || this.socket.id
  }

  get writable(): boolean {
    return this.socket.connected && !this.closed
  }

  get destroyed(): boolean {
    return this.closed || !this.socket.connected
  }

  write(data: Buffer): void {
    if (!this.writable) {
      return
    }
    this.socket.emit('tunnel', data)
  }

  destroy(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.socket.disconnect(true)
  }

  accept(data: Buffer): void {
    if (this.closed) {
      return
    }
    this.emit('data', data)
  }

  closeFromGateway(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.emit('close')
  }

  override on(event: 'data', listener: (chunk: Buffer) => void): this
  override on(event: 'error', listener: (error: Error) => void): this
  override on(event: 'close', listener: () => void): this
  override on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener)
  }
}
