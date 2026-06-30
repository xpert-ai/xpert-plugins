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

import { WechatTriggerStrategy } from './wechat-trigger.strategy.js'
import { WechatMessage } from '../message.js'

describe('WechatTriggerStrategy', () => {
  it('replays published trigger bindings during server bootstrap', () => {
    const strategy = new WechatTriggerStrategy({} as any, {} as any, {} as any, {} as any, {} as any, {} as any)

    expect(strategy.bootstrap).toEqual({
      mode: 'replay_publish',
      critical: false
    })
  })

  it('exposes translated labels for trigger select options', () => {
    const strategy = new WechatTriggerStrategy({} as any, {} as any, {} as any, {} as any, {} as any, {} as any)
    const properties = (strategy.meta.configSchema as any).properties

    expect(properties.selfMessagePolicy['x-ui'].enumLabels.history_only.zh_Hans).toBe('只写入历史')
    expect(properties.chatFilterMode['x-ui'].enumLabels.group_only.zh_Hans).toBe('仅群聊')
    expect(properties.groupTriggerMode['x-ui'].enumLabels.mention_or_keywords.en_US).toBe('@ mention or keywords')
    expect(properties.groupTriggerOverrides.title.zh_Hans).toBe('按群触发配置')
    expect(properties.groupTriggerOverrides.items.properties.groupId.title.zh_Hans).toBe('群 ID')
    expect(properties.groupJoinWelcomeEnabled.title.zh_Hans).toBe('欢迎新入群成员')
    expect(properties.groupJoinWelcomePrompt['x-ui'].component).toBe('textarea')
    expect(properties.groupJoinWelcomePrompt.default).toContain('{names}')
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
      upsert: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({
        integrationId: 'integration-1',
        accountUuid: '*',
        xpertId: 'xpert-1',
        sessionTimeoutSeconds: 3600,
        summaryWindowSeconds: 0,
        historyContextLimit: 20,
        historyContextWindowSeconds: 3600,
        ignoreSelfMessages: true,
        selfMessagePolicy: 'history_only',
        ...bindingOverrides
      })
    }
    const accountRepository = {
      findOne: jest.fn().mockResolvedValue({
        integrationId: 'integration-1',
        uuid: 'uuid-1'
      })
    }
    const messageLogRepository = {
      update: jest.fn().mockResolvedValue(undefined)
    }
    const pluginContext = {
      resolve: jest.fn(() => ({
        read: jest.fn().mockResolvedValue({
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        })
      }))
    }
    const strategy = new WechatTriggerStrategy(
      dispatchService as any,
      aggregationService as any,
      {} as any,
      bindingRepository as any,
      accountRepository as any,
      pluginContext as any,
      messageLogRepository as any
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
        language: 'zh-Hans',
        status: 'thinking'
      }
    )
    return { strategy, dispatchService, aggregationService, bindingRepository, accountRepository, messageLogRepository, wechatMessage }
  }

  it('normalizes per-group trigger overrides when publishing a binding', async () => {
    const { strategy, bindingRepository } = createStrategy()
    bindingRepository.findOne.mockResolvedValue(null)

    await strategy.publish(
      {
        xpertId: 'xpert-1',
        node: { key: 'Trigger_Wechat' },
        config: {
          enabled: true,
          integrationId: 'integration-1',
          groupTriggerMode: 'mention_or_keywords',
          groupKeywords: ['默认'],
          mentionFallbackNames: ['全局助手'],
          groupJoinWelcomeEnabled: true,
          groupJoinWelcomePrompt: '欢迎 {names} 加入 {groupName}',
          groupTriggerOverrides: [
            {
              groupId: 'room-a@chatroom',
              groupTriggerMode: 'keywords',
              groupKeywords: ['订单'],
              mentionFallbackNames: ['订单助手']
            },
            {
              groupId: '',
              groupTriggerMode: 'all',
              groupKeywords: ['ignored']
            }
          ]
        }
      } as any,
      jest.fn()
    )

    expect(bindingRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        groupTriggerOverrides: [
          {
            groupId: 'room-a@chatroom',
            groupTriggerMode: 'keywords',
            groupKeywords: ['订单'],
            mentionFallbackNames: ['订单助手']
          }
        ],
        groupJoinWelcomeEnabled: true,
        groupJoinWelcomePrompt: '欢迎 {names} 加入 {groupName}'
      }),
      ['integrationId', 'accountUuid']
    )
  })

  it('publishes exact account bindings with the integration/account conflict target', async () => {
    const { strategy, bindingRepository, accountRepository } = createStrategy()
    bindingRepository.findOne.mockResolvedValue(null)

    await strategy.publish(
      {
        xpertId: 'xpert-2',
        node: { key: 'Trigger_Wechat' },
        config: {
          enabled: true,
          integrationId: 'integration-1',
          accountUuid: 'uuid-1'
        }
      } as any,
      jest.fn()
    )

    expect(accountRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          integrationId: 'integration-1',
          uuid: 'uuid-1'
        })
      })
    )
    expect(bindingRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        accountUuid: 'uuid-1',
        xpertId: 'xpert-2'
      }),
      ['integrationId', 'accountUuid']
    )
  })

  it('prefers exact account bindings before falling back to the default binding', async () => {
    const { strategy, dispatchService, bindingRepository, wechatMessage } = createStrategy()
    bindingRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        integrationId: 'integration-1',
        accountUuid: '*',
        xpertId: 'xpert-default',
        sessionTimeoutSeconds: 3600,
        summaryWindowSeconds: 0,
        historyContextLimit: 20,
        historyContextWindowSeconds: 3600,
        ignoreSelfMessages: true,
        selfMessagePolicy: 'history_only'
      })

    await expect(
      strategy.handleInboundMessage({
        integrationId: 'integration-1',
        accountUuid: 'uuid-2',
        input: '账号二消息',
        wechatMessage,
        conversationUserKey: 'integration-1:uuid-2:wxid_friend:wxid_friend',
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      })
    ).resolves.toEqual({
      accepted: true,
      queued: false,
      dispatched: true
    })

    expect(bindingRepository.findOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          integrationId: 'integration-1',
          accountUuid: 'uuid-2'
        })
      })
    )
    expect(bindingRepository.findOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          integrationId: 'integration-1',
          accountUuid: '*'
        })
      })
    )
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        xpertId: 'xpert-default',
        input: '账号二消息'
      })
    )
  })

  it('routes exact account bindings to their own xpert', async () => {
    const { strategy, dispatchService, bindingRepository, wechatMessage } = createStrategy()
    bindingRepository.findOne.mockResolvedValueOnce({
      integrationId: 'integration-1',
      accountUuid: 'uuid-2',
      xpertId: 'xpert-2',
      sessionTimeoutSeconds: 3600,
      summaryWindowSeconds: 0,
      historyContextLimit: 20,
      historyContextWindowSeconds: 3600,
      ignoreSelfMessages: true,
      selfMessagePolicy: 'history_only'
    })

    await expect(
      strategy.handleInboundMessage({
        integrationId: 'integration-1',
        accountUuid: 'uuid-2',
        input: '账号二消息',
        wechatMessage,
        conversationUserKey: 'integration-1:uuid-2:wxid_friend:wxid_friend',
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      })
    ).resolves.toEqual({
      accepted: true,
      queued: false,
      dispatched: true
    })

    expect(bindingRepository.findOne).toHaveBeenCalledTimes(1)
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        xpertId: 'xpert-2',
        input: '账号二消息'
      })
    )
  })

  it('prepends history context for immediate dispatch without conversationId', async () => {
    const { strategy, dispatchService, wechatMessage } = createStrategy()

    await expect(
      strategy.handleInboundMessage({
        integrationId: 'integration-1',
        input: '本次消息',
        files: [
          {
            fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
            mimeType: 'image/png',
            originalName: 'wechat-1.png',
            fileKey: 'file-key-1'
          }
        ],
        wechatMessage,
        conversationId: 'old-conversation-1',
        conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        historyContext: '[历史上下文]\n用户(wxid_friend): 之前消息',
        currentInboundLogIds: ['inbound-log-1'],
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toEqual({
      accepted: true,
      queued: false,
      dispatched: true
    })

    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.not.objectContaining({
        conversationId: expect.anything()
      })
    )
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '[历史上下文]\n用户(wxid_friend): 之前消息\n\n[本次用户消息]\n本次消息',
        files: [
          {
            fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
            mimeType: 'image/png',
            originalName: 'wechat-1.png',
            fileKey: 'file-key-1'
          }
        ]
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
        files: [
          {
            fileUrl: 'data:image/png;base64,first',
            mimeType: 'image/png',
            originalName: 'first.png',
            fileKey: 'first'
          }
        ],
        wechatMessage,
        conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        historyContext: '[历史上下文]\n用户(wxid_friend): 更早消息',
        currentInboundLogIds: ['inbound-log-1'],
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toEqual({
      accepted: true,
      queued: true,
      dispatched: false
    })

    expect(aggregationService.enqueueAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        integrationId: 'integration-1',
        accountUuid: '*',
        xpertId: 'xpert-1',
        input: '第一条',
        files: [
          {
            fileUrl: 'data:image/png;base64,first',
            mimeType: 'image/png',
            originalName: 'first.png',
            fileKey: 'first'
          }
        ],
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
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 1,
      inputParts: ['第一条'],
      files: [
        {
          fileUrl: 'data:image/png;base64,first',
          mimeType: 'image/png',
          originalName: 'first.png',
          fileKey: 'first'
        }
      ],
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
        accountUuid: '*',
        xpertId: 'xpert-1',
        input: '第二条',
        files: [
          {
            fileUrl: 'data:image/png;base64,second',
            mimeType: 'image/png',
            originalName: 'second.png',
            fileKey: 'second'
          }
        ],
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
        files: [
          {
            fileUrl: 'data:image/png;base64,first',
            mimeType: 'image/png',
            originalName: 'first.png',
            fileKey: 'first'
          },
          {
            fileUrl: 'data:image/png;base64,second',
            mimeType: 'image/png',
            originalName: 'second.png',
            fileKey: 'second'
          }
        ],
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
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 3,
      inputParts: ['第一条', '第二条'],
      files: [
        {
          fileUrl: 'data:image/png;base64,first',
          mimeType: 'image/png',
          originalName: 'first.png',
          fileKey: 'first'
        }
      ],
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
        input: '[历史上下文]\nAgent: 之前回复\n\n[本次用户消息]\n第一条\n第二条',
        files: [
          {
            fileUrl: 'data:image/png;base64,first',
            mimeType: 'image/png',
            originalName: 'first.png',
            fileKey: 'first'
          }
        ]
      })
    )
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.not.objectContaining({
        conversationId: expect.anything()
      })
    )
    expect(aggregationService.clear).toHaveBeenCalledWith('integration-1:uuid-1:wxid_friend:wxid_friend')
  })

  it('uses a default human input for image-only debounced batches', async () => {
    const { strategy, dispatchService, aggregationService } = createStrategy()
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 4,
      inputParts: ['', '   '],
      files: [
        {
          fileUrl: 'data:image/png;base64,only-image',
          mimeType: 'image/png',
          originalName: 'only-image.png',
          fileKey: 'only-image'
        }
      ],
      currentInboundLogIds: ['inbound-log-3'],
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
        messageId: 'msg-3'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        version: 4
      })
    ).resolves.toBe(true)

    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '[历史上下文]\nAgent: 之前回复\n\n[本次用户消息]\n[理解图片]',
        files: [
          {
            fileUrl: 'data:image/png;base64,only-image',
            mimeType: 'image/png',
            originalName: 'only-image.png',
            fileKey: 'only-image'
          }
        ]
      })
    )
  })

  it('flushes a debounced group batch when a later text mentions the bot', async () => {
    const { strategy, dispatchService, aggregationService, messageLogRepository } = createStrategy()
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:room@chatroom:wxid_sender',
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:room@chatroom:wxid_sender',
      xpertId: 'xpert-1',
      version: 6,
      inputParts: ['', '这次可以看到了吗'],
      items: [
        {
          input: '',
          messageKind: 'image',
          chatType: 'group',
          mentioned: false,
          groupKeywordMatched: false
        },
        {
          input: '这次可以看到了吗',
          messageKind: 'text',
          chatType: 'group',
          mentioned: true,
          groupKeywordMatched: false
        }
      ],
      triggerOptions: {
        groupTriggerMode: 'mentions',
        mentionFallbackNames: ['小白龙']
      },
      files: [
        {
          fileUrl: 'data:image/png;base64,group-image',
          mimeType: 'image/png',
          originalName: 'group-image.png',
          fileKey: 'group-image'
        }
      ],
      currentInboundLogIds: ['inbound-log-image', 'inbound-log-text'],
      historyContext: undefined,
      lastMessageAt: Date.now(),
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latestMessage: {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        senderId: 'wxid_sender',
        language: 'zh-Hans',
        messageId: 'msg-6'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:uuid-1:room@chatroom:wxid_sender',
        version: 6
      })
    ).resolves.toBe(true)

    expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '这次可以看到了吗',
        files: [
          {
            fileUrl: 'data:image/png;base64,group-image',
            mimeType: 'image/png',
            originalName: 'group-image.png',
            fileKey: 'group-image'
          }
        ],
        currentInboundLogIds: ['inbound-log-image', 'inbound-log-text']
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-log-image' }),
      expect.objectContaining({ status: 'dispatched', error: undefined })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-log-text' }),
      expect.objectContaining({ status: 'dispatched', error: undefined })
    )
  })

  it('skips a debounced group batch when no item matches the trigger policy', async () => {
    const { strategy, dispatchService, aggregationService, messageLogRepository } = createStrategy()
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:room@chatroom:wxid_sender',
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:room@chatroom:wxid_sender',
      xpertId: 'xpert-1',
      version: 7,
      inputParts: ['普通消息'],
      items: [
        {
          input: '普通消息',
          messageKind: 'text',
          chatType: 'group',
          mentioned: false,
          groupKeywordMatched: false
        }
      ],
      triggerOptions: {
        groupTriggerMode: 'mentions'
      },
      files: [],
      currentInboundLogIds: ['inbound-log-plain'],
      historyContext: undefined,
      lastMessageAt: Date.now(),
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latestMessage: {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        senderId: 'wxid_sender',
        messageId: 'msg-7'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:uuid-1:room@chatroom:wxid_sender',
        version: 7
      })
    ).resolves.toBe(false)

    expect(dispatchService.enqueueDispatch).not.toHaveBeenCalled()
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-log-plain' }),
      expect.objectContaining({
        status: 'skipped',
        error: 'filtered_by_trigger_policy'
      })
    )
    expect(aggregationService.clear).toHaveBeenCalledWith('integration-1:uuid-1:room@chatroom:wxid_sender')
  })

  it('flushes debounced voice transcripts as normal text input', async () => {
    const { strategy, dispatchService, aggregationService } = createStrategy()
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 5,
      inputParts: ['第一条语音转写', '第二条语音转写'],
      files: [],
      currentInboundLogIds: ['inbound-log-4', 'inbound-log-5'],
      historyContext: undefined,
      lastMessageAt: Date.now(),
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latestMessage: {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        language: 'zh-Hans',
        messageId: 'msg-4'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        version: 5
      })
    ).resolves.toBe(true)

    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '第一条语音转写\n第二条语音转写',
        files: []
      })
    )
  })
})
