jest.mock('@xpert-ai/plugin-sdk', () => ({
  WorkflowTriggerStrategy: () => (target: unknown) => target,
  ChatChannel: () => (target: unknown) => target,
  defineChannelMessageType: (...parts: unknown[]) => parts.join(':'),
  AGENT_CHAT_DISPATCH_MESSAGE_TYPE: 'agent_chat_dispatch',
  HANDOFF_PERMISSION_SERVICE_TOKEN: Symbol('HANDOFF_PERMISSION_SERVICE_TOKEN'),
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN'),
  RequestContext: {
    currentTenantId: () => undefined,
    currentUserId: () => undefined,
    getLanguageCode: () => undefined,
    getOrganizationId: () => undefined
  }
}))

import { WechatPersonalTriggerStrategy } from './wechat-personal-trigger.strategy.js'
import { WechatPersonalMessage } from '../message.js'

describe('WechatPersonalTriggerStrategy', () => {
  it('replays published trigger bindings during server bootstrap', () => {
    const strategy = new WechatPersonalTriggerStrategy({} as any, {} as any, {} as any, {} as any, {} as any)

    expect(strategy.bootstrap).toEqual({
      mode: 'replay_publish',
      critical: false
    })
  })

  function createStrategy(bindingOverrides: Record<string, unknown> = {}) {
    const dispatchService = {
      enqueueDispatch: jest.fn().mockResolvedValue(undefined),
      buildDispatchMessage: jest.fn(async (payload) => ({
        id: 'handoff-1',
        payload
      }))
    }
    const aggregationService = {
      get: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      enqueueAggregate: jest.fn().mockResolvedValue({ id: 'aggregate-job-1' }),
      enqueueFlush: jest.fn().mockResolvedValue({ id: 'flush-job-1' }),
      withAggregateLock: jest.fn(async (_aggregateKey: string, callback: () => Promise<unknown>) => callback())
    }
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue({
        integrationId: 'integration-1',
        xpertId: 'xpert-1',
        sessionTimeoutSeconds: 3600,
        summaryWindowSeconds: 0,
        historyContextLimit: 20,
        ignoreSelfMessages: true,
        ...bindingOverrides
      })
    }
    const strategy = new WechatPersonalTriggerStrategy(
      dispatchService as any,
      aggregationService as any,
      {} as any,
      bindingRepository as any,
      { resolve: jest.fn() } as any
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
        language: 'zh-Hans',
        status: 'thinking'
      }
    )
    return { strategy, dispatchService, aggregationService, bindingRepository, wechatMessage }
  }

  it('prepends history context for immediate dispatch without conversationId', async () => {
    const { strategy, dispatchService, wechatMessage } = createStrategy()

    await expect(
      strategy.handleInboundMessage({
        integrationId: 'integration-1',
        input: '本次消息',
        wechatMessage,
        conversationId: 'old-conversation-1',
        conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        historyContext: '[历史上下文]\n用户(wxid_friend): 之前消息',
        currentInboundLogIds: ['inbound-log-1'],
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toBe(true)

    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.not.objectContaining({
        conversationId: expect.anything()
      })
    )
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '[历史上下文]\n用户(wxid_friend): 之前消息\n\n[本次用户消息]\n本次消息'
      })
    )
  })

  it('enqueues inbound aggregate jobs for debounced messages', async () => {
    const { strategy, aggregationService, wechatMessage } = createStrategy({
      summaryWindowSeconds: 5
    })

    await expect(
      strategy.handleInboundMessage({
        integrationId: 'integration-1',
        input: '第一条',
        wechatMessage,
        conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        historyContext: '[历史上下文]\n用户(wxid_friend): 更早消息',
        currentInboundLogIds: ['inbound-log-1'],
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toBe(true)

    expect(aggregationService.enqueueAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        integrationId: 'integration-1',
        xpertId: 'xpert-1',
        input: '第一条',
        currentInboundLogIds: ['inbound-log-1'],
        historyContext: '[历史上下文]\n用户(wxid_friend): 更早消息',
        summaryWindowSeconds: 5,
        sessionTimeoutSeconds: 3600,
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      })
    )
    expect(aggregationService.save).not.toHaveBeenCalled()
  })

  it('aggregates debounced inbound jobs under a Redis lock and schedules BullMQ flush', async () => {
    const { strategy, aggregationService } = createStrategy()
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      integrationId: 'integration-1',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 1,
      inputParts: ['第一条'],
      currentInboundLogIds: ['inbound-log-1'],
      historyContext: '[历史上下文]\n用户(wxid_friend): 更早消息',
      lastMessageAt: Date.now(),
      tenantId: 'tenant-1',
      latestMessage: {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend'
      }
    })

    await expect(
      strategy.processInboundAggregateJob({
        aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        integrationId: 'integration-1',
        xpertId: 'xpert-1',
        input: '第二条',
        historyContext: '[不应覆盖的历史]',
        currentInboundLogIds: ['inbound-log-2'],
        summaryWindowSeconds: 5,
        sessionTimeoutSeconds: 3600,
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        latestMessage: {
          integrationId: 'integration-1',
          uuid: 'uuid-1',
          contactId: 'wxid_friend',
          senderId: 'wxid_friend'
        }
      })
    ).resolves.toBeUndefined()

    expect(aggregationService.withAggregateLock).toHaveBeenCalledWith(
      'integration-1:uuid-1:wxid_friend:wxid_friend',
      expect.any(Function)
    )
    expect(aggregationService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 2,
        inputParts: ['第一条', '第二条'],
        currentInboundLogIds: ['inbound-log-1', 'inbound-log-2'],
        historyContext: '[历史上下文]\n用户(wxid_friend): 更早消息'
      }),
      expect.any(Number)
    )
    expect(aggregationService.enqueueFlush).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 2,
        inputParts: ['第一条', '第二条']
      }),
      5000
    )
  })

  it('flushes one debounced batch as one fresh-session dispatch with history context', async () => {
    const { strategy, dispatchService, aggregationService } = createStrategy()
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      integrationId: 'integration-1',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 3,
      inputParts: ['第一条', '第二条'],
      currentInboundLogIds: ['inbound-log-1', 'inbound-log-2'],
      historyContext: '[历史上下文]\nAgent: 之前回复',
      lastMessageAt: Date.now(),
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latestMessage: {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        language: 'zh-Hans',
        messageId: 'msg-2'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        version: 3
      })
    ).resolves.toBe(true)

    expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '[历史上下文]\nAgent: 之前回复\n\n[本次用户消息]\n第一条\n第二条'
      })
    )
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.not.objectContaining({
        conversationId: expect.anything()
      })
    )
    expect(aggregationService.clear).toHaveBeenCalledWith('integration-1:uuid-1:wxid_friend:wxid_friend')
  })
})
