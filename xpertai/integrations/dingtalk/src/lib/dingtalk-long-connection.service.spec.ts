import axios from 'axios'

jest.mock('@xpert-ai/contracts', () => ({}))

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn()
  }
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
  RequestContext: {
    currentUser: jest.fn(() => null)
  },
  runWithRequestContext: jest.fn()
}))

jest.mock('./conversation.service.js', () => ({
  DingTalkConversationService: class DingTalkConversationService {}
}))

jest.mock('./dingtalk-channel.strategy.js', () => ({
  DingTalkChannelStrategy: class DingTalkChannelStrategy {}
}))

import { DingTalkLongConnectionService } from './dingtalk-long-connection.service.js'
import { INTEGRATION_DINGTALK_LONG } from './types.js'

describe('DingTalkLongConnectionService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>

  function createRedisMock(initialMembers: string[] = [], initialHashes: Record<string, Record<string, string>> = {}) {
    const sets = new Map<string, Set<string>>()
    const hashes = new Map<string, Record<string, string>>(
      Object.entries(initialHashes).map(([key, value]) => [key, { ...value }])
    )
    if (initialMembers.length) {
      sets.set('dingtalk:stream:registry', new Set(initialMembers))
    }

    return {
      sadd: jest.fn(async (key: string, ...members: string[]) => {
        const current = sets.get(key) ?? new Set<string>()
        members.forEach((member) => current.add(member))
        sets.set(key, current)
        return current.size
      }),
      srem: jest.fn(async (key: string, ...members: string[]) => {
        const current = sets.get(key) ?? new Set<string>()
        members.forEach((member) => current.delete(member))
        sets.set(key, current)
        return 1
      }),
      smembers: jest.fn(async (key: string) => [...(sets.get(key) ?? new Set<string>())]),
      hset: jest.fn(async (key: string, ...entries: string[]) => {
        const current = hashes.get(key) ?? {}
        for (let index = 0; index < entries.length; index += 2) {
          current[entries[index]] = entries[index + 1]
        }
        hashes.set(key, current)
        return Object.keys(current).length
      }),
      hgetall: jest.fn(async (key: string) => hashes.get(key) ?? {}),
      expire: jest.fn(async () => 1),
      del: jest.fn(async (key: string) => {
        sets.delete(key)
        hashes.delete(key)
        return 1
      })
    }
  }

  const createSocket = (readyState = 1) => {
    const socket = {
      readyState,
      on: jest.fn(),
      off: jest.fn(),
      send: jest.fn(),
      close: jest.fn(function (this: { readyState: number }) {
        this.readyState = 3
      }),
      terminate: jest.fn(function (this: { readyState: number }) {
        this.readyState = 3
      }),
      removeAllListeners: jest.fn()
    }
    return socket
  }

  afterEach(() => {
    jest.clearAllMocks()
    const service = new DingTalkLongConnectionService({} as any, {} as any, {} as any)
    ;(service as any).socketRegistry.clear()
  })

  it('registers robot and card Stream subscriptions as callbacks', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        endpoint: 'wss://stream.dingtalk.example/connect',
        ticket: 'stream-ticket'
      }
    } as any)

    const service = new DingTalkLongConnectionService({} as any, {} as any, {} as any)
    const connectUrl = await (service as any).getConnectUrl('client-id', 'client-secret')

    expect(connectUrl).toBe('wss://stream.dingtalk.example/connect?ticket=stream-ticket')
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.dingtalk.com/v1.0/gateway/connections/open',
      expect.objectContaining({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        subscriptions: [
          {
            type: 'CALLBACK',
            topic: '/v1.0/im/bot/messages/get'
          },
          {
            type: 'CALLBACK',
            topic: '/v1.0/card/instances/callback'
          }
        ]
      }),
      expect.objectContaining({
        headers: {
          Accept: 'application/json'
        },
        timeout: 10_000
      })
    )
  })

  it('preserves permission service context when bootstrapping Stream integrations', async () => {
    const integrationPermissionService = {
      moduleRef: {},
      findAll: jest.fn(function (this: { moduleRef?: unknown }, { where }: { where: { provider: string } }) {
        if (!this.moduleRef) {
          throw new Error('lost permission service context')
        }
        return Promise.resolve({
          items:
            where.provider === INTEGRATION_DINGTALK_LONG
              ? [
                  {
                    id: 'integration-long',
                    provider: INTEGRATION_DINGTALK_LONG,
                    options: {
                      clientId: 'client-id',
                      clientSecret: 'client-secret'
                    }
                  }
                ]
              : []
        })
      }),
      read: jest.fn()
    }
    const pluginContext = {
      resolve: jest.fn((token: unknown) => {
        if (token === 'INTEGRATION_PERMISSION_SERVICE_TOKEN') {
          return integrationPermissionService
        }
        throw new Error(`Unexpected token: ${String(token)}`)
      })
    }
    const service = new DingTalkLongConnectionService(pluginContext as any, {} as any, {} as any)
    jest.spyOn(service, 'connect').mockResolvedValue({
      integrationId: 'integration-long',
      connectionMode: 'long_connection',
      connected: true,
      state: 'connected',
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastError: null,
      reconnectAttempts: 0,
      lastCallbackAt: null
    })

    await service.onModuleInit()

    expect(integrationPermissionService.findAll).toHaveBeenCalledWith({
      where: {
        provider: INTEGRATION_DINGTALK_LONG
      },
      relations: ['tenant']
    })
    expect(service.connect).toHaveBeenCalledWith('integration-long')
  })

  it('does not block module initialization while restoring Stream sessions', async () => {
    const integrationPermissionService = {
      moduleRef: {},
      findAll: jest.fn(function (this: { moduleRef?: unknown }, { where }: { where: { provider: string } }) {
        if (!this.moduleRef) {
          throw new Error('lost permission service context')
        }
        return Promise.resolve({
          items:
            where.provider === INTEGRATION_DINGTALK_LONG
              ? [
                  {
                    id: 'integration-long',
                    provider: INTEGRATION_DINGTALK_LONG,
                    options: {
                      clientId: 'client-id',
                      clientSecret: 'client-secret'
                    }
                  }
                ]
              : []
        })
      })
    }
    const pluginContext = {
      resolve: jest.fn((token: unknown) => {
        if (token === 'INTEGRATION_PERMISSION_SERVICE_TOKEN') {
          return integrationPermissionService
        }
        throw new Error(`Unexpected token: ${String(token)}`)
      })
    }
    const service = new DingTalkLongConnectionService(pluginContext as any, {} as any, {} as any)
    jest.spyOn(service, 'connect').mockReturnValue(new Promise(() => undefined))

    const result = await Promise.race([
      service.onModuleInit().then(() => 'resolved'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 20))
    ])

    expect(result).toBe('resolved')
    expect(service.connect).toHaveBeenCalledWith('integration-long')
  })

  it('restores registered Stream integrations when the integration scan fails on backend restart', async () => {
    const redis = createRedisMock(['integration-long'])
    const integrationPermissionService = {
      findAll: jest.fn().mockRejectedValue(new Error('permission service unavailable'))
    }
    const pluginContext = {
      resolve: jest.fn((token: unknown) => {
        if (token === 'INTEGRATION_PERMISSION_SERVICE_TOKEN') {
          return integrationPermissionService
        }
        if (token === 'REDIS_CLIENT') {
          return redis
        }
        throw new Error(`Unexpected token: ${String(token)}`)
      })
    }
    const service = new DingTalkLongConnectionService(pluginContext as any, {} as any, {} as any)
    jest.spyOn(service, 'connect').mockResolvedValue({
      integrationId: 'integration-long',
      connectionMode: 'long_connection',
      connected: true,
      state: 'connected',
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastError: null,
      reconnectAttempts: 0,
      lastCallbackAt: null
    })

    await service.onModuleInit()

    expect(redis.smembers).toHaveBeenCalledWith('dingtalk:stream:registry')
    expect(service.connect).toHaveBeenCalledWith('integration-long')
  })

  it('registers Stream integrations after a successful connect so backend restart can restore them', async () => {
    const redis = createRedisMock()
    const integration = {
      id: 'integration-long',
      provider: INTEGRATION_DINGTALK_LONG,
      options: {
        clientId: 'client-id',
        clientSecret: 'client-secret'
      }
    }
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue(integration)
    }
    const pluginContext = {
      resolve: jest.fn((token: unknown) => {
        if (token === 'INTEGRATION_PERMISSION_SERVICE_TOKEN') {
          return integrationPermissionService
        }
        if (token === 'REDIS_CLIENT') {
          return redis
        }
        throw new Error(`Unexpected token: ${String(token)}`)
      })
    }
    const service = new DingTalkLongConnectionService(pluginContext as any, {} as any, {} as any)
    jest.spyOn(service as any, 'startSession').mockResolvedValue(undefined)

    await service.connect('integration-long')

    expect(redis.sadd).toHaveBeenCalledWith('dingtalk:stream:registry', 'integration-long')
  })

  it('returns stored Stream runtime status when current process has no session', async () => {
    const redis = createRedisMock([], {
      'dingtalk:stream:status:integration-long': {
        state: 'connected',
        connectionMode: 'long_connection',
        connected: 'true',
        lastConnectedAt: '1000',
        lastDisconnectedAt: '',
        lastError: '',
        reconnectAttempts: '2',
        lastCallbackAt: '900'
      }
    })
    const pluginContext = {
      resolve: jest.fn((token: unknown) => {
        if (token === 'REDIS_CLIENT') {
          return redis
        }
        throw new Error(`Unexpected token: ${String(token)}`)
      })
    }
    const service = new DingTalkLongConnectionService(pluginContext as any, {} as any, {} as any)

    await expect(service.status('integration-long')).resolves.toEqual({
      integrationId: 'integration-long',
      connectionMode: 'long_connection',
      connected: true,
      state: 'connected',
      lastConnectedAt: 1000,
      lastDisconnectedAt: null,
      lastError: null,
      reconnectAttempts: 2,
      lastCallbackAt: 900
    })
    expect(redis.hgetall).toHaveBeenCalledWith('dingtalk:stream:status:integration-long')
  })

  it('persists connected Stream runtime status after connect', async () => {
    const redis = createRedisMock()
    const integration = {
      id: 'integration-long',
      provider: INTEGRATION_DINGTALK_LONG,
      options: {
        clientId: 'client-id',
        clientSecret: 'client-secret'
      }
    }
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue(integration)
    }
    const pluginContext = {
      resolve: jest.fn((token: unknown) => {
        if (token === 'INTEGRATION_PERMISSION_SERVICE_TOKEN') {
          return integrationPermissionService
        }
        if (token === 'REDIS_CLIENT') {
          return redis
        }
        throw new Error(`Unexpected token: ${String(token)}`)
      })
    }
    const service = new DingTalkLongConnectionService(pluginContext as any, {} as any, {} as any)
    jest.spyOn(service as any, 'getConnectUrl').mockResolvedValue('wss://stream.dingtalk.example/connect')
    jest.spyOn(service as any, 'openWebSocket').mockResolvedValue(createSocket())

    await service.connect('integration-long')

    expect(redis.hset).toHaveBeenCalled()
    const [statusKey, ...statusEntries] = redis.hset.mock.calls[0]
    expect(statusKey).toBe('dingtalk:stream:status:integration-long')
    expect(statusEntries).toEqual(
      expect.arrayContaining([
        'state',
        'connected',
        'connectionMode',
        'long_connection',
        'connected',
        'true',
        'lastError',
        ''
      ])
    )
    expect(redis.expire).toHaveBeenCalledWith('dingtalk:stream:status:integration-long', 60 * 60 * 24)
  })

  it('closes stale registered sockets before opening a new Stream session', async () => {
    const service = new DingTalkLongConnectionService({} as any, {} as any, {} as any)
    const staleSocket = createSocket()
    const freshSocket = createSocket()
    const session = {
      integrationId: 'integration-long',
      clientId: 'client-id',
      clientSecret: 'client-secret',
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

    ;(service as any).registerSocket('integration-long', staleSocket)
    jest.spyOn(service as any, 'getConnectUrl').mockResolvedValue('wss://stream.dingtalk.example/connect')
    jest.spyOn(service as any, 'openWebSocket').mockResolvedValue(freshSocket)

    await (service as any).startSession(session, { id: 'integration-long' })

    expect(staleSocket.removeAllListeners).toHaveBeenCalled()
    expect(staleSocket.close).toHaveBeenCalled()
    expect(staleSocket.terminate).toHaveBeenCalled()
    expect((service as any).socketRegistry.get('integration-long')?.has(freshSocket)).toBe(true)
  })

  it('disconnects all registered Stream sockets on module destroy', async () => {
    const service = new DingTalkLongConnectionService({} as any, {} as any, {} as any)
    const socket = createSocket()

    ;(service as any).registerSocket('integration-long', socket)

    await service.disconnectAll()

    expect(socket.removeAllListeners).toHaveBeenCalled()
    expect(socket.close).toHaveBeenCalled()
    expect(socket.terminate).toHaveBeenCalled()
    expect((service as any).socketRegistry.size).toBe(0)
  })
})
