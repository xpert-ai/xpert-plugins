jest.mock('@xpert-ai/plugin-sdk', () => ({
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN'),
  RequestContext: {
    currentTenantId: () => undefined,
    currentUserId: () => undefined,
    getOrganizationId: () => undefined
  }
}))

jest.mock('./wechat-personal-channel.strategy.js', () => ({
  WechatPersonalChannelStrategy: class WechatPersonalChannelStrategy {}
}))

jest.mock('./workflow/wechat-personal-trigger.strategy.js', () => ({
  WechatPersonalTriggerStrategy: class WechatPersonalTriggerStrategy {}
}))

import { FindOperator } from 'typeorm'
import { WechatPersonalConversationService } from './conversation.service.js'
import { WechatPersonalInboundEvent } from './types.js'

describe('WechatPersonalConversationService duplicate detection', () => {
  const baseEvent: WechatPersonalInboundEvent = {
    source: 'message_webhook',
    uuid: 'uuid-1',
    ownerWxid: 'wxid_owner',
    contactId: 'wxid_friend',
    senderId: 'wxid_friend',
    chatId: 'wxid_friend',
    chatType: 'private',
    messageId: 'msg-1',
    msgType: 1,
    content: '你好',
    timestamp: Date.now(),
    isSelf: false,
    raw: {},
    rawPayload: {}
  }

  function createService(count: jest.Mock) {
    return new WechatPersonalConversationService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { count } as any,
      {} as any
    )
  }

  it('treats the same inbound message id as duplicate', async () => {
    const count = jest.fn().mockResolvedValueOnce(1)
    const service = createService(count)

    await expect((service as any).isDuplicateInbound('integration-1', baseEvent)).resolves.toBe(true)
    expect(count).toHaveBeenCalledTimes(1)
    expect(count).toHaveBeenCalledWith({
      where: {
        integrationId: 'integration-1',
        messageId: 'msg-1',
        direction: 'inbound'
      }
    })
  })

  it('scopes duplicate checks by tenant and organization when available', async () => {
    const count = jest.fn().mockResolvedValueOnce(1)
    const service = createService(count)

    await expect(
      (service as any).isDuplicateInbound('integration-1', baseEvent, {
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      })
    ).resolves.toBe(true)

    expect(count).toHaveBeenCalledWith({
      where: {
        integrationId: 'integration-1',
        messageId: 'msg-1',
        direction: 'inbound',
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      }
    })
  })

  it('deduplicates wx2.0 dual callbacks when the legacy numeric id loses precision', async () => {
    const count = jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    const service = createService(count)

    await expect(
      (service as any).isDuplicateInbound('integration-1', {
        ...baseEvent,
        messageId: '8856336577595259000'
      })
    ).resolves.toBe(true)

    expect(count).toHaveBeenCalledTimes(2)
    expect(count).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        direction: 'inbound',
        content: '你好',
        createdAt: expect.any(FindOperator)
      })
    })
  })
})
