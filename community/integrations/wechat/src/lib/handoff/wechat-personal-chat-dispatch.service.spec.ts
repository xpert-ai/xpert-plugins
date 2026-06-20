jest.mock('@xpert-ai/plugin-sdk', () => ({
  AGENT_CHAT_DISPATCH_MESSAGE_TYPE: 'agent_chat_dispatch',
  HANDOFF_PERMISSION_SERVICE_TOKEN: Symbol('HANDOFF_PERMISSION_SERVICE_TOKEN'),
  defineChannelMessageType: (channel: string, key: string, version: number) => `channel.${channel}.${key}.v${version}`,
  RequestContext: {
    currentUserId: () => undefined,
    getLanguageCode: () => undefined
  }
}))

import { WechatPersonalMessage } from '../message.js'
import { WechatPersonalChatRunStateService } from './wechat-personal-chat-run-state.service.js'
import { WechatPersonalChatDispatchService } from './wechat-personal-chat-dispatch.service.js'

describe('WechatPersonalChatDispatchService', () => {
  it('builds a fresh-session chat request even when a previous conversationId is provided', async () => {
    const runStateService = {
      save: jest.fn().mockResolvedValue(undefined)
    }
    const service = new WechatPersonalChatDispatchService(
      runStateService as unknown as WechatPersonalChatRunStateService,
      { resolve: jest.fn(() => ({ enqueue: jest.fn() })) } as any
    )
    const wechatMessage = new WechatPersonalMessage(
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
      organizationId: 'org-1'
    })

    expect(message.sessionKey).toBe('integration-1:uuid-1:wxid_friend:wxid_friend')
    expect((message.payload as any).request).toEqual({
      action: 'send',
      message: {
        clientMessageId: 'wechat-personal:integration-1:uuid-1:msg-1',
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
    expect((message.payload as any).callback.context).not.toHaveProperty('conversationId')
    expect(message.headers).not.toHaveProperty('conversationId')
  })
})
