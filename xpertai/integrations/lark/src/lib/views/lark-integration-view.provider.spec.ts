jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  CHAT_CHANNEL_TEXT_LIMITS: { lark: 1000 },
  ChatChannel: () => (target: unknown) => target,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
  USER_PERMISSION_SERVICE_TOKEN: 'USER_PERMISSION_SERVICE_TOKEN',
  RequestContext: {
    currentUser: jest.fn(),
    currentTenantId: jest.fn(),
    currentUserId: jest.fn(),
    getOrganizationId: jest.fn(),
    getLanguageCode: jest.fn()
  },
  ViewExtensionProvider: () => (target: unknown) => target,
  XpertServerPlugin: () => (target: unknown) => target,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  runWithRequestContext: async (_context: unknown, callback: () => unknown) => await callback()
}))

import type { IIntegration, XpertResolvedViewHostContext } from '@metad/contracts'
import { LarkConversationService } from '../conversation.service.js'
import { LarkRecipientDirectoryService } from '../lark-recipient-directory.service.js'
import { LarkChannelStrategy } from '../lark-channel.strategy.js'
import { LarkLongConnectionService } from '../lark-long-connection.service.js'
import { TIntegrationLarkOptions } from '../types.js'
import { LarkIntegrationViewProvider } from './lark-integration-view.provider.js'

