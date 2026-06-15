#!/usr/bin/env node

import { randomBytes, createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import tls from 'node:tls'
import process from 'node:process'

const DEFAULT_LISTEN_HOST = '127.0.0.1'
const DEFAULT_LISTEN_PORT = 8088
const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function printUsage() {
  console.log(`Wechat tunnel sidecar.

Usage:
  node scripts/wechat-tunnel-sidecar.mjs --xpert-url wss://xpert.example.com/api/wechat-personal/tunnel/ws/<clientId>
  node scripts/wechat-tunnel-sidecar.mjs --api-url https://xpert.example.com --client-id <clientId>

Options:
  --xpert-url <url>       Full ws/wss tunnel URL.
  --api-url <url>         Xpert API origin. Used with --client-id.
  --client-id <id>        Tunnel client id. Used with --api-url.
  --listen-host <host>    Local raw TCP listen host. Default: ${DEFAULT_LISTEN_HOST}
  --listen-port <port>    Local raw TCP listen port. Default: ${DEFAULT_LISTEN_PORT}
  --header <k:v>          Extra websocket handshake header. Repeatable.
  --verbose               Print tunnel frame summaries for troubleshooting.
  --help                  Show help.

Environment:
  XPERT_WECHAT_TUNNEL_URL
  XPERT_API_URL
  XPERT_WECHAT_TUNNEL_CLIENT_ID
  XPERT_WECHAT_SIDECAR_LISTEN_HOST
  XPERT_WECHAT_SIDECAR_LISTEN_PORT
  XPERT_WECHAT_SIDECAR_VERBOSE
`)
}

function parseArgs(argv) {
  const args = { headers: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') {
      args.help = true
      continue
    }
    if (token === '--verbose') {
      args.verbose = true
      continue
    }
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`)
    }
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`)
    }
    index += 1
    if (key === 'header') {
      args.headers.push(value)
    } else {
      args[key] = value
    }
  }
  return args
}

function resolveTunnelUrl(args) {
  const explicit = args.xpertUrl || process.env.XPERT_WECHAT_TUNNEL_URL
  if (explicit) {
    return normalizeWsUrl(explicit)
  }
  const apiUrl = args.apiUrl || process.env.XPERT_API_URL
  const clientId = args.clientId || process.env.XPERT_WECHAT_TUNNEL_CLIENT_ID
  if (!apiUrl || !clientId) {
    throw new Error('Missing --xpert-url or both --api-url and --client-id.')
  }
  const url = new URL(apiUrl.includes('://') ? apiUrl : `https://${apiUrl}`)
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
  url.pathname = `/api/wechat-personal/tunnel/ws/${encodeURIComponent(clientId)}`
  url.search = ''
  return url
}

function normalizeWsUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
  }
  return url
}

