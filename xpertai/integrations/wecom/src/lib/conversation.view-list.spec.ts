jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  CHAT_CHANNEL_TEXT_LIMITS: { wecom: 1000 },
  ChatChannel: () => (target: unknown) => target,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
  RequestContext: {
    currentUser: jest.fn(),
    currentTenantId: jest.fn(),
    currentUserId: jest.fn(),
    getOrganizationId: jest.fn(),
    getLanguageCode: jest.fn()
  },
  ViewExtensionProvider: () => (target: unknown) => target,
  WorkflowTriggerStrategy: () => (target: unknown) => target,
  XpertServerPlugin: () => (target: unknown) => target,
  defineChannelMessageType: (...parts: Array<string | number>) => parts.join('.'),
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  runWithRequestContext: async (_context: unknown, _store: unknown, callback: () => unknown) => await callback()
}))

import { WeComConversationService } from './conversation.service.js'

type PersistedConversationBinding = {
  id?: string
  conversationUserKey: string
  xpertId: string
  conversationId: string
  lastActiveAt?: Date
  updatedAt?: Date
}

describe('WeComConversationService view lists', () => {
  function createFixture(bindings: PersistedConversationBinding[]) {
    const sortBindings = (items: PersistedConversationBinding[]) =>
      [...items].sort((left, right) => {
        const leftTime = (left.updatedAt ?? left.lastActiveAt)?.getTime() ?? 0
        const rightTime = (right.updatedAt ?? right.lastActiveAt)?.getTime() ?? 0
        return rightTime - leftTime
      })

    const conversationBindingRepository = {
      find: jest.fn().mockResolvedValue(sortBindings(bindings)),
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({})
    }

    const service = new WeComConversationService(
      {} as any,
      { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any,
      conversationBindingRepository as any,
      { resolve: jest.fn() } as any
    )

    return {
      service,
      conversationBindingRepository
    }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('filters bindings by integration, skips malformed keys, and paginates by updatedAt desc', async () => {
    const { service, conversationBindingRepository } = createFixture([
      {
        id: 'binding-1',
        conversationUserKey: 'integration-1:chat-1:sender-1',
        xpertId: 'xpert-1',
        conversationId: 'conversation-1',
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      },
      {
        id: 'binding-2',
        conversationUserKey: 'integration-1:chat-2:sender-2',
        xpertId: 'xpert-2',
        conversationId: 'conversation-2',
        updatedAt: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        id: 'binding-3',
        conversationUserKey: 'integration-2:chat-other:sender-other',
        xpertId: 'xpert-other',
        conversationId: 'conversation-other',
        updatedAt: new Date('2026-04-01T00:00:00.000Z')
      },
      {
        id: 'binding-broken',
        conversationUserKey: 'broken-key',
        xpertId: 'xpert-broken',
        conversationId: 'conversation-broken',
        updatedAt: new Date('2026-05-01T00:00:00.000Z')
      }
    ])

    await expect(
      service.listBindingsByIntegration('integration-1', {
        page: 1,
        pageSize: 1
      })
    ).resolves.toEqual({
      items: [
        {
          id: 'binding-2',
          chatType: 'group',
          chatId: 'chat-2',
          senderId: 'sender-2',
          xpertId: 'xpert-2',
          conversationId: 'conversation-2',
          updatedAt: new Date('2026-03-01T00:00:00.000Z')
        }
      ],
      total: 2
    })

    expect(conversationBindingRepository.find).toHaveBeenCalledWith({
      order: {
        updatedAt: 'DESC'
      }
    })
  })

  it('searches binding fields and supports explicit sorting', async () => {
    const { service } = createFixture([
      {
        id: 'binding-1',
        conversationUserKey: 'integration-1:chat-b:sender-2',
        xpertId: 'xpert-b',
        conversationId: 'conversation-b',
        updatedAt: new Date('2026-02-01T00:00:00.000Z')
      },
      {
        id: 'binding-2',
        conversationUserKey: 'integration-1:chat-a:sender-1',
        xpertId: 'xpert-a',
        conversationId: 'conversation-a',
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      }
    ])

    await expect(
      service.listBindingsByIntegration('integration-1', {
        search: 'sender-1',
        sortBy: 'chatId',
        sortDirection: 'asc'
      })
    ).resolves.toEqual({
      items: [
        {
          id: 'binding-2',
          chatType: 'group',
          chatId: 'chat-a',
          senderId: 'sender-1',
          xpertId: 'xpert-a',
          conversationId: 'conversation-a',
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        }
      ],
      total: 1
    })
  })

})
