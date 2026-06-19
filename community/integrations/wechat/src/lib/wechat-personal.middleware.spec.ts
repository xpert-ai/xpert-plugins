jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: unknown) => target
}))

jest.mock('@langchain/core/tools', () => ({
  tool: (handler: unknown, config: Record<string, unknown>) => ({
    ...config,
    handler
  })
}))

jest.mock('./conversation.service.js', () => ({
  WechatPersonalConversationService: class WechatPersonalConversationService {}
}))

jest.mock('./wechat-personal-channel.strategy.js', () => ({
  WechatPersonalChannelStrategy: class WechatPersonalChannelStrategy {}
}))

import {
  XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY,
  XPERT_TASK_SCHEDULE_PROPERTY_PREFIX
} from '@xpert-ai/contracts'
import {
  WECHAT_PERSONAL_CANCEL_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PERSONAL_GET_CALLBACK_CONFIG_TOOL_NAME,
  WECHAT_PERSONAL_GET_RUNTIME_STATUS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_ACCOUNTS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_CONVERSATIONS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PERSONAL_MIDDLEWARE_NAME,
  WECHAT_PERSONAL_PAUSE_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_PERSONAL_REGISTER_CALLBACK_TOOL_NAME,
  WECHAT_PERSONAL_REVOKE_WEBHOOK_CREDENTIAL_TOOL_NAME,
  WECHAT_PERSONAL_RESUME_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_PERSONAL_RETRY_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PERSONAL_ROTATE_WEBHOOK_CREDENTIAL_TOOL_NAME,
  WECHAT_PERSONAL_RESET_CONVERSATION_TOOL_NAME,
  WECHAT_PERSONAL_RUNTIME_FEATURE,
  WECHAT_PERSONAL_SEARCH_MESSAGE_LOGS_TOOL_NAME,
  WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME,
  WECHAT_PERSONAL_SET_ACCOUNT_ENABLED_TOOL_NAME,
  WECHAT_PERSONAL_WORKBENCH_FEATURE
} from './constants.js'
import { WechatPersonalRuntimeMiddleware } from './wechat-personal.middleware.js'

const WECHAT_PERSONAL_SCHEDULE_UUID_STATE_KEY = `${XPERT_TASK_SCHEDULE_PROPERTY_PREFIX}uuid`
const WECHAT_PERSONAL_SCHEDULE_CONTACT_ID_STATE_KEY = `${XPERT_TASK_SCHEDULE_PROPERTY_PREFIX}contact_id`
const WECHAT_PERSONAL_SCHEDULE_CHAT_TYPE_STATE_KEY = `${XPERT_TASK_SCHEDULE_PROPERTY_PREFIX}chat_type`
const WECHAT_PERSONAL_SCHEDULE_AT_USERS_STATE_KEY = `${XPERT_TASK_SCHEDULE_PROPERTY_PREFIX}at_users`

