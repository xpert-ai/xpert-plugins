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
      {
        getStatus: jest.fn(() => ({ connected: false, bindingCount: 0, bindings: [] }))
      } as any,
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

  it('guards concurrent dual callbacks before the message log is committed', () => {
    const service = createService(jest.fn())
    const legacyEvent = {
      ...baseEvent,
      source: 'legacy_callback' as const,
      messageId: '622368768'
    }
    const webhookEvent = {
      ...baseEvent,
      source: 'message_webhook' as const,
      messageId: '1981963849618395083'
    }

    const legacyKeys = (service as any).buildInboundDedupeKeys('integration-1', legacyEvent)
    const webhookKeys = (service as any).buildInboundDedupeKeys('integration-1', webhookEvent)
    const releaseLock = (service as any).releaseInboundDedupeLock.bind(service)

    expect(legacyKeys.some((key: string) => webhookKeys.includes(key))).toBe(true)
    expect((service as any).acquireInboundDedupeLock(legacyKeys)).toBe(true)
    expect((service as any).acquireInboundDedupeLock(webhookKeys)).toBe(false)

    releaseLock(legacyKeys)
    expect((service as any).acquireInboundDedupeLock(webhookKeys)).toBe(true)
    releaseLock(webhookKeys)
  })
})

describe('WechatPersonalConversationService fresh session history context', () => {
  const createdAt = new Date('2026-06-16T03:00:00.000Z')
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
    content: '新消息',
    timestamp: Date.now(),
    isSelf: false,
    raw: {},
    rawPayload: {}
  }

  function createQueryBuilder(logs: any[] = []) {
    return {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(logs)
    }
  }

  function createFullService(overrides: Record<string, any> = {}) {
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue({
        id: 'integration-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        options: {}
      })
    }
    const triggerStrategy = {
      getBinding: jest.fn().mockResolvedValue({
        integrationId: 'integration-1',
        xpertId: 'xpert-1',
        sessionTimeoutSeconds: 3600,
        summaryWindowSeconds: 0,
        historyContextLimit: 20,
        ignoreSelfMessages: true,
        chatFilterMode: 'all',
        groupTriggerMode: 'mention_or_keywords'
      }),
      handleInboundMessage: jest.fn().mockResolvedValue(true),
      clearBufferedConversation: jest.fn().mockResolvedValue(undefined)
    }
    const accountRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined)
    }
    const messageLogRepository = {
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(async (payload) => ({
        id: payload.direction === 'system' ? 'reset-log-1' : 'inbound-log-1',
        createdAt,
        ...payload
      })),
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => createQueryBuilder())
    }
    const service = new WechatPersonalConversationService(
      {} as any,
      triggerStrategy as any,
      {
        getStatus: jest.fn(() => ({ connected: false, bindingCount: 0, bindings: [] }))
      } as any,
      { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any,
      { delete: jest.fn().mockResolvedValue(undefined) } as any,
      accountRepository as any,
      messageLogRepository as any,
      { resolve: jest.fn(() => integrationPermissionService) } as any
    )

    return {
      service,
      integrationPermissionService,
      triggerStrategy,
      accountRepository,
      messageLogRepository,
      ...overrides
    }
  }

  it('dispatches every inbound message without reusing an existing conversationId', async () => {
    const { service, triggerStrategy } = createFullService()
    const historySpy = jest.spyOn(service as any, 'buildHistoryContext').mockResolvedValue('[历史上下文]')
    const getConversationSpy = jest.spyOn(service as any, 'getConversationState')

    await expect(
      service.handleInboundEvent(baseEvent, {
        integration: { id: 'integration-1' },
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

    expect(getConversationSpy).not.toHaveBeenCalled()
    expect(historySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        excludedLogIds: ['inbound-log-1'],
        limit: 20,
        timeoutSeconds: 3600
      })
    )
    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.not.objectContaining({
        conversationId: expect.anything()
      })
    )
    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        historyContext: '[历史上下文]',
        currentInboundLogIds: ['inbound-log-1']
      })
    )
  })

  it('writes a context reset marker and skips old history for /new commands', async () => {
    const { service, triggerStrategy, messageLogRepository } = createFullService()
    const historySpy = jest.spyOn(service as any, 'buildHistoryContext')

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          content: '/new 重新开始'
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

    expect(triggerStrategy.clearBufferedConversation).toHaveBeenCalledWith(
      'integration-1:uuid-1:wxid_friend:wxid_friend'
    )
    expect(messageLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'system',
        status: 'context_reset',
        content: 'history_context_reset',
        conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        xpertId: 'xpert-1'
      })
    )
    expect(historySpy).not.toHaveBeenCalled()
    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '重新开始',
        historyContext: undefined
      })
    )
  })

  it('formats only previous dispatched inbound and sent outbound logs as history context', async () => {
    const query = createQueryBuilder([
      {
        id: 'outbound-1',
        direction: 'outbound',
        status: 'sent',
        content: '上一轮 Agent 回复',
        sentAt: new Date('2026-06-16T02:59:00.000Z'),
        createdAt: new Date('2026-06-16T02:59:00.000Z')
      },
      {
        id: 'inbound-1',
        direction: 'inbound',
        status: 'dispatched',
        senderId: 'wxid_friend',
        content: '上一轮用户消息',
        createdAt: new Date('2026-06-16T02:58:00.000Z')
      }
    ])
    const { service, messageLogRepository } = createFullService()
    messageLogRepository.findOne.mockResolvedValueOnce({
      createdAt: new Date('2026-06-16T02:00:00.000Z')
    })
    messageLogRepository.createQueryBuilder.mockReturnValueOnce(query)

    const context = await (service as any).buildHistoryContext({
      integrationId: 'integration-1',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      limit: 20,
      timeoutSeconds: 3600,
      before: createdAt,
      excludedLogIds: ['inbound-log-1'],
      scope: {
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      }
    })

    expect(messageLogRepository.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: 'context_reset'
      }),
      order: {
        createdAt: 'DESC'
      }
    })
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('log.status = :outboundStatus'),
      expect.objectContaining({
        inboundStatus: 'dispatched',
        outboundStatus: 'sent'
      })
    )
    expect(query.andWhere).toHaveBeenCalledWith('log.id NOT IN (:...excludedLogIds)', {
      excludedLogIds: ['inbound-log-1']
    })
    expect(query.limit).toHaveBeenCalledWith(20)
    expect(context).toContain('[历史上下文')
    expect(context).toContain('用户(wxid_friend): 上一轮用户消息')
    expect(context).toContain('Agent: 上一轮 Agent 回复')
  })

  it('disables history context when historyContextLimit is 0', async () => {
    const { service, messageLogRepository } = createFullService()

    await expect(
      (service as any).buildHistoryContext({
        integrationId: 'integration-1',
        conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        xpertId: 'xpert-1',
        limit: 0,
        before: createdAt
      })
    ).resolves.toBeUndefined()

    expect(messageLogRepository.createQueryBuilder).not.toHaveBeenCalled()
  })
})
