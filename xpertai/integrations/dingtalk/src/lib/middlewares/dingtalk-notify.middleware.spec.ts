jest.mock('@xpert-ai/plugin-sdk', () => ({
	AgentMiddlewareStrategy: () => () => undefined,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  WORKSPACE_FILES_SOURCE: 'platform.workspace.files',
  WorkspaceFilesRuntimeCapability: Symbol.for('WorkspaceFilesRuntimeCapability')
}))

jest.mock('@xpert-ai/contracts', () => ({
	getToolCallIdFromConfig: jest.fn(() => 'tool-call-id')
}))

jest.mock('../conversation.service.js', () => ({
	DingTalkConversationService: class DingTalkConversationService {}
}))

jest.mock('../dingtalk-channel.strategy.js', () => ({
	DingTalkChannelStrategy: class DingTalkChannelStrategy {}
}))

import { DingTalkNotifyMiddleware } from './dingtalk-notify.middleware.js'

describe('DingTalkNotifyMiddleware', () => {
  function createFixture(options?: {
    workspaceCapability?: boolean
    middlewareConfig?: Record<string, unknown>
  }) {
    const fileBuffer = Buffer.from('report bytes')
    const workspaceFiles = {
      readRuntimeBuffer: jest.fn().mockResolvedValue({
        name: 'report.pdf',
        filePath: 'files/report.pdf',
        workspacePath: '/workspace/files/report.pdf',
        mimeType: 'application/pdf',
        size: fileBuffer.length,
        buffer: fileBuffer
      })
    }
    const dingtalkChannel = {
      uploadFile: jest.fn().mockResolvedValue({ mediaId: 'media-1' }),
      getCachedSessionWebhook: jest.fn().mockResolvedValue(null),
      createMessage: jest.fn().mockResolvedValue({
        data: { message_id: 'message-1' },
        degraded: false
      })
    }
    const conversationService = {
      setConversation: jest.fn().mockResolvedValue(undefined)
    }
    const context = {
      xpertId: 'xpert-1',
      conversationId: 'conversation-1',
      runtime:
        options?.workspaceCapability === false
          ? undefined
          : {
              capabilities: {
                get: jest.fn((key: unknown) =>
                  key === Symbol.for('WorkspaceFilesRuntimeCapability') ? workspaceFiles : undefined
                )
              }
            }
    }
    const strategy = new DingTalkNotifyMiddleware(dingtalkChannel as any, conversationService as any)
    const middleware = strategy.createMiddleware(
      options?.middlewareConfig ?? {
          integrationId: 'integration-1',
          recipient_type: 'chat_id',
          recipient_id: 'chat-1',
          defaults: { timeoutMs: 1000 }
        },
      context as any
    ) as any

    return { middleware, dingtalkChannel, workspaceFiles, fileBuffer }
  }

  function getTool(middleware: any, name: string) {
    return middleware.tools.find((item: any) => item.name === name)
  }

	it('uses the DingTalk trigger without exposing integration or recipient selectors', () => {
		const middleware = new DingTalkNotifyMiddleware({} as any, {} as any)
		const properties = middleware.meta.configSchema.properties as Record<string, any>

		expect(properties).not.toHaveProperty('integrationId')
		expect(properties).not.toHaveProperty('recipient_type')
		expect(properties).not.toHaveProperty('recipient_id')
		expect(properties).toHaveProperty('template')
		expect(properties).toHaveProperty('defaults')
	})

  it('accepts current-conversation mode without a configured integration or recipient', () => {
    expect(() => createFixture({ middlewareConfig: {} })).not.toThrow()
  })

  it('sends workspace files through DingTalk media upload without webhook fallback', async () => {
    const { middleware, dingtalkChannel, workspaceFiles, fileBuffer } = createFixture()
    const sendFile = getTool(middleware, 'dingtalk_send_file')

    await sendFile.invoke({
      path: 'files/report.pdf',
      originalName: 'report.pdf',
      mimeType: 'application/pdf'
    })

    expect(workspaceFiles.readRuntimeBuffer).toHaveBeenCalledWith({
      path: 'files/report.pdf',
      originalName: 'report.pdf',
      name: undefined,
      mimeType: 'application/pdf',
      mimetype: undefined,
      size: undefined
    })
    expect(dingtalkChannel.uploadFile).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        buffer: fileBuffer,
        fileName: 'report.pdf',
        fileType: 'pdf',
        mediaType: 'file',
        mimeType: 'application/pdf'
      }),
      1000
    )
    expect(dingtalkChannel.createMessage).toHaveBeenCalledWith('integration-1', {
      recipient: { type: 'chat_id', id: 'chat-1' },
      robotCodeOverride: null,
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

  it('sends workspace images through the DingTalk image message channel', async () => {
    const { middleware, dingtalkChannel, workspaceFiles } = createFixture()
    const imageBuffer = Buffer.from('chart bytes')
    workspaceFiles.readRuntimeBuffer.mockResolvedValueOnce({
      name: 'chart.png',
      filePath: 'files/chart.png',
      workspacePath: '/workspace/files/chart.png',
      mimeType: 'image/png',
      size: imageBuffer.length,
      buffer: imageBuffer
    })
    const sendFile = getTool(middleware, 'dingtalk_send_file')

    await sendFile.invoke({
      path: 'files/chart.png',
      originalName: 'chart.png',
      mimeType: 'image/png'
    })

    expect(dingtalkChannel.uploadFile).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        buffer: imageBuffer,
        fileName: 'chart.png',
        fileType: 'png',
        mediaType: 'image',
        mimeType: 'image/png'
      }),
      1000
    )
    expect(dingtalkChannel.createMessage).toHaveBeenCalledWith('integration-1', {
      recipient: { type: 'chat_id', id: 'chat-1' },
      robotCodeOverride: null,
      msgType: 'interactive',
      content: {
        msgKey: 'sampleImageMsg',
        msgParam: {
          photoURL: 'media-1'
        }
      },
      allowFallback: false
    })
  })

  it('sends a workspace file to the trusted current group conversation', async () => {
    const { middleware, dingtalkChannel } = createFixture()
    const sendFile = getTool(middleware, 'dingtalk_send_file')

    await sendFile.invoke(
      { path: 'files/report.pdf' },
      {
        configurable: {
          context: {
            sourceIntegrationId: 'integration-runtime',
            chatId: 'chat-runtime',
            chatType: 'group',
            senderRecipient: { type: 'user_id', id: 'user-runtime' },
            robotCode: 'robot-runtime'
          }
        }
      }
    )

    expect(dingtalkChannel.uploadFile).toHaveBeenCalledWith(
      'integration-runtime',
      expect.any(Object),
      1000
    )
    expect(dingtalkChannel.createMessage).toHaveBeenCalledWith(
      'integration-runtime',
      expect.objectContaining({
        recipient: { type: 'chat_id', id: 'chat-runtime' },
        robotCodeOverride: 'robot-runtime',
        allowFallback: false
      })
    )
  })

  it('sends an explicit text notification through the trusted trigger conversation', async () => {
    const { middleware, dingtalkChannel } = createFixture({ middlewareConfig: {} })
    const sendText = getTool(middleware, 'dingtalk_send_text_notification')

    await sendText.invoke(
      { content: '已完成' },
      {
        configurable: {
          context: {
            sourceIntegrationId: 'integration-runtime',
            chatId: 'chat-runtime',
            chatType: 'group',
            robotCode: 'robot-runtime',
            sessionWebhook: 'https://example.com/session'
          }
        }
      }
    )

    expect(dingtalkChannel.createMessage).toHaveBeenCalledWith('integration-runtime', {
      recipient: { type: 'chat_id', id: 'chat-runtime' },
      sessionWebhook: 'https://example.com/session',
      robotCodeOverride: 'robot-runtime',
      msgType: 'text',
      content: { text: '已完成' }
    })
  })

  it.each([
    {
      toolName: 'dingtalk_send_text_notification',
      input: { content: '已完成', sessionWebhook: 'http://127.0.0.1/internal' },
      msgType: 'text'
    },
    {
      toolName: 'dingtalk_send_rich_notification',
      input: { mode: 'markdown', markdown: '已完成', sessionWebhook: 'http://127.0.0.1/internal' },
      msgType: 'markdown'
    }
  ])('ignores tool-provided session webhooks for trusted $toolName routing', async ({ toolName, input, msgType }) => {
    const { middleware, dingtalkChannel } = createFixture({ middlewareConfig: {} })
    const send = getTool(middleware, toolName)

    await send.invoke(input, {
      configurable: {
        context: {
          sourceIntegrationId: 'integration-runtime',
          chatId: 'chat-runtime',
          chatType: 'group',
          robotCode: 'robot-runtime'
        }
      }
    })

    expect(dingtalkChannel.createMessage).toHaveBeenCalledWith(
      'integration-runtime',
      expect.objectContaining({
        recipient: { type: 'chat_id', id: 'chat-runtime' },
        sessionWebhook: undefined,
        msgType
      })
    )
  })

  it('preserves tool-provided session webhooks for legacy configured targets', async () => {
    const { middleware, dingtalkChannel } = createFixture()
    const sendText = getTool(middleware, 'dingtalk_send_text_notification')

    await sendText.invoke({
      content: '已完成',
      sessionWebhook: 'https://oapi.dingtalk.com/robot/send/legacy-session'
    })

    expect(dingtalkChannel.createMessage).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        recipient: { type: 'chat_id', id: 'chat-1' },
        sessionWebhook: 'https://oapi.dingtalk.com/robot/send/legacy-session'
      })
    )
  })

  it('sends a workspace file to the trusted sender in the current private conversation', async () => {
    const { middleware, dingtalkChannel } = createFixture({ middlewareConfig: {} })
    const sendFile = getTool(middleware, 'dingtalk_send_file')

    await sendFile.invoke(
      { path: 'files/report.pdf' },
      {
        configurable: {
          context: {
            sourceIntegrationId: 'integration-runtime',
            chatId: 'private-chat-runtime',
            chatType: 'private',
            senderRecipient: { type: 'user_id', id: 'staff-runtime' }
          }
        }
      }
    )

    expect(dingtalkChannel.createMessage).toHaveBeenCalledWith(
      'integration-runtime',
      expect.objectContaining({
        recipient: { type: 'user_id', id: 'staff-runtime' },
        allowFallback: false
      })
    )
  })

  it('does not let file tool arguments select a DingTalk target', async () => {
    const { middleware, dingtalkChannel } = createFixture({
      middlewareConfig: { integrationId: 'integration-config' }
    })
    const sendFile = getTool(middleware, 'dingtalk_send_file')

    await expect(
      sendFile.invoke({
        path: 'files/report.pdf',
        integrationId: 'integration-attacker',
        chatId: 'chat-attacker',
        recipient_id: 'user-attacker'
      } as any)
    ).rejects.toThrow('No trusted DingTalk recipient was found')
    expect(dingtalkChannel.uploadFile).not.toHaveBeenCalled()
  })

  it('requires the workspace runtime capability before uploading', async () => {
    const { middleware, dingtalkChannel } = createFixture({ workspaceCapability: false })
    const sendFile = getTool(middleware, 'dingtalk_send_file')

    await expect(sendFile.invoke({ path: 'files/report.pdf' })).rejects.toThrow(
      'platform.workspace.files runtime capability is required'
    )
    expect(dingtalkChannel.uploadFile).not.toHaveBeenCalled()
  })

  it('does not expose integration or recipient overrides in the file tool schema', () => {
    const { middleware } = createFixture()
    const sendFile = getTool(middleware, 'dingtalk_send_file')
    const shape = sendFile.schema.shape

    expect(shape).not.toHaveProperty('integrationId')
    expect(shape).not.toHaveProperty('recipient_id')
    expect(shape).not.toHaveProperty('recipient_type')
    expect(shape).not.toHaveProperty('tenantId')
    expect(shape).not.toHaveProperty('catalog')
  })
})