describe('WechatPersonalRuntimeMiddleware', () => {
  function createMiddleware(conversationService: Record<string, unknown> = {}, wechatChannel: Record<string, unknown> = {}) {
    const outboundQueue = {
      cancelOutboundQueueItem: jest.fn(async () => ({ success: true })),
      retryOutboundQueueItem: jest.fn(async () => ({ success: true })),
      pauseOutboundAccount: jest.fn(async () => undefined),
      resumeOutboundAccount: jest.fn(async () => 0)
    }
    return new WechatPersonalRuntimeMiddleware(conversationService as any, wechatChannel as any, outboundQueue as any)
  }

  it('exposes runtime features for agent view discovery', () => {
    const middleware = createMiddleware()

    expect(middleware.meta.name).toBe(WECHAT_PERSONAL_MIDDLEWARE_NAME)
    expect(middleware.meta.features).toEqual(
      expect.arrayContaining([WECHAT_PERSONAL_RUNTIME_FEATURE, WECHAT_PERSONAL_WORKBENCH_FEATURE])
    )
  })

  it('keeps scheduled send parameters in runtime state instead of middleware config targets', () => {
    const middleware = createMiddleware()
    const configSchema = middleware.meta.configSchema as { properties?: Record<string, unknown> }
    const runtime = middleware.createMiddleware(
      { integrationId: 'integration-1', toolMode: 'user' },
      { node: { options: {} } } as any
    ) as any
    const shape = runtime.stateSchema.shape as Record<string, unknown>

    expect(configSchema.properties?.scheduleTargets).toBeUndefined()
    expect((middleware.meta as { scheduleTarget?: unknown }).scheduleTarget).toBeUndefined()
    expect(shape[WECHAT_PERSONAL_SCHEDULE_UUID_STATE_KEY]).toBeDefined()
    expect(shape[WECHAT_PERSONAL_SCHEDULE_CONTACT_ID_STATE_KEY]).toBeDefined()
  })

  it('registers Personal WeChat management tools', async () => {
    const middleware = await Promise.resolve(
      createMiddleware().createMiddleware(
        { integrationId: 'integration-1', toolMode: 'admin' },
        {
          node: {
            key: 'Middleware_WechatPersonalRuntime',
            options: {}
          }
        } as any
      )
    )

    expect(middleware.name).toBe(WECHAT_PERSONAL_MIDDLEWARE_NAME)
    expect((middleware.tools ?? []).map((item: any) => item.name).sort()).toEqual(
      [
        WECHAT_PERSONAL_GET_CALLBACK_CONFIG_TOOL_NAME,
        WECHAT_PERSONAL_GET_RUNTIME_STATUS_TOOL_NAME,
        WECHAT_PERSONAL_LIST_ACCOUNTS_TOOL_NAME,
        WECHAT_PERSONAL_LIST_CONVERSATIONS_TOOL_NAME,
        WECHAT_PERSONAL_LIST_OUTBOUND_QUEUE_TOOL_NAME,
        WECHAT_PERSONAL_CANCEL_OUTBOUND_QUEUE_TOOL_NAME,
        WECHAT_PERSONAL_RETRY_OUTBOUND_QUEUE_TOOL_NAME,
        WECHAT_PERSONAL_PAUSE_OUTBOUND_ACCOUNT_TOOL_NAME,
        WECHAT_PERSONAL_RESUME_OUTBOUND_ACCOUNT_TOOL_NAME,
        WECHAT_PERSONAL_REGISTER_CALLBACK_TOOL_NAME,
        WECHAT_PERSONAL_ROTATE_WEBHOOK_CREDENTIAL_TOOL_NAME,
        WECHAT_PERSONAL_REVOKE_WEBHOOK_CREDENTIAL_TOOL_NAME,
        WECHAT_PERSONAL_RESET_CONVERSATION_TOOL_NAME,
        WECHAT_PERSONAL_SEARCH_MESSAGE_LOGS_TOOL_NAME,
        WECHAT_PERSONAL_SET_ACCOUNT_ENABLED_TOOL_NAME
      ].sort()
    )
    expect((middleware.tools ?? []).map((item: any) => item.name)).not.toContain(WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME)
  })

  it('defaults to user tool mode when no explicit mode is configured', async () => {
    const middleware = await Promise.resolve(
      createMiddleware().createMiddleware(
        { integrationId: 'integration-1' },
        {
          node: {
            options: {}
          }
        } as any
      )
    )

    expect((middleware.tools ?? []).map((item: any) => item.name)).toEqual([WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME])
  })

  it('registers only controlled send tool for user-facing assistants', async () => {
    const middleware = await Promise.resolve(
      createMiddleware().createMiddleware(
        { integrationId: 'integration-1', toolMode: 'user' },
        {
          node: {
            options: {}
          }
        } as any
      )
    )

    expect((middleware.tools ?? []).map((item: any) => item.name)).toEqual([WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME])
    expect(middleware.stateSchema).toBeDefined()
  })

  it('resolves integration id from the assistant trigger binding for runtime tools', async () => {
    const conversationService = {
      getBoundIntegrationIdForXpert: jest.fn(async () => 'integration-1'),
      getRuntimeStatus: jest.fn(async () => ({ summary: { accountCount: 1 } }))
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService).createMiddleware(
        { toolMode: 'admin' },
        {
          xpertId: 'xpert-1',
          node: {
            options: {}
          }
        } as any
      )
    )

    const runtimeStatusTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_PERSONAL_GET_RUNTIME_STATUS_TOOL_NAME
    ) as any
    const result = JSON.parse(await runtimeStatusTool.handler({}))

    expect(conversationService.getBoundIntegrationIdForXpert).toHaveBeenCalledWith('xpert-1')
    expect(conversationService.getRuntimeStatus).toHaveBeenCalledWith('integration-1')
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          summary: expect.objectContaining({ accountCount: 1 })
        })
      })
    )
  })

  it('returns organization runtime status when no integration is bound', async () => {
    const conversationService = {
      getBoundIntegrationIdForXpert: jest.fn(async () => null),
      getOrganizationRuntimeStatus: jest.fn(async () => ({
        scope: 'organization',
        summary: {
          integrationCount: 2,
          accountCount: 3
        }
      }))
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService).createMiddleware(
        { toolMode: 'admin' },
        {
          xpertId: 'xpert-admin',
          node: {
            options: {}
          }
        } as any
      )
    )

    const runtimeStatusTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_PERSONAL_GET_RUNTIME_STATUS_TOOL_NAME
    ) as any
    const result = JSON.parse(await runtimeStatusTool.handler({}))

    expect(conversationService.getBoundIntegrationIdForXpert).toHaveBeenCalledWith('xpert-admin')
    expect(conversationService.getOrganizationRuntimeStatus).toHaveBeenCalledTimes(1)
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          scope: 'organization',
          summary: expect.objectContaining({ integrationCount: 2 })
        })
      })
    )
  })

  it('rejects manually supplied scheduled send parameters without runtime state injection', async () => {
    const conversationService = {
      findOutboundByIdempotencyKey: jest.fn(async () => null),
      logOutbound: jest.fn(async () => undefined)
    }
    const wechatChannel = {
      sendReplyByIntegrationId: jest.fn(async () => ({
        success: true,
        queued: true,
        outboundLogId: 'outbound-log-1',
        items: [
          {
            type: 'text',
            success: true,
            queued: true,
            outboundLogId: 'outbound-log-1',
            content: '早报',
            payloadSummary: JSON.stringify({
              type: 'text',
              source: 'scheduled_agent',
              idempotencyKey: 'daily-news:2026-06-16'
            })
          }
        ]
      }))
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService, wechatChannel).createMiddleware(
        {
          integrationId: 'integration-1',
          toolMode: 'user'
        },
        {
          xpertId: 'xpert-1',
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          userId: 'user-1',
          node: {
            options: {}
          }
        } as any
      )
    )

    const sendTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME
    ) as any
    const result = JSON.parse(
      await sendTool.handler({
        content: '早报',
        idempotencyKey: 'daily-news:2026-06-16',
        __wechatPersonalRuntimeSend: {
          uuid: 'uuid-1',
          contactId: 'room@chatroom',
          chatType: 'group',
          atUsers: ['wxid_member']
        }
      })
    )

    expect(conversationService.findOutboundByIdempotencyKey).not.toHaveBeenCalled()
    expect(wechatChannel.sendReplyByIntegrationId).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: 'Personal WeChat scheduled send parameters were not provided in runtime state.'
      })
    )
  })

  it('uses scheduled send parameters and idempotency key from runtime state', async () => {
    const conversationService = {
      findOutboundByIdempotencyKey: jest.fn(async () => null),
      logOutbound: jest.fn(async () => undefined)
    }
    const wechatChannel = {
      sendReplyByIntegrationId: jest.fn(async () => ({
        success: true,
        queued: true,
        outboundLogId: 'outbound-log-1',
        items: []
      }))
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService, wechatChannel).createMiddleware(
        {
          integrationId: 'integration-1',
          toolMode: 'user'
        },
        {
          xpertId: 'xpert-1',
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          userId: 'user-1',
          node: {
            options: {}
          }
        } as any
      )
    )
    const sendTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME
    ) as any
    const toolHandler = jest.fn(async (request) => sendTool.handler(request.toolCall.args))
    const result = JSON.parse(
      `${await middleware.wrapToolCall?.(
        {
          toolCall: {
            id: 'tool-call-1',
            name: WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME,
            type: 'tool_call',
            args: {
              content: '今日新闻'
            }
          },
          tool: sendTool,
          state: {
            [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]: 'daily-news:2026-06-16',
            [WECHAT_PERSONAL_SCHEDULE_UUID_STATE_KEY]: 'uuid-1',
            [WECHAT_PERSONAL_SCHEDULE_CONTACT_ID_STATE_KEY]: 'daily@chatroom',
            [WECHAT_PERSONAL_SCHEDULE_CHAT_TYPE_STATE_KEY]: 'group',
            [WECHAT_PERSONAL_SCHEDULE_AT_USERS_STATE_KEY]: ['wxid_state']
          },
          runtime: {}
        } as any,
        toolHandler as any
      )}`
    )

    expect(toolHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          args: expect.objectContaining({
            idempotencyKey: 'daily-news:2026-06-16',
            atUsers: ['wxid_state'],
            __wechatPersonalRuntimeSend: expect.objectContaining({
              uuid: 'uuid-1',
              contactId: 'daily@chatroom',
              chatType: 'group',
              atUsers: ['wxid_state']
            }),
            __wechatPersonalRuntimeSendToken: expect.any(String)
          })
        })
      })
    )

    expect(conversationService.findOutboundByIdempotencyKey).toHaveBeenCalledWith(
      'integration-1',
      'daily-news:2026-06-16'
    )
    expect(wechatChannel.sendReplyByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'daily@chatroom',
        content: '今日新闻',
        atUsers: ['wxid_state'],
        source: 'scheduled_agent',
        idempotencyKey: 'daily-news:2026-06-16',
        context: expect.objectContaining({
          xpertId: 'xpert-1',
          tenantId: 'tenant-1',
          channelSource: 'wechat_personal_agent_tool'
        })
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          uuid: 'uuid-1',
          contactId: 'daily@chatroom'
        })
      })
    )
  })

  it('adds scheduled-send guidance when runtime state includes send parameters', async () => {
    const middleware = await Promise.resolve(
      createMiddleware().createMiddleware(
        {
          integrationId: 'integration-1',
          toolMode: 'user'
        },
        {
          node: {
            key: 'Middleware_WechatPersonalRuntime',
            options: {}
          }
        } as any
      )
    )
    const handler = jest.fn(async (request) => request.systemMessage?.content)

    const content = await middleware.wrapModelCall?.(
      {
        state: {
          [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]: 'daily-news:2026-06-16',
          [WECHAT_PERSONAL_SCHEDULE_UUID_STATE_KEY]: 'uuid-1',
          [WECHAT_PERSONAL_SCHEDULE_CONTACT_ID_STATE_KEY]: 'daily@chatroom'
        },
        systemMessage: { content: 'base' },
        messages: [],
        tools: [],
        runtime: {}
      } as any,
      handler as any
    )

    expect(content).toContain('base')
    expect(content).toContain('trusted Personal WeChat scheduled-send parameters')
    expect(content).toContain(WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME)
  })

  it('skips proactive sends when idempotency key already exists', async () => {
    const conversationService = {
      findOutboundByIdempotencyKey: jest.fn(async () => ({
        id: 'outbound-log-existing',
        status: 'queued',
        queueJobId: 'queue-job-1'
      }))
    }
    const wechatChannel = {
      sendReplyByIntegrationId: jest.fn()
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService, wechatChannel).createMiddleware(
        {
          integrationId: 'integration-1',
          toolMode: 'user'
        },
        {
          node: {
            options: {}
          }
        } as any
      )
    )

    const sendTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME
    ) as any
    const toolHandler = jest.fn(async (request) => sendTool.handler(request.toolCall.args))
    const result = JSON.parse(
      `${await middleware.wrapToolCall?.(
        {
          toolCall: {
            id: 'tool-call-1',
            name: WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME,
            type: 'tool_call',
            args: {
              content: '早报'
            }
          },
          tool: sendTool,
          state: {
            [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]: 'daily-news:2026-06-16',
            [WECHAT_PERSONAL_SCHEDULE_UUID_STATE_KEY]: 'uuid-1',
            [WECHAT_PERSONAL_SCHEDULE_CONTACT_ID_STATE_KEY]: 'room@chatroom'
          },
          runtime: {}
        } as any,
        toolHandler as any
      )}`
    )

    expect(wechatChannel.sendReplyByIntegrationId).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          duplicate: true,
          outboundLogId: 'outbound-log-existing',
          status: 'queued'
        })
      })
    )
  })
})
