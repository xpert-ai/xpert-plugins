import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import { IncomingMessage } from 'http'
import { Socket } from 'net'
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { normalizeString } from './types.js'
import {
  WechatPersonalTunnelBrokerService,
  WechatPersonalTunnelTransport
} from './wechat-personal-tunnel-broker.service.js'

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

@Injectable()
export class WechatPersonalWebsocketTunnelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WechatPersonalWebsocketTunnelService.name)
  private httpServer?: { on(event: 'upgrade', listener: UpgradeListener): void; off?(event: 'upgrade', listener: UpgradeListener): void; removeListener?(event: 'upgrade', listener: UpgradeListener): void }
  private readonly upgradeListener: UpgradeListener = (request, socket, head) => this.handleUpgrade(request, socket, head)

  constructor(
    private readonly broker: WechatPersonalTunnelBrokerService,
    private readonly httpAdapterHost: HttpAdapterHost
  ) {}

  onModuleInit(): void {
    const status = this.broker.getStatus()
    const adapter = this.httpAdapterHost.httpAdapter as any
    const httpServer = adapter?.getHttpServer?.()
    if (!httpServer?.on) {
      this.logger.warn('[wechat-personal-tunnel-ws] http server is unavailable; sidecar websocket tunnel disabled')
      return
    }

    this.httpServer = httpServer
    this.httpServer.on('upgrade', this.upgradeListener)
    this.logger.log(`[wechat-personal-tunnel-ws] listening for websocket upgrades at ${status.wsPath}/:clientId`)
  }

  onModuleDestroy(): void {
    if (!this.httpServer) {
      return
    }
    if (this.httpServer.off) {
      this.httpServer.off('upgrade', this.upgradeListener)
    } else {
      this.httpServer.removeListener?.('upgrade', this.upgradeListener)
    }
    this.httpServer = undefined
  }

  private handleUpgrade(request: IncomingMessage, socket: Socket, head: Buffer): void {
    const status = this.broker.getStatus()
    const match = this.matchPath(request.url, status.wsPath)
    if (!match) {
      return
    }

    const key = normalizeString(request.headers['sec-websocket-key'])
    const upgrade = normalizeString(request.headers.upgrade).toLowerCase()
    if (!key || upgrade !== 'websocket') {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    const accept = createHash('sha1').update(`${key}${WEBSOCKET_GUID}`).digest('base64')
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '\r\n'
      ].join('\r\n')
    )

    const transport = new WebSocketTunnelTransport(socket, head)
    this.broker.attachTransport(transport, {
      expectedClientId: match.clientId
    })
  }

  private matchPath(rawUrl: string | undefined, wsPath: string): { clientId: string } | null {
    if (!rawUrl) {
      return null
    }
    const url = new URL(rawUrl, 'http://localhost')
    const basePath = wsPath.replace(/\/+$/, '')
    if (!url.pathname.startsWith(`${basePath}/`)) {
      return null
    }
    const clientId = decodeURIComponent(url.pathname.slice(basePath.length + 1)).replace(/\/+$/, '')
    return clientId ? { clientId } : null
  }
}

type UpgradeListener = (request: IncomingMessage, socket: Socket, head: Buffer) => void

class WebSocketTunnelTransport extends EventEmitter implements WechatPersonalTunnelTransport {
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private closed = false
  private continuation: Buffer[] = []

  constructor(
    private readonly socket: Socket,
    head: Buffer
  ) {
    super()
    if (head.byteLength) {
      this.accept(head)
    }
    socket.on('data', (chunk) => this.accept(chunk))
    socket.on('error', (error) => this.emit('error', error))
    socket.on('close', () => {
      this.closed = true
      this.emit('close')
    })
  }

  get remoteAddress(): string {
    return `${this.socket.remoteAddress ?? 'unknown'}:${this.socket.remotePort ?? 0}`
  }

  get writable(): boolean {
    return this.socket.writable && !this.socket.destroyed && !this.closed
  }

  get destroyed(): boolean {
    return this.socket.destroyed || this.closed
  }

  write(data: Buffer): void {
    if (!this.writable) {
      return
    }
    this.socket.write(encodeWebSocketFrame(data, 0x2, false))
  }

