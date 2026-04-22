jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  HandoffProcessorStrategy: () => (target: unknown) => target,
  defineChannelMessageType: (...parts: Array<string | number>) => parts.join('.')
}))

jest.mock('@xpert-ai/chatkit-types', () => ({
  ChatMessageEventTypeEnum: {
    ON_CONVERSATION_START: 'on_conversation_start'
  },
  ChatMessageTypeEnum: {
    MESSAGE: 'message',
    EVENT: 'event'
  }
}))

jest.mock('@metad/contracts', () => ({
  filterMessageText: (value: unknown) => {
    if (typeof value === 'string') {
      return value
    }
    if (value && typeof value === 'object' && (value as { type?: unknown }).type === 'text') {
      return (value as { text?: unknown }).text ?? ''
    }
    return ''
  }
}))

jest.mock('../conversation.service.js', () => ({
  WeComConversationService: class WeComConversationService {}
}))

jest.mock('../wecom-channel.strategy.js', () => ({
  WeComChannelStrategy: class WeComChannelStrategy {}
}))

import { ChatMessageTypeEnum } from '@xpert-ai/chatkit-types'
import { WeComChatStreamCallbackProcessor } from './wecom-chat-callback.processor.js'

describe('WeComChatStreamCallbackProcessor', () => {
  function createFixture() {
    let storedState: any = null

    const wecomChannel = {
      sendTextByIntegrationId: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'reply-message-id'
      })
    }
    const conversationService = {
      setConversation: jest.fn().mockResolvedValue(undefined)
    }
    const runStateService = {
      get: jest.fn(async () => storedState),
      save: jest.fn(async (state: unknown) => {
        storedState = state
      }),
      clear: jest.fn(async () => {
        storedState = null
      })
    }

    const processor = new WeComChatStreamCallbackProcessor(
      wecomChannel as any,
      conversationService as any,
      runStateService as any,
      {} as any
    )

    return {
      processor,
      wecomChannel,
      runStateService
    }
  }

  function createContext() {
    return {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1',
      xpertId: 'xpert-1',
      integrationId: 'integration-1',
      chatId: 'chat-1',
      senderId: 'sender-1',
      responseUrl: 'https://example.com/respond',
      message: {
        id: 'wecom-message-id',
        messageId: 'chat-message-id',
        status: 'thinking',
        language: 'zh-Hans'
      }
    }
  }

  it('preserves markdown chunk boundaries before sending the final reply', async () => {
    const { processor, wecomChannel, runStateService } = createFixture()
    const context = createContext()

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 1,
          kind: 'stream',
          context,
          event: {
            data: {
              type: ChatMessageTypeEnum.MESSAGE,
              data: '\n根据知识库信息，装备评估按照成熟度等级分为一级至五级，具体评估方法如下：\n\n---\n'
            }
          }
        }
      } as any,
      {} as any
    )

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 2,
          kind: 'stream',
          event: {
            data: {
              type: ChatMessageTypeEnum.MESSAGE,
              data: '\n## 一级评估要点\n\n**要求1：** 应在关键工序应用自动化设备\n'
            }
          }
        }
      } as any,
      {} as any
    )

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 3,
          kind: 'complete'
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendTextByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        chatId: 'chat-1',
        senderId: 'sender-1',
        responseUrl: 'https://example.com/respond',
        preferResponseUrl: true,
        content:
          '根据知识库信息，装备评估按照成熟度等级分为一级至五级，具体评估方法如下：\n\n---\n\n## 一级评估要点\n\n**要求1：** 应在关键工序应用自动化设备'
      })
    )
    expect(runStateService.save).toHaveBeenCalledTimes(2)
    expect(runStateService.clear).toHaveBeenCalledWith('source-message-id')
  })

  it('does not include reasoning chunks in the final WeCom reply', async () => {
    const { processor, wecomChannel } = createFixture()
    const context = createContext()

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 1,
          kind: 'stream',
          context,
          event: {
            data: {
              type: ChatMessageTypeEnum.MESSAGE,
              data: {
                type: 'reasoning',
                text: '这是不该发给企微的推理'
              }
            }
          }
        }
      } as any,
      {} as any
    )

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 2,
          kind: 'stream',
          event: {
            data: {
              type: ChatMessageTypeEnum.MESSAGE,
              data: {
                type: 'text',
                text: '这是最终答案'
              }
            }
          }
        }
      } as any,
      {} as any
    )

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 3,
          kind: 'complete'
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendTextByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        content: '这是最终答案'
      })
    )
  })
})
