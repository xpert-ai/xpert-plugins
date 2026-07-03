jest.mock('@xpert-ai/plugin-sdk', () => ({
  AGENT_CHAT_DISPATCH_MESSAGE_TYPE: 'agent_chat_dispatch',
  HANDOFF_PERMISSION_SERVICE_TOKEN: Symbol('HANDOFF_PERMISSION_SERVICE_TOKEN'),
  defineChannelMessageType: (channel: string, key: string, version: number) => `channel.${channel}.${key}.v${version}`,
  RequestContext: {
    currentUserId: () => undefined,
    getLanguageCode: () => undefined
  }
}))

import { WechatMessage } from '../message.js'
import { WechatChatRunStateService } from './wechat-chat-run-state.service.js'
import { WechatChatDispatchService } from './wechat-chat-dispatch.service.js'

describe('WechatChatDispatchService', () => {
  it('builds a fresh-session chat request even when a previous conversationId is provided', async () => {
    const runStateService = {
      save: jest.fn().mockResolvedValue(undefined)
    }
    const service = new WechatChatDispatchService(
      runStateService as unknown as WechatChatRunStateService,
      { resolve: jest.fn(() => ({ enqueue: jest.fn() })) } as any
    )
    const wechatMessage = new WechatMessage(
      {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        wechatChannel: {} as any
      },
      {
        messageId: 'msg-1',
        status: 'thinking',
        language: 'zh-Hans'
      }
    )

    const message = await service.buildDispatchMessage({
      xpertId: 'xpert-1',
      input: '你好',
      files: [
        {
          fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
          mimeType: 'image/png',
          originalName: 'wechat-image.png',
          fileKey: 'file-key-1'
        }
      ],
      wechatMessage,
      conversationId: 'old-conversation-1',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      currentInboundLogIds: ['inbound-log-1', '', 'inbound-log-2']
    })

    expect(message.sessionKey).toBe('integration-1:uuid-1:wxid_friend:wxid_friend')
    expect((message.payload as any).request).toEqual({
      action: 'send',
      message: {
        clientMessageId: 'wechat:integration-1:uuid-1:msg-1',
        input: {
          input: '你好',
          files: [
            {
              fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
              url: 'data:image/png;base64,iVBORw0KGgo=',
              mimeType: 'image/png',
              mimetype: 'image/png',
              originalName: 'wechat-image.png',
              name: 'wechat-image.png',
              extension: 'png',
              fileKey: 'file-key-1'
            }
          ],
          contactId: 'wxid_friend'
        }
      },
      state: {
        contactId: 'wxid_friend',
        human: {
          input: '你好',
          files: [
            {
              fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
              url: 'data:image/png;base64,iVBORw0KGgo=',
              mimeType: 'image/png',
              mimetype: 'image/png',
              originalName: 'wechat-image.png',
              name: 'wechat-image.png',
              extension: 'png',
              fileKey: 'file-key-1'
            }
          ],
          contactId: 'wxid_friend'
        }
      }
    })
    expect((message.payload as any).callback.headers).not.toHaveProperty('conversationId')
    expect((message.payload as any).callback.headers).not.toHaveProperty('userId')
    expect((message.payload as any).callback.context).not.toHaveProperty('conversationId')
    expect((message.payload as any).callback.context).not.toHaveProperty('userId')
    expect((message.payload as any).callback.context.currentInboundLogIds).toEqual([
      'inbound-log-1',
      'inbound-log-2'
    ])
    expect((message.payload as any).callback.context.message.id).toBe('inbound-log-1')
    expect((message.payload as any).options).toEqual(
      expect.objectContaining({
        runtimePrincipal: {
          type: 'assistant',
          xpertId: 'xpert-1',
          sourceIntegrationId: 'integration-1'
        },
        fromEndUserId: 'wxid_friend',
        context: expect.objectContaining({
          from: 'wechat',
          channelType: 'wechat',
          channelSource: 'wechat_webhook',
          sourceIntegrationId: 'integration-1',
          integrationId: 'integration-1',
          uuid: 'uuid-1',
          contactId: 'wxid_friend',
          contact_id: 'wxid_friend',
          chatId: 'wxid_friend',
          chat_id: 'wxid_friend',
          senderId: 'wxid_friend',
          sender_id: 'wxid_friend',
          channelUserId: 'wxid_friend',
          conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
          sourceMessageLogIds: ['inbound-log-1', 'inbound-log-2'],
          currentInboundLogIds: ['inbound-log-1', 'inbound-log-2']
        }),
        sourceMessageLogIds: ['inbound-log-1', 'inbound-log-2']
      })
    )
    expect((message.payload as any).options).not.toHaveProperty('user')
    expect(message.headers).not.toHaveProperty('conversationId')
    expect(message.headers).not.toHaveProperty('userId')
  })

  it('keeps workspace-backed file asset handles without requiring data urls', async () => {
    const runStateService = {
      save: jest.fn().mockResolvedValue(undefined)
    }
    const service = new WechatChatDispatchService(
      runStateService as unknown as WechatChatRunStateService,
      { resolve: jest.fn(() => ({ enqueue: jest.fn() })) } as any
    )
    const wechatMessage = new WechatMessage(
      {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        wechatChannel: {} as any
      },
      {
        messageId: 'msg-file-1',
        status: 'thinking',
        language: 'zh-Hans'
      }
    )

    const message = await service.buildDispatchMessage({
      xpertId: 'xpert-1',
      input: '这讲的什么内容',
      files: [
        {
          id: 'asset-1',
          fileId: 'asset-1',
          fileAssetId: 'asset-1',
          filePath: 'files/wechat/integration-1/uuid-1/msg-file-1/doc.docx',
          workspacePath: 'files/wechat/integration-1/uuid-1/msg-file-1/doc.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          originalName: '技术实现文档.docx',
          size: 22900,
          extension: 'docx'
        }
      ],
      wechatMessage,
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      tenantId: 'tenant-1',
      organizationId: 'org-1'
    })

    const requestFiles = (message.payload as any).request.message.input.files
    const stateFiles = (message.payload as any).request.state.human.files
    expect(requestFiles).toEqual([
      expect.objectContaining({
        id: 'asset-1',
        fileId: 'asset-1',
        fileAssetId: 'asset-1',
        filePath: 'files/wechat/integration-1/uuid-1/msg-file-1/doc.docx',
        workspacePath: 'files/wechat/integration-1/uuid-1/msg-file-1/doc.docx',
        originalName: '技术实现文档.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 22900,
        extension: 'docx'
      })
    ])
    expect(stateFiles).toEqual(requestFiles)
    expect(JSON.stringify((message.payload as any).request)).not.toContain('data:')
    expect(requestFiles[0]).not.toHaveProperty('fileUrl')
    expect(requestFiles[0]).not.toHaveProperty('url')
  })
})
