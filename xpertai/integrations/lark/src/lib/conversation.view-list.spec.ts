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

import { Repository } from 'typeorm'
import { type Cache } from 'cache-manager'
import { CommandBus } from '@nestjs/cqrs'
import { type PluginContext } from '@xpert-ai/plugin-sdk'
import { LarkConversationService } from './conversation.service.js'
import { LarkChannelStrategy } from './lark-channel.strategy.js'
import { LarkRecipientDirectoryService } from './lark-recipient-directory.service.js'
import { LarkGroupMentionWindowService } from './lark-group-mention-window.service.js'
import { LarkConversationBindingEntity } from './entities/lark-conversation-binding.entity.js'
import { LarkTriggerBindingEntity } from './entities/lark-trigger-binding.entity.js'

type PersistedConversationBinding = {
  id?: string
  integrationId?: string | null
  chatType?: string | null
  chatId?: string | null
  senderOpenId?: string | null
  xpertId: string
  conversationId: string
  updatedAt?: Date
}

describe('LarkConversationService listBindingsByIntegration', () => {
  function createFixture(bindings: PersistedConversationBinding[]) {
    const sortBindings = (
      items: PersistedConversationBinding[],
      order?: {
        updatedAt?: 'ASC' | 'DESC'
      }
    ) => {
      const toTime = (value?: Date) => (value instanceof Date ? value.getTime() : 0)
      return [...items].sort((left, right) => {
        if (order?.updatedAt === 'ASC') {
          return toTime(left.updatedAt) - toTime(right.updatedAt)
        }
        return toTime(right.updatedAt) - toTime(left.updatedAt)
      })
    }

    const conversationBindingRepository = {
      find: jest.fn().mockImplementation(
        async ({
          where,
          order
        }: {
          where: Partial<PersistedConversationBinding>
          order?: {
            updatedAt?: 'ASC' | 'DESC'
          }
        }) =>
          sortBindings(
            bindings.filter((item) =>
              where.integrationId === undefined ? true : item.integrationId === where.integrationId
            ),
            order
          )
      ),
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ generatedMaps: [], raw: [], identifiers: [] }),
      delete: jest.fn().mockResolvedValue({ affected: 0 })
    }
    const triggerBindingRepository = {
      findOne: jest.fn().mockResolvedValue(null)
    }

    const service = new LarkConversationService(
      { execute: jest.fn() } as unknown as CommandBus,
      { get: jest.fn(), set: jest.fn(), del: jest.fn() } as unknown as Cache,
      {} as unknown as LarkChannelStrategy,
      {} as unknown as LarkRecipientDirectoryService,
      {} as unknown as LarkGroupMentionWindowService,
      conversationBindingRepository as unknown as Repository<LarkConversationBindingEntity>,
      triggerBindingRepository as unknown as Repository<LarkTriggerBindingEntity>,
      { resolve: jest.fn() } as unknown as PluginContext
    )

    return {
      service,
      conversationBindingRepository
    }
  }

  it('filters by integration, sorts by updatedAt desc by default, and paginates', async () => {
    const { service, conversationBindingRepository } = createFixture([
      {
        id: 'binding-1',
        integrationId: 'integration-1',
        chatType: 'group',
        chatId: 'chat-1',
        senderOpenId: 'ou_sender_1',
        xpertId: 'xpert-1',
        conversationId: 'conversation-1',
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      },
      {
        id: 'binding-2',
        integrationId: 'integration-1',
        chatType: 'p2p',
        chatId: 'chat-2',
        senderOpenId: 'ou_sender_2',
        xpertId: 'xpert-2',
        conversationId: 'conversation-2',
        updatedAt: new Date('2026-03-01T00:00:00.000Z')
      },
      {
        id: 'binding-3',
        integrationId: 'integration-2',
        chatType: 'group',
        chatId: 'chat-other',
        senderOpenId: 'ou_sender_other',
        xpertId: 'xpert-other',
        conversationId: 'conversation-other',
        updatedAt: new Date('2026-04-01T00:00:00.000Z')
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
          chatType: 'p2p',
          chatId: 'chat-2',
          senderOpenId: 'ou_sender_2',
          xpertId: 'xpert-2',
          conversationId: 'conversation-2',
          updatedAt: new Date('2026-03-01T00:00:00.000Z')
        }
      ],
      total: 2
    })

    expect(conversationBindingRepository.find).toHaveBeenCalledWith({
      where: {
        integrationId: 'integration-1'
      },
      order: {
        updatedAt: 'DESC'
      }
    })
  })

  it('searches exposed id-like fields and supports explicit sorting', async () => {
    const { service } = createFixture([
      {
        id: 'binding-1',
        integrationId: 'integration-1',
        chatType: 'group',
        chatId: 'chat-b',
        senderOpenId: 'ou_sender_2',
        xpertId: 'xpert-b',
        conversationId: 'conversation-b',
        updatedAt: new Date('2026-02-01T00:00:00.000Z')
      },
      {
        id: 'binding-2',
        integrationId: 'integration-1',
        chatType: 'p2p',
        chatId: 'chat-a',
        senderOpenId: 'ou_sender_1',
        xpertId: 'xpert-a',
        conversationId: 'conversation-a',
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      }
    ])

    await expect(
      service.listBindingsByIntegration('integration-1', {
        search: 'sender_1',
        sortBy: 'chatId',
        sortDirection: 'asc'
      })
    ).resolves.toEqual({
      items: [
        {
          id: 'binding-2',
          chatType: 'p2p',
          chatId: 'chat-a',
          senderOpenId: 'ou_sender_1',
          xpertId: 'xpert-a',
          conversationId: 'conversation-a',
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        }
      ],
      total: 1
    })
  })
})