  destroy(): void {
    if (!this.socket.destroyed) {
      this.socket.destroy()
    }
  }

  override on(event: 'data', listener: (chunk: Buffer) => void): this
  override on(event: 'error', listener: (error: Error) => void): this
  override on(event: 'close', listener: () => void): this
  override on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener)
  }

  private accept(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    try {
      while (this.buffer.byteLength >= 2) {
        const frame = decodeOneWebSocketFrame(this.buffer)
        if (!frame) {
          return
        }
        this.buffer = frame.rest
        this.handleFrame(frame)
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
      this.destroy()
    }
  }

  private handleFrame(frame: DecodedWebSocketFrame): void {
    if (frame.opcode === 0x8) {
      if (this.writable) {
        this.socket.write(encodeWebSocketFrame(Buffer.alloc(0), 0x8, false))
      }
      this.destroy()
      return
    }
    if (frame.opcode === 0x9) {
      this.socket.write(encodeWebSocketFrame(frame.payload, 0xa, false))
      return
    }
    if (frame.opcode === 0xa) {
      return
    }
    if (frame.opcode === 0x2 || frame.opcode === 0x1) {
      if (frame.fin) {
        this.emit('data', frame.payload)
      } else {
        this.continuation = [frame.payload]
      }
      return
    }
    if (frame.opcode === 0x0) {
      this.continuation.push(frame.payload)
      if (frame.fin) {
        this.emit('data', Buffer.concat(this.continuation))
        this.continuation = []
      }
    }
  }
}

type DecodedWebSocketFrame = {
  fin: boolean
  opcode: number
  payload: Buffer
  rest: Buffer
}

function decodeOneWebSocketFrame(buffer: Buffer): DecodedWebSocketFrame | null {
  const first = buffer[0]
  const second = buffer[1]
  const fin = Boolean(first & 0x80)
  const opcode = first & 0x0f
  const masked = Boolean(second & 0x80)
  let length = second & 0x7f
  let offset = 2

  if (length === 126) {
    if (buffer.byteLength < offset + 2) {
      return null
    }
    length = buffer.readUInt16BE(offset)
    offset += 2
  } else if (length === 127) {
    if (buffer.byteLength < offset + 8) {
      return null
    }
    const bigintLength = buffer.readBigUInt64BE(offset)
    if (bigintLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('websocket frame is too large')
    }
    length = Number(bigintLength)
    offset += 8
  }

  const maskOffset = offset
  if (masked) {
    offset += 4
  }
  if (buffer.byteLength < offset + length) {
    return null
  }

  const payload = Buffer.from(buffer.subarray(offset, offset + length))
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4)
    for (let index = 0; index < payload.byteLength; index += 1) {
      payload[index] ^= mask[index % 4]
    }
  }

  return {
    fin,
    opcode,
    payload,
    rest: buffer.subarray(offset + length)
  }
}

function encodeWebSocketFrame(payload: Buffer, opcode: number, masked: boolean): Buffer {
  const length = payload.byteLength
  const lengthBytes = length < 126 ? 0 : length <= 0xffff ? 2 : 8
  const maskBytes = masked ? 4 : 0
  const frame = Buffer.allocUnsafe(2 + lengthBytes + maskBytes + length)
  frame[0] = 0x80 | opcode
  let offset = 2
  if (length < 126) {
    frame[1] = (masked ? 0x80 : 0) | length
  } else if (length <= 0xffff) {
    frame[1] = (masked ? 0x80 : 0) | 126
    frame.writeUInt16BE(length, offset)
    offset += 2
  } else {
    frame[1] = (masked ? 0x80 : 0) | 127
    frame.writeBigUInt64BE(BigInt(length), offset)
    offset += 8
  }

  if (masked) {
    const mask = Buffer.from([0x12, 0x34, 0x56, 0x78])
    mask.copy(frame, offset)
    offset += 4
    for (let index = 0; index < payload.byteLength; index += 1) {
      frame[offset + index] = payload[index] ^ mask[index % 4]
    }
  } else {
    payload.copy(frame, offset)
  }

  return frame
}
