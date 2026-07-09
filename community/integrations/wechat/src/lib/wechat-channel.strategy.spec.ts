jest.mock('@xpert-ai/plugin-sdk', () => ({
  ChatChannel: () => (target: unknown) => target,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN')
}))

import { WechatChannelStrategy } from './wechat-channel.strategy.js'

describe('WechatChannelStrategy', () => {
  function createStrategy(options: Record<string, unknown> = {}) {
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
      })),
      enqueueFile: jest.fn(async () => ({
        success: true,
        queued: true,
        queueJobId: 'job-file-1',
        outboundLogId: 'log-file-1',
        scheduledAt: '2026-06-16T00:00:02.000Z'
      }))
    }
    const integration = {
      id: 'integration-1',
      provider: 'wechat',
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
    const strategy = new WechatChannelStrategy(outboundQueue as any, pluginContext as any)

    return { strategy, outboundQueue, integration }
  }

  it('formats markdown-like final replies before enqueueing outbound text', async () => {
    const { strategy, outboundQueue, integration } = createStrategy()

    await expect(
      strategy.sendTextByIntegrationId('integration-1', {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: '## Summary\n\n**Done**: see [details](https://example.com).'
      })
    ).resolves.toEqual(
      expect.objectContaining({ success: true, queued: true, queueJobId: 'job-1', outboundLogId: 'log-1' })
    )

    expect(outboundQueue.enqueueText).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: 'Summary\n\nDone: see details: https://example.com.'
      })
    )
  })

  it('queues outbound text even when an existing integration disabled the queue', async () => {
    const { strategy, outboundQueue, integration } = createStrategy({
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
    ).resolves.toEqual(expect.objectContaining({ success: true, queued: true, queueJobId: 'job-1' }))

    expect(outboundQueue.enqueueText).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: 'Direct send'
      })
    )
  })

  it('sends Agent markdown image replies as combined text, images, and a completion text', async () => {
    const { strategy, outboundQueue, integration } = createStrategy()

    await expect(
      strategy.sendReplyByIntegrationId('integration-1', {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: `文字一

![图](https://example.com/a.png)

文字二

![图二](https://example.com/b.png)`,
        source: 'agent_callback',
        delayMs: 1500
      })
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
        queued: true,
        items: [
          expect.objectContaining({ type: 'text', content: '文字一\n\n文字二' }),
          expect.objectContaining({ type: 'image', content: 'https://example.com/a.png' }),
          expect.objectContaining({ type: 'image', content: 'https://example.com/b.png' }),
          expect.objectContaining({ type: 'text', content: '2个图片已发完' })
        ]
      })
    )

    expect(outboundQueue.enqueueText).toHaveBeenNthCalledWith(
      1,
      integration,
      expect.objectContaining({
        content: '文字一\n\n文字二',
        source: 'agent_callback',
        delayMs: 1500
      })
    )
    expect(outboundQueue.enqueueImage).toHaveBeenNthCalledWith(
      1,
      integration,
      expect.objectContaining({
        imageUrl: 'https://example.com/a.png',
        source: 'agent_callback',
        delayMs: 1500
      })
    )
    expect(outboundQueue.enqueueImage).toHaveBeenNthCalledWith(
      2,
      integration,
      expect.objectContaining({
        imageUrl: 'https://example.com/b.png',
        source: 'agent_callback',
        delayMs: 1500
      })
    )
    expect(outboundQueue.enqueueText).toHaveBeenNthCalledWith(
      2,
      integration,
      expect.objectContaining({
        content: '2个图片已发完',
        source: 'agent_callback',
        delayMs: 1500
      })
    )
  })

  it('does not add a completion text when replies contain no images', async () => {
    const { strategy, outboundQueue, integration } = createStrategy()

    await expect(
      strategy.sendReplyByIntegrationId('integration-1', {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: '**纯文本**回复',
        source: 'agent_callback'
      })
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
        items: [expect.objectContaining({ type: 'text', content: '纯文本回复' })]
      })
    )

    expect(outboundQueue.enqueueText).toHaveBeenCalledTimes(1)
    expect(outboundQueue.enqueueText).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        content: '纯文本回复'
      })
    )
    expect(outboundQueue.enqueueImage).not.toHaveBeenCalled()
  })

  it('does not send the image completion text when image sending fails', async () => {
    const { strategy, outboundQueue } = createStrategy()
    outboundQueue.enqueueImage.mockResolvedValueOnce({
      success: false,
      error: 'image failed'
    } as any)

    await expect(
      strategy.sendReplyByIntegrationId('integration-1', {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: `文字

![图](https://example.com/a.png)`,
        source: 'agent_callback'
      })
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: 'image failed',
        items: [
          expect.objectContaining({ type: 'text', content: '文字' }),
          expect.objectContaining({ type: 'image', content: 'https://example.com/a.png', success: false })
        ]
      })
    )

    expect(outboundQueue.enqueueText).toHaveBeenCalledTimes(1)
    expect(outboundQueue.enqueueText).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: '文字'
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

  it('queues validated file sends by metadata without calling wx2.0 immediately', async () => {
    const { strategy, outboundQueue, integration } = createStrategy()

    await expect(
      strategy.sendFileByIntegrationId('integration-1', {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        file: {
          filePath: '/tmp/report.pdf',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          extension: 'pdf',
          size: 10,
          sha256: 'hash-1',
          fileContent: 'base64-file'
        },
        source: 'agent_tool',
        idempotencyKey: 'send-file-1'
      })
    ).resolves.toEqual(
      expect.objectContaining({ success: true, queued: true, queueJobId: 'job-file-1', outboundLogId: 'log-file-1' })
    )

    expect(outboundQueue.enqueueFile).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        type: 'file',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        filePath: '/tmp/report.pdf',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        size: 10,
        sha256: 'hash-1',
        source: 'agent_tool',
        idempotencyKey: 'send-file-1'
      })
    )
  })

  it('queues file sends even when an existing integration disabled the queue', async () => {
    const { strategy, outboundQueue, integration } = createStrategy({
      outboundQueue: {
        enabled: false
      }
    })

    await expect(
      strategy.sendFileByIntegrationId('integration-1', {
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        file: {
          filePath: '/tmp/report.pdf',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          extension: 'pdf',
          size: 10,
          sha256: 'hash-1',
          fileContent: 'base64-file'
        }
      })
    ).resolves.toEqual(expect.objectContaining({ success: true, queued: true, queueJobId: 'job-file-1' }))

    expect(outboundQueue.enqueueFile).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({
        type: 'file',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        filePath: '/tmp/report.pdf',
        fileName: 'report.pdf',
        size: 10,
        sha256: 'hash-1'
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
          expect.objectContaining({ type: 'image', content: 'http://localhost:3333/api/images/plugin.png' }),
          expect.objectContaining({ type: 'text', content: '1个图片已发完' })
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
