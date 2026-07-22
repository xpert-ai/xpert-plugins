jest.mock('@xpert-ai/plugin-sdk', () => ({
  CHAT_CHANNEL_TEXT_LIMITS: { dingtalk: 3000 },
  ChatChannel: () => (target: unknown) => target,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN'
}))

import { DingTalkChannelStrategy } from './dingtalk-channel.strategy.js'

describe('DingTalkChannelStrategy', () => {
  function createFixture() {
    const strategy = new DingTalkChannelStrategy({ resolve: jest.fn() } as any)
    const client = {
      sendMessage: jest.fn().mockResolvedValue({ messageId: 'message-1', degraded: false })
    }
    jest.spyOn(strategy, 'uploadFile').mockResolvedValue({ mediaId: 'media-1' })
    jest.spyOn(strategy, 'getOrCreateDingTalkClientById').mockResolvedValue(client as any)

    return { strategy, client }
  }

  it('uploads and sends file content through the DingTalk sampleFile template', async () => {
    const { strategy, client } = createFixture()
    const content = Buffer.from('pdf bytes')

    await expect(
      strategy.sendMedia(
        {
          integration: { id: 'integration-1' },
          chatId: 'chat-1'
        } as any,
        {
          type: 'file',
          content,
          filename: 'report.pdf'
        }
      )
    ).resolves.toEqual({ success: true, messageId: 'message-1' })

    expect(strategy.uploadFile).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        buffer: content,
        fileName: 'report.pdf',
        fileType: 'pdf',
        mimeType: 'application/pdf'
      })
    )
    expect(client.sendMessage).toHaveBeenCalledWith({
      recipient: { type: 'chat_id', id: 'chat-1' },
      robotCodeOverride: undefined,
      msgType: 'interactive',
      content: {
        msgKey: 'sampleFile',
        msgParam: {
          mediaId: 'media-1',
          fileName: 'report.pdf',
          fileType: 'pdf'
        }
      },
      allowFallback: false
    })
  })

  it('sends private file content to the explicit user recipient', async () => {
    const { strategy, client } = createFixture()

    await strategy.sendMedia(
      {
        integration: { id: 'integration-1' },
        chatId: 'private-conversation-1',
        userId: 'staff-1'
      } as any,
      {
        type: 'file',
        content: Buffer.from('pdf bytes'),
        filename: 'report.pdf'
      }
    )

    expect(client.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: { type: 'user_id', id: 'staff-1' }
      })
    )
  })

  it.each(['image', 'audio', 'video'] as const)('rejects unsupported %s media without uploading', async (type) => {
    const { strategy, client } = createFixture()

    await expect(
      strategy.sendMedia(
        {
          integration: { id: 'integration-1' },
          chatId: 'chat-1'
        } as any,
        {
          type,
          content: Buffer.from('media bytes'),
          filename: 'media.bin'
        }
      )
    ).resolves.toEqual({
      success: false,
      error: 'DingTalk sendMedia currently supports file content only'
    })

    expect(strategy.uploadFile).not.toHaveBeenCalled()
    expect(client.sendMessage).not.toHaveBeenCalled()
  })
})
