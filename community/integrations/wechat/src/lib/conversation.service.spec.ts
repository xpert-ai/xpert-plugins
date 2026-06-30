jest.mock('@xpert-ai/plugin-sdk', () => ({
  INTEGRATION_PERMISSION_SERVICE_TOKEN: Symbol('INTEGRATION_PERMISSION_SERVICE_TOKEN'),
  SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN: Symbol('SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN'),
  RequestContext: {
    currentTenantId: () => undefined,
    currentUserId: () => undefined,
    getOrganizationId: () => undefined
  }
}))

jest.mock('./wechat-channel.strategy.js', () => ({
  WechatChannelStrategy: class WechatChannelStrategy {}
}))

jest.mock('./workflow/wechat-trigger.strategy.js', () => ({
  WechatTriggerStrategy: class WechatTriggerStrategy {}
}))

import { SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
import { FindOperator } from 'typeorm'
import { WechatConversationService } from './conversation.service.js'
import { WechatInboundEvent } from './types.js'

describe('WechatConversationService duplicate detection', () => {
  const baseEvent: WechatInboundEvent = {
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
    content: '你好',
    timestamp: Date.now(),
    isSelf: false,
    raw: {},
    rawPayload: {}
  }

  function createService(count: jest.Mock) {
    return new WechatConversationService(
      {} as any,
      {} as any,
      {} as any,
      {
        getStatus: jest.fn(() => ({ connected: false, bindingCount: 0, bindings: [] }))
      } as any,
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

  it('deduplicates wx2.0 callbacks when the message id differs but content matches', async () => {
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

  it('deduplicates contentless image callbacks by media signature', async () => {
    const count = jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    const service = createService(count)
    const imageEvent: WechatInboundEvent = {
      ...baseEvent,
      messageId: 'img-msg-1',
      msgType: 3,
      messageKind: 'image',
      content: '<msg><img aeskey="download-token" /></msg>',
      mediaSignature: 'image:uuid-1:img-msg-1:3:wxid_friend'
    }

    await expect((service as any).isDuplicateInbound('integration-1', imageEvent)).resolves.toBe(true)

    expect(count).toHaveBeenCalledTimes(2)
    expect(count).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        senderId: 'wxid_friend',
        direction: 'inbound',
        payloadSummary: expect.any(FindOperator),
        createdAt: expect.any(FindOperator)
      })
    })

    const keys = (service as any).buildInboundDedupeKeys('integration-1', imageEvent)
    expect(keys.some((key: string) => key.includes('|media:'))).toBe(true)
  })

  it('guards concurrent equivalent webhook callbacks before the message log is committed', () => {
    const service = createService(jest.fn())
    const firstEvent = {
      ...baseEvent,
      messageId: '622368768'
    }
    const secondEvent = {
      ...baseEvent,
      messageId: '1981963849618395083'
    }

    const firstKeys = (service as any).buildInboundDedupeKeys('integration-1', firstEvent)
    const secondKeys = (service as any).buildInboundDedupeKeys('integration-1', secondEvent)
    const releaseLock = (service as any).releaseInboundDedupeLock.bind(service)

    expect(firstKeys.some((key: string) => secondKeys.includes(key))).toBe(true)
    expect((service as any).acquireInboundDedupeLock(firstKeys)).toBe(true)
    expect((service as any).acquireInboundDedupeLock(secondKeys)).toBe(false)

    releaseLock(firstKeys)
    expect((service as any).acquireInboundDedupeLock(secondKeys)).toBe(true)
    releaseLock(secondKeys)
  })
})

describe('WechatConversationService fresh session history context', () => {
  const createdAt = new Date('2026-06-16T03:00:00.000Z')
  const baseEvent: WechatInboundEvent = {
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
    content: '新消息',
    timestamp: Date.now(),
    isSelf: false,
    raw: {},
    rawPayload: {}
  }

  const groupJoinEvent: WechatInboundEvent = {
    source: 'message_webhook',
    uuid: 'uuid-1',
    ownerWxid: 'wxid_owner',
    contactId: 'room@chatroom',
    contactName: '测试群',
    fromUser: 'room@chatroom',
    toUser: 'wxid_owner',
    senderId: 'room@chatroom',
    chatId: 'room@chatroom',
    chatType: 'group',
    messageId: 'join-1',
    msgType: 10000,
    messageKind: 'unsupported',
    content: '"老威"与群里其他人都不是朋友关系，请注意隐私安全',
    displayText: '"老威"与群里其他人都不是朋友关系，请注意隐私安全',
    timestamp: Date.now(),
    isSelf: false,
    raw: {},
    rawPayload: {}
  }

  const groupQrJoinEvent: WechatInboundEvent = {
    ...groupJoinEvent,
    messageId: 'join-2',
    msgType: 10002,
    content:
      '<sysmsg type="sysmsgtemplate"><sysmsgtemplate><content_template type="tmpl_type_profilewithrevokeqrcode"><template><![CDATA["$adder$"通过扫描你分享的二维码加入群聊  $revoke$]]></template><link_list><link name="adder" type="link_profile"><memberlist><member><username><![CDATA[anypossible-w]]></username><nickname><![CDATA[暗梅幽闻花]]></nickname></member></memberlist></link><link name="revoke" type="link_revoke_qrcode" hidden="1"><title><![CDATA[撤销]]></title></link></link_list></content_template></sysmsgtemplate></sysmsg>',
    displayText: "'暗梅幽闻花'通过扫描你分享的二维码加入群聊  撤销"
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
        options: {},
        ...overrides.integration
      })
    }
    const triggerStrategy = {
      getBinding: jest.fn().mockResolvedValue({
        integrationId: 'integration-1',
        accountUuid: '*',
        xpertId: 'xpert-1',
        sessionTimeoutSeconds: 3600,
        summaryWindowSeconds: 0,
        historyContextLimit: 20,
        historyContextWindowSeconds: 3600,
        ignoreSelfMessages: true,
        selfMessagePolicy: 'history_only',
        chatFilterMode: 'all',
        groupTriggerMode: 'mention_or_keywords',
        groupJoinWelcomeEnabled: false,
        groupJoinWelcomePrompt: '微信群有新成员加入：{names}。请生成一句简短、友好的中文欢迎语回复群聊，不要提及系统消息。',
        ...overrides.triggerBinding
      }),
      getBindingForAccount: jest.fn().mockResolvedValue({
        integrationId: 'integration-1',
        accountUuid: '*',
        xpertId: 'xpert-1',
        sessionTimeoutSeconds: 3600,
        summaryWindowSeconds: 0,
        historyContextLimit: 20,
        historyContextWindowSeconds: 3600,
        ignoreSelfMessages: true,
        selfMessagePolicy: 'history_only',
        chatFilterMode: 'all',
        groupTriggerMode: 'mention_or_keywords',
        groupJoinWelcomeEnabled: false,
        groupJoinWelcomePrompt: '微信群有新成员加入：{names}。请生成一句简短、友好的中文欢迎语回复群聊，不要提及系统消息。',
        ...overrides.triggerBinding
      }),
      getBindings: jest.fn().mockResolvedValue(overrides.triggerBindings ?? []),
      handleInboundMessage: jest.fn().mockResolvedValue(true),
      clearBufferedConversation: jest.fn().mockResolvedValue(undefined)
    }
    const accountRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      ...overrides.accountRepository
    }
    const tunnelBroker = {
      getStatus: jest.fn(() => ({
        state: 'disconnected',
        connected: false,
        instanceId: 'test-instance',
        bindingCount: 0,
        bindings: []
      })),
      listClients: jest.fn(() => []),
      disconnectClient: jest.fn(() => false),
      ...overrides.tunnelBroker
    }
    const wechatClient = {
      downloadImage: jest.fn().mockResolvedValue({
        success: true,
        file: {
          fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
          url: 'data:image/png;base64,iVBORw0KGgo=',
          mimeType: 'image/png',
          mimetype: 'image/png',
          originalName: 'wechat-image.png',
          name: 'wechat-image.png',
          fileKey: 'file-key-1',
          size: 8,
          extension: 'png'
        }
      }),
      downloadVoice: jest.fn().mockResolvedValue({
        success: true,
        audio: {
          data: Buffer.from('RIFF____WAVE'),
          mimeType: 'audio/wav',
          originalName: 'wechat-voice.wav',
          fileKey: 'voice-key-1',
          size: 12,
          durationMs: 1000
        }
      }),
      ...overrides.wechatClient
    }
    const speechToTextPermissionService = {
      transcribe: jest.fn().mockResolvedValue({
        text: '这是一条语音转写'
      }),
      ...overrides.speechToTextPermissionService
    }
    const messageLogRepository = {
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(async (payload) => ({
        id: payload.direction === 'system' ? 'reset-log-1' : 'inbound-log-1',
        createdAt,
        ...payload
      })),
      update: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => createQueryBuilder())
    }
    const service = new WechatConversationService(
      {} as any,
      wechatClient as any,
      triggerStrategy as any,
      tunnelBroker as any,
      accountRepository as any,
      messageLogRepository as any,
      {
        resolve: jest.fn((token) =>
          token === SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN ? speechToTextPermissionService : integrationPermissionService
        )
      } as any
    )

    return {
      service,
      integrationPermissionService,
      triggerStrategy,
      wechatClient,
      tunnelBroker,
      speechToTextPermissionService,
      accountRepository,
      messageLogRepository,
      ...overrides
    }
  }

  it('dispatches every inbound message without reusing an existing conversationId', async () => {
    const { service, triggerStrategy } = createFullService()
    const historySpy = jest.spyOn(service as any, 'buildHistoryContext').mockResolvedValue('[历史上下文]')

    await expect(
      service.handleInboundEvent(baseEvent, {
        integration: { id: 'integration-1' },
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

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
        accountUuid: 'uuid-1',
        historyContext: '[历史上下文]',
        currentInboundLogIds: ['inbound-log-1']
      })
    )
  })

  it('drops weixin events before account, log, or trigger handling', async () => {
    const { service, messageLogRepository, triggerStrategy } = createFullService()
    const upsertSpy = jest.spyOn(service as any, 'upsertAccount')
    const logSpy = jest.spyOn(service as any, 'logInbound')

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          senderId: 'weixin',
          fromUser: 'weixin'
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: false, reason: 'weixin_ignored' })

    expect(upsertSpy).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    expect(messageLogRepository.save).not.toHaveBeenCalled()
    expect(triggerStrategy.getBindingForAccount).not.toHaveBeenCalled()
  })

  it('skips group join system messages when welcome is disabled', async () => {
    const { service, triggerStrategy, messageLogRepository } = createFullService({
      triggerBinding: {
        groupJoinWelcomeEnabled: false,
        groupTriggerMode: 'off'
      }
    })

    await expect(
      service.handleInboundEvent(groupJoinEvent, {
        integration: { id: 'integration-1' },
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toEqual({ handled: false, reason: 'filtered' })

    expect(triggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-log-1' }),
      expect.objectContaining({
        status: 'skipped',
        error: 'filtered_by_trigger_policy',
        content: '"老威"与群里其他人都不是朋友关系，请注意隐私安全'
      })
    )
  })

  it('dispatches group join welcome through the agent independently of group trigger mode', async () => {
    const { service, triggerStrategy } = createFullService({
      triggerBinding: {
        groupJoinWelcomeEnabled: true,
        groupJoinWelcomePrompt: '欢迎 {names} 加入 {groupName}',
        groupTriggerMode: 'off'
      }
    })

    await expect(
      service.handleInboundEvent(groupJoinEvent, {
        integration: { id: 'integration-1' },
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining('欢迎 老威 加入 测试群'),
        item: expect.objectContaining({
          input: expect.stringContaining('新成员: 老威'),
          messageKind: 'text',
          chatType: 'group'
        }),
        wechatMessage: expect.objectContaining({
          contactId: 'room@chatroom',
          senderId: 'room@chatroom'
        })
      })
    )
    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining('原始系统提示: "老威"与群里其他人都不是朋友关系')
      })
    )
  })

  it('dispatches msgtype 10002 QR-code group join welcomes through the agent', async () => {
    const { service, triggerStrategy } = createFullService({
      triggerBinding: {
        groupJoinWelcomeEnabled: true,
        groupJoinWelcomePrompt: '欢迎 {names} 加入 {groupName}',
        groupTriggerMode: 'off'
      }
    })

    await expect(
      service.handleInboundEvent(groupQrJoinEvent, {
        integration: { id: 'integration-1' },
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining('欢迎 暗梅幽闻花 加入 测试群'),
        item: expect.objectContaining({
          input: expect.stringContaining('新成员: 暗梅幽闻花'),
          messageKind: 'text',
          chatType: 'group'
        })
      })
    )
  })

  it('does not dispatch group join welcome for blocked groups', async () => {
    const { service, triggerStrategy } = createFullService({
      triggerBinding: {
        groupJoinWelcomeEnabled: true,
        groupJoinWelcomePrompt: '欢迎 {names}',
        blockedGroupIds: ['room@chatroom']
      }
    })

    await expect(
      service.handleInboundEvent(groupJoinEvent, {
        integration: { id: 'integration-1' },
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toEqual({ handled: false, reason: 'filtered' })

    expect(triggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
  })

  it('adds tunnel binding state to account workbench rows', async () => {
    const { service, accountRepository, tunnelBroker } = createFullService({
      integration: {
        name: 'My WeChat',
        options: {
          connectionMode: 'reverse_tunnel',
          tunnelClientId: 'client-1'
        }
      },
      tunnelBroker: {
        getStatus: jest.fn(() => ({
          wsPath: '/api/wechat/tunnel/ws',
          state: 'connected',
          connected: true,
          instanceId: 'test-instance',
          clientId: 'client-1',
          clientName: 'local wx',
          lastSeenAt: '2026-06-25T03:00:00.000Z',
          lastSyncAt: '2026-06-25T03:01:00.000Z',
          bindingCount: 1,
          bindings: [{ uuid: 'uuid-1', wxid: 'wxid_owner' }]
        })),
        listClients: jest.fn(() => [])
      },
      triggerBindings: [
        {
          id: 'binding-1',
          integrationId: 'integration-1',
          accountUuid: 'uuid-1',
          xpertId: 'xpert-account-1',
          updatedAt: new Date('2026-06-25T03:02:00.000Z')
        }
      ]
    })
    accountRepository.find.mockResolvedValueOnce([
      {
        id: 'account-1',
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        ownerWxid: 'wxid_owner',
        status: 'online',
        enabled: true
      }
    ])

    await expect(service.listAccounts('integration-1')).resolves.toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            uuid: 'uuid-1',
            tunnelBinding: expect.objectContaining({
              status: 'bound_connected',
              connected: true,
              clientId: 'client-1',
              clientName: 'local wx',
              bindingCount: 1
            }),
            triggerBinding: expect.objectContaining({
              status: 'exact',
              accountUuid: 'uuid-1',
              xpertId: 'xpert-account-1'
            })
          })
        ],
        total: 1
      })
    )
    expect(tunnelBroker.getStatus).toHaveBeenCalled()
  })

  it('marks inbound messages failed when dispatch handoff throws after the message is logged', async () => {
    const { service, triggerStrategy, messageLogRepository } = createFullService()
    jest.spyOn(service as any, 'buildHistoryContext').mockResolvedValue(undefined)
    triggerStrategy.handleInboundMessage.mockRejectedValueOnce(new Error('Access denied to workspace'))

    await expect(
      service.handleInboundEvent(baseEvent, {
        integration: { id: 'integration-1' },
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toEqual({ handled: false, reason: 'processing_failed' })

    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inbound-log-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      }),
      expect.objectContaining({
        status: 'failed',
        error: 'Access denied to workspace'
      })
    )
  })

  it('does not forward binding or integration users as agent executors', async () => {
    const { service, triggerStrategy } = createFullService({
      integration: {
        createdById: 'integration-created-user',
        updatedById: 'integration-updated-user',
        userId: 'integration-technical-user'
      },
      triggerBinding: {
        createdById: 'binding-created-user',
        updatedById: 'binding-updated-user'
      }
    })
    jest.spyOn(service as any, 'buildHistoryContext').mockResolvedValue(undefined)

    await expect(
      service.handleInboundEvent(baseEvent, {
        integration: {
          id: 'integration-1',
          createdById: 'integration-created-user',
          updatedById: 'integration-updated-user',
          userId: 'integration-technical-user'
        },
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

    const [dispatchInput] = triggerStrategy.handleInboundMessage.mock.calls[0]
    expect(dispatchInput).toEqual(
      expect.objectContaining({
        integrationId: 'integration-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      })
    )
    expect(dispatchInput).not.toHaveProperty('executorUserId')
  })

  it('stores self private messages as history only under the real peer conversation key', async () => {
    const { service, triggerStrategy, messageLogRepository } = createFullService()

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          messageId: 'self-msg-a',
          ownerWxid: 'wxid_owner',
          fromUser: 'wxid_owner',
          toUser: 'wxid_friend_a',
          contactId: 'wxid_owner',
          senderId: 'wxid_owner',
          chatId: 'wxid_owner',
          content: '发给 A 的消息',
          isSelf: true
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: true, reason: 'history_only' })

    expect(triggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-log-1' }),
      expect.objectContaining({
        contactId: 'wxid_friend_a',
        senderId: 'wxid_friend_a',
        chatType: 'private',
        isSelf: true,
        conversationUserKey: 'integration-1:uuid-1:wxid_friend_a:wxid_friend_a'
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-log-1' }),
      expect.objectContaining({
        status: 'history_only',
        content: '发给 A 的消息'
      })
    )
  })

  it('uses explicit historyContextWindowSeconds instead of sessionTimeoutSeconds', async () => {
    const { service } = createFullService({
      triggerBinding: {
        sessionTimeoutSeconds: 60,
        historyContextWindowSeconds: 7200
      }
    })
    const historySpy = jest.spyOn(service as any, 'buildHistoryContext').mockResolvedValue(undefined)

    await expect(
      service.handleInboundEvent(baseEvent, {
        integration: { id: 'integration-1' },
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

    expect(historySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutSeconds: 7200
      })
    )
  })

  it('passes a zero history context window through to disable time filtering', async () => {
    const { service } = createFullService({
      triggerBinding: {
        sessionTimeoutSeconds: 60,
        historyContextWindowSeconds: 0
      }
    })
    const historySpy = jest.spyOn(service as any, 'buildHistoryContext').mockResolvedValue(undefined)

    await expect(
      service.handleInboundEvent(baseEvent, {
        integration: { id: 'integration-1' },
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      } as any)
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

    expect(historySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutSeconds: 0
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

  it('skips unmatched allowed keyword messages before building history context', async () => {
    const { service, triggerStrategy } = createFullService({
      triggerBinding: {
        allowedKeywords: ['重要']
      }
    })
    const historySpy = jest.spyOn(service as any, 'buildHistoryContext')

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          content: '普通消息'
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: false, reason: 'filtered' })

    expect(historySpy).not.toHaveBeenCalled()
    expect(triggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
  })

  it('uses per-group trigger overrides instead of the global group trigger mode', async () => {
    const { service, triggerStrategy } = createFullService({
      triggerBinding: {
        groupTriggerMode: 'off',
        groupTriggerOverrides: [
          {
            groupId: 'room@chatroom',
            groupTriggerMode: 'all',
            groupKeywords: ['订单'],
            mentionFallbackNames: ['订单助手']
          }
        ]
      }
    })

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          contactId: 'room@chatroom',
          chatId: 'room@chatroom',
          chatType: 'group',
          senderId: 'wxid_sender',
          content: '普通群消息'
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '普通群消息',
        triggerOptions: expect.objectContaining({
          groupTriggerMode: 'all',
          groupKeywords: ['订单'],
          mentionFallbackNames: ['订单助手']
        })
      })
    )
  })

  it('stores only self history messages that match allowed keywords', async () => {
    const { service, messageLogRepository } = createFullService({
      triggerBinding: {
        allowedKeywords: ['重要']
      }
    })

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          messageId: 'self-msg-filtered',
          ownerWxid: 'wxid_owner',
          fromUser: 'wxid_owner',
          toUser: 'wxid_friend',
          contactId: 'wxid_owner',
          senderId: 'wxid_owner',
          chatId: 'wxid_owner',
          content: '普通消息',
          isSelf: true
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: false, reason: 'filtered' })

    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-log-1' }),
      expect.objectContaining({
        status: 'skipped',
        content: '普通消息',
        error: 'filtered_by_trigger_policy'
      })
    )
  })

  it('downloads inbound images and dispatches them as files with empty input', async () => {
    const { service, triggerStrategy, wechatClient, messageLogRepository } = createFullService()
    const imageRef = {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      newMsgId: 'img-msg-1',
      msgContent: '',
      msgType: 3 as const,
      fromUser: 'wxid_friend',
      toUser: 'wxid_owner',
      msgId: 123,
      isSelf: false,
      fileKey: 'file-key-1'
    }

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          messageId: 'img-msg-1',
          msgType: 3,
          messageKind: 'image',
          content: '',
          displayText: '[图片]',
          imageRef,
          mediaSignature: 'image:uuid-1:img-msg-1:3:wxid_friend:wxid_friend:wxid_owner',
          rawPayload: {
            imgbuf: 'should-not-be-persisted',
            content: ''
          }
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

    expect(wechatClient.downloadImage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'integration-1'
      }),
      imageRef
    )
    expect(messageLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'inbound',
        content: '[图片]',
        payloadSummary: expect.not.stringContaining('should-not-be-persisted')
      })
    )
    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '',
        files: [
          {
            fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
            url: 'data:image/png;base64,iVBORw0KGgo=',
            mimeType: 'image/png',
            mimetype: 'image/png',
            originalName: 'wechat-image.png',
            name: 'wechat-image.png',
            fileKey: 'file-key-1',
            size: 8,
            extension: 'png'
          }
        ]
      })
    )
  })

  it('does not download image-only messages that fail allowed keyword filtering', async () => {
    const { service, triggerStrategy, wechatClient } = createFullService({
      triggerBinding: {
        allowedKeywords: ['图片']
      }
    })
    const historySpy = jest.spyOn(service as any, 'buildHistoryContext')
    const imageRef = {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      newMsgId: 'img-msg-filtered',
      msgContent: '',
      msgType: 3 as const,
      fromUser: 'wxid_friend',
      toUser: 'wxid_owner',
      msgId: 124,
      isSelf: false,
      fileKey: 'file-key-filtered'
    }

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          messageId: 'img-msg-filtered',
          msgType: 3,
          messageKind: 'image',
          content: '',
          displayText: '[图片]',
          imageRef,
          mediaSignature: 'image:uuid-1:img-msg-filtered:3:wxid_friend:wxid_friend:wxid_owner'
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: false, reason: 'filtered' })

    expect(historySpy).not.toHaveBeenCalled()
    expect(wechatClient.downloadImage).not.toHaveBeenCalled()
    expect(triggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
  })

  it('queues unmentioned group images for debounced batch trigger evaluation', async () => {
    const { service, triggerStrategy, wechatClient, messageLogRepository } = createFullService({
      triggerBinding: {
        summaryWindowSeconds: 5,
        groupTriggerMode: 'mentions',
        mentionFallbackNames: ['小白龙']
      }
    })
    triggerStrategy.handleInboundMessage.mockResolvedValueOnce({
      accepted: true,
      queued: true,
      dispatched: false
    })
    const imageRef = {
      uuid: 'uuid-1',
      contactId: 'room@chatroom',
      newMsgId: 'img-msg-debounced',
      msgContent: '',
      msgType: 3 as const,
      fromUser: 'wxid_sender',
      toUser: 'wxid_owner',
      msgId: 125,
      isSelf: false,
      fileKey: 'file-key-debounced'
    }

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          contactId: 'room@chatroom',
          chatId: 'room@chatroom',
          chatType: 'group',
          senderId: 'wxid_sender',
          messageId: 'img-msg-debounced',
          msgType: 3,
          messageKind: 'image',
          content: '',
          displayText: '[图片]',
          imageRef,
          mediaSignature: 'image:uuid-1:img-msg-debounced:3:room@chatroom:wxid_sender:wxid_owner'
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: true, reason: 'queued' })

    expect(wechatClient.downloadImage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'integration-1' }),
      imageRef
    )
    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '',
        item: expect.objectContaining({
          input: '',
          messageKind: 'image',
          chatType: 'group',
          mentioned: false
        }),
        triggerOptions: expect.objectContaining({
          groupTriggerMode: 'mentions',
          mentionFallbackNames: ['小白龙']
        }),
        files: [
          expect.objectContaining({
            fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
            fileKey: 'file-key-1'
          })
        ]
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-log-1' }),
      expect.objectContaining({
        status: 'queued',
        error: undefined
      })
    )
  })

  it('marks inbound image logs failed and skips Agent dispatch when download fails', async () => {
    const { service, triggerStrategy, messageLogRepository } = createFullService({
      wechatClient: {
        downloadImage: jest.fn().mockResolvedValue({
          success: false,
          error: 'download failed'
        })
      }
    })

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          messageId: 'img-msg-2',
          msgType: 3,
          messageKind: 'image',
          content: '',
          displayText: '',
          imageRef: {
            uuid: 'uuid-1',
            contactId: 'wxid_friend',
            newMsgId: 'img-msg-2',
            msgContent: '',
            msgType: 3
          },
          mediaSignature: 'image:uuid-1:img-msg-2:3:wxid_friend'
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: false, reason: 'image_download_failed' })

    expect(triggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inbound-log-1'
      }),
      expect.objectContaining({
        status: 'failed',
        xpertId: 'xpert-1',
        error: expect.stringContaining('inbound_image_download_failed')
      })
    )
  })

  it('transcribes private voice messages and dispatches the transcript as human input', async () => {
    const { service, triggerStrategy, wechatClient, speechToTextPermissionService, messageLogRepository } = createFullService({
      integration: {
        createdById: '11111111-1111-4111-8111-111111111111'
      }
    })
    const voiceRef = {
      uuid: 'uuid-1',
      contactId: 'wxid_friend',
      newMsgId: 'voice-msg-1',
      msgContent: '<msg><voicemsg /></msg>',
      msgType: 34 as const,
      fromUser: 'wxid_friend',
      toUser: 'wxid_owner',
      msgId: 234,
      isSelf: false,
      fileKey: 'voice-key-1'
    }

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          messageId: 'voice-msg-1',
          msgType: 34,
          messageKind: 'voice',
          content: '<msg><voicemsg /></msg>',
          displayText: '[语音]',
          voiceRef,
          mediaSignature: 'voice:uuid-1:voice-msg-1:34:wxid_friend:wxid_friend:wxid_owner',
          rawPayload: {
            voicebuf: 'should-not-be-persisted',
            content: '<msg><voicemsg /></msg>'
          }
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

    expect(wechatClient.downloadVoice).toHaveBeenCalledWith(expect.objectContaining({ id: 'integration-1' }), voiceRef)
    expect(speechToTextPermissionService.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        xpertId: 'xpert-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        file: expect.objectContaining({
          data: Buffer.from('RIFF____WAVE'),
          originalName: 'wechat-voice.wav',
          mimeType: 'audio/wav',
          size: 12
        })
      })
    )
    expect(speechToTextPermissionService.transcribe.mock.calls[0]?.[0]).not.toHaveProperty('userId')
    expect(messageLogRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'inbound',
        content: '[语音]',
        payloadSummary: expect.not.stringContaining('should-not-be-persisted')
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inbound-log-1' }),
      expect.objectContaining({
        content: '这是一条语音转写',
        payloadSummary: expect.stringContaining('这是一条语音转写')
      })
    )
    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '这是一条语音转写',
        files: undefined
      })
    )
  })

  it('applies allowed keyword filtering to voice transcripts before history context', async () => {
    const { service, triggerStrategy, wechatClient } = createFullService({
      triggerBinding: {
        allowedKeywords: ['语音']
      }
    })
    const historySpy = jest.spyOn(service as any, 'buildHistoryContext').mockResolvedValue('[历史上下文]')

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          messageId: 'voice-msg-keyword',
          msgType: 34,
          messageKind: 'voice',
          content: '<msg><voicemsg /></msg>',
          displayText: '[语音]',
          voiceRef: {
            uuid: 'uuid-1',
            contactId: 'wxid_friend',
            newMsgId: 'voice-msg-keyword',
            msgContent: '<msg><voicemsg /></msg>',
            msgType: 34,
            fromUser: 'wxid_friend',
            toUser: 'wxid_owner',
            isSelf: false
          },
          mediaSignature: 'voice:uuid-1:voice-msg-keyword:34:wxid_friend'
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

    expect(wechatClient.downloadVoice).toHaveBeenCalled()
    expect(historySpy).toHaveBeenCalled()
    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '这是一条语音转写',
        historyContext: '[历史上下文]'
      })
    )
  })

  it('marks inbound voice logs failed and skips Agent dispatch when transcription fails', async () => {
    const { service, triggerStrategy, messageLogRepository } = createFullService({
      speechToTextPermissionService: {
        transcribe: jest.fn().mockRejectedValue(new Error('stt unavailable'))
      }
    })

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          messageId: 'voice-msg-2',
          msgType: 34,
          messageKind: 'voice',
          content: '<msg><voicemsg /></msg>',
          displayText: '[语音]',
          voiceRef: {
            uuid: 'uuid-1',
            contactId: 'wxid_friend',
            newMsgId: 'voice-msg-2',
            msgContent: '<msg><voicemsg /></msg>',
            msgType: 34
          },
          mediaSignature: 'voice:uuid-1:voice-msg-2:34:wxid_friend'
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: false, reason: 'voice_transcription_failed' })

    expect(triggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inbound-log-1'
      }),
      expect.objectContaining({
        status: 'failed',
        xpertId: 'xpert-1',
        error: expect.stringContaining('inbound_voice_transcription_failed')
      })
    )
  })

  it('surfaces structured speech-to-text host errors in inbound voice logs', async () => {
    const error = new Error('Bad Request') as Error & { getResponse: () => Record<string, unknown> }
    error.getResponse = () => ({
      code: 'xpert_principal_xpert_not_found',
      message: 'Target Xpert was not found for principal initialization.',
      xpertId: 'xpert-1',
      remediation: 'Check the WeChat binding target Xpert and organization scope.'
    })
    const { service, triggerStrategy, messageLogRepository } = createFullService({
      speechToTextPermissionService: {
        transcribe: jest.fn().mockRejectedValue(error)
      }
    })

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          messageId: 'voice-msg-principal-missing',
          msgType: 34,
          messageKind: 'voice',
          content: '<msg><voicemsg /></msg>',
          displayText: '[语音]',
          voiceRef: {
            uuid: 'uuid-1',
            contactId: 'wxid_friend',
            newMsgId: 'voice-msg-principal-missing',
            msgContent: '<msg><voicemsg /></msg>',
            msgType: 34
          },
          mediaSignature: 'voice:uuid-1:voice-msg-principal-missing:34:wxid_friend'
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: false, reason: 'voice_transcription_failed' })

    expect(triggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inbound-log-1'
      }),
      expect.objectContaining({
        status: 'failed',
        xpertId: 'xpert-1',
        error: expect.stringContaining('xpert_principal_xpert_not_found')
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inbound-log-1'
      }),
      expect.objectContaining({
        error: expect.stringContaining('principal initialization')
      })
    )
    expect(messageLogRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inbound-log-1'
      }),
      expect.objectContaining({
        error: expect.stringContaining('xpertId=xpert-1')
      })
    )
  })

  it('uses transcribed voice text for group keyword trigger policy', async () => {
    const { service, triggerStrategy, wechatClient } = createFullService({
      triggerBinding: {
        groupTriggerMode: 'keywords',
        groupKeywords: ['总结']
      },
      speechToTextPermissionService: {
        transcribe: jest.fn().mockResolvedValue({
          text: '请总结这张图里的内容'
        })
      }
    })

    await expect(
      service.handleInboundEvent(
        {
          ...baseEvent,
          contactId: 'room@chatroom',
          chatId: 'room@chatroom',
          chatType: 'group',
          senderId: 'wxid_sender',
          messageId: 'voice-msg-3',
          msgType: 34,
          messageKind: 'voice',
          content: '<msg><voicemsg /></msg>',
          displayText: '[语音]',
          voiceRef: {
            uuid: 'uuid-1',
            contactId: 'room@chatroom',
            newMsgId: 'voice-msg-3',
            msgContent: '<msg><voicemsg /></msg>',
            msgType: 34
          },
          mediaSignature: 'voice:uuid-1:voice-msg-3:34:room@chatroom'
        },
        {
          integration: { id: 'integration-1' },
          tenantId: 'tenant-1',
          organizationId: 'org-1'
        } as any
      )
    ).resolves.toEqual({ handled: true, reason: 'dispatched' })

    expect(wechatClient.downloadVoice).toHaveBeenCalled()
    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: '请总结这张图里的内容'
      })
    )
  })

  it('searches scoped WeChat chat history without exposing raw payload fields', async () => {
    const longContent = `合同历史${'内容'.repeat(800)}`
    const { service, messageLogRepository, triggerStrategy } = createFullService()
    messageLogRepository.find.mockResolvedValueOnce([
      {
        id: 'current-log',
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        senderId: 'wxid_sender',
        direction: 'inbound',
        status: 'received',
        content: '合同 current',
        payloadSummary: '{"secret":"hidden"}',
        createdAt: new Date('2026-06-16T03:01:00.000Z')
      },
      {
        id: 'outbound-1',
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        direction: 'outbound',
        status: 'sent',
        content: '合同 Agent 回复',
        messageId: 'msg-out-1',
        sentAt: new Date('2026-06-16T03:00:00.000Z'),
        createdAt: new Date('2026-06-16T03:00:00.000Z')
      },
      {
        id: 'inbound-1',
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        senderId: 'wxid_member',
        direction: 'inbound',
        status: 'dispatched',
        content: longContent,
        messageId: 'msg-in-1',
        createdAt: new Date('2026-06-16T02:58:00.000Z')
      },
      {
        id: 'failed-1',
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        senderId: 'wxid_member',
        direction: 'inbound',
        status: 'failed',
        content: '合同失败消息',
        createdAt: new Date('2026-06-16T02:57:00.000Z')
      }
    ])

    const result = await service.searchChatHistory('integration-1', {
      uuid: 'uuid-1',
      contactId: 'room@chatroom',
      chatType: 'group',
      keyword: '合同',
      limit: 2,
      excludedLogIds: ['current-log'],
      enforceTriggerFilters: true
    })

    expect(triggerStrategy.getBindingForAccount).toHaveBeenCalledWith('integration-1', 'uuid-1', {
      tenantId: 'tenant-1',
      organizationId: 'org-1'
    })
    expect(messageLogRepository.find).toHaveBeenCalledWith({
      where: expect.objectContaining({
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        tenantId: 'tenant-1',
        organizationId: 'org-1'
      }),
      order: { createdAt: 'DESC' },
      take: 1000
    })
    expect(result).toEqual(
      expect.objectContaining({
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        totalScanned: 2,
        hasMore: false
      })
    )
    expect(result.items.map((item) => item.id)).toEqual(['inbound-1', 'outbound-1'])
    expect(result.items[0].content).toContain('[截断]')
    expect(result.items[0]).not.toHaveProperty('payloadSummary')
    expect(result.items[0]).not.toHaveProperty('queueJobId')
  })

  it('applies sender, direction and time filters when searching chat history', async () => {
    const { service, messageLogRepository } = createFullService()
    messageLogRepository.find.mockResolvedValueOnce([
      {
        id: 'other-sender',
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        senderId: 'wxid_other',
        direction: 'inbound',
        status: 'dispatched',
        content: '其他人消息',
        createdAt: new Date('2026-06-16T03:00:00.000Z')
      },
      {
        id: 'wanted',
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        senderId: 'wxid_member',
        direction: 'inbound',
        status: 'history_only',
        content: '指定成员消息',
        createdAt: new Date('2026-06-16T02:30:00.000Z')
      },
      {
        id: 'outbound-1',
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        direction: 'outbound',
        status: 'sent',
        content: 'Agent 消息',
        createdAt: new Date('2026-06-16T02:20:00.000Z')
      }
    ])

    const result = await service.searchChatHistory('integration-1', {
      uuid: 'uuid-1',
      contactId: 'room@chatroom',
      chatType: 'group',
      senderId: 'wxid_member',
      direction: 'inbound',
      after: '2026-06-16T02:00:00.000Z',
      before: '2026-06-16T04:00:00.000Z'
    })

    expect(result.items.map((item) => item.id)).toEqual(['wanted'])
  })

  it('rejects chat history search for blocked groups', async () => {
    const { service, messageLogRepository } = createFullService({
      triggerBinding: {
        blockedGroupIds: ['room@chatroom']
      }
    })

    await expect(
      service.searchChatHistory('integration-1', {
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        enforceTriggerFilters: true
      })
    ).rejects.toThrow('不在触发器允许')

    expect(messageLogRepository.find).not.toHaveBeenCalled()
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
      },
      {
        id: 'self-1',
        direction: 'inbound',
        status: 'history_only',
        senderId: 'wxid_friend',
        content: '用户自己补充的背景',
        createdAt: new Date('2026-06-16T02:58:30.000Z')
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
        inboundStatuses: ['dispatched', 'history_only'],
        outboundStatus: 'sent'
      })
    )
    expect(query.andWhere).toHaveBeenCalledWith('log.id NOT IN (:...excludedLogIds)', {
      excludedLogIds: ['inbound-log-1']
    })
    expect(query.andWhere).toHaveBeenCalledWith('log.createdAt > :resetAt', {
      resetAt: new Date('2026-06-16T02:00:00.000Z')
    })
    expect(query.limit).toHaveBeenCalledWith(20)
    expect(context).toContain('[历史上下文')
    expect(context).toContain('用户(wxid_friend): 上一轮用户消息')
    expect(context).toContain('用户(wxid_friend): 用户自己补充的背景')
    expect(context).toContain('Agent: 上一轮 Agent 回复')
  })

  it('does not add a history time filter when historyContextWindowSeconds is 0', async () => {
    const query = createQueryBuilder([])
    const { service, messageLogRepository } = createFullService()
    messageLogRepository.createQueryBuilder.mockReturnValueOnce(query)

    await (service as any).buildHistoryContext({
      integrationId: 'integration-1',
      conversationUserKey: 'integration-1:uuid-1:wxid_friend:wxid_friend',
      xpertId: 'xpert-1',
      limit: 20,
      timeoutSeconds: 0,
      before: createdAt
    })

    expect(query.andWhere).not.toHaveBeenCalledWith('log.createdAt > :historySince', expect.anything())
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
