jest.mock('@xpert-ai/plugin-sdk', () => ({
  ChatChannel: () => (target: unknown) => target,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN')
}))

import { WechatPersonalChannelStrategy } from './wechat-personal-channel.strategy.js'

describe('WechatPersonalChannelStrategy', () => {
  function createStrategy(options: Record<string, unknown> = {}) {
    const client = {
      sendText: jest.fn(async () => ({ success: true, messageId: 'sent-1' })),
      sendImage: jest.fn(async () => ({ success: true, messageId: 'image-1' }))
    }
    const outboundQueue = {
      enqueueText: jest.fn(async () => ({
        success: true,
        queued: true,
        queueJobId: 'job-1',
        outboundLogId: 'log-1',
        scheduledAt: '2026-06-16T00:00:00.000Z'
      })),
      enqueueImage: jest.fn(async () => ({
        success: true,
        queued: true,
        queueJobId: 'job-image-1',
        outboundLogId: 'log-image-1',
        scheduledAt: '2026-06-16T00:00:01.000Z'
      }))
    }
    const integration = {
      id: 'integration-1',
      provider: 'wechat-personal',
      options: {
        baseUrl: 'http://127.0.0.1:8201',
        ...options
      }
    }
    const integrationPermissionService = {
      read: jest.fn(async () => integration)
    }
    const pluginContext = {
      resolve: jest.fn(() => integrationPermissionService)
    }
    const strategy = new WechatPersonalChannelStrategy(client as any, outboundQueue as any, pluginContext as any)

    return { strategy, client, outboundQueue, integration }
  }

  it('formats markdown-like final replies before enqueueing outbound text', async () => {
    const { strategy, client, outboundQueue, integration } = createStrategy()

    await expect(
      strategy.sendTextByIntegrationId('integration-1', {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: '## Summary\n\n**Done**: see [details](https://example.com).'
      })
    ).resolves.toEqual(
      expect.objectContaining({ success: true, queued: true, queueJobId: 'job-1', outboundLogId: 'log-1' })
    )

    expect(client.sendText).not.toHaveBeenCalled()
    expect(outboundQueue.enqueueText).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: 'Summary\n\nDone: see details: https://example.com.'
      })
    )
  })

  it('sends directly only when the outbound queue is disabled for the integration', async () => {
    const { strategy, client, outboundQueue, integration } = createStrategy({
      outboundQueue: {
        enabled: false
      }
    })

    await expect(
      strategy.sendTextByIntegrationId('integration-1', {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: '**Direct** send'
      })
    ).resolves.toEqual(expect.objectContaining({ success: true, messageId: 'sent-1' }))

    expect(outboundQueue.enqueueText).not.toHaveBeenCalled()
    expect(client.sendText).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: 'Direct send'
      })
    )
  })

  it('splits Agent markdown image replies and enqueues parts in order', async () => {
    const { strategy, outboundQueue, integration } = createStrategy()

    await expect(
      strategy.sendReplyByIntegrationId('integration-1', {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: `文字一

![图](https://example.com/a.png)

文字二`,
        source: 'agent_callback'
      })
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
        queued: true,
        items: [
          expect.objectContaining({ type: 'text', content: '文字一' }),
          expect.objectContaining({ type: 'image', content: 'https://example.com/a.png' }),
          expect.objectContaining({ type: 'text', content: '文字二' })
        ]
      })
    )

    expect(outboundQueue.enqueueText).toHaveBeenNthCalledWith(
      1,
      integration,
      expect.objectContaining({
        content: '文字一',
        source: 'agent_callback'
      })
    )
    expect(outboundQueue.enqueueImage).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        imageUrl: 'https://example.com/a.png',
        source: 'agent_callback'
      })
    )
    expect(outboundQueue.enqueueText).toHaveBeenNthCalledWith(
      2,
      integration,
      expect.objectContaining({
        content: '文字二',
        source: 'agent_callback'
      })
    )
  })

  it('supports sendMedia for image URLs', async () => {
    const { strategy, outboundQueue, integration } = createStrategy()

    await expect(
      strategy.sendMedia(
        {
          integration,
          chatId: 'wxid_friend',
          uuid: 'uuid-1'
        } as any,
        {
          type: 'image',
          url: 'https://example.com/a.png'
        }
      )
    ).resolves.toEqual(expect.objectContaining({ success: true, queued: true }))

    expect(outboundQueue.enqueueImage).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        imageUrl: 'https://example.com/a.png'
      })
    )
  })

  it('treats markdown links to image resources as image replies', async () => {
    const { strategy, outboundQueue, integration } = createStrategy()

    await expect(
      strategy.sendReplyByIntegrationId('integration-1', {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: '插件管理界面：[截图](http://localhost:3333/api/images/plugin.png)',
        source: 'agent_callback'
      })
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
        queued: true,
        items: [
          expect.objectContaining({ type: 'text', content: '插件管理界面：' }),
          expect.objectContaining({ type: 'image', content: 'http://localhost:3333/api/images/plugin.png' })
        ]
      })
    )

    expect(outboundQueue.enqueueImage).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        imageUrl: 'http://localhost:3333/api/images/plugin.png',
        source: 'agent_callback'
      })
    )
  })
})
