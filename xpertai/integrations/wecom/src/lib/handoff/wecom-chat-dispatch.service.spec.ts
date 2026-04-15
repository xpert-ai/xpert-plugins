import {
  HANDOFF_PERMISSION_SERVICE_TOKEN,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { ChatWeComMessage } from '../message.js'
import { WeComChatDispatchService } from './wecom-chat-dispatch.service.js'

function createWeComMessage(
  overrides: Partial<{
    id: string
    messageId: string
    status: string
    language: string
    integrationId: string
    chatId: string
    senderId: string
    responseUrl: string
  }> = {}
) {
  return new ChatWeComMessage(
    {
      integrationId: overrides.integrationId ?? 'integration-1',
      chatId: overrides.chatId ?? 'chat-1',
      senderId: overrides.senderId ?? 'sender-1',
      responseUrl: overrides.responseUrl ?? 'https://example.com/wecom/respond',
      wecomChannel: {
        sendTextByIntegrationId: jest.fn().mockResolvedValue({
          success: true,
          messageId: 'reply-message-id'
        })
      }
    },
    {
      id: overrides.id ?? 'wecom-message-id',
      messageId: overrides.messageId ?? 'wecom-chat-message-id',
      status: (overrides.status as any) ?? 'thinking',
      language: overrides.language ?? 'zh-Hans'
    }
  )
}

function mockRequestContext(params?: {
  userId?: string
  language?: string
}) {
  jest.spyOn(RequestContext, 'currentUserId').mockReturnValue((params?.userId ?? 'request-user-id') as any)
  jest.spyOn(RequestContext, 'getLanguageCode').mockReturnValue((params?.language ?? 'zh-Hans') as any)
}

describe('WeComChatDispatchService', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  function createFixture() {
    const runStateService = {
      save: jest.fn().mockResolvedValue(undefined)
    }
    const handoffPermissionService = {
      enqueue: jest.fn().mockResolvedValue(undefined)
    }
    const pluginContext = {
      resolve: jest.fn((token: unknown) => {
        if (token === HANDOFF_PERMISSION_SERVICE_TOKEN) {
          return handoffPermissionService
        }
        throw new Error(`Unexpected token: ${String(token)}`)
      })
    }
    const service = new WeComChatDispatchService(
      runStateService as any,
      pluginContext as any
    )

    return {
      service,
      runStateService,
      handoffPermissionService
    }
  }

  it('buildDispatchMessage uses the current send request shape', async () => {
    mockRequestContext({
      userId: 'request-user-id',
      language: 'zh-Hans'
    })
    const { service, runStateService } = createFixture()
    const wecomMessage = createWeComMessage()

    const message = await service.buildDispatchMessage({
      xpertId: 'xpert-1',
      input: 'hello from wecom',
      wecomMessage,
      conversationId: 'conversation-1',
      conversationUserKey: 'wecom:user-key-1',
      tenantId: 'tenant-1',
      organizationId: 'organization-1',
      executorUserId: 'executor-user-id',
      endUserId: 'end-user-id'
    })

    expect((message.payload as any).request).toEqual({
      action: 'send',
      conversationId: 'conversation-1',
      message: {
        input: {
          input: 'hello from wecom'
        }
      }
    })
    expect((message.payload as any).options).toEqual(
      expect.objectContaining({
        xpertId: 'xpert-1',
        from: 'wecom',
        fromEndUserId: 'end-user-id',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        language: 'zh-Hans',
        integrationId: 'integration-1',
        chatId: 'chat-1',
        senderId: 'sender-1',
        channelUserId: 'sender-1',
        responseUrl: 'https://example.com/wecom/respond',
        response_url: 'https://example.com/wecom/respond'
      })
    )
    expect(message.headers).toEqual(
      expect.objectContaining({
        organizationId: 'organization-1',
        userId: 'executor-user-id',
        language: 'zh-Hans',
        conversationId: 'conversation-1'
      })
    )
    expect(runStateService.save).toHaveBeenCalledTimes(1)
  })
})
