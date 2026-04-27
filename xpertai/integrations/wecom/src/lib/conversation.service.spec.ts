import { INTEGRATION_PERMISSION_SERVICE_TOKEN, RequestContext } from '@xpert-ai/plugin-sdk'
import { WeComConversationService } from './conversation.service.js'
import { WeComTriggerStrategy } from './workflow/wecom-trigger.strategy.js'

describe('WeComConversationService', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  function createFixture(options?: {
    preferLanguage?: string
    triggerBinding?: {
      xpertId: string
      sessionTimeoutSeconds?: number
      summaryWindowSeconds?: number
    } | null
    conversationState?: {
      id?: string
      conversationUserKey: string
      xpertId: string
      conversationId: string
      lastActiveAt?: Date
      updatedAt?: Date
    } | null
  }) {
    const resolvedTriggerBinding =
      options && Object.prototype.hasOwnProperty.call(options, 'triggerBinding')
        ? options.triggerBinding
        : {
            xpertId: 'xpert-1',
            sessionTimeoutSeconds: 3600,
            summaryWindowSeconds: 0
          }
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue({
        id: 'integration-1',
        tenantId: 'tenant-1',
      organizationId: 'organization-1',
      options: {
          preferLanguage: options?.preferLanguage ?? 'zh-Hans'
        }
      })
    }
    const wecomChannel = {
      errorMessage: jest.fn().mockResolvedValue(undefined),
      sendTextByIntegrationId: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'reply-1'
      })
    }
    const wecomTriggerStrategy = {
      handleInboundMessage: jest.fn().mockResolvedValue(true),
      getBinding: jest.fn().mockResolvedValue(resolvedTriggerBinding),
      clearBufferedConversation: jest.fn().mockResolvedValue(undefined)
    }

    const cacheStore = new Map<string, any>()
    const cacheManager = {
      get: jest.fn().mockImplementation(async (key: string) => cacheStore.get(key)),
      set: jest.fn().mockImplementation(async (key: string, value: unknown) => {
        cacheStore.set(key, value)
      }),
      del: jest.fn().mockImplementation(async (key: string) => {
        cacheStore.delete(key)
      })
    }

    const conversationState =
      options?.conversationState && {
        id: options.conversationState.id ?? 'binding-1',
        ...options.conversationState
      }
    const conversationBindingRepository = {
      find: jest.fn().mockResolvedValue(conversationState ? [{ ...conversationState }] : []),
      findOne: jest.fn().mockImplementation(async ({ where }: { where: { id?: string; conversationUserKey?: string; xpertId?: string } }) => {
        if (conversationState && where.id && conversationState.id === where.id) {
          return {
            ...conversationState
          }
        }
        if (
          conversationState &&
          conversationState.conversationUserKey === where.conversationUserKey &&
          conversationState.xpertId === where.xpertId
        ) {
          return {
            ...conversationState
          }
        }
        return null
      }),
      upsert: jest.fn().mockImplementation(async (payload: any) => {
        if (payload.conversationUserKey && payload.xpertId) {
          Object.assign(conversationState ?? {}, payload)
        }
      }),
      update: jest.fn().mockImplementation(async (_criteria: any, partial: any) => {
        if (conversationState) {
          Object.assign(conversationState, partial)
        }
      }),
      delete: jest.fn().mockImplementation(async () => {
        if (conversationState) {
          conversationState.conversationId = ''
        }
      })
    }
    const pluginContext = {
      resolve: jest.fn((token: unknown) => {
        if (token === INTEGRATION_PERMISSION_SERVICE_TOKEN) {
          return integrationPermissionService
        }
        if (token === WeComTriggerStrategy) {
          return wecomTriggerStrategy
        }
        throw new Error(`Unexpected token: ${String(token)}`)
      })
    }

    const service = new WeComConversationService(
      wecomChannel as any,
      cacheManager as any,
      conversationBindingRepository as any,
      pluginContext as any
    )

    return {
      service,
      wecomChannel,
      wecomTriggerStrategy,
      conversationBindingRepository,
      pluginContext
    }
  }

  it('uses trigger binding instead of integration fallback', async () => {
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('request-user-id' as any)

    const { service, wecomTriggerStrategy, pluginContext } = createFixture()

    await service.handleMessage(
      {
        content: 'hello from local test',
        chatId: 'chat-1',
        senderId: 'sender-1',
        senderName: '张三',
        chatType: 'group',
        mentions: [{ id: 'mentioned-1', name: '李四' }],
        raw: {
          response_url: 'https://example.com/respond',
          req_id: 'req-1'
        }
      } as any,
      {
        integration: {
          id: 'integration-1'
        },
        tenantId: 'tenant-1',
        organizationId: 'organization-1'
      } as any
    )

    expect(wecomTriggerStrategy.getBinding).toHaveBeenCalledWith('integration-1')
    expect(wecomTriggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        input: 'hello from local test',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        conversationUserKey: 'integration-1:chat-1:sender-1'
      })
    )
    expect(wecomTriggerStrategy.handleInboundMessage.mock.calls[0][0].wecomMessage.reqId).toBe('req-1')
    expect(pluginContext.resolve).toHaveBeenCalledTimes(2)
    expect(pluginContext.resolve).toHaveBeenCalledWith(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    expect(pluginContext.resolve).toHaveBeenCalledWith(WeComTriggerStrategy)
  })

  it('starts a new session and replies with a fixed prompt for bare /new', async () => {
    const { service, wecomChannel, wecomTriggerStrategy } = createFixture({
      conversationState: {
        conversationUserKey: 'integration-1:chat-1:sender-1',
        xpertId: 'xpert-1',
        conversationId: 'conversation-1',
        lastActiveAt: new Date(),
        updatedAt: new Date()
      }
    })

    await service.handleMessage(
      {
        content: '/new',
        chatId: 'chat-1',
        senderId: 'sender-1',
        raw: {
          req_id: 'req-1'
        }
      } as any,
      {
        integration: {
          id: 'integration-1'
        },
        tenantId: 'tenant-1',
        organizationId: 'organization-1'
      } as any
    )

    expect(wecomTriggerStrategy.clearBufferedConversation).toHaveBeenCalledWith('integration-1:chat-1:sender-1')
    expect(wecomTriggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
    expect(wecomChannel.sendTextByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        content: '已开启新会话，请继续提问'
      })
    )
  })

  it('localizes the bare /new prompt with the integration preferred language', async () => {
    const { service, wecomChannel } = createFixture({
      preferLanguage: 'en',
      conversationState: {
        conversationUserKey: 'integration-1:chat-1:sender-1',
        xpertId: 'xpert-1',
        conversationId: 'conversation-1',
        lastActiveAt: new Date(),
        updatedAt: new Date()
      }
    })

    await service.handleMessage(
      {
        content: '/new',
        chatId: 'chat-1',
        senderId: 'sender-1',
        raw: {
          req_id: 'req-1'
        }
      } as any,
      {
        integration: {
          id: 'integration-1'
        },
        tenantId: 'tenant-1',
        organizationId: 'organization-1'
      } as any
    )

    expect(wecomChannel.sendTextByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        content: 'New conversation started. Please continue asking.'
      })
    )
  })

  it('treats /new remainder as the first question of a new session', async () => {
    const { service, wecomTriggerStrategy } = createFixture({
      conversationState: {
        conversationUserKey: 'integration-1:chat-1:sender-1',
        xpertId: 'xpert-1',
        conversationId: 'conversation-1',
        lastActiveAt: new Date(),
        updatedAt: new Date()
      }
    })

    await service.handleMessage(
      {
        content: '/new 你的上下文是多大',
        chatId: 'chat-1',
        senderId: 'sender-1',
        raw: {
          req_id: 'req-1'
        }
      } as any,
      {
        integration: {
          id: 'integration-1'
        },
        tenantId: 'tenant-1',
        organizationId: 'organization-1'
      } as any
    )

    expect(wecomTriggerStrategy.clearBufferedConversation).toHaveBeenCalledWith('integration-1:chat-1:sender-1')
    expect(wecomTriggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '你的上下文是多大',
        conversationId: undefined
      })
    )
  })

  it('starts a new session after timeout and drops the old conversationId', async () => {
    const expiredAt = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const { service, wecomTriggerStrategy, conversationBindingRepository } = createFixture({
      conversationState: {
        conversationUserKey: 'integration-1:chat-1:sender-1',
        xpertId: 'xpert-1',
        conversationId: 'conversation-1',
        lastActiveAt: expiredAt,
        updatedAt: expiredAt
      }
    })

    await service.handleMessage(
      {
        content: 'timeout test',
        chatId: 'chat-1',
        senderId: 'sender-1',
        raw: {
          req_id: 'req-1'
        }
      } as any,
      {
        integration: {
          id: 'integration-1'
        },
        tenantId: 'tenant-1',
        organizationId: 'organization-1'
      } as any
    )

    expect(conversationBindingRepository.delete).toHaveBeenCalled()
    expect(wecomTriggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'timeout test',
        conversationId: undefined
      })
    )
  })

  it('replies with an explicit trigger-binding error when no trigger is bound', async () => {
    const { service, wecomChannel, wecomTriggerStrategy } = createFixture({
      preferLanguage: 'en',
      triggerBinding: null
    })

    await service.handleMessage(
      {
        content: 'hello',
        chatId: 'chat-1',
        senderId: 'sender-1',
        raw: {
          req_id: 'req-1'
        }
      } as any,
      {
        integration: {
          id: 'integration-1'
        },
        tenantId: 'tenant-1',
        organizationId: 'organization-1'
      } as any
    )

    expect(wecomTriggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
    expect(wecomChannel.errorMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1'
      }),
      expect.objectContaining({
        message:
          'This WeCom integration is not bound to a trigger. Please bind a WeCom trigger in the workflow first.'
      })
    )
  })

  it('restarts a conversation binding with the same cleanup semantics as /new', async () => {
    const { service, wecomTriggerStrategy, conversationBindingRepository } = createFixture({
      conversationState: {
        id: 'binding-1',
        conversationUserKey: 'integration-1:chat-1:sender-1',
        xpertId: 'xpert-1',
        conversationId: 'conversation-1',
        lastActiveAt: new Date(),
        updatedAt: new Date()
      }
    })

    await expect(service.restartConversationBinding('integration-1', 'binding-1')).resolves.toBeUndefined()

    expect(conversationBindingRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: 'binding-1'
      }
    })
    expect(conversationBindingRepository.delete).toHaveBeenCalledWith({
      conversationUserKey: 'integration-1:chat-1:sender-1',
      xpertId: 'xpert-1'
    })
    expect(wecomTriggerStrategy.clearBufferedConversation).toHaveBeenCalledWith('integration-1:chat-1:sender-1')
  })

  it('rejects restart when the binding does not belong to the current integration', async () => {
    const { service, wecomTriggerStrategy, conversationBindingRepository } = createFixture({
      conversationState: {
        id: 'binding-1',
        conversationUserKey: 'integration-2:chat-1:sender-1',
        xpertId: 'xpert-1',
        conversationId: 'conversation-1',
        lastActiveAt: new Date(),
        updatedAt: new Date()
      }
    })

    await expect(service.restartConversationBinding('integration-1', 'binding-1')).rejects.toThrow(
      '该会话不属于当前企业微信集成。'
    )

    expect(conversationBindingRepository.delete).not.toHaveBeenCalled()
    expect(wecomTriggerStrategy.clearBufferedConversation).not.toHaveBeenCalled()
  })
})
