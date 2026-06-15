jest.mock('@xpert-ai/plugin-sdk', () => ({
  ChatChannel: () => (target: unknown) => target,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN')
}))

import { WechatPersonalChannelStrategy } from './wechat-personal-channel.strategy.js'

describe('WechatPersonalChannelStrategy', () => {
  it('formats markdown-like final replies before sending text to wx2.0', async () => {
    const client = {
      sendText: jest.fn(async () => ({ success: true, messageId: 'sent-1' }))
    }
    const integration = {
      id: 'integration-1',
      options: {
        baseUrl: 'http://127.0.0.1:8201'
      }
    }
    const integrationPermissionService = {
      read: jest.fn(async () => integration)
    }
    const pluginContext = {
      resolve: jest.fn(() => integrationPermissionService)
    }
    const strategy = new WechatPersonalChannelStrategy(client as any, pluginContext as any)

    await expect(
      strategy.sendTextByIntegrationId('integration-1', {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: '## Summary\n\n**Done**: see [details](https://example.com).'
      })
    ).resolves.toEqual(expect.objectContaining({ success: true, messageId: 'sent-1' }))

    expect(client.sendText).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: 'Summary\n\nDone: see details: https://example.com.'
      })
    )
  })
})
