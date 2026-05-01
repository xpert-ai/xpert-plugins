jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  CHAT_CHANNEL_TEXT_LIMITS: { wecom: 1000 },
  ChatChannel: () => (target: unknown) => target,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
  WorkflowTriggerStrategy: () => (target: unknown) => target,
  defineChannelMessageType: (...parts: Array<string | number>) => parts.join('.'),
  runWithRequestContext: async (_context: unknown, _store: unknown, callback: () => unknown) => await callback()
}))

import { WeComChannelStrategy } from './wecom-channel.strategy.js'

describe('WeComChannelStrategy', () => {
  function createFixture() {
    const pluginContext = {
      resolve: jest.fn()
    }
    const longConnection = {
      sendRespondMessage: jest.fn(),
      sendReplyStream: jest.fn().mockResolvedValue({
        reqId: 'req-1',
        errcode: 0,
        errmsg: 'ok',
        raw: {}
      }),
      sendUpdateMessage: jest.fn(),
      sendActiveMessage: jest.fn()
    }

    const strategy = new WeComChannelStrategy(pluginContext as any, longConnection as any)

    return {
      strategy
    }
  }

  it('converts standard markdown into WeCom-compatible markdown before sending payloads', async () => {
    const { strategy } = createFixture()

    jest.spyOn(strategy as any, 'readIntegration').mockResolvedValue({
      id: 'integration-1',
      provider: 'wecom',
      options: {
        timeoutMs: 1200
      }
    })
    jest.spyOn(strategy as any, 'resolveRobotContext').mockResolvedValue({
      integrationId: 'integration-1',
      provider: 'wecom',
      senderId: 'sender-1',
      chatId: 'chat-1',
      responseUrl: 'https://example.com/respond',
      reqId: null
    })
    const sendToResponseUrlPayload = jest.spyOn(strategy as any, 'sendToResponseUrlPayload').mockResolvedValue({
      success: true,
      messageId: 'message-1'
    })

    await strategy.sendRobotPayload({
      integrationId: 'integration-1',
      chatId: 'chat-1',
      senderId: 'sender-1',
      responseUrl: 'https://example.com/respond',
      payload: {
        msgtype: 'markdown',
        markdown: {
          content: ['##一级评估要点', '', '| 指标 | 说明 |', '| --- | --- |', '| 自动化 | 已覆盖 |'].join('\n')
        }
      }
    })

    expect(sendToResponseUrlPayload).toHaveBeenCalledWith(
      'https://example.com/respond',
      {
        msgtype: 'markdown',
        markdown: {
          content: ['## 一级评估要点', '', '- **指标:** 自动化; **说明:** 已覆盖'].join('\n')
        }
      },
      1200
    )
  })

  it('routes template card updates through long connection reqId', async () => {
    const { strategy } = createFixture()

    jest.spyOn(strategy as any, 'readIntegration').mockResolvedValue({
      id: 'integration-1',
      provider: 'wecom_long',
      options: {
        timeoutMs: 1200
      }
    })
    jest.spyOn(strategy as any, 'resolveRobotContext').mockResolvedValue({
      integrationId: 'integration-1',
      provider: 'wecom_long',
      senderId: 'sender-1',
      chatId: 'chat-1',
      responseUrl: null,
      reqId: 'req-1'
    })

    await strategy.updateRobotTemplateCard({
      integrationId: 'integration-1',
      senderId: 'sender-1',
      chatId: 'chat-1',
      reqId: 'req-1',
      templateCard: {
        card_type: 'text_notice'
      }
    })

    expect((strategy as any).longConnection.sendUpdateMessage).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      reqId: 'req-1',
      templateCard: {
        card_type: 'text_notice'
      },
      timeoutMs: 1200
    })
  })

  it('treats long-connection single chats as private even when chatid differs from sender', () => {
    const { strategy } = createFixture()

    const event = strategy.normalizeWebhookEvent({
      chatid: 'chat-1',
      chattype: 'single',
      from: {
        userid: 'sender-1'
      },
      text: {
        content: 'hi'
      }
    } as any)

    expect(event).toEqual(
      expect.objectContaining({
        chatId: 'chat-1',
        senderId: 'sender-1',
        chatType: 'private'
      })
    )
  })

  it('routes restart cards through active send using senderId for private long connections', async () => {
    const { strategy } = createFixture()

    jest.spyOn(strategy as any, 'readIntegration').mockResolvedValue({
      id: 'integration-1',
      provider: 'wecom_long',
      options: {
        timeoutMs: 1200
      }
    })
    jest.spyOn(strategy as any, 'resolveRobotContext').mockResolvedValue({
      integrationId: 'integration-1',
      provider: 'wecom_long',
      senderId: 'sender-1',
      chatId: 'chat-1',
      responseUrl: null,
      reqId: 'req-1'
    })

    await strategy.sendRobotPayload({
      integrationId: 'integration-1',
      senderId: 'sender-1',
      chatId: 'chat-1',
      chatType: 'private',
      reqId: 'req-1',
      preferActiveMessage: true,
      payload: {
        msgtype: 'template_card',
        template_card: {
          card_type: 'text_notice'
        }
      }
    })

    expect((strategy as any).longConnection.sendActiveMessage).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      chatId: 'sender-1',
      body: {
        msgtype: 'template_card',
        template_card: {
          card_type: 'text_notice'
        }
      },
      timeoutMs: 1200
    })
    expect((strategy as any).longConnection.sendRespondMessage).not.toHaveBeenCalled()
  })

  it('routes replyStream through long connection reqId and normalizes markdown', async () => {
    const { strategy } = createFixture()

    jest.spyOn(strategy as any, 'readIntegration').mockResolvedValue({
      id: 'integration-1',
      provider: 'wecom_long',
      options: {
        timeoutMs: 1200
      }
    })
    jest.spyOn(strategy as any, 'resolveRobotContext').mockResolvedValue({
      integrationId: 'integration-1',
      provider: 'wecom_long',
      senderId: 'sender-1',
      chatId: 'chat-1',
      responseUrl: null,
      reqId: 'req-1'
    })

    await strategy.sendReplyStreamByIntegrationId('integration-1', {
      senderId: 'sender-1',
      chatId: 'chat-1',
      reqId: 'req-1',
      streamId: 'stream-1',
      content: ['##一级评估要点', '', '| 指标 | 说明 |', '| --- | --- |', '| 自动化 | 已覆盖 |'].join('\n'),
      finish: true
    })

    expect((strategy as any).longConnection.sendReplyStream).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      reqId: 'req-1',
      streamId: 'stream-1',
      content: ['## 一级评估要点', '', '- **指标:** 自动化; **说明:** 已覆盖'].join('\n'),
      finish: true,
      msgItem: undefined,
      feedback: undefined,
      nonBlocking: false,
      timeoutMs: 1200
    })
  })

  it('passes through nonBlocking stream updates for live WeCom streaming', async () => {
    const { strategy } = createFixture()

    jest.spyOn(strategy as any, 'readIntegration').mockResolvedValue({
      id: 'integration-1',
      provider: 'wecom_long',
      options: {
        timeoutMs: 1200
      }
    })
    jest.spyOn(strategy as any, 'resolveRobotContext').mockResolvedValue({
      integrationId: 'integration-1',
      provider: 'wecom_long',
      senderId: 'sender-1',
      chatId: 'chat-1',
      responseUrl: null,
      reqId: 'req-1'
    })

    await strategy.sendReplyStreamByIntegrationId('integration-1', {
      senderId: 'sender-1',
      chatId: 'chat-1',
      reqId: 'req-1',
      streamId: 'stream-1',
      content: '这是中间流式内容',
      finish: false,
      nonBlocking: true
    })

    expect((strategy as any).longConnection.sendReplyStream).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      reqId: 'req-1',
      streamId: 'stream-1',
      content: '这是中间流式内容',
      finish: false,
      msgItem: undefined,
      feedback: undefined,
      nonBlocking: true,
      timeoutMs: 1200
    })
  })

  it('localizes conversation error replies with the integration preferred language', async () => {
    const { strategy } = createFixture()

    jest.spyOn(strategy as any, 'readIntegration').mockResolvedValue({
      id: 'integration-1',
      provider: 'wecom_long',
      options: {
        preferLanguage: 'en'
      }
    })
    const sendTextByIntegrationId = jest
      .spyOn(strategy, 'sendTextByIntegrationId')
      .mockResolvedValue({
        success: true,
        messageId: 'message-1'
      } as any)
    const sendRobotPayload = jest.spyOn(strategy, 'sendRobotPayload').mockResolvedValue({
      success: true,
      messageId: 'message-2'
    } as any)

    await strategy.errorMessage(
      {
        integrationId: 'integration-1',
        chatId: 'chat-1',
        chatType: 'private',
        senderId: 'sender-1',
        reqId: 'req-1'
      },
      new Error('Missing trigger binding')
    )

    expect(sendTextByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        content: '[WeCom conversation error]\nMissing trigger binding'
      })
    )
    expect(sendRobotPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        chatType: 'private',
        preferActiveMessage: true,
        payload: expect.objectContaining({
          msgtype: 'template_card'
        })
      })
    )
  })
})