describe('LarkIntegrationViewProvider', () => {
  function createContext(provider = 'lark'): XpertResolvedViewHostContext {
    return {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1',
      hostType: 'integration',
      hostId: 'integration-1',
      locale: 'zh-Hans',
      slots: [{ key: 'detail.main_tabs', mode: 'tabs', order: 0 }],
      hostSnapshot: {
        id: 'integration-1',
        provider,
        type: provider,
        botUser: 'Fallback Bot',
        status: 'connected'
      }
    }
  }

  function createIntegration(connectionMode: 'webhook' | 'long_connection' = 'long_connection') {
    return {
      id: 'integration-1',
      provider: 'lark',
      options: {
        appId: 'app-id',
        appSecret: 'app-secret',
        verificationToken: 'token',
        encryptKey: 'encrypt-key',
        xpertId: 'xpert-1',
        preferLanguage: 'zh-Hans',
        connectionMode
      }
    } as IIntegration<TIntegrationLarkOptions>
  }

  function createFixture(connectionMode: 'webhook' | 'long_connection' = 'long_connection') {
    const integration = createIntegration(connectionMode)
    const longConnectionService = {
      status: jest.fn().mockResolvedValue({
        integrationId: 'integration-1',
        connectionMode,
        connected: connectionMode === 'long_connection',
        state: connectionMode === 'long_connection' ? 'connected' : 'idle',
        ownerInstanceId: connectionMode === 'long_connection' ? 'instance-1' : null,
        lastConnectedAt: connectionMode === 'long_connection' ? Date.parse('2026-04-01T00:00:00.000Z') : null,
        lastError: null,
        failureCount: 0,
        nextReconnectAt: null,
        disabledReason: null
      }),
      reconnect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined)
    }
    const larkChannel = {
      readIntegrationById: jest.fn().mockResolvedValue(integration),
      getBotInfo: jest.fn().mockResolvedValue({
        id: 'ou_bot_1',
        name: 'Lark Bot'
      }),
      resolveConnectionMode: jest.fn().mockImplementation((value: unknown) => {
        if (value && typeof value === 'object' && 'options' in value) {
          const options = Reflect.get(value, 'options')
          if (options && typeof options === 'object' && 'connectionMode' in options) {
            const connectionMode = Reflect.get(options, 'connectionMode')
            return connectionMode === 'long_connection' ? 'long_connection' : 'webhook'
          }
        }

        if (value && typeof value === 'object' && 'connectionMode' in value) {
          const connectionMode = Reflect.get(value, 'connectionMode')
          return connectionMode === 'long_connection' ? 'long_connection' : 'webhook'
        }

        return 'webhook'
      })
    }
    const recipientDirectoryService = {
      listByIntegration: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'ou_user_1',
            name: 'Alice',
            openId: 'ou_user_1',
            source: 'sender',
            aliases: ['Alice'],
            firstSeenAt: 1000,
            lastSeenAt: 2000
          }
        ],
        total: 1
      })
    }
    const conversationService = {
      listBindingsByIntegration: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'binding-1',
            chatType: 'group',
            chatId: 'chat-1',
            senderOpenId: 'ou_user_1',
            xpertId: 'xpert-1',
            conversationId: 'conversation-1',
            updatedAt: new Date('2026-04-02T00:00:00.000Z')
          }
        ],
        total: 1
      })
    }

    return {
      longConnectionService,
      larkChannel,
      recipientDirectoryService,
      conversationService,
      provider: new LarkIntegrationViewProvider(
        longConnectionService as unknown as LarkLongConnectionService,
        larkChannel as unknown as LarkChannelStrategy,
        recipientDirectoryService as unknown as LarkRecipientDirectoryService,
        conversationService as unknown as LarkConversationService
      )
    }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('supports only lark integration hosts', () => {
    const { provider } = createFixture()

    expect(provider.supports(createContext('lark'))).toBe(true)
    expect(provider.supports(createContext('slack'))).toBe(false)
  })

  it('declares status, users, and conversations tabs for integration detail main tabs', () => {
    const { provider } = createFixture()

    expect(
      provider.getViewManifests(createContext(), 'detail.main_tabs').map((manifest) => manifest.key)
    ).toEqual(['status', 'users', 'conversations'])
    expect(provider.getViewManifests(createContext(), 'detail.sidebar')).toEqual([])
  })

  it('loads status data from runtime status and bot info', async () => {
    const { provider } = createFixture()

    await expect(provider.getViewData(createContext(), 'status', {})).resolves.toEqual({
      summary: {
        connectionMode: 'long_connection',
        state: 'connected',
        botUser: 'Lark Bot',
        ownerInstanceId: 'instance-1',
        lastConnectedAt: '2026-04-01T00:00:00.000Z',
        lastError: null
      }
    })
  })

  it('loads users and conversations data through local aggregation services', async () => {
    const { provider, recipientDirectoryService, conversationService } = createFixture()

    await expect(
      provider.getViewData(createContext(), 'users', {
        page: 2,
        pageSize: 5,
        search: 'alice',
        sortBy: 'lastSeenAt',
        sortDirection: 'desc'
      })
    ).resolves.toEqual({
      items: [
        {
          id: 'ou_user_1',
          name: 'Alice',
          openId: 'ou_user_1',
          source: 'sender',
          lastSeenAt: '1970-01-01T00:00:02.000Z'
        }
      ],
      total: 1
    })

    expect(recipientDirectoryService.listByIntegration).toHaveBeenCalledWith('integration-1', {
      page: 2,
      pageSize: 5,
      search: 'alice',
      sortBy: 'lastSeenAt',
      sortDirection: 'desc'
    })

    await expect(provider.getViewData(createContext(), 'conversations', {})).resolves.toEqual({
      items: [
        {
          id: 'binding-1',
          chatType: 'group',
          chatId: 'chat-1',
          senderOpenId: 'ou_user_1',
          xpertId: 'xpert-1',
          conversationId: 'conversation-1',
          updatedAt: '2026-04-02T00:00:00.000Z'
        }
      ],
      total: 1
    })

    expect(conversationService.listBindingsByIntegration).toHaveBeenCalledWith('integration-1', {
      page: undefined,
      pageSize: undefined,
      search: undefined,
      sortBy: undefined,
      sortDirection: null
    })
  })

  it('refreshes and invokes reconnect or disconnect for long connection integrations', async () => {
    const { provider, longConnectionService } = createFixture('long_connection')

    await expect(provider.executeViewAction(createContext(), 'status', 'refresh', {})).resolves.toEqual(
      expect.objectContaining({
        success: true,
        refresh: true
      })
    )

    await expect(provider.executeViewAction(createContext(), 'status', 'reconnect', {})).resolves.toEqual(
      expect.objectContaining({
        success: true,
        refresh: true
      })
    )
    expect(longConnectionService.reconnect).toHaveBeenCalledWith('integration-1')

    await expect(provider.executeViewAction(createContext(), 'status', 'disconnect', {})).resolves.toEqual(
      expect.objectContaining({
        success: true,
        refresh: true
      })
    )
    expect(longConnectionService.disconnect).toHaveBeenCalledWith('integration-1')
  })

  it('blocks reconnect and disconnect actions for webhook integrations', async () => {
    const { provider, longConnectionService } = createFixture('webhook')

    await expect(provider.executeViewAction(createContext(), 'status', 'reconnect', {})).resolves.toEqual(
      expect.objectContaining({
        success: false
      })
    )
    await expect(provider.executeViewAction(createContext(), 'status', 'disconnect', {})).resolves.toEqual(
      expect.objectContaining({
        success: false
      })
    )

    expect(longConnectionService.reconnect).not.toHaveBeenCalled()
    expect(longConnectionService.disconnect).not.toHaveBeenCalled()
  })
})
