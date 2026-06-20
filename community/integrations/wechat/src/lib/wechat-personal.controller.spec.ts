let mockCurrentUser: any

jest.mock('@xpert-ai/plugin-sdk', () => ({
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN'),
  PluginWebhookAuth: () => () => undefined,
  PluginWebhookAuthGuard: class PluginWebhookAuthGuard {},
  runWithRequestContext: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    mockCurrentUser = req.user
    next()
  },
  RequestContext: {
    currentApiKey: () => mockCurrentUser?.apiKey ?? null
  }
}))

jest.mock('./conversation.service.js', () => ({
  WechatPersonalConversationService: class WechatPersonalConversationService {}
}))

jest.mock('./wechat-personal-channel.strategy.js', () => ({
  WechatPersonalChannelStrategy: class WechatPersonalChannelStrategy {}
}))

import { INTEGRATION_PERMISSION_SERVICE_TOKEN, RequestContext } from '@xpert-ai/plugin-sdk'
import { WECHAT_PERSONAL_PROVIDER_KEY } from './constants.js'
import { WechatPersonalController } from './wechat-personal.controller.js'

describe('WechatPersonalController webhook principal', () => {
  beforeEach(() => {
    mockCurrentUser = null
  })

  it('runs inbound webhook handling with the guarded integration api principal', async () => {
    const integration = {
      id: 'integration-1',
      provider: WECHAT_PERSONAL_PROVIDER_KEY,
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      options: {
        preferLanguage: 'zh-Hans'
      }
    }
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue(integration),
      findAll: jest.fn()
    }
    const pluginContext = {
      resolve: jest.fn((token) => {
        if (token === INTEGRATION_PERMISSION_SERVICE_TOKEN) {
          return integrationPermissionService
        }
        throw new Error('unexpected token')
      })
    }
    const event = {
      source: 'message_webhook',
      uuid: 'uuid-1',
      ownerWxid: 'wxid_owner',
      contactId: 'wxid_friend',
      senderId: 'wxid_friend',
      chatId: 'wxid_friend',
      chatType: 'private',
      messageId: 'msg-1',
      msgType: 1,
      messageKind: 'text',
      content: 'hello',
      timestamp: Date.now(),
      isSelf: false,
      raw: {},
      rawPayload: {}
    }
    const conversation = {
      handleInboundEvent: jest.fn().mockImplementation(async () => {
        expect(RequestContext.currentApiKey()).toEqual(
          expect.objectContaining({
            type: 'integration',
            entityId: 'integration-1'
          })
        )
      })
    }
    const wechatChannel = {
      normalizeWebhookEvent: jest.fn().mockReturnValue(event)
    }
    const controller = new WechatPersonalController(conversation as any, wechatChannel as any, pluginContext as any)

    await expect(
      controller.webhook(
        'integration-1',
        {
          user: {
            id: 'integration-user-1',
            tenantId: 'tenant-1',
            apiKey: {
              token: 'integration-webhook:integration-1',
              type: 'integration',
              entityId: 'integration-1',
              tenantId: 'tenant-1',
              organizationId: 'org-1'
            },
            principalType: 'api_key'
          },
          headers: {
            'tenant-id': 'tenant-1',
            'organization-id': 'org-1',
            'x-scope-level': 'organization'
          }
        },
        {
          msgtype: 1,
          content: 'hello'
        }
      )
    ).resolves.toBe('success')

    expect(conversation.handleInboundEvent).toHaveBeenCalledWith(event, {
      integration,
      tenantId: 'tenant-1',
      organizationId: 'org-1'
    })
  })

  it('rejects webhook calls when the generic guard did not attach an integration principal', async () => {
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue({
        id: 'integration-1',
        provider: WECHAT_PERSONAL_PROVIDER_KEY,
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        options: {}
      }),
      findAll: jest.fn()
    }
    const pluginContext = {
      resolve: jest.fn(() => integrationPermissionService)
    }
    const controller = new WechatPersonalController(
      {
        handleInboundEvent: jest.fn()
      } as any,
      {
        normalizeWebhookEvent: jest.fn().mockReturnValue({
          source: 'message_webhook',
          uuid: 'uuid-1',
          ownerWxid: 'wxid_owner',
          contactId: 'wxid_friend',
          senderId: 'wxid_friend',
          chatId: 'wxid_friend',
          chatType: 'private',
          messageId: 'msg-1',
          msgType: 1,
          messageKind: 'text',
          content: 'hello',
          timestamp: Date.now(),
          isSelf: false,
          raw: {},
          rawPayload: {}
        })
      } as any,
      pluginContext as any
    )

    await expect(controller.webhook('integration-1', { headers: {} }, { msgtype: 1 })).rejects.toThrow(
      'Personal WeChat webhook principal is required'
    )
  })
})
