import { RequestContext, INTEGRATION_PERMISSION_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
import { WeComConversationService } from './conversation.service.js'

describe('WeComConversationService', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  function createFixture() {
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue({
        id: 'integration-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        options: {
          preferLanguage: 'zh-Hans'
        }
      })
    }
    const commandBus = {
      execute: jest.fn().mockResolvedValue(undefined)
    }
    const wecomChannel = {
      errorMessage: jest.fn().mockResolvedValue(undefined)
    }
    const wecomTriggerStrategy = {
      handleInboundMessage: jest.fn().mockResolvedValue(true),
      getBoundXpertId: jest.fn().mockResolvedValue(null)
    }
    const cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined)
    }
    const conversationBindingRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined)
    }
    const pluginContext = {
      resolve: jest.fn((token: unknown) => {
        if (token === INTEGRATION_PERMISSION_SERVICE_TOKEN) {
          return integrationPermissionService
        }
        throw new Error(`Unexpected token: ${String(token)}`)
      })
    }

    const service = new WeComConversationService(
      commandBus as any,
      wecomChannel as any,
      wecomTriggerStrategy as any,
      cacheManager as any,
      conversationBindingRepository as any,
      pluginContext as any
    )

    return {
      service,
      commandBus,
      wecomTriggerStrategy,
      pluginContext
    }
  }

  it('uses the injected WeComTriggerStrategy instead of resolving it from pluginContext', async () => {
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('request-user-id' as any)

    const { service, commandBus, wecomTriggerStrategy, pluginContext } = createFixture()

    await service.handleMessage(
      {
        content: 'hello from local test',
        chatId: 'chat-1',
        senderId: 'sender-1',
        raw: {
          response_url: 'https://example.com/respond'
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

    expect(wecomTriggerStrategy.getBoundXpertId).toHaveBeenCalledWith('integration-1')
    expect(wecomTriggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        input: 'hello from local test',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        conversationUserKey: 'integration-1:chat-1:sender-1'
      })
    )
    expect(commandBus.execute).not.toHaveBeenCalled()
    expect(pluginContext.resolve).toHaveBeenCalledTimes(1)
    expect(pluginContext.resolve).toHaveBeenCalledWith(INTEGRATION_PERMISSION_SERVICE_TOKEN)
  })
})
