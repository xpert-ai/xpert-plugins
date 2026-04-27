jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  HandoffProcessorStrategy: () => (target: unknown) => target,
  defineChannelMessageType: (...parts: Array<string | number>) => parts.join('.')
}))

jest.mock('@xpert-ai/chatkit-types', () => ({
  ChatMessageEventTypeEnum: {
    ON_CONVERSATION_START: 'on_conversation_start',
    ON_CONVERSATION_END: 'on_conversation_end'
  },
  ChatMessageTypeEnum: {
    MESSAGE: 'message',
    EVENT: 'event'
  }
}))

jest.mock('@metad/contracts', () => ({
  XpertAgentExecutionStatusEnum: {
    ERROR: 'error',
    INTERRUPTED: 'interrupted'
  },
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

import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/chatkit-types'
import { XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { WeComChatStreamCallbackProcessor } from './wecom-chat-callback.processor.js'

describe('WeComChatStreamCallbackProcessor', () => {
  function createFixture() {
    let storedState: any = null

    const wecomChannel = {
      sendTextByIntegrationId: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'reply-message-id'
      }),
      sendReplyStreamByIntegrationId: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'stream-1'
      }),
      updateRobotTemplateCard: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'updated-message-id'
      }),
      sendRobotPayload: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'ack-message-id'
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
      runStateService as any
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
      chatType: 'private',
      chat_type: 'private',
      senderId: 'sender-1',
      responseUrl: 'https://example.com/respond',
      reqId: 'req-1',
      req_id: 'req-1',
      streamId: undefined,
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
    const context = {
      ...createContext(),
      responseStrategy: 'final_text'
    }

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
    const context = {
      ...createContext(),
      responseStrategy: 'final_text'
    }

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

  it('uses the same stream id when response strategy is reply_stream', async () => {
    const { processor, wecomChannel, runStateService } = createFixture()
    const context = {
      ...createContext(),
      streamId: 'stream-1',
      responseStrategy: 'reply_stream'
    }

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
          sequence: 2,
          kind: 'complete'
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendReplyStreamByIntegrationId).toHaveBeenNthCalledWith(
      1,
      'integration-1',
      expect.objectContaining({
        chatId: 'chat-1',
        senderId: 'sender-1',
        responseUrl: 'https://example.com/respond',
        reqId: 'req-1',
        streamId: 'stream-1',
        content: '这是最终答案',
        finish: false,
        nonBlocking: true
      })
    )
    expect(wecomChannel.sendReplyStreamByIntegrationId).toHaveBeenNthCalledWith(
      2,
      'integration-1',
      expect.objectContaining({
        chatId: 'chat-1',
        senderId: 'sender-1',
        responseUrl: 'https://example.com/respond',
        reqId: 'req-1',
        streamId: 'stream-1',
        content: '这是最终答案',
        finish: true
      })
    )
    expect(wecomChannel.updateRobotTemplateCard).not.toHaveBeenCalled()
    expect(wecomChannel.sendTextByIntegrationId).not.toHaveBeenCalled()
    expect(runStateService.clear).toHaveBeenCalledWith('source-message-id')
  })

  it('pushes visible answer deltas immediately before the complete frame', async () => {
    const { processor, wecomChannel } = createFixture()
    const context = {
      ...createContext(),
      streamId: 'stream-1',
      responseStrategy: 'reply_stream'
    }

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
                type: 'text',
                text: '\n## 一级评估要点'
              }
            }
          }
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendReplyStreamByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        streamId: 'stream-1',
        content: '\n## 一级评估要点',
        finish: false,
        nonBlocking: true
      })
    )
  })

  it('keeps only the latest visible content and retries until it is sent', async () => {
    jest.useFakeTimers()
    try {
      const { processor, wecomChannel } = createFixture()
      const context = {
        ...createContext(),
        streamId: 'stream-1',
        responseStrategy: 'reply_stream'
      }

      wecomChannel.sendReplyStreamByIntegrationId
        .mockResolvedValueOnce({
          success: true,
          messageId: 'stream-1',
          skipped: true
        })
        .mockResolvedValueOnce({
          success: true,
          messageId: 'stream-1',
          skipped: true
        })
        .mockResolvedValueOnce({
          success: true,
          messageId: 'stream-1'
        })

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
            sequence: 2,
            kind: 'stream',
            event: {
              data: {
                type: ChatMessageTypeEnum.MESSAGE,
                data: {
                  type: 'text',
                  text: '，请看下面'
                }
              }
            }
          }
        } as any,
        {} as any
      )

      expect(wecomChannel.sendReplyStreamByIntegrationId).toHaveBeenCalledTimes(2)
      expect(wecomChannel.sendReplyStreamByIntegrationId).toHaveBeenNthCalledWith(
        2,
        'integration-1',
        expect.objectContaining({
          streamId: 'stream-1',
          content: '这是最终答案，请看下面',
          finish: false,
          nonBlocking: true
        })
      )

      await jest.advanceTimersByTimeAsync(250)

      expect(wecomChannel.sendReplyStreamByIntegrationId).toHaveBeenCalledTimes(3)
      expect(wecomChannel.sendReplyStreamByIntegrationId).toHaveBeenNthCalledWith(
        3,
        'integration-1',
        expect.objectContaining({
          streamId: 'stream-1',
          content: '这是最终答案，请看下面',
          finish: false,
          nonBlocking: true
        })
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it('falls back to a new text reply when reply stream finish fails', async () => {
    const { processor, wecomChannel } = createFixture()
    const context = {
      ...createContext(),
      streamId: 'stream-1',
      responseStrategy: 'reply_stream'
    }
    wecomChannel.sendReplyStreamByIntegrationId
      .mockResolvedValueOnce({
        success: true,
        messageId: 'stream-1'
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'stream failed'
      })

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
          sequence: 2,
          kind: 'complete'
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendReplyStreamByIntegrationId).toHaveBeenNthCalledWith(
      2,
      'integration-1',
      expect.objectContaining({
        streamId: 'stream-1',
        finish: true,
        content: '这是最终答案'
      })
    )
    expect(wecomChannel.sendTextByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        chatId: 'chat-1',
        senderId: 'sender-1',
        responseUrl: undefined,
        reqId: undefined,
        content: '这是最终答案'
      })
    )
  })

  it('finishes the same stream with the error text', async () => {
    const { processor, wecomChannel } = createFixture()
    const context = {
      ...createContext(),
      streamId: 'stream-1',
      responseStrategy: 'reply_stream'
    }
    wecomChannel.sendReplyStreamByIntegrationId.mockResolvedValueOnce({
      success: false,
      error: 'stream failed'
    })

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 1,
          kind: 'error',
          context,
          error: '处理失败'
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendReplyStreamByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        streamId: 'stream-1',
        finish: true,
        content: '[企业微信对话失败]\n处理失败'
      })
    )
    expect(wecomChannel.sendRobotPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        chatId: 'chat-1',
        chatType: 'private',
        senderId: 'sender-1',
        responseUrl: undefined,
        reqId: undefined,
        preferActiveMessage: true,
        payload: expect.objectContaining({
          msgtype: 'template_card'
        })
      })
    )
  })

  it('localizes stream error replies when the callback context language is english', async () => {
    const { processor, wecomChannel } = createFixture()
    const context = {
      ...createContext(),
      streamId: 'stream-1',
      responseStrategy: 'reply_stream',
      message: {
        ...createContext().message,
        language: 'en'
      },
      preferLanguage: 'en'
    }

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 1,
          kind: 'error',
          context,
          error: 'Processing failed'
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendReplyStreamByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        streamId: 'stream-1',
        finish: true,
        content: '[WeCom conversation failed]\nProcessing failed'
      })
    )
  })

  it('falls back to a text error reply when reply stream error finish fails', async () => {
    const { processor, wecomChannel } = createFixture()
    const context = {
      ...createContext(),
      streamId: 'stream-1',
      responseStrategy: 'reply_stream'
    }
    wecomChannel.sendReplyStreamByIntegrationId.mockResolvedValueOnce({
      success: false,
      error: 'stream failed'
    })

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 1,
          kind: 'error',
          context,
          error: '处理失败'
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendTextByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        chatId: 'chat-1',
        senderId: 'sender-1',
        responseUrl: undefined,
        reqId: undefined,
        content: '[企业微信对话失败]\n处理失败'
      })
    )
    expect(wecomChannel.sendRobotPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        chatId: 'chat-1',
        senderId: 'sender-1',
        responseUrl: undefined,
        reqId: undefined,
        preferActiveMessage: true,
        payload: expect.objectContaining({
          msgtype: 'template_card'
        })
      })
    )
  })

  it('records a terminal error status and replays the localized error when complete arrives', async () => {
    const { processor, wecomChannel, runStateService } = createFixture()
    const context = {
      ...createContext(),
      responseStrategy: 'final_text'
    }

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 1,
          kind: 'stream',
          context,
          event: {
            data: {
              type: ChatMessageTypeEnum.EVENT,
              event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
              data: {
                status: XpertAgentExecutionStatusEnum.ERROR,
                error: '处理失败'
              }
            }
          }
        }
      } as any,
      {} as any
    )

    expect(runStateService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          message: expect.objectContaining({
            status: XpertAgentExecutionStatusEnum.ERROR
          })
        }),
        terminalError: '处理失败'
      })
    )

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 2,
          kind: 'complete'
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendTextByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        content: '[企业微信对话失败]\n处理失败'
      })
    )
    expect(wecomChannel.sendRobotPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        chatId: 'chat-1',
        chatType: 'private',
        preferActiveMessage: true,
        payload: expect.objectContaining({
          msgtype: 'template_card'
        })
      })
    )
  })

  it('records an interrupted terminal status on the current message', async () => {
    const { processor, runStateService } = createFixture()
    const context = {
      ...createContext(),
      responseStrategy: 'final_text'
    }

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 1,
          kind: 'stream',
          context,
          event: {
            data: {
              type: ChatMessageTypeEnum.EVENT,
              event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
              data: {
                status: XpertAgentExecutionStatusEnum.INTERRUPTED
              }
            }
          }
        }
      } as any,
      {} as any
    )

    expect(runStateService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          message: expect.objectContaining({
            status: XpertAgentExecutionStatusEnum.INTERRUPTED
          })
        }),
        terminalError: undefined
      })
    )
  })

  it('replays the interrupted terminal state instead of the success fallback when complete arrives', async () => {
    const { processor, wecomChannel } = createFixture()
    const context = {
      ...createContext(),
      responseStrategy: 'final_text'
    }

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 1,
          kind: 'stream',
          context,
          event: {
            data: {
              type: ChatMessageTypeEnum.EVENT,
              event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
              data: {
                status: XpertAgentExecutionStatusEnum.INTERRUPTED
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
          kind: 'complete'
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendTextByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        content: '[企业微信对话已中断]\n当前对话已中断。'
      })
    )
  })

  it('finishes the same stream with the interrupted terminal text when complete arrives', async () => {
    const { processor, wecomChannel } = createFixture()
    const context = {
      ...createContext(),
      streamId: 'stream-1',
      responseStrategy: 'reply_stream',
      message: {
        ...createContext().message,
        language: 'en'
      },
      preferLanguage: 'en'
    }

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 1,
          kind: 'stream',
          context,
          event: {
            data: {
              type: ChatMessageTypeEnum.EVENT,
              event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
              data: {
                status: XpertAgentExecutionStatusEnum.INTERRUPTED
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
          kind: 'complete'
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendReplyStreamByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        streamId: 'stream-1',
        finish: true,
        content: '[WeCom conversation interrupted]\nThe conversation was interrupted.'
      })
    )
  })

  it('finishes the same stream with the localized error when complete arrives after a terminal error event', async () => {
    const { processor, wecomChannel } = createFixture()
    const context = {
      ...createContext(),
      streamId: 'stream-1',
      responseStrategy: 'reply_stream',
      message: {
        ...createContext().message,
        language: 'en'
      },
      preferLanguage: 'en'
    }

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 1,
          kind: 'stream',
          context,
          event: {
            data: {
              type: ChatMessageTypeEnum.EVENT,
              event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
              data: {
                status: XpertAgentExecutionStatusEnum.ERROR,
                error: 'Processing failed'
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
          kind: 'complete'
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendReplyStreamByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        streamId: 'stream-1',
        finish: true,
        content: '[WeCom conversation failed]\nProcessing failed'
      })
    )
    expect(wecomChannel.sendRobotPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        chatId: 'chat-1',
        chatType: 'private',
        preferActiveMessage: true,
        payload: expect.objectContaining({
          msgtype: 'template_card'
        })
      })
    )
  })

  it('does not fall back to conversation id when the stream completes without visible text', async () => {
    const { processor, wecomChannel } = createFixture()
    const context = {
      ...createContext(),
      conversationId: 'conversation-1',
      responseStrategy: 'final_text'
    }

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 1,
          kind: 'complete',
          context
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendTextByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        content: '[企业微信回复]\n已处理完成。'
      })
    )
  })

  it('localizes the completion fallback when the callback context language is english', async () => {
    const { processor, wecomChannel } = createFixture()
    const context = {
      ...createContext(),
      responseStrategy: 'final_text',
      message: {
        ...createContext().message,
        language: 'en'
      },
      preferLanguage: 'en'
    }

    await processor.process(
      {
        payload: {
          sourceMessageId: 'source-message-id',
          sequence: 1,
          kind: 'complete',
          context
        }
      } as any,
      {} as any
    )

    expect(wecomChannel.sendTextByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        content: '[WeCom reply]\nProcessed.'
      })
    )
  })
})