function parseHeaders(values) {
  const headers = {}
  for (const value of values || []) {
    const index = value.indexOf(':')
    if (index <= 0) {
      throw new Error(`Invalid --header value: ${value}`)
    }
    headers[value.slice(0, index).trim()] = value.slice(index + 1).trim()
  }
  return headers
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  const tunnelUrl = resolveTunnelUrl(args)
  const listenHost = args.listenHost || process.env.XPERT_WECHAT_SIDECAR_LISTEN_HOST || DEFAULT_LISTEN_HOST
  const listenPort = Number(args.listenPort || process.env.XPERT_WECHAT_SIDECAR_LISTEN_PORT || DEFAULT_LISTEN_PORT)
  if (!Number.isInteger(listenPort) || listenPort <= 0 || listenPort > 65535) {
    throw new Error(`Invalid listen port: ${listenPort}`)
  }
  const extraHeaders = parseHeaders(args.headers)
  const verbose = args.verbose === true || parseBoolean(process.env.XPERT_WECHAT_SIDECAR_VERBOSE)
  const localSockets = new Set()
  const remoteSockets = new Set()

  const server = net.createServer((localSocket) => {
    localSockets.add(localSocket)
    const localAddress = `${localSocket.remoteAddress || 'unknown'}:${localSocket.remotePort || 0}`
    console.log(`[wechat-sidecar] local connection ${localAddress}`)
    localSocket.pause()
    connectWebSocket(tunnelUrl, extraHeaders)
      .then((remote) => {
        remoteSockets.add(remote)
        console.log(`[wechat-sidecar] websocket connected ${tunnelUrl.toString()}`)
        localSocket.resume()
        localSocket.on('data', (chunk) => {
          logTunnelFrames('wx2.0 -> xpert', chunk, verbose)
          remote.send(chunk)
        })
        localSocket.on('error', (error) => {
          console.warn(`[wechat-sidecar] local socket error: ${error.message}`)
          remote.close()
        })
        localSocket.on('close', () => {
          localSockets.delete(localSocket)
          remote.close()
        })
        remote.on('data', (chunk) => localSocket.write(chunk))
        remote.on('error', (error) => {
          console.warn(`[wechat-sidecar] websocket error: ${error.message}`)
          localSocket.destroy()
        })
        remote.on('close', () => {
          console.log(`[wechat-sidecar] websocket closed ${tunnelUrl.toString()}`)
          remoteSockets.delete(remote)
          localSocket.destroy()
        })
        remote.on('data', (chunk) => logTunnelFrames('xpert -> wx2.0', chunk, verbose))
      })
      .catch((error) => {
        console.error(`[wechat-sidecar] websocket connect failed: ${error.message}`)
        localSockets.delete(localSocket)
        localSocket.destroy()
      })
  })

  server.listen(listenPort, listenHost, () => {
    console.log(`[wechat-sidecar] listening raw TCP on ${listenHost}:${listenPort}`)
    console.log(`[wechat-sidecar] forwarding to ${tunnelUrl.toString()}`)
  })

  let shuttingDown = false
  const shutdown = (signal) => {
    if (shuttingDown) {
      process.exit(0)
    }
    shuttingDown = true
    console.log(`[wechat-sidecar] received ${signal}; shutting down`)
    for (const remote of remoteSockets) {
      remote.close()
    }
    for (const localSocket of localSockets) {
      localSocket.destroy()
    }
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

function parseBoolean(value) {
  if (typeof value !== 'string') {
    return false
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function logTunnelFrames(direction, chunk, verbose) {
  if (!verbose) {
    return
  }
  const summaries = summarizeTunnelFrames(chunk)
  if (!summaries.length) {
    console.log(`[wechat-sidecar] ${direction} ${chunk.byteLength} bytes`)
    return
  }
  console.log(`[wechat-sidecar] ${direction} ${chunk.byteLength} bytes ${summaries.join(', ')}`)
}

function summarizeTunnelFrames(chunk) {
  const summaries = []
  let offset = 0
  while (chunk.byteLength - offset >= 4) {
    const length = chunk.readUInt32BE(offset)
    if (length > 128 * 1024 * 1024 || chunk.byteLength - offset - 4 < length) {
      break
    }
    const raw = chunk.subarray(offset + 4, offset + 4 + length).toString('utf8')
    try {
      const message = JSON.parse(raw)
      const parts = [String(message.type || 'unknown')]
      if (message.id) {
        parts.push(`id=${message.id}`)
      }
      if (message.requestId) {
        parts.push(`requestId=${message.requestId}`)
      }
      if (typeof message.status === 'number') {
        parts.push(`status=${message.status}`)
      }
      summaries.push(parts.join(' '))
    } catch {
      summaries.push(`json:${length}`)
    }
    offset += 4 + length
  }
  return summaries
}

function connectWebSocket(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString('base64')
    const port = Number(url.port || (url.protocol === 'wss:' ? 443 : 80))
    const socket = url.protocol === 'wss:'
      ? tls.connect({ host: url.hostname, port, servername: url.hostname })
      : net.connect({ host: url.hostname, port })
    let handshakeBuffer = Buffer.alloc(0)
    let done = false

    const fail = (error) => {
      if (done) {
        return
      }
      done = true
      socket.destroy()
      reject(error)
    }

    socket.once('error', fail)
    socket.once('connect', () => {
      const path = `${url.pathname || '/'}${url.search || ''}`
      const headers = {
        Host: url.host,
        Upgrade: 'websocket',
        Connection: 'Upgrade',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
        ...extraHeaders
      }
      const request = [
        `GET ${path} HTTP/1.1`,
        ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
        '\r\n'
      ].join('\r\n')
      socket.write(request)
    })
    socket.on('data', function onHandshakeData(chunk) {
      handshakeBuffer = Buffer.concat([handshakeBuffer, chunk])
      const headerEnd = handshakeBuffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) {
        return
      }
      socket.off('data', onHandshakeData)
      const headerText = handshakeBuffer.subarray(0, headerEnd).toString('utf8')
      const rest = handshakeBuffer.subarray(headerEnd + 4)
      const lines = headerText.split(/\r\n/)
      if (!/^HTTP\/1\.[01] 101\b/.test(lines[0] || '')) {
        fail(new Error(`unexpected websocket response: ${lines[0] || 'empty response'}`))
        return
      }
      const headers = parseHttpResponseHeaders(lines.slice(1))
      const expectedAccept = createHash('sha1').update(`${key}${WEBSOCKET_GUID}`).digest('base64')
      if ((headers['sec-websocket-accept'] || '') !== expectedAccept) {
        fail(new Error('invalid websocket accept header'))
        return
      }
      done = true
      const remote = new WebSocketRawClient(socket)
      if (rest.byteLength) {
        remote.accept(rest)
      }
      resolve(remote)
    })
  })
}

function parseHttpResponseHeaders(lines) {
  const headers = {}
  for (const line of lines) {
    const index = line.indexOf(':')
    if (index > 0) {
      headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim()
    }
  }
  return headers
}

class WebSocketRawClient extends EventEmitter {
  buffer = Buffer.alloc(0)
  closed = false

  constructor(socket) {
    super()
    this.socket = socket
    socket.on('data', (chunk) => this.accept(chunk))
    socket.on('error', (error) => this.emit('error', error))
    socket.on('close', () => {
      this.closed = true
      this.emit('close')
    })
  }

  send(chunk) {
    if (!this.closed && !this.socket.destroyed) {
      this.socket.write(encodeWebSocketFrame(chunk, 0x2, true))
    }
  }

  close() {
    if (!this.closed && !this.socket.destroyed) {
      this.socket.write(encodeWebSocketFrame(Buffer.alloc(0), 0x8, true))
      this.socket.destroy()
    }
  }

  accept(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.byteLength >= 2) {
      const frame = decodeOneWebSocketFrame(this.buffer)
      if (!frame) {
        return
      }
      this.buffer = frame.rest
      if (frame.opcode === 0x8) {
        this.close()
        return
      }
      if (frame.opcode === 0x9) {
        this.socket.write(encodeWebSocketFrame(frame.payload, 0xa, true))
        continue
      }
      if (frame.opcode === 0x2 || frame.opcode === 0x1 || frame.opcode === 0x0) {
        this.emit('data', frame.payload)
      }
    }
  }
}

function decodeOneWebSocketFrame(buffer) {
  const first = buffer[0]
  const second = buffer[1]
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
    opcode,
    payload,
    rest: buffer.subarray(offset + length)
  }
}

function encodeWebSocketFrame(payload, opcode, masked) {
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
    const mask = randomBytes(4)
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

main().catch((error) => {
  console.error(`[wechat-sidecar] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
