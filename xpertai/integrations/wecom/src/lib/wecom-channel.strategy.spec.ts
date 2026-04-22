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
})
