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
  WECHAT_PERSONAL_CANCEL_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PERSONAL_GET_CALLBACK_CONFIG_TOOL_NAME,
  WECHAT_PERSONAL_GET_RUNTIME_STATUS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_ACCOUNTS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_CONVERSATIONS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PERSONAL_MIDDLEWARE_NAME,
  WECHAT_PERSONAL_PAUSE_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_PERSONAL_REGISTER_CALLBACK_TOOL_NAME,
  WECHAT_PERSONAL_RESUME_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_PERSONAL_RETRY_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_PERSONAL_RESET_CONVERSATION_TOOL_NAME,
  WECHAT_PERSONAL_RUNTIME_FEATURE,
  WECHAT_PERSONAL_SEARCH_MESSAGE_LOGS_TOOL_NAME,
  WECHAT_PERSONAL_SEND_MESSAGE_TOOL_NAME,
  WECHAT_PERSONAL_SET_ACCOUNT_ENABLED_TOOL_NAME,
  WECHAT_PERSONAL_WORKBENCH_FEATURE
} from './constants.js'
import { WechatPersonalRuntimeMiddleware } from './wechat-personal.middleware.js'

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

  it('defines scheduleTargets in the middleware config schema', () => {
    const middleware = createMiddleware()
    const configSchema = middleware.meta.configSchema as { properties?: Record<string, unknown> }

    expect(configSchema.properties?.scheduleTargets).toBeDefined()
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

  it('sends proactive messages only to configured schedule targets', async () => {
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
          toolMode: 'user',
          scheduleTargets: [
            {
              id: 'morning-news-group',
              name: '早报群',
              uuid: 'uuid-1',
              contactId: 'room@chatroom',
              chatType: 'group',
              atUsers: ['wxid_member']
            }
          ]
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
        targetId: 'morning-news-group',
        content: '早报',
        idempotencyKey: 'daily-news:2026-06-16'
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
        contactId: 'room@chatroom',
        content: '早报',
        atUsers: ['wxid_member'],
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
          targetId: 'morning-news-group',
          outboundLogId: 'outbound-log-1'
        })
      })
    )
  })

  it('uses scheduled send target and idempotency key from runtime state', async () => {
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
          toolMode: 'user',
          scheduleTargets: [
            {
              id: 'daily-news',
              name: '每日新闻群',
              uuid: 'uuid-1',
              contactId: 'daily@chatroom',
              atUsers: ['wxid_default']
            }
          ]
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
            xpertTaskSchedule: {
              target: {
                type: 'WechatPersonalRuntimeMiddleware',
                nodeKey: 'Middleware_WechatPersonalRuntime',
                targetId: 'daily-news'
              },
              idempotencyKey: 'daily-news:2026-06-16',
              atUsers: ['wxid_state']
            }
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
            targetId: 'daily-news',
            idempotencyKey: 'daily-news:2026-06-16',
            atUsers: ['wxid_state']
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
        atUsers: ['wxid_default', 'wxid_state'],
        source: 'scheduled_agent',
        idempotencyKey: 'daily-news:2026-06-16'
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          targetId: 'daily-news'
        })
      })
    )
  })

  it('adds scheduled-send guidance when runtime state selects a target', async () => {
    const middleware = await Promise.resolve(
      createMiddleware().createMiddleware(
        {
          integrationId: 'integration-1',
          toolMode: 'user',
          scheduleTargets: [
            {
              id: 'daily-news',
              uuid: 'uuid-1',
              contactId: 'daily@chatroom'
            }
          ]
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
          xpertTaskSchedule: {
            target: {
              nodeKey: 'Middleware_WechatPersonalRuntime',
              targetId: 'daily-news'
            },
            idempotencyKey: 'daily-news:2026-06-16'
          }
        },
        systemMessage: { content: 'base' },
        messages: [],
        tools: [],
        runtime: {}
      } as any,
      handler as any
    )

    expect(content).toContain('base')
    expect(content).toContain('Target id: daily-news')
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
          toolMode: 'user',
          scheduleTargets: [
            {
              id: 'morning-news-group',
              uuid: 'uuid-1',
              contactId: 'room@chatroom'
            }
          ]
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
    const result = JSON.parse(
      await sendTool.handler({
        targetId: 'morning-news-group',
        content: '早报',
        idempotencyKey: 'daily-news:2026-06-16'
      })
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
