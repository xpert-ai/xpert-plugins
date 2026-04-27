jest.mock('@xpert-ai/plugin-sdk', () => ({
  HANDOFF_PERMISSION_SERVICE_TOKEN: 'HANDOFF_PERMISSION_SERVICE_TOKEN',
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
  WorkflowTriggerStrategy: () => () => undefined,
  defineChannelMessageType: (...parts: Array<string | number>) => parts.join('.'),
  RequestContext: {
    currentTenantId: jest.fn(() => null),
    getOrganizationId: jest.fn(() => null),
    currentUserId: jest.fn(() => null)
  }
}))

jest.mock('../handoff/wecom-chat-dispatch.service.js', () => ({
  WeComChatDispatchService: class WeComChatDispatchService {}
}))

jest.mock('../wecom-long-connection.service.js', () => ({
  WeComLongConnectionService: class WeComLongConnectionService {}
}))

jest.mock('../wecom-channel.strategy.js', () => ({
  WeComChannelStrategy: class WeComChannelStrategy {}
}))

import { WECOM_LONG_CONNECTION_SERVICE } from '../tokens.js'
import { WeComTriggerStrategy } from './wecom-trigger.strategy.js'

describe('WeComTriggerStrategy', () => {
  function createStrategy(params?: {
    dbBindings?: Array<
      [string, { xpertId: string; sessionTimeoutSeconds?: number; summaryWindowSeconds?: number }]
    >
    integrationProvider?: 'wecom' | 'wecom_long'
  }) {
    const persistedBindings = new Map<
      string,
      { xpertId: string; sessionTimeoutSeconds: number; summaryWindowSeconds: number }
    >(
      (params?.dbBindings ?? []).map(([integrationId, value]) => [
        integrationId,
        {
          xpertId: value.xpertId,
          sessionTimeoutSeconds: value.sessionTimeoutSeconds ?? 3600,
          summaryWindowSeconds: value.summaryWindowSeconds ?? 5
        }
      ])
    )
    const aggregationStates = new Map<string, any>()
    const dispatchService = {
      buildDispatchMessage: jest.fn().mockResolvedValue({
        id: 'handoff-id'
      }),
      enqueueDispatch: jest.fn().mockResolvedValue({
        messageId: 'enqueued-message'
      })
    }
    const aggregationService = {
      get: jest.fn().mockImplementation(async (key: string) => aggregationStates.get(key) ?? null),
      save: jest.fn().mockImplementation(async (state: any) => {
        aggregationStates.set(state.aggregateKey, state)
      }),
      clear: jest.fn().mockImplementation(async (key: string) => {
        aggregationStates.delete(key)
      })
    }
    const handoffPermissionService = {
      enqueue: jest.fn().mockResolvedValue({
        id: 'flush-message-id'
      })
    }
    const longConnection = {
      connect: jest.fn().mockResolvedValue({
        integrationId: 'integration-1',
        connectionMode: 'long_connection',
        connected: false,
        state: 'idle'
      })
    }
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue({
        id: 'integration-1',
        provider: params?.integrationProvider ?? 'wecom_long',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        updatedById: 'user-1',
        options: {}
      })
    }
    const bindingRepository = {
      findOne: jest.fn().mockImplementation(async ({ where }: { where: { integrationId: string } }) => {
        const binding = persistedBindings.get(where.integrationId)
        return binding
          ? {
              integrationId: where.integrationId,
              ...binding
            }
          : null
      }),
      find: jest.fn().mockImplementation(async ({ where }: { where: { xpertId: string } }) => {
        const rows: Array<{ integrationId: string; xpertId: string }> = []
        for (const [integrationId, binding] of persistedBindings.entries()) {
          if (binding.xpertId === where.xpertId) {
            rows.push({
              integrationId,
              xpertId: binding.xpertId
            })
          }
        }
        return rows
      }),
      upsert: jest.fn().mockImplementation(async (payload: any) => {
        persistedBindings.set(payload.integrationId, {
          xpertId: payload.xpertId,
          sessionTimeoutSeconds: payload.sessionTimeoutSeconds,
          summaryWindowSeconds: payload.summaryWindowSeconds
        })
      }),
      delete: jest.fn().mockImplementation(async (criteria: { integrationId?: string; xpertId?: string }) => {
        if (criteria.integrationId) {
          const current = persistedBindings.get(criteria.integrationId)
          if (!criteria.xpertId || current?.xpertId === criteria.xpertId) {
            persistedBindings.delete(criteria.integrationId)
          }
        } else if (criteria.xpertId) {
          for (const [integrationId, binding] of persistedBindings) {
            if (binding.xpertId === criteria.xpertId) {
              persistedBindings.delete(integrationId)
            }
          }
        }
        return { affected: 1 }
      })
    }
    const pluginContext = {
      resolve: jest.fn((token: unknown) => {
        if (token === 'INTEGRATION_PERMISSION_SERVICE_TOKEN') {
          return integrationPermissionService
        }
        if (token === 'HANDOFF_PERMISSION_SERVICE_TOKEN') {
          return handoffPermissionService
        }
        if (token === WECOM_LONG_CONNECTION_SERVICE) {
          return longConnection
        }
        throw new Error(`Unexpected token: ${String(token)}`)
      })
    }

    const strategy = new WeComTriggerStrategy(
      dispatchService as any,
      aggregationService as any,
      {
        sendTextByIntegrationId: jest.fn(),
        sendRobotPayload: jest.fn(),
        updateRobotTemplateCard: jest.fn(),
        sendReplyStreamByIntegrationId: jest.fn()
      } as any,
      bindingRepository as any,
      pluginContext as any
    )
    return {
      strategy,
      dispatchService,
      aggregationService,
      handoffPermissionService,
      longConnection,
      bindingRepository,
      integrationPermissionService,
      persistedBindings
    }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('exposes session timeout and summary window defaults in trigger schema', () => {
    const { strategy } = createStrategy()
    const properties = strategy.meta.configSchema?.properties as Record<string, any>

    expect(properties.sessionTimeoutSeconds.default).toBe(3600)
    expect(properties.summaryWindowSeconds.default).toBe(5)
  })

  it('syncs long connection after publishing a long-connection binding', async () => {
    const { strategy, longConnection, persistedBindings } = createStrategy()

    await strategy.publish(
      {
        xpertId: 'xpert-1',
        config: {
          enabled: true,
          integrationId: 'integration-1'
        }
      } as any,
      jest.fn()
    )

    expect(persistedBindings.get('integration-1')).toEqual({
      xpertId: 'xpert-1',
      sessionTimeoutSeconds: 3600,
      summaryWindowSeconds: 5
    })
    expect(longConnection.connect).toHaveBeenCalledWith('integration-1')
  })

  it('persists zero summary window without changing session timeout fallback behavior', async () => {
    const { strategy, persistedBindings } = createStrategy()

    await strategy.publish(
      {
        xpertId: 'xpert-1',
        config: {
          enabled: true,
          integrationId: 'integration-1',
          sessionTimeoutSeconds: 0,
          summaryWindowSeconds: 0
        }
      } as any,
      jest.fn()
    )

    expect(persistedBindings.get('integration-1')).toEqual({
      xpertId: 'xpert-1',
      sessionTimeoutSeconds: 3600,
      summaryWindowSeconds: 0
    })
  })

  it('does not touch long connection when the trigger targets webhook mode', async () => {
    const { strategy, longConnection } = createStrategy({
      integrationProvider: 'wecom'
    })

    await strategy.publish(
      {
        xpertId: 'xpert-1',
        config: {
          enabled: true,
          integrationId: 'integration-1'
        }
      } as any,
      jest.fn()
    )

    expect(longConnection.connect).not.toHaveBeenCalled()
  })

  it('buffers inbound messages and schedules a delayed flush', async () => {
    const { strategy, aggregationService, handoffPermissionService } = createStrategy({
      dbBindings: [['integration-1', { xpertId: 'xpert-1', summaryWindowSeconds: 7 }]]
    })

    await expect(
      strategy.handleInboundMessage({
        integrationId: 'integration-1',
        input: '第一条消息',
        wecomMessage: {
          integrationId: 'integration-1',
          chatId: 'chat-1',
          chatType: 'private',
          senderId: 'sender-1',
          responseUrl: 'https://example.com/response',
          reqId: 'req-1',
          language: 'zh-Hans'
        } as any,
        conversationId: 'conversation-1',
        conversationUserKey: 'integration-1:chat-1:sender-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        executorUserId: 'user-1',
        endUserId: 'sender-1'
      })
    ).resolves.toBe(true)

    expect(aggregationService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateKey: 'integration-1:chat-1:sender-1',
        version: 1,
        inputParts: ['第一条消息'],
        xpertId: 'xpert-1',
        conversationId: 'conversation-1',
        latestMessage: expect.objectContaining({
          chatType: 'private'
        })
      }),
      expect.any(Number)
    )
    expect(handoffPermissionService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          aggregateKey: 'integration-1:chat-1:sender-1',
          version: 1
        }
      }),
      {
        delayMs: 7000
      }
    )
  })

  it('dispatches immediately when summary window is zero', async () => {
    const { strategy, aggregationService, dispatchService, handoffPermissionService } = createStrategy({
      dbBindings: [['integration-1', { xpertId: 'xpert-1', summaryWindowSeconds: 0 }]]
    })

    await expect(
      strategy.handleInboundMessage({
        integrationId: 'integration-1',
        input: '立即发送',
        wecomMessage: {
          integrationId: 'integration-1',
          chatId: 'chat-1',
          senderId: 'sender-1',
          responseUrl: 'https://example.com/response',
          reqId: 'req-1',
          language: 'zh-Hans'
        } as any,
        conversationId: 'conversation-1',
        conversationUserKey: 'integration-1:chat-1:sender-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        executorUserId: 'user-1',
        endUserId: 'sender-1'
      })
    ).resolves.toBe(true)

    expect(aggregationService.save).not.toHaveBeenCalled()
    expect(handoffPermissionService.enqueue).not.toHaveBeenCalled()
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        xpertId: 'xpert-1',
        input: '立即发送',
        conversationId: 'conversation-1',
        conversationUserKey: 'integration-1:chat-1:sender-1'
      })
    )
  })

  it('flushes only the latest aggregate version', async () => {
    const { strategy, aggregationService, dispatchService } = createStrategy()
    aggregationService.get.mockResolvedValue({
      aggregateKey: 'integration-1:chat-1:sender-1',
      integrationId: 'integration-1',
      conversationUserKey: 'integration-1:chat-1:sender-1',
      xpertId: 'xpert-1',
      version: 2,
      inputParts: ['第一条消息'],
      lastMessageAt: Date.now(),
      conversationId: 'conversation-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      executorUserId: 'user-1',
      endUserId: 'sender-1',
      latestMessage: {
        integrationId: 'integration-1',
        chatId: 'chat-1',
        senderId: 'sender-1',
        reqId: 'req-1',
        language: 'zh-Hans'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:chat-1:sender-1',
        version: 1
      })
    ).resolves.toBe(false)
    expect(dispatchService.enqueueDispatch).not.toHaveBeenCalled()
  })

  it('flushes the current aggregate into a single dispatch payload', async () => {
    const { strategy, aggregationService, dispatchService } = createStrategy()
    aggregationService.get.mockResolvedValue({
      aggregateKey: 'integration-1:chat-1:sender-1',
      integrationId: 'integration-1',
      conversationUserKey: 'integration-1:chat-1:sender-1',
      xpertId: 'xpert-1',
      version: 2,
      inputParts: ['第一条消息', '第二条消息'],
      lastMessageAt: Date.now(),
      conversationId: 'conversation-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      executorUserId: 'user-1',
      endUserId: 'sender-1',
      latestMessage: {
        integrationId: 'integration-1',
        chatId: 'chat-1',
        chatType: 'private',
        senderId: 'sender-1',
        responseUrl: 'https://example.com/response',
        reqId: 'req-2',
        language: 'zh-Hans'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:chat-1:sender-1',
        version: 2
      })
    ).resolves.toBe(true)

    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        xpertId: 'xpert-1',
        input: '第一条消息\n第二条消息',
        conversationId: 'conversation-1',
        conversationUserKey: 'integration-1:chat-1:sender-1'
      })
    )
    expect(dispatchService.enqueueDispatch.mock.calls[0][0].wecomMessage.chatType).toBe('private')
    expect(dispatchService.enqueueDispatch.mock.calls[0][0].wecomMessage.reqId).toBe('req-2')
    expect(aggregationService.clear).toHaveBeenCalledWith('integration-1:chat-1:sender-1')
  })

  it('re-evaluates long connection after removing a trigger binding', async () => {
    const { strategy, longConnection, persistedBindings } = createStrategy({
      dbBindings: [['integration-1', { xpertId: 'xpert-1' }]]
    })

    await strategy.stop(
      {
        xpertId: 'xpert-1',
        config: {
          enabled: true,
          integrationId: 'integration-1'
        }
      } as any
    )

    expect(persistedBindings.has('integration-1')).toBe(false)
    expect(longConnection.connect).toHaveBeenCalledWith('integration-1')
  })
})
