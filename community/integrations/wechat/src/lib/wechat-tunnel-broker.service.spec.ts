import { EventEmitter } from 'events'
import {
  decodeWechatTunnelFrames,
  encodeWechatTunnelMessage,
  WechatTunnelBrokerService,
  WechatTunnelMessage
} from './wechat-tunnel-broker.service.js'

class MemoryTunnelTransport extends EventEmitter {
  readonly remoteAddress = 'memory'
  writable = true
  destroyed = false
  writes: Buffer[] = []

  write(data: Buffer): void {
    this.writes.push(data)
  }

  destroy(): void {
    this.destroyed = true
    this.emit('close')
  }

  receive(data: Buffer): void {
    this.emit('data', data)
  }
}

function createService(overrides: Record<string, unknown> = {}) {
  return new WechatTunnelBrokerService({
    config: {
      tunnelHeartbeatIntervalMs: 10000,
      tunnelClientTimeoutMs: 10000,
      ...overrides
    }
  } as any)
}

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 1000
  while (Date.now() < deadline) {
    if (condition()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('condition not met')
}

function attachMemoryClient(service: WechatTunnelBrokerService, expectedClientId = 'client-1') {
  const transport = new MemoryTunnelTransport()
  service.attachTransport(transport as any, { expectedClientId })
  return transport
}

function readWrites(transport: MemoryTunnelTransport): WechatTunnelMessage[] {
  if (!transport.writes.length) {
    return []
  }
  return decodeWechatTunnelFrames(Buffer.concat(transport.writes)).messages
}

describe('WechatTunnelBrokerService', () => {
  let service: WechatTunnelBrokerService | null = null

  afterEach(async () => {
    await service?.onModuleDestroy()
    service = null
  })

  it('encodes and decodes wx2.0 length-prefixed JSON frames', () => {
    const frame = encodeWechatTunnelMessage({
      type: 'register',
      id: 'client-1',
      name: 'local'
    })
    const decoded = decodeWechatTunnelFrames(frame)

    expect(decoded.rest.byteLength).toBe(0)
    expect(decoded.messages).toEqual([
      expect.objectContaining({
        type: 'register',
        id: 'client-1',
        name: 'local'
      })
    ])
  })

  it('registers a tunnel client, syncs bindings, and forwards HTTP RPC responses', async () => {
    service = createService()
    const transport = attachMemoryClient(service)

    transport.receive(
      encodeWechatTunnelMessage({
        type: 'register',
        id: 'client-1',
        name: 'local wx'
      })
    )
    expect(readWrites(transport)[0]).toEqual(
      expect.objectContaining({
        type: 'register_ack',
        ok: true
      })
    )

    transport.receive(
      encodeWechatTunnelMessage({
        type: 'sync_bindings',
        bindings: [{ uuid: 'uuid-1', wxid: 'wxid_owner' }]
      })
    )
    await waitFor(() => service.getStatus('client-1').bindingCount === 1)

    const responsePromise = service.sendHttpRequest({
      clientId: 'client-1',
      method: 'POST',
      path: '/v1/message/sendtext',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: 'uuid-1' }),
      timeoutMs: 1000
    })
    const request = readWrites(transport)[1]
    expect(request).toEqual(
      expect.objectContaining({
        type: 'http_request',
        method: 'POST',
        path: '/v1/message/sendtext',
        body: Buffer.from(JSON.stringify({ uuid: 'uuid-1' })).toString('base64')
      })
    )

    transport.receive(
      encodeWechatTunnelMessage({
        type: 'http_response',
        requestId: request.requestId,
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify({ code: 0, data: { newmsgid: 'msg-1' } })).toString('base64')
      })
    )

    await expect(responsePromise).resolves.toEqual(
      expect.objectContaining({
        status: 200,
        text: JSON.stringify({ code: 0, data: { newmsgid: 'msg-1' } })
      })
    )
    expect(service.getStatus('client-1')).toEqual(
      expect.objectContaining({
        connected: true,
        clientId: 'client-1',
        clientName: 'local wx'
      })
    )
  })

  it('rejects registration without client id', async () => {
    service = createService()
    const transport = new MemoryTunnelTransport()
    service.attachTransport(transport as any)

    transport.receive(encodeWechatTunnelMessage({ type: 'register' }))

    expect(readWrites(transport)[0]).toEqual(
      expect.objectContaining({
        type: 'register_ack',
        ok: false
      })
    )
    expect(transport.destroyed).toBe(true)
  })

  it('times out pending HTTP RPC requests', async () => {
    service = createService()
    const transport = attachMemoryClient(service)

    transport.receive(encodeWechatTunnelMessage({ type: 'register', id: 'client-1' }))
    expect(readWrites(transport)[0]).toEqual(expect.objectContaining({ type: 'register_ack', ok: true }))

    const responsePromise = service.sendHttpRequest({
      clientId: 'client-1',
      method: 'POST',
      path: '/v1/message/sendtext',
      timeoutMs: 20
    })
    expect(readWrites(transport)[1]).toEqual(expect.objectContaining({ type: 'http_request' }))

    await expect(responsePromise).rejects.toThrow(/timed out/)
  })

  it('disconnects a registered tunnel client by id', async () => {
    service = createService()
    const transport = attachMemoryClient(service)

    transport.receive(encodeWechatTunnelMessage({ type: 'register', id: 'client-1' }))
    expect(service.getStatus('client-1').connected).toBe(true)

    expect(service.disconnectClient('client-1', 'config changed')).toBe(true)
    expect(transport.destroyed).toBe(true)
    expect(service.getStatus('client-1')).toEqual(
      expect.objectContaining({
        connected: false,
        clientId: 'client-1',
        lastError: 'config changed'
      })
    )
    expect(service.disconnectClient('missing-client')).toBe(false)
  })

  it('lists connected clients, disconnected snapshots, and configured placeholders', async () => {
    service = createService()
    const first = attachMemoryClient(service, 'client-list-1')
    const second = attachMemoryClient(service, 'client-list-2')

    first.receive(encodeWechatTunnelMessage({ type: 'register', id: 'client-list-1', name: 'first local wx' }))
    first.receive(
      encodeWechatTunnelMessage({
        type: 'sync_bindings',
        bindings: [{ uuid: 'uuid-1', wxid: 'wxid_owner_1' }]
      })
    )
    second.receive(encodeWechatTunnelMessage({ type: 'register', id: 'client-list-2', name: 'second local wx' }))

    expect(
      service.listClients({
        clientIds: ['client-list-1', 'client-list-2']
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientId: 'client-list-1',
          clientName: 'first local wx',
          connected: true,
          bindingCount: 1,
          bindings: [{ uuid: 'uuid-1', wxid: 'wxid_owner_1' }]
        }),
        expect.objectContaining({
          clientId: 'client-list-2',
          clientName: 'second local wx',
          connected: true,
          bindingCount: 0
        })
      ])
    )

    expect(service.disconnectClient('client-list-1', 'manual disconnect')).toBe(true)
    expect(
      service.listClients({
        clientIds: ['client-list-1']
      })
    ).toEqual([
      expect.objectContaining({
        clientId: 'client-list-1',
        connected: false,
        state: 'disconnected',
        lastError: 'manual disconnect',
        bindingCount: 1
      })
    ])

    expect(
      service.listClients({
        clientIds: ['client-missing'],
        includeMissing: true
      })
    ).toEqual([
      expect.objectContaining({
        clientId: 'client-missing',
        connected: false,
        state: 'disconnected',
        bindingCount: 0
      })
    ])
  })

  it('shares tunnel sessions across broker instances in the same process', async () => {
    service = createService()
    const sender = createService()
    const transport = attachMemoryClient(service)

    transport.receive(encodeWechatTunnelMessage({ type: 'register', id: 'client-1' }))
    expect(readWrites(transport)[0]).toEqual(expect.objectContaining({ type: 'register_ack', ok: true }))

    const responsePromise = sender.sendHttpRequest({
      clientId: 'client-1',
      method: 'POST',
      path: '/v1/message/sendtext',
      body: JSON.stringify({ uuid: 'uuid-1' }),
      timeoutMs: 1000
    })
    const request = readWrites(transport)[1]
    expect(request).toEqual(expect.objectContaining({ type: 'http_request' }))

    transport.receive(
      encodeWechatTunnelMessage({
        type: 'http_response',
        requestId: request.requestId,
        status: 200,
        body: Buffer.from(JSON.stringify({ code: 0 })).toString('base64')
      })
    )

    await expect(responsePromise).resolves.toEqual(
      expect.objectContaining({
        status: 200,
        text: JSON.stringify({ code: 0 })
      })
    )
  })

  it('rejects websocket bridge connections whose register id does not match the path client id', async () => {
    service = createService()
    const transport = new MemoryTunnelTransport()

    service.attachTransport(transport as any, { expectedClientId: 'client-expected' })
    transport.receive(encodeWechatTunnelMessage({ type: 'register', id: 'client-other' }))

    const ack = decodeWechatTunnelFrames(Buffer.concat(transport.writes)).messages[0]
    expect(ack).toEqual(
      expect.objectContaining({
        type: 'register_ack',
        ok: false
      })
    )
    expect(service.getStatus('client-other').connected).toBe(false)
  })
})
