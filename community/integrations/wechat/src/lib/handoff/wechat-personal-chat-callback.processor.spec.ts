jest.mock('@xpert-ai/plugin-sdk', () => ({
  HandoffProcessorStrategy: () => (target: unknown) => target,
  defineChannelMessageType: (channel: string, key: string, version: number) => `channel.${channel}.${key}.v${version}`
}))

jest.mock('@xpert-ai/chatkit-types', () => ({
  ChatMessageTypeEnum: {
    MESSAGE: 'message',
    EVENT: 'event'
  },
  ChatMessageEventTypeEnum: {
    ON_CONVERSATION_START: 'on_conversation_start',
    ON_MESSAGE_END: 'on_message_end'
  }
}))

jest.mock('../wechat-personal-channel.strategy.js', () => ({
  WechatPersonalChannelStrategy: class WechatPersonalChannelStrategy {}
}))

jest.mock('../conversation.service.js', () => ({
  WechatPersonalConversationService: class WechatPersonalConversationService {}
}))

import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/chatkit-types'
import { WechatPersonalChatCallbackProcessor } from './wechat-personal-chat-callback.processor.js'
import {
  WechatPersonalChatRunState,
  WechatPersonalChatRunStateService
} from './wechat-personal-chat-run-state.service.js'
import { WechatPersonalChatCallbackContext, WechatPersonalChatCallbackPayload } from './wechat-personal-chat.types.js'

class MemoryRunStateService {
  private readonly states = new Map<string, WechatPersonalChatRunState>()

  async save(state: WechatPersonalChatRunState): Promise<void> {
    this.states.set(state.sourceMessageId, structuredClone(state))
  }

  async get(sourceMessageId: string): Promise<WechatPersonalChatRunState | null> {
    return this.states.get(sourceMessageId) ?? null
  }

  async clear(sourceMessageId: string): Promise<void> {
    this.states.delete(sourceMessageId)
  }
}

describe('WechatPersonalChatCallbackProcessor', () => {
  const context: WechatPersonalChatCallbackContext = {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1',
    xpertId: 'xpert-1',
    integrationId: 'integration-1',
    uuid: 'uuid-1',
    contactId: 'wxid_friend',
    chatId: 'wxid_friend',
    conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
    message: {}
  }

  function createProcessor() {
    const wechatChannel = {
      sendReplyByIntegrationId: jest.fn(async () => ({
        success: true,
        queued: true,
        queueJobId: 'job-1',
        outboundLogId: 'log-1',
        items: [
          {
            type: 'text',
            content: '完整的微信回复',
            success: true,
            queued: true,
            queueJobId: 'job-1',
            outboundLogId: 'log-1'
          }
        ]
      }))
    }
    const conversationService = {
      setConversation: jest.fn(async () => undefined),
      logOutbound: jest.fn(async () => undefined)
    }
    const runStateService = new MemoryRunStateService()
    const processor = new WechatPersonalChatCallbackProcessor(
      wechatChannel as any,
      conversationService as any,
      runStateService as unknown as WechatPersonalChatRunStateService
    )
    return { processor, wechatChannel, conversationService, runStateService }
  }

  it('uses on_message_end final text and completes when earlier callback sequences are missing', async () => {
    const { processor, wechatChannel, conversationService, runStateService } = createProcessor()
    const sourceMessageId = 'wechat-personal-chat-run-1'
    const finalText = '完整的微信回复'

    const messageEnd: WechatPersonalChatCallbackPayload = {
      kind: 'stream',
      sourceMessageId,
      sequence: 2,
      context,
      event: {
        data: {
          type: ChatMessageTypeEnum.EVENT,
          event: ChatMessageEventTypeEnum.ON_MESSAGE_END,
          data: {
            conversationId: 'conversation-1',
            content: [
              { type: 'component', data: { name: 'workspace_list' } },
              { type: 'text', text: finalText }
            ]
          }
        }
      }
    } as any

    const complete: WechatPersonalChatCallbackPayload = {
      kind: 'complete',
      sourceMessageId,
      sequence: 4
    } as any

    await processor.process({ payload: messageEnd } as any, {} as any)
    await processor.process({ payload: complete } as any, {} as any)

    expect(wechatChannel.sendReplyByIntegrationId).toHaveBeenCalledWith('integration-1', {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      content: finalText,
      context: expect.objectContaining({
        integrationId: 'integration-1',
        conversationId: 'conversation-1'
      }),
      source: 'agent_callback'
    })
    expect(conversationService.setConversation).not.toHaveBeenCalled()
    expect(conversationService.logOutbound).not.toHaveBeenCalled()
    await expect(runStateService.get(sourceMessageId)).resolves.toBeNull()
  })

  it('logs every directly sent mixed reply part when the queue is disabled', async () => {
    const { processor, wechatChannel, conversationService } = createProcessor()
    const sourceMessageId = 'wechat-personal-chat-run-2'
    ;(wechatChannel.sendReplyByIntegrationId as jest.Mock).mockResolvedValueOnce({
      success: true,
      queued: false,
      items: [
        {
          type: 'text',
          content: '文字',
          success: true,
          messageId: 'text-1',
          payloadSummary: JSON.stringify({ type: 'text', source: 'agent_callback' })
        },
        {
          type: 'image',
          content: 'https://example.com/a.png',
          success: true,
          messageId: 'image-1',
          payloadSummary: JSON.stringify({
            type: 'image',
            source: 'agent_callback',
            imageUrl: 'https://example.com/a.png'
          })
        }
      ]
    })

    await processor.process(
      {
        payload: {
          kind: 'stream',
          sourceMessageId,
          sequence: 1,
          context,
          event: {
            data: {
              type: ChatMessageTypeEnum.EVENT,
              event: ChatMessageEventTypeEnum.ON_MESSAGE_END,
              data: {
                content: '文字\n\n![图](https://example.com/a.png)'
              }
            }
          }
        }
      } as any,
      {} as any
    )
    await processor.process({ payload: { kind: 'complete', sourceMessageId, sequence: 2 } } as any, {} as any)

    expect(conversationService.logOutbound).toHaveBeenCalledTimes(2)
    expect(conversationService.logOutbound).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        content: '文字',
        messageId: 'text-1',
        payloadSummary: JSON.stringify({ type: 'text', source: 'agent_callback' })
      })
    )
    expect(conversationService.logOutbound).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: 'https://example.com/a.png',
        messageId: 'image-1',
        payloadSummary: JSON.stringify({
          type: 'image',
          source: 'agent_callback',
          imageUrl: 'https://example.com/a.png'
        })
      })
    )
  })
})
