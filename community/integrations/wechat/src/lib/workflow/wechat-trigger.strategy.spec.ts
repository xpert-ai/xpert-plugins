jest.mock('@xpert-ai/plugin-sdk', () => ({
  WorkflowTriggerStrategy: () => (target: unknown) => target,
  ChatChannel: () => (target: unknown) => target,
  defineChannelMessageType: (...parts: unknown[]) => parts.join(':'),
  AGENT_CHAT_DISPATCH_MESSAGE_TYPE: 'agent_chat_dispatch',
  HANDOFF_PERMISSION_SERVICE_TOKEN: Symbol('HANDOFF_PERMISSION_SERVICE_TOKEN'),
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN'),
  WORKSPACE_FILES_SOURCE: 'platform.workspace.files',
  RequestContext: {
    currentTenantId: () => undefined,
    currentUserId: () => undefined,
    getLanguageCode: () => undefined,
    getOrganizationId: () => undefined
  }
}))

import { WechatTriggerStrategy } from './wechat-trigger.strategy.js'
import { WechatMessage } from '../message.js'
import type { WechatAggregateLockLease } from './wechat-trigger-aggregation.service.js'

describe('WechatTriggerStrategy', () => {
  it('replays published trigger bindings during server bootstrap', () => {
    const strategy = new WechatTriggerStrategy({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any)

    expect(strategy.bootstrap).toEqual({
      mode: 'replay_publish',
      critical: false
    })
  })

  it('exposes translated labels for trigger select options', () => {
    const strategy = new WechatTriggerStrategy({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any)
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
    const aggregateLockLease = {
      ensureOwned: jest.fn().mockResolvedValue(undefined),
      clearStateIfOwned: jest.fn().mockResolvedValue(undefined)
    }
    const aggregationService = {
      get: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      enqueueAggregate: jest.fn().mockResolvedValue({ id: 'aggregate-job-1' }),
      enqueueFlush: jest.fn().mockResolvedValue({ id: 'flush-job-1' }),
      withAggregateLock: jest.fn(async (_aggregateKey: string, callback: (lease: WechatAggregateLockLease) => Promise<unknown>) =>
        callback(aggregateLockLease)
      )
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
    const wechatClient = {
      downloadImage: jest.fn().mockResolvedValue({
        success: true,
        file: {
          data: Buffer.from('iVBORw0KGgo=', 'base64'),
          fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
          url: 'data:image/png;base64,iVBORw0KGgo=',
          mimeType: 'image/png',
          mimetype: 'image/png',
          originalName: 'wechat-image.png',
          name: 'wechat-image.png',
          fileKey: 'image-key-1',
          size: 8,
          extension: 'png'
        }
      }),
      downloadFile: jest.fn().mockResolvedValue({
        success: true,
        file: {
          data: Buffer.from('docx-bytes'),
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          originalName: '技术实现文档.docx',
          fileKey: 'file-key-1',
          size: 9,
          extension: 'docx'
        }
      })
    }
    const workspaceFiles = {
      uploadBuffer: jest.fn().mockResolvedValue({
        name: '技术实现文档.docx',
        filePath: 'files/wechat/integration-1/uuid-1/file-msg-1/技术实现文档.docx',
        workspacePath: 'files/wechat/integration-1/uuid-1/file-msg-1/技术实现文档.docx',
        fileUrl: 'https://files.example/files/wechat/技术实现文档.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 9
      }),
      understandFile: jest.fn().mockResolvedValue({
        id: 'file-asset-1',
        fileId: 'file-asset-1',
        fileAssetId: 'file-asset-1',
        filePath: 'files/wechat/integration-1/uuid-1/file-msg-1/技术实现文档.docx',
        workspacePath: 'files/wechat/integration-1/uuid-1/file-msg-1/技术实现文档.docx',
        fileUrl: 'https://files.example/files/wechat/技术实现文档.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalName: '技术实现文档.docx',
        name: '技术实现文档.docx',
        size: 9,
        status: 'parsing',
        parseStatus: 'queued',
        capabilities: ['preview', 'workspace']
      })
    }
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue({
        id: 'integration-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        updatedById: 'user-1'
      })
    }
    const messageFileRepository = {
      save: jest.fn(async (payload) => ({
        id: 'message-file-1',
        ...payload
      })),
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null)
    }
    const messageLogRepository = {
      update: jest.fn().mockResolvedValue(undefined)
    }
    const pluginContext = {
      resolve: jest.fn((token) => {
        if (token === 'XPERT_RUNTIME_CAPABILITIES') {
          return {
            get: jest.fn((key) => (key === 'platform.workspace.files' ? workspaceFiles : undefined))
          }
        }
        return integrationPermissionService
      })
    }
    const strategy = new WechatTriggerStrategy(
      dispatchService as any,
      aggregationService as any,
      {} as any,
      wechatClient as any,
      bindingRepository as any,
      accountRepository as any,
      messageFileRepository as any,
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
    return {
      strategy,
      dispatchService,
      aggregationService,
      aggregateLockLease,
      bindingRepository,
      accountRepository,
      wechatClient,
      workspaceFiles,
      integrationPermissionService,
      messageFileRepository,
      messageLogRepository,
      wechatMessage
    }
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

  it('stores different integration bindings for the same xpert as separate routes', async () => {
    const { strategy, bindingRepository } = createStrategy()
    bindingRepository.findOne.mockResolvedValue(null)

    await strategy.publish(
      {
        xpertId: 'xpert-1',
        node: { key: 'Trigger_Wechat_A' },
        config: {
          enabled: true,
          integrationId: 'integration-1'
        }
      } as any,
      jest.fn()
    )
    await strategy.publish(
      {
        xpertId: 'xpert-1',
        node: { key: 'Trigger_Wechat_B' },
        config: {
          enabled: true,
          integrationId: 'integration-2'
        }
      } as any,
      jest.fn()
    )

    expect(bindingRepository.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        integrationId: 'integration-1',
        accountUuid: '*',
        xpertId: 'xpert-1'
      }),
      ['integrationId', 'accountUuid']
    )
    expect(bindingRepository.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        integrationId: 'integration-2',
        accountUuid: '*',
        xpertId: 'xpert-1'
      }),
      ['integrationId', 'accountUuid']
    )
  })

  it('does not collapse multiple bound integrations for the same xpert into the latest route', async () => {
    const { strategy, bindingRepository } = createStrategy()
    bindingRepository.find.mockResolvedValue([
      {
        integrationId: 'integration-2',
        accountUuid: '*',
        xpertId: 'xpert-1',
        updatedAt: new Date('2026-07-03T04:00:00.000Z')
      },
      {
        integrationId: 'integration-1',
        accountUuid: '*',
        xpertId: 'xpert-1',
        updatedAt: new Date('2026-07-03T03:00:00.000Z')
      }
    ])

    await expect(strategy.getBoundIntegrationId('xpert-1')).resolves.toBeNull()
    expect(bindingRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          xpertId: 'xpert-1'
        }),
        order: {
          updatedAt: 'DESC'
        }
      })
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

  it('enqueues pending file refs without downloading before the debounce flush', async () => {
    const { strategy, aggregationService, wechatClient, wechatMessage } = createStrategy({
      summaryWindowSeconds: 3
    })
    const fileRef = {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      newMsgId: 'file-msg-1',
      msgContent: '<msg><appmsg><title>技术实现文档.docx</title><type>74</type></appmsg></msg>',
      msgType: 49,
      fileKey: 'file-key-1',
      originalName: '技术实现文档.docx',
      extension: 'docx',
      size: 9
    }

    await expect(
      strategy.handleInboundMessage({
        integrationId: 'integration-1',
        input: '',
        pendingFiles: [
          {
            kind: 'file',
            messageLogId: 'inbound-file-log-1',
            messageId: 'file-msg-1',
            uuid: 'uuid-1',
            contactId: 'wxid_friend',
            senderId: 'wxid_friend',
            originalName: '技术实现文档.docx',
            size: 9,
            extension: 'docx',
            fileRef
          }
        ],
        wechatMessage,
        conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        currentInboundLogIds: ['inbound-file-log-1'],
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      })
    ).resolves.toEqual({
      accepted: true,
      queued: true,
      dispatched: false
    })

    expect(wechatClient.downloadFile).not.toHaveBeenCalled()
    expect(aggregationService.enqueueAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingFiles: [
          expect.objectContaining({
            kind: 'file',
            messageLogId: 'inbound-file-log-1',
            fileRef
          })
        ]
      })
    )
  })

  it('aggregates debounced inbound jobs under a Redis lock and schedules managed queue flush', async () => {
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
      expect.any(Function),
      undefined,
      expect.objectContaining({
        integrationId: 'integration-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      })
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

  it('locks flush and rejects an outdated aggregate version', async () => {
    const { strategy, dispatchService, aggregationService, aggregateLockLease } = createStrategy()
    const aggregateKey = 'integration-1:uuid-1:wxid_friend:wxid_friend'
    const state = {
      aggregateKey,
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: aggregateKey,
      xpertId: 'xpert-1',
      version: 2,
      inputParts: ['分析这张图片', ''],
      items: [
        { input: '分析这张图片', messageKind: 'text', chatType: 'private' },
        { input: '', messageKind: 'image', chatType: 'private' }
      ],
      files: [
        {
          fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
          mimeType: 'image/png',
          originalName: 'wechat-image.png',
          fileKey: 'image-key-1',
          fileAssetId: 'image-asset-1'
        }
      ],
      currentInboundLogIds: ['inbound-text-log-1', 'inbound-image-log-1'],
      lastMessageAt: Date.now(),
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latestMessage: {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        messageId: 'image-msg-1'
      }
    }
    aggregationService.get.mockResolvedValue(state)
    const scope = {
      integrationId: 'integration-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1'
    }

    await expect(
      strategy.flushBufferedConversation({ aggregateKey, version: 1, ...scope })
    ).resolves.toBe(false)
    expect(dispatchService.enqueueDispatch).not.toHaveBeenCalled()

    await expect(
      strategy.flushBufferedConversation({ aggregateKey, version: 2, ...scope })
    ).resolves.toBe(true)
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledTimes(1)
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '分析这张图片',
        files: [expect.objectContaining({ fileAssetId: 'image-asset-1' })]
      })
    )
    expect(aggregationService.withAggregateLock).toHaveBeenCalledWith(
      aggregateKey,
      expect.any(Function),
      undefined,
      expect.objectContaining(scope)
    )
    expect(aggregateLockLease.clearStateIfOwned).toHaveBeenCalledTimes(1)
  })

  it('coalesces duplicate pending file refs and materializes the more complete attachment metadata', async () => {
    const { strategy, aggregationService, wechatClient, workspaceFiles } = createStrategy()
    const partialFileRef = {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      newMsgId: 'file-msg-partial',
      msgContent: '<msg><appmsg><title>技术实现文档.docx</title><type>74</type></appmsg></msg>',
      msgType: 49,
      originalName: '技术实现文档.docx',
      extension: 'docx',
      size: 9
    }
    const fullFileRef = {
      ...partialFileRef,
      newMsgId: 'file-msg-full',
      msgContent:
        '<msg><appmsg><title>技术实现文档.docx</title><type>74</type><appattach><totallen>9</totallen><attachid>attach-1</attachid><cdnattachurl>https://cdn.example/file</cdnattachurl><aeskey>aes-1</aeskey></appattach></appmsg></msg>',
      fileKey: 'attach-1',
      attachId: 'attach-1',
      cdnAttachUrl: 'https://cdn.example/file',
      aesKey: 'aes-1'
    }
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 1,
      inputParts: [''],
      pendingFiles: [
        {
          kind: 'file',
          messageLogId: 'inbound-file-partial',
          messageId: 'file-msg-partial',
          uuid: 'uuid-1',
          contactId: 'wxid_friend',
          senderId: 'wxid_friend',
          originalName: '技术实现文档.docx',
          size: 9,
          extension: 'docx',
          fileRef: partialFileRef
        }
      ],
      currentInboundLogIds: ['inbound-file-partial'],
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
        input: '分析这个文档',
        item: {
          input: '分析这个文档',
          messageKind: 'text',
          chatType: 'private'
        },
        pendingFiles: [
          {
            kind: 'file',
            messageLogId: 'inbound-file-full',
            messageId: 'file-msg-full',
            uuid: 'uuid-1',
            contactId: 'wxid_friend',
            senderId: 'wxid_friend',
            originalName: '技术实现文档.docx',
            size: 9,
            extension: 'docx',
            fileRef: fullFileRef
          }
        ],
        currentInboundLogIds: ['inbound-file-full', 'inbound-text-log-1'],
        summaryWindowSeconds: 3,
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

    expect(wechatClient.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'integration-1' }), fullFileRef)
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'files/wechat/integration-1/uuid-1/file-msg-full',
        fileName: '技术实现文档.docx'
      })
    )
    expect(aggregationService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        inputParts: ['', '分析这个文档'],
        pendingFiles: undefined,
        files: [
          expect.objectContaining({
            fileAssetId: 'file-asset-1',
            workspacePath: 'files/wechat/integration-1/uuid-1/file-msg-1/技术实现文档.docx'
          })
        ],
        currentInboundLogIds: ['inbound-file-partial', 'inbound-file-full', 'inbound-text-log-1'],
        duplicateInboundLogIds: ['inbound-file-partial']
      }),
      expect.any(Number)
    )
  })

  it('flushes one debounced batch as one fresh-session dispatch with history context', async () => {
    const { strategy, dispatchService, aggregationService, aggregateLockLease } = createStrategy()
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
    expect(aggregateLockLease.clearStateIfOwned).toHaveBeenCalledTimes(1)
  })

  it('materializes pending files at flush and dispatches FileAsset handles with merged text', async () => {
    const {
      strategy,
      dispatchService,
      aggregationService,
      aggregateLockLease,
      wechatClient,
      workspaceFiles,
      messageFileRepository
    } = createStrategy()
    const fileRef = {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      newMsgId: 'file-msg-1',
      msgContent: '<msg><appmsg><title>技术实现文档.docx</title><type>74</type></appmsg></msg>',
      msgType: 49,
      fileKey: 'file-key-1',
      originalName: '技术实现文档.docx',
      extension: 'docx',
      size: 9
    }
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 8,
      inputParts: ['', '分析这个文档'],
      items: [
        {
          input: '',
          messageKind: 'file',
          chatType: 'private'
        },
        {
          input: '分析这个文档',
          messageKind: 'text',
          chatType: 'private'
        }
      ],
      pendingFiles: [
        {
          kind: 'file',
          messageLogId: 'inbound-file-log-1',
          messageId: 'file-msg-1',
          uuid: 'uuid-1',
          contactId: 'wxid_friend',
          senderId: 'wxid_friend',
          originalName: '技术实现文档.docx',
          size: 9,
          extension: 'docx',
          fileRef
        }
      ],
      currentInboundLogIds: ['inbound-file-log-1', 'inbound-text-log-1'],
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
        messageId: 'text-msg-1'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        version: 8
      })
    ).resolves.toBe(true)

    expect(wechatClient.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'integration-1' }), fileRef)
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: 'xperts',
        xpertId: 'xpert-1',
        isolateByUser: false,
        folder: 'files/wechat/integration-1/uuid-1/file-msg-1',
        fileName: '技术实现文档.docx',
        buffer: Buffer.from('docx-bytes')
      })
    )
    expect(workspaceFiles.understandFile).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: 'xperts',
        xpertId: 'xpert-1',
        isolateByUser: false,
        filePath: 'files/wechat/integration-1/uuid-1/file-msg-1/技术实现文档.docx',
        originalName: '技术实现文档.docx',
        purpose: 'chat_attachment',
        parseMode: 'auto'
      })
    )
    expect(messageFileRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        messageLogId: 'inbound-file-log-1',
        status: 'processing',
        xpertId: 'xpert-1'
      })
    )
    expect(messageFileRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'message-file-1' }),
      expect.objectContaining({
        status: 'ready',
        fileAssetId: 'file-asset-1',
        workspacePath: 'files/wechat/integration-1/uuid-1/file-msg-1/技术实现文档.docx'
      })
    )
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '分析这个文档',
        files: [
          expect.objectContaining({
            fileAssetId: 'file-asset-1',
            fileId: 'file-asset-1',
            workspacePath: 'files/wechat/integration-1/uuid-1/file-msg-1/技术实现文档.docx',
            originalName: '技术实现文档.docx'
          })
        ],
        currentInboundLogIds: ['inbound-file-log-1', 'inbound-text-log-1']
      })
    )
    expect(JSON.stringify(dispatchService.enqueueDispatch.mock.calls[0][0])).not.toContain('docx-bytes')
  })

  it('uploads decoded inbound images to workspace storage while preserving the data URL for vision dispatch', async () => {
    const { strategy, dispatchService, workspaceFiles, messageFileRepository, wechatMessage } = createStrategy()
    workspaceFiles.uploadBuffer.mockResolvedValueOnce({
      name: 'wechat-image.png',
      filePath: 'files/wechat/integration-1/uuid-1/image-msg-1/wechat-image.png',
      workspacePath: 'files/wechat/integration-1/uuid-1/image-msg-1/wechat-image.png',
      fileUrl: 'https://files.example/files/wechat/wechat-image.png',
      mimeType: 'image/png',
      size: 8
    })
    workspaceFiles.understandFile.mockResolvedValueOnce({
      id: 'image-asset-1',
      fileId: 'image-asset-1',
      fileAssetId: 'image-asset-1',
      storageFileId: 'storage-image-1',
      filePath: 'files/wechat/integration-1/uuid-1/image-msg-1/wechat-image.png',
      workspacePath: 'files/wechat/integration-1/uuid-1/image-msg-1/wechat-image.png',
      fileUrl: 'https://files.example/files/wechat/wechat-image.png',
      mimeType: 'image/png',
      originalName: 'wechat-image.png',
      name: 'wechat-image.png',
      size: 8
    })
    const imageRef = {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      newMsgId: 'image-msg-1',
      msgContent: '<msg><img /></msg>',
      msgType: 3 as const,
      fileKey: 'image-key-1',
      originalName: 'wechat-image.png'
    }

    await expect(
      strategy.handleInboundMessage({
        integrationId: 'integration-1',
        input: '',
        pendingFiles: [
          {
            kind: 'image',
            messageLogId: 'inbound-image-log-1',
            messageId: 'image-msg-1',
            uuid: 'uuid-1',
            contactId: 'wxid_friend',
            senderId: 'wxid_friend',
            originalName: 'wechat-image.png',
            imageRef
          }
        ],
        wechatMessage,
        conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        currentInboundLogIds: ['inbound-image-log-1'],
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      })
    ).resolves.toEqual({
      accepted: true,
      queued: false,
      dispatched: true
    })

    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: 'xperts',
        xpertId: 'xpert-1',
        isolateByUser: false,
        folder: 'files/wechat/integration-1/uuid-1/image-msg-1',
        fileName: 'wechat-image.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgo=', 'base64')
      })
    )
    expect(workspaceFiles.understandFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: 'files/wechat/integration-1/uuid-1/image-msg-1/wechat-image.png',
        purpose: 'chat_attachment',
        parseMode: 'auto'
      })
    )
    expect(messageFileRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'message-file-1' }),
      expect.objectContaining({
        status: 'ready',
        fileAssetId: 'image-asset-1',
        workspacePath: 'files/wechat/integration-1/uuid-1/image-msg-1/wechat-image.png',
        fileUrl: 'https://files.example/files/wechat/wechat-image.png'
      })
    )
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '[理解附件]',
        files: [
          expect.objectContaining({
            fileAssetId: 'image-asset-1',
            storageFileId: 'storage-image-1',
            workspacePath: 'files/wechat/integration-1/uuid-1/image-msg-1/wechat-image.png',
            fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
            url: 'data:image/png;base64,iVBORw0KGgo='
          })
        ]
      })
    )
    expect(JSON.stringify(dispatchService.enqueueDispatch.mock.calls[0][0])).not.toContain('"data":')
  })

  it('skips known oversized file messages before wx2.0 download or workspace upload', async () => {
    const { strategy, dispatchService, wechatClient, workspaceFiles, messageFileRepository, wechatMessage } = createStrategy()
    const oversizedSize = 3 * 1024 * 1024
    const fileRef = {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      newMsgId: 'file-msg-large',
      msgContent: '<msg><appmsg><title>large.docx</title><type>74</type><appattach><totallen>3145728</totallen></appattach></appmsg></msg>',
      msgType: 49,
      fileKey: 'file-key-large',
      originalName: 'large.docx',
      extension: 'docx',
      size: oversizedSize
    }

    await expect(
      strategy.handleInboundMessage({
        integrationId: 'integration-1',
        input: '',
        pendingFiles: [
          {
            kind: 'file',
            messageLogId: 'inbound-file-large',
            messageId: 'file-msg-large',
            uuid: 'uuid-1',
            contactId: 'wxid_friend',
            senderId: 'wxid_friend',
            originalName: 'large.docx',
            size: oversizedSize,
            extension: 'docx',
            fileRef
          }
        ],
        wechatMessage,
        conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        currentInboundLogIds: ['inbound-file-large'],
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      })
    ).resolves.toEqual(
      expect.objectContaining({
        accepted: false,
        queued: false,
        dispatched: false,
        skipped: true,
        error: expect.stringContaining('inbound_file_size_exceeded')
      })
    )

    expect(wechatClient.downloadFile).not.toHaveBeenCalled()
    expect(workspaceFiles.uploadBuffer).not.toHaveBeenCalled()
    expect(workspaceFiles.understandFile).not.toHaveBeenCalled()
    expect(dispatchService.enqueueDispatch).not.toHaveBeenCalled()
    expect(messageFileRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        messageLogId: 'inbound-file-large',
        status: 'failed',
        size: oversizedSize,
        error: expect.stringContaining('inbound_file_size_exceeded')
      })
    )
  })

  it('skips files that exceed the inbound limit after download and before workspace upload', async () => {
    const { strategy, dispatchService, wechatClient, workspaceFiles, messageFileRepository, wechatMessage } = createStrategy()
    const oversizedBuffer = Buffer.alloc(2 * 1024 * 1024 + 1)
    wechatClient.downloadFile.mockResolvedValueOnce({
      success: true,
      file: {
        data: oversizedBuffer,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalName: 'unknown-size.docx',
        fileKey: 'file-key-unknown-size',
        size: oversizedBuffer.length,
        extension: 'docx'
      }
    })
    const fileRef = {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      newMsgId: 'file-msg-unknown-size',
      msgContent: '<msg><appmsg><title>unknown-size.docx</title><type>74</type></appmsg></msg>',
      msgType: 49,
      fileKey: 'file-key-unknown-size',
      originalName: 'unknown-size.docx',
      extension: 'docx'
    }

    await expect(
      strategy.handleInboundMessage({
        integrationId: 'integration-1',
        input: '',
        pendingFiles: [
          {
            kind: 'file',
            messageLogId: 'inbound-file-unknown-size',
            messageId: 'file-msg-unknown-size',
            uuid: 'uuid-1',
            contactId: 'wxid_friend',
            senderId: 'wxid_friend',
            originalName: 'unknown-size.docx',
            extension: 'docx',
            fileRef
          }
        ],
        wechatMessage,
        conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        currentInboundLogIds: ['inbound-file-unknown-size'],
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      })
    ).resolves.toEqual(
      expect.objectContaining({
        accepted: false,
        skipped: true,
        error: expect.stringContaining('inbound_file_size_exceeded')
      })
    )

    expect(wechatClient.downloadFile).toHaveBeenCalledTimes(1)
    expect(workspaceFiles.uploadBuffer).not.toHaveBeenCalled()
    expect(workspaceFiles.understandFile).not.toHaveBeenCalled()
    expect(dispatchService.enqueueDispatch).not.toHaveBeenCalled()
    expect(messageFileRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'message-file-1' }),
      expect.objectContaining({
        status: 'failed',
        size: oversizedBuffer.length,
        error: expect.stringContaining('inbound_file_size_exceeded')
      })
    )
  })

  it('skips oversized files in a debounced batch while dispatching the remaining text', async () => {
    const { strategy, dispatchService, aggregationService, wechatClient, workspaceFiles, messageLogRepository } = createStrategy()
    const oversizedSize = 3 * 1024 * 1024
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 12,
      inputParts: ['', '分析这个文档'],
      items: [
        { input: '', messageKind: 'file', chatType: 'private' },
        { input: '分析这个文档', messageKind: 'text', chatType: 'private' }
      ],
      pendingFiles: [
        {
          kind: 'file',
          messageLogId: 'inbound-file-large',
          messageId: 'file-msg-large',
          uuid: 'uuid-1',
          contactId: 'wxid_friend',
          senderId: 'wxid_friend',
          originalName: 'large.docx',
          size: oversizedSize,
          extension: 'docx',
          fileRef: {
            uuid: 'uuid-1',
            contactId: 'wxid_friend',
            newMsgId: 'file-msg-large',
            msgContent: '<msg><appmsg><title>large.docx</title><type>74</type><appattach><totallen>3145728</totallen></appattach></appmsg></msg>',
            msgType: 49,
            fileKey: 'file-key-large',
            originalName: 'large.docx',
            extension: 'docx',
            size: oversizedSize
          }
        }
      ],
      currentInboundLogIds: ['inbound-file-large', 'inbound-text-log-1'],
      lastMessageAt: Date.now(),
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latestMessage: {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        messageId: 'text-msg-1'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        version: 12
      })
    ).resolves.toBe(true)

    expect(wechatClient.downloadFile).not.toHaveBeenCalled()
    expect(workspaceFiles.uploadBuffer).not.toHaveBeenCalled()
    expect(workspaceFiles.understandFile).not.toHaveBeenCalled()
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '分析这个文档',
        files: [],
        currentInboundLogIds: ['inbound-text-log-1']
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-file-large' }),
      expect.objectContaining({
        status: 'skipped',
        error: expect.stringContaining('inbound_file_size_exceeded')
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-text-log-1' }),
      expect.objectContaining({
        status: 'dispatched'
      })
    )
  })

  it('keeps the debounced batch and retries flush when file attachment fields are not ready', async () => {
    const {
      strategy,
      dispatchService,
      aggregationService,
      aggregateLockLease,
      wechatClient,
      messageLogRepository,
      messageFileRepository
    } = createStrategy()
    wechatClient.downloadFile.mockResolvedValueOnce({
      success: false,
      error: '无法从应用消息提取附件'
    })
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 9,
      inputParts: ['', '分析这个文档'],
      items: [
        {
          input: '',
          messageKind: 'file',
          chatType: 'private'
        },
        {
          input: '分析这个文档',
          messageKind: 'text',
          chatType: 'private'
        }
      ],
      pendingFiles: [
        {
          kind: 'file',
          messageLogId: 'inbound-file-log-1',
          messageId: 'file-msg-1',
          uuid: 'uuid-1',
          contactId: 'wxid_friend',
          senderId: 'wxid_friend',
          originalName: '技术实现文档.docx',
          size: 9,
          extension: 'docx',
          fileRef: {
            uuid: 'uuid-1',
            contactId: 'wxid_friend',
            newMsgId: 'file-msg-1',
            msgContent: '<msg />',
            msgType: 49
          }
        }
      ],
      currentInboundLogIds: ['inbound-file-log-1', 'inbound-text-log-1'],
      lastMessageAt: Date.now(),
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latestMessage: {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        messageId: 'text-msg-1'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        version: 9
      })
    ).resolves.toBe(false)

    expect(dispatchService.enqueueDispatch).not.toHaveBeenCalled()
    expect(messageLogRepository.update).not.toHaveBeenCalled()
    expect(messageFileRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        messageLogId: 'inbound-file-log-1',
        status: 'processing'
      })
    )
    expect(messageFileRepository.save).not.toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed'
      })
    )
    expect(aggregateLockLease.clearStateIfOwned).not.toHaveBeenCalled()
    expect(aggregationService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fileMaterializeRetryCount: 1,
        fileMaterializeLastError: expect.stringContaining('无法从应用消息提取附件'),
        inputParts: ['', '分析这个文档']
      }),
      expect.any(Number)
    )
    expect(aggregationService.enqueueFlush).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 9,
        fileMaterializeRetryCount: 1
      }),
      2000
    )
  })

  it('merges duplicate file shell events and materializes the most complete ref with text', async () => {
    const { strategy, dispatchService, aggregationService, wechatClient, workspaceFiles, messageLogRepository } =
      createStrategy()
    const partialRef = {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      newMsgId: 'file-msg-shell',
      msgContent: '<msg><appmsg><title>PBOM最佳匹配及智能报价说明.docx</title><type>74</type></appmsg></msg>',
      msgType: 49,
      fileKey: 'file-msg-shell',
      originalName: 'PBOM最佳匹配及智能报价说明.docx',
      extension: 'docx'
    }
    const completeRef = {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      newMsgId: 'file-msg-ready',
      msgContent:
        '<msg><appmsg><title>PBOM最佳匹配及智能报价说明.docx</title><type>74</type><appattach><totallen>10</totallen><attachid>attach-ready</attachid><cdnattachurl>https://cdn.example/file</cdnattachurl><aeskey>aes-ready</aeskey><fileext>docx</fileext></appattach></appmsg></msg>',
      msgType: 49,
      fileKey: 'attach-ready',
      attachId: 'attach-ready',
      cdnAttachUrl: 'https://cdn.example/file',
      aesKey: 'aes-ready',
      originalName: 'PBOM最佳匹配及智能报价说明.docx',
      extension: 'docx',
      size: 10
    }
    wechatClient.downloadFile.mockResolvedValueOnce({
      success: true,
      file: {
        data: Buffer.from('ready-docx'),
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalName: 'PBOM最佳匹配及智能报价说明.docx',
        fileKey: 'attach-ready',
        size: 10,
        extension: 'docx'
      }
    })
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 11,
      inputParts: ['', '', '分析此文档内容里的风险点'],
      items: [
        { input: '', messageKind: 'file', chatType: 'private' },
        { input: '', messageKind: 'file', chatType: 'private' },
        { input: '分析此文档内容里的风险点', messageKind: 'text', chatType: 'private' }
      ],
      pendingFiles: [
        {
          kind: 'file',
          messageLogId: 'inbound-file-shell-log',
          messageId: 'file-msg-shell',
          uuid: 'uuid-1',
          contactId: 'wxid_friend',
          senderId: 'wxid_friend',
          originalName: 'PBOM最佳匹配及智能报价说明.docx',
          extension: 'docx',
          fileRef: partialRef
        },
        {
          kind: 'file',
          messageLogId: 'inbound-file-ready-log',
          messageId: 'file-msg-ready',
          uuid: 'uuid-1',
          contactId: 'wxid_friend',
          senderId: 'wxid_friend',
          originalName: 'PBOM最佳匹配及智能报价说明.docx',
          size: 10,
          extension: 'docx',
          fileRef: completeRef
        }
      ],
      currentInboundLogIds: ['inbound-file-shell-log', 'inbound-file-ready-log', 'inbound-text-log'],
      lastMessageAt: Date.now(),
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latestMessage: {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        messageId: 'text-msg-1'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        version: 11
      })
    ).resolves.toBe(true)

    expect(wechatClient.downloadFile).toHaveBeenCalledTimes(1)
    expect(wechatClient.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'integration-1' }), completeRef)
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'files/wechat/integration-1/uuid-1/file-msg-ready',
        buffer: Buffer.from('ready-docx')
      })
    )
    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '分析此文档内容里的风险点',
        currentInboundLogIds: ['inbound-file-ready-log', 'inbound-text-log'],
        files: [expect.objectContaining({ fileAssetId: 'file-asset-1' })]
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-file-shell-log' }),
      expect.objectContaining({ status: 'skipped', error: 'duplicate_file_event' })
    )
    expect(messageLogRepository.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'failed' })
    )
  })

  it('fails the debounced batch when pending file materialization fails', async () => {
    const { strategy, dispatchService, aggregationService, wechatClient, messageLogRepository, messageFileRepository } =
      createStrategy()
    wechatClient.downloadFile.mockResolvedValueOnce({
      success: false,
      error: 'download timeout'
    })
    messageFileRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'message-file-1'
      })
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      version: 9,
      inputParts: ['', '分析这个文档'],
      items: [
        {
          input: '',
          messageKind: 'file',
          chatType: 'private'
        },
        {
          input: '分析这个文档',
          messageKind: 'text',
          chatType: 'private'
        }
      ],
      pendingFiles: [
        {
          kind: 'file',
          messageLogId: 'inbound-file-log-1',
          messageId: 'file-msg-1',
          uuid: 'uuid-1',
          contactId: 'wxid_friend',
          senderId: 'wxid_friend',
          originalName: '技术实现文档.docx',
          size: 9,
          extension: 'docx',
          fileRef: {
            uuid: 'uuid-1',
            contactId: 'wxid_friend',
            newMsgId: 'file-msg-1',
            msgContent: '<msg />',
            msgType: 49
          }
        }
      ],
      currentInboundLogIds: ['inbound-file-log-1', 'inbound-text-log-1'],
      lastMessageAt: Date.now(),
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latestMessage: {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        messageId: 'text-msg-1'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
        version: 9
      })
    ).resolves.toBe(false)

    expect(dispatchService.enqueueDispatch).not.toHaveBeenCalled()
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-file-log-1' }),
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('download timeout')
      })
    )
    expect(messageFileRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        messageLogId: 'inbound-file-log-1',
        integrationId: 'integration-1'
      }),
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('download timeout')
      })
    )
  })

  it('uses a default human input for attachment-only debounced batches', async () => {
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
        input: '[历史上下文]\nAgent: 之前回复\n\n[本次用户消息]\n[理解附件]',
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
    const { strategy, dispatchService, aggregationService, aggregateLockLease, messageLogRepository } = createStrategy()
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
    expect(aggregateLockLease.clearStateIfOwned).toHaveBeenCalledTimes(1)
  })

  it('dispatches debounced group join welcomes without normal group mention or keyword policy', async () => {
    const { strategy, dispatchService, aggregationService, messageLogRepository } = createStrategy()
    const welcomeInput = [
      '欢迎 老威 加入 测试群',
      '',
      '群名称: 测试群',
      '群 roomId: room@chatroom',
      '新成员: 老威',
      '原始系统提示: "老威"与群里其他人都不是朋友关系，请注意隐私安全'
    ].join('\n')
    aggregationService.get.mockResolvedValueOnce({
      aggregateKey: 'integration-1:uuid-1:room@chatroom:room@chatroom',
      integrationId: 'integration-1',
      accountUuid: '*',
      conversationUserKey: 'integration-1:uuid-1:room@chatroom:room@chatroom',
      xpertId: 'xpert-1',
      version: 13,
      inputParts: [welcomeInput],
      items: [
        {
          input: welcomeInput,
          messageKind: 'text',
          chatType: 'group',
          mentioned: false,
          groupKeywordMatched: false,
          bypassTriggerPolicy: true,
          triggerReason: 'group_join_welcome'
        }
      ],
      triggerOptions: {
        groupTriggerMode: 'off',
        groupKeywords: ['不会命中'],
        allowedKeywords: ['也不会命中']
      },
      files: [],
      currentInboundLogIds: ['inbound-log-welcome'],
      historyContext: undefined,
      lastMessageAt: Date.now(),
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latestMessage: {
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        senderId: 'room@chatroom',
        language: 'zh-Hans',
        messageId: 'join-1'
      }
    })

    await expect(
      strategy.flushBufferedConversation({
        aggregateKey: 'integration-1:uuid-1:room@chatroom:room@chatroom',
        version: 13
      })
    ).resolves.toBe(true)

    expect(dispatchService.enqueueDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: welcomeInput,
        files: [],
        currentInboundLogIds: ['inbound-log-welcome']
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-log-welcome' }),
      expect.objectContaining({
        status: 'dispatched',
        error: undefined
      })
    )
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
