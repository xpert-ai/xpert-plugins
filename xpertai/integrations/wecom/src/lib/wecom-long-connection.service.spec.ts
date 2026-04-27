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

import { EventEmitter } from 'events'
import { WeComConversationService } from './conversation.service.js'
import { WeComChannelStrategy } from './wecom-channel.strategy.js'
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
        timeoutMs: 10000,
        ...(overrides?.options ?? {})
      }
    }
  }

  function createFixture(overrides?: Partial<{ integration: ReturnType<typeof createIntegration> }>) {
    const redis = createRedisMock()
    const integration = overrides?.integration ?? createIntegration()
    const triggerBindingRepository = {
      findOne: jest.fn().mockResolvedValue({
        integrationId: integration.id,
        xpertId: 'xpert-from-trigger'
      })
    }
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
      {} as WeComConversationService,
      triggerBindingRepository as any
    )

    return {
      service,
      redis,
      integrationPermissionService,
      integration,
      triggerBindingRepository
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

  it('treats trigger binding as a valid routing target during bootstrap', async () => {
    const { service, integrationPermissionService, triggerBindingRepository } = createFixture({
      integration: createIntegration({
        options: {
          botId: 'bot-1',
          secret: 'secret-1'
        }
      })
    })
    triggerBindingRepository.findOne.mockResolvedValue({
      integrationId: 'integration-1',
      xpertId: 'xpert-from-trigger'
    })
    integrationPermissionService.findAll.mockResolvedValue({
      items: [
        createIntegration({
          options: {
            botId: 'bot-1',
            secret: 'secret-1'
          }
        })
      ]
    })

    const connectSpy = jest.spyOn(service, 'connect').mockResolvedValue({
      integrationId: 'integration-1',
      connectionMode: 'long_connection',
      connected: false,
      state: 'idle'
    } as any)

    await service.onModuleInit()

    expect(connectSpy).toHaveBeenCalledWith('integration-1')
  })

  it('hasRoutingTarget depends only on persisted trigger bindings', async () => {
    const { service, triggerBindingRepository } = createFixture()
    triggerBindingRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      integrationId: 'integration-1',
      xpertId: 'xpert-from-trigger'
    })

    await expect(service.hasRoutingTarget({ integrationId: 'integration-1' })).resolves.toBe(false)
    await expect(service.hasRoutingTarget({ integrationId: 'integration-1' })).resolves.toBe(true)
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

  it('does not start renew timers or log connected when initial authentication fails', async () => {
    const { service, integration } = createFixture()
    const session = (service as any).ensureSession(integration)
    session.shouldRun = true

    const client = {
      connect: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),
      disconnect: jest.fn(),
      isConnected: false
    }

    jest.spyOn(service as any, 'acquireLock').mockResolvedValue('lock-1')
    jest.spyOn(service as any, 'writeOwner').mockResolvedValue(undefined)
    jest.spyOn(service as any, 'writeStatus').mockResolvedValue(undefined)
    jest.spyOn(service as any, 'createClient').mockReturnValue(client)
    jest.spyOn(service as any, 'bindClientEvents').mockImplementation(() => undefined)
    jest
      .spyOn(service as any, 'waitForInitialAuthentication')
      .mockRejectedValue(new Error('Long connection authentication timeout (10000ms)'))

    const handleStartFailureSpy = jest.spyOn(service as any, 'handleStartFailure').mockResolvedValue(undefined)
    const startRenewSpy = jest.spyOn(service as any, 'startRenew').mockImplementation(() => undefined)
    const loggerLogSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined)

    await (service as any).startSession(session)

    expect(client.connect).toHaveBeenCalled()
    expect(handleStartFailureSpy).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        message: 'Long connection authentication timeout (10000ms)'
      })
    )
    expect(startRenewSpy).not.toHaveBeenCalled()
    expect(loggerLogSpy).not.toHaveBeenCalled()
  })

  it('sends replyStream via the SDK client using the same reqId and streamId', async () => {
    const { service, integration } = createFixture()
    const session = (service as any).ensureSession(integration)
    session.state = 'connected'
    session.client = {
      replyStream: jest.fn().mockResolvedValue({
        headers: {
          req_id: 'req-1'
        },
        errcode: 0,
        errmsg: 'ok'
      })
    }
    session.websocket = {
      isConnected: true
    }
    jest.spyOn(service, 'connect').mockResolvedValue({
      integrationId: integration.id,
      connectionMode: 'long_connection',
      connected: true,
      state: 'connected'
    } as any)

    await service.sendReplyStream({
      integrationId: integration.id,
      reqId: 'req-1',
      streamId: 'stream-1',
      content: '已收到，正在思考中...',
      finish: false
    })

    expect(session.client.replyStream).toHaveBeenCalledWith(
      {
        headers: {
          req_id: 'req-1'
        }
      },
      'stream-1',
      '已收到，正在思考中...',
      false,
      undefined,
      undefined
    )
  })

  it('uses the SDK non-blocking stream reply for live delta updates', async () => {
    const { service, integration } = createFixture()
    const session = (service as any).ensureSession(integration)
    session.state = 'connected'
    session.client = {
      replyStreamNonBlocking: jest.fn().mockResolvedValue('skipped')
    }
    session.websocket = {
      isConnected: true
    }
    jest.spyOn(service, 'connect').mockResolvedValue({
      integrationId: integration.id,
      connectionMode: 'long_connection',
      connected: true,
      state: 'connected'
    } as any)

    const result = await service.sendReplyStream({
      integrationId: integration.id,
      reqId: 'req-1',
      streamId: 'stream-1',
      content: '这是中间流式内容',
      finish: false,
      nonBlocking: true
    })

    expect(session.client.replyStreamNonBlocking).toHaveBeenCalledWith(
      {
        headers: {
          req_id: 'req-1'
        }
      },
      'stream-1',
      '这是中间流式内容',
      false,
      undefined,
      undefined
    )
    expect(result).toEqual(
      expect.objectContaining({
        errmsg: 'skipped',
        raw: expect.objectContaining({
          skipped: true
        })
      })
    )
  })

  it('truncates oversized replyStream content to the WeCom byte limit', async () => {
    const { service, integration } = createFixture()
    const session = (service as any).ensureSession(integration)
    session.state = 'connected'
    session.client = {
      replyStream: jest.fn().mockResolvedValue({
        headers: {
          req_id: 'req-1'
        },
        errcode: 0,
        errmsg: 'ok'
      })
    }
    session.websocket = {
      isConnected: true
    }
    jest.spyOn(service, 'connect').mockResolvedValue({
      integrationId: integration.id,
      connectionMode: 'long_connection',
      connected: true,
      state: 'connected'
    } as any)

    await service.sendReplyStream({
      integrationId: integration.id,
      reqId: 'req-1',
      streamId: 'stream-1',
      content: 'a'.repeat(21000),
      finish: true
    })

    expect(Buffer.byteLength(session.client.replyStream.mock.calls[0][2], 'utf8')).toBeLessThanOrEqual(20480)
  })

  it('replies with a welcome card when the SDK emits event.enter_chat', async () => {
    const { service, integration } = createFixture({
      integration: createIntegration({
        options: {
          botId: 'bot-1',
          secret: 'secret-1',
          preferLanguage: 'zh-Hans'
        }
      })
    })
    const session = (service as any).ensureSession(integration)
    const client = new EventEmitter() as EventEmitter & {
      replyWelcome: jest.Mock
    }
    client.replyWelcome = jest.fn().mockResolvedValue({
      errcode: 0,
      errmsg: 'ok'
    })
    session.client = client as any

    ;(service as any).bindClientEvents(session, client as any)
    client.emit('event.enter_chat', {
      headers: {
        req_id: 'req-enter-1'
      },
      body: {
        msgtype: 'event',
        chattype: 'single',
        from: {
          userid: 'sender-1'
        },
        event: {
          eventtype: 'enter_chat'
        }
      }
    })

    await new Promise((resolve) => setImmediate(resolve))

    expect(client.replyWelcome).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          req_id: 'req-enter-1'
        }
      }),
      expect.objectContaining({
        msgtype: 'template_card',
        template_card: expect.objectContaining({
          card_type: 'text_notice',
          jump_list: expect.arrayContaining([
            expect.objectContaining({
              title: '开启新对话',
              question: '/new'
            })
          ])
        })
      })
    )
  })

})
