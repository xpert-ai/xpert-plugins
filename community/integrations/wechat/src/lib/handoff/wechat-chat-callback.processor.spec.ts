jest.mock('@xpert-ai/plugin-sdk', () => ({
  HandoffProcessorStrategy: () => (target: unknown) => target,
  defineChannelMessageType: (channel: string, key: string, version: number) => `channel.${channel}.${key}.v${version}`
}))

jest.mock('../wechat-channel.strategy.js', () => ({
  WechatChannelStrategy: class WechatChannelStrategy {}
}))

jest.mock('../conversation.service.js', () => ({
  WechatConversationService: class WechatConversationService {}
}))

import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/contracts'
import { WechatChatCallbackProcessor } from './wechat-chat-callback.processor.js'
import {
  WechatChatRunState,
  WechatChatRunStateService
} from './wechat-chat-run-state.service.js'
import { WechatChatCallbackContext, WechatChatCallbackPayload } from './wechat-chat.types.js'

class MemoryRunStateService {
  private readonly states = new Map<string, WechatChatRunState>()

  async save(state: WechatChatRunState): Promise<void> {
    this.states.set(state.sourceMessageId, structuredClone(state))
  }

  async get(sourceMessageId: string): Promise<WechatChatRunState | null> {
    return this.states.get(sourceMessageId) ?? null
  }

  async clear(sourceMessageId: string): Promise<void> {
    this.states.delete(sourceMessageId)
  }
}

describe('WechatChatCallbackProcessor', () => {
  const context: WechatChatCallbackContext = {
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
      })),
      sendTextByIntegrationId: jest.fn(async () => ({
        success: true,
        queued: true,
        queueJobId: 'job-2'
      }))
    }
    const conversationService = {
      setConversation: jest.fn(async () => undefined),
      logOutbound: jest.fn(async () => undefined),
      markInboundCallbackFailed: jest.fn(async () => undefined)
    }
    const runStateService = new MemoryRunStateService()
    const processor = new WechatChatCallbackProcessor(
      wechatChannel as any,
      conversationService as any,
      runStateService as unknown as WechatChatRunStateService
    )
    return { processor, wechatChannel, conversationService, runStateService }
  }

  it('uses on_message_end final text and completes when earlier callback sequences are missing', async () => {
    const { processor, wechatChannel, conversationService, runStateService } = createProcessor()
    const sourceMessageId = 'wechat-chat-run-1'
    const finalText = '完整的微信回复'

    const messageEnd: WechatChatCallbackPayload = {
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

    const complete: WechatChatCallbackPayload = {
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
    const sourceMessageId = 'wechat-chat-run-2'
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

  it('marks inbound messages failed when the agent dispatch reports an error', async () => {
    const { processor, wechatChannel, conversationService, runStateService } = createProcessor()
    const sourceMessageId = 'wechat-chat-run-error'
    const errorContext = {
      ...context,
      currentInboundLogIds: ['inbound-log-1'],
      message: {
        id: 'inbound-log-1'
      }
    }

    await processor.process(
      {
        payload: {
          kind: 'error',
          sourceMessageId,
          sequence: 1,
          context: errorContext,
          error: 'Access denied to workspace'
        }
      } as any,
      {} as any
    )

    expect(conversationService.markInboundCallbackFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        currentInboundLogIds: ['inbound-log-1']
      }),
      'Access denied to workspace'
    )
    expect(conversationService.logOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: 'Access denied to workspace'
      })
    )
    expect(wechatChannel.sendTextByIntegrationId).toHaveBeenCalled()
    await expect(runStateService.get(sourceMessageId)).resolves.toBeNull()
  })
})
