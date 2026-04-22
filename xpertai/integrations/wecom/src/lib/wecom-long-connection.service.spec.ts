jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  CHAT_CHANNEL_TEXT_LIMITS: { wecom: 1000 },
  ChatChannel: () => (target: unknown) => target,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
  RequestContext: {
    currentUser: jest.fn()
  },
  defineChannelMessageType: (...parts: Array<string | number>) => parts.join('.'),
  WorkflowTriggerStrategy: () => (target: unknown) => target,
  runWithRequestContext: async (_context: unknown, _store: unknown, callback: () => unknown) => await callback()
}))

import { WeComConversationService } from './conversation.service.js'
import { WeComChannelStrategy } from './wecom-channel.strategy.js'
import { WECOM_PLUGIN_CONTEXT } from './tokens.js'
import { TIntegrationWeComLongOptions } from './types.js'
import { WeComLongConnectionService } from './wecom-long-connection.service.js'

function createRedisMock() {
  const store = new Map<string, string>()
  const sets = new Map<string, Set<string>>()
  const hashes = new Map<string, Record<string, string>>()

  return {
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value)
      return 'OK'
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (...keys: string[]) => {
      keys.forEach((key) => {
        store.delete(key)
        sets.delete(key)
        hashes.delete(key)
      })
      return 1
    }),
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
    sismember: jest.fn(async (key: string, member: string) => Number((sets.get(key) ?? new Set<string>()).has(member))),
    hSet: jest.fn(async (key: string, value: Record<string, string>) => {
      hashes.set(key, { ...value })
      return 1
    }),
    hGetAll: jest.fn(async (key: string) => hashes.get(key) ?? {}),
    expire: jest.fn(async () => 1),
    eval: jest.fn(async () => 1)
  }
}

describe('WeComLongConnectionService', () => {
  function createIntegration(
    overrides?: Partial<{ enabled: boolean; options: Partial<TIntegrationWeComLongOptions> }>
  ) {
    return {
      id: 'integration-1',
      provider: 'wecom_long',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      enabled: overrides?.enabled ?? true,
      options: {
        botId: 'bot-1',
        secret: 'secret-1',
        xpertId: 'xpert-1',
        timeoutMs: 10000,
        ...(overrides?.options ?? {})
      }
    }
  }

  function createFixture(overrides?: Partial<{ integration: ReturnType<typeof createIntegration> }>) {
    const redis = createRedisMock()
    const integration = overrides?.integration ?? createIntegration()
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue(integration),
      findAll: jest.fn().mockResolvedValue({ items: [integration] })
    }
    const pluginContext = {
      resolve: jest.fn((token: string) => {
        if (token === 'INTEGRATION_PERMISSION_SERVICE_TOKEN') {
          return integrationPermissionService
        }
        if (token === 'REDIS_CLIENT') {
          return redis
        }
        throw new Error(`Unknown token: ${token}`)
      })
    }

    const service = new WeComLongConnectionService(
      pluginContext as any,
      {} as WeComChannelStrategy,
      {} as WeComConversationService
    )

    return {
      service,
      redis,
      integrationPermissionService,
      integration
    }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('disconnect persists manual disconnect runtime status in redis', async () => {
    const { service, integration } = createFixture()
    ;(service as any).ensureSession(integration)

    await service.disconnect('integration-1')

    await expect(service.status('integration-1')).resolves.toMatchObject({
      integrationId: 'integration-1',
      state: 'idle',
      connected: false,
      shouldRun: false,
      disabledReason: 'manual_disconnect'
    })
  })

  it('bootstraps enabled integrations on module init', async () => {
    const { service } = createFixture()
    const connectSpy = jest.spyOn(service, 'connect').mockResolvedValue({
      integrationId: 'integration-1',
      connectionMode: 'long_connection',
      connected: false,
      state: 'idle'
    } as any)

    await service.onModuleInit()

    expect(connectSpy).toHaveBeenCalledWith('integration-1')
  })

  it('resets unhealthy session state when connectWithConfig is called', async () => {
    const { service, integration } = createFixture()
    const session = (service as any).ensureSession(integration)
    Object.assign(session, {
      state: 'unhealthy',
      shouldRun: false,
      failureCount: 2,
      reconnectAttempts: 3,
      pingFailureCount: 1,
      disabledReason: 'config_invalid',
      lastError: 'invalid secret',
      nextReconnectAt: 123
    })

    const stopSessionSpy = jest.spyOn(service as any, 'stopSession').mockResolvedValue(undefined)
    const startSessionSpy = jest.spyOn(service as any, 'startSession').mockImplementation(async () => {
      expect(session.state).toBe('idle')
      expect(session.shouldRun).toBe(true)
      expect(session.failureCount).toBe(0)
      expect(session.reconnectAttempts).toBe(0)
      expect(session.pingFailureCount).toBe(0)
      expect(session.disabledReason).toBeNull()
      expect(session.lastError).toBeNull()
      expect(session.nextReconnectAt).toBeNull()
    })

    await service.connectWithConfig({
      integrationId: integration.id,
      botId: 'bot-1',
      secret: 'secret-2',
      timeoutMs: 10000
    })

    expect(stopSessionSpy).toHaveBeenCalledWith(session, true)
    expect(startSessionSpy).toHaveBeenCalledWith(session)
    expect(session.secret).toBe('secret-2')
  })
})
