#!/usr/bin/env node

import { EventEmitter } from 'node:events'
import net from 'node:net'
import process from 'node:process'
import { io } from 'socket.io-client'

const DEFAULT_LISTEN_HOST = '127.0.0.1'
const DEFAULT_LISTEN_PORT = 8088

function printUsage() {
  console.log(`Wechat tunnel sidecar.

Usage:
  node scripts/wechat-tunnel-sidecar.mjs --xpert-url wss://xpert.example.com/api/wechat/tunnel/ws/<clientId>
  node scripts/wechat-tunnel-sidecar.mjs --api-url https://xpert.example.com --client-id <clientId>

Options:
  --xpert-url <url>       Full ws/wss tunnel URL.
  --api-url <url>         Xpert API origin. Used with --client-id.
  --client-id <id>        Tunnel client id. Used with --api-url.
  --listen-host <host>    Local raw TCP listen host. Default: ${DEFAULT_LISTEN_HOST}
  --listen-port <port>    Local raw TCP listen port. Default: ${DEFAULT_LISTEN_PORT}
  --header <k:v>          Extra websocket handshake header. Repeatable.
  --verbose               Print tunnel frame summaries for troubleshooting.
  --no-startup-probe      Skip the initial Xpert websocket connectivity check.
  --help                  Show help.

Environment:
  XPERT_WECHAT_TUNNEL_URL
  XPERT_API_URL
  XPERT_WECHAT_TUNNEL_CLIENT_ID
  XPERT_WECHAT_SIDECAR_LISTEN_HOST
  XPERT_WECHAT_SIDECAR_LISTEN_PORT
  XPERT_WECHAT_SIDECAR_VERBOSE
  XPERT_WECHAT_SIDECAR_NO_STARTUP_PROBE
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
    if (token === '--no-startup-probe') {
      args.noStartupProbe = true
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
  url.pathname = `/api/wechat/tunnel/ws/${encodeURIComponent(clientId)}`
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
  const startupProbe =
    args.noStartupProbe !== true &&
    !parseBoolean(process.env.XPERT_WECHAT_SIDECAR_NO_STARTUP_PROBE)
  const localSockets = new Set()
  const remoteSockets = new Set()

  const server = net.createServer((localSocket) => {
    localSockets.add(localSocket)
    const localAddress = `${localSocket.remoteAddress || 'unknown'}:${localSocket.remotePort || 0}`
    console.log(`[wechat-sidecar] local connection ${localAddress}`)
    localSocket.pause()
    connectSocketIo(tunnelUrl, extraHeaders)
      .then((remote) => {
        remoteSockets.add(remote)
        console.log(`[wechat-sidecar] socket.io connected ${tunnelUrl.toString()}`)
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
    if (startupProbe) {
      probeTunnelEndpoint(tunnelUrl, extraHeaders, server)
    }
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

function probeTunnelEndpoint(tunnelUrl, extraHeaders, server) {
  connectSocketIo(tunnelUrl, extraHeaders)
    .then((remote) => {
      console.log(`[wechat-sidecar] websocket reachable ${tunnelUrl.toString()}`)
      remote.close()
    })
    .catch((error) => {
      console.error(`[wechat-sidecar] startup websocket probe failed: ${error.message}`)
      server.close(() => process.exit(1))
      setTimeout(() => process.exit(1), 1000).unref()
    })
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

function connectSocketIo(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const socketUrl = normalizeSocketIoUrl(url)
    const clientId = extractClientIdFromTunnelUrl(url)
    const socket = io(socketUrl.toString(), {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 15000,
      extraHeaders,
      auth: clientId ? { clientId } : undefined,
      query: clientId ? { clientId } : undefined
    })
    let done = false

    const fail = (error) => {
      if (done) {
        return
      }
      done = true
      socket.disconnect()
      reject(error)
    }

    socket.once('connect_error', fail)
    socket.once('connect', () => {
      if (done) {
        return
      }
      done = true
      socket.off('connect_error', fail)
      resolve(new SocketIoTunnelClient(socket))
    })
  })
}

function normalizeSocketIoUrl(url) {
  const normalized = new URL(url.toString())
  if (normalized.protocol === 'ws:') {
    normalized.protocol = 'http:'
  } else if (normalized.protocol === 'wss:') {
    normalized.protocol = 'https:'
  }
  return normalized
}

function extractClientIdFromTunnelUrl(url) {
  const parts = (url.pathname || '').split('/').filter(Boolean)
  const clientId = parts.at(-1)
  if (!clientId || clientId === 'ws') {
    return ''
  }
  return decodeURIComponent(clientId)
}

class SocketIoTunnelClient extends EventEmitter {
  closed = false

  constructor(socket) {
    super()
    this.socket = socket
    socket.on('tunnel', (chunk) => this.emit('data', toBuffer(chunk)))
    socket.on('connect_error', (error) => this.emit('error', error))
    socket.on('disconnect', (reason) => {
      this.closed = true
      if (reason && reason !== 'io client disconnect') {
        this.emit('error', new Error(reason))
      }
      this.emit('close')
    })
  }

  send(chunk) {
    if (!this.closed && this.socket.connected) {
      this.socket.emit('tunnel', chunk)
    }
  }

  close() {
    if (!this.closed) {
      this.closed = true
      this.socket.disconnect()
    }
  }
}

function toBuffer(data) {
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

main().catch((error) => {
  console.error(`[wechat-sidecar] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
