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
  WECHAT_PERSONAL_GET_CALLBACK_CONFIG_TOOL_NAME,
  WECHAT_PERSONAL_GET_RUNTIME_STATUS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_ACCOUNTS_TOOL_NAME,
  WECHAT_PERSONAL_LIST_CONVERSATIONS_TOOL_NAME,
  WECHAT_PERSONAL_MIDDLEWARE_NAME,
  WECHAT_PERSONAL_REGISTER_CALLBACK_TOOL_NAME,
  WECHAT_PERSONAL_RESET_CONVERSATION_TOOL_NAME,
  WECHAT_PERSONAL_RUNTIME_FEATURE,
  WECHAT_PERSONAL_SEARCH_MESSAGE_LOGS_TOOL_NAME,
  WECHAT_PERSONAL_SET_ACCOUNT_ENABLED_TOOL_NAME,
  WECHAT_PERSONAL_WORKBENCH_FEATURE
} from './constants.js'
import { WechatPersonalRuntimeMiddleware } from './wechat-personal.middleware.js'

describe('WechatPersonalRuntimeMiddleware', () => {
  it('exposes runtime features for agent view discovery', () => {
    const middleware = new WechatPersonalRuntimeMiddleware({} as any, {} as any)

    expect(middleware.meta.name).toBe(WECHAT_PERSONAL_MIDDLEWARE_NAME)
    expect(middleware.meta.features).toEqual(
      expect.arrayContaining([WECHAT_PERSONAL_RUNTIME_FEATURE, WECHAT_PERSONAL_WORKBENCH_FEATURE])
    )
  })

  it('registers Personal WeChat management tools', async () => {
    const middleware = await Promise.resolve(
      new WechatPersonalRuntimeMiddleware({} as any, {} as any).createMiddleware(
        { integrationId: 'integration-1' },
        {
          node: {
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
        WECHAT_PERSONAL_REGISTER_CALLBACK_TOOL_NAME,
        WECHAT_PERSONAL_RESET_CONVERSATION_TOOL_NAME,
        WECHAT_PERSONAL_SEARCH_MESSAGE_LOGS_TOOL_NAME,
        WECHAT_PERSONAL_SET_ACCOUNT_ENABLED_TOOL_NAME
      ].sort()
    )
  })

  it('resolves integration id from the assistant trigger binding for runtime tools', async () => {
    const conversationService = {
      getBoundIntegrationIdForXpert: jest.fn(async () => 'integration-1'),
      getRuntimeStatus: jest.fn(async () => ({ summary: { accountCount: 1 } }))
    }
    const middleware = await Promise.resolve(
      new WechatPersonalRuntimeMiddleware(conversationService as any, {} as any).createMiddleware(
        {},
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
      new WechatPersonalRuntimeMiddleware(conversationService as any, {} as any).createMiddleware(
        {},
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
})
