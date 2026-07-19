jest.mock('@xpert-ai/plugin-sdk', () => {
  const { createLarkPluginSdkMock } = require('../../../../../test-utils/larkPluginSdkMock.cjs')
  return createLarkPluginSdkMock(jest, {
    AgentMiddlewareStrategy: () => (target: unknown) => target,
    WORKSPACE_FILES_SOURCE: 'workspace_files',
    WorkspaceFilesRuntimeCapability: Symbol('WorkspaceFilesRuntimeCapability')
  })
})

import { LarkRuntimeMiddleware } from './lark-runtime.middleware.js'

describe('LarkRuntimeMiddleware', () => {
  it('combines the three Lark capabilities into one exact tool surface', async () => {
    const callOrder: string[] = []
    const localHistoryMiddleware = {
      meta: { configSchema: { type: 'object', properties: {} } },
      createMiddleware: jest.fn().mockReturnValue({
        name: 'local',
        tools: [{ name: 'lark_search_chat_history' }]
      })
    }
    const notifyMiddleware = {
      meta: {
        configSchema: {
          type: 'object',
          properties: {
            integrationId: { type: 'string' },
            recipient_type: { type: 'string' },
            recipient_id: { type: 'string' },
            template: { type: 'object' },
            lookupTools: { type: 'object' },
            defaults: {
              type: 'object',
              properties: { postLocale: { type: 'string' }, timeoutMs: { type: 'number' } }
            }
          }
        }
      },
      createMiddleware: jest.fn().mockReturnValue({
        name: 'notify',
        beforeAgent: async () => ({ notifyReady: true }),
        wrapModelCall: async (request: unknown, handler: (value: unknown) => unknown) => {
          callOrder.push('notify')
          return handler(request)
        },
        tools: [
          { name: 'lark_send_text_notification' },
          { name: 'lark_send_rich_notification' },
          { name: 'lark_send_file' },
          { name: 'lark_update_message' },
          { name: 'lark_recall_message' },
          { name: 'lark_list_users' },
          { name: 'lark_list_chats' }
        ]
      })
    }
    const conversationContextMiddleware = {
      meta: {
        configSchema: {
          type: 'object',
          properties: {
            integrationId: { type: 'string' },
            defaults: {
              type: 'object',
              properties: {
                pageSize: { type: 'number' },
                resourceContentMode: { type: 'string' }
              }
            }
          }
        }
      },
      createMiddleware: jest.fn().mockReturnValue({
        name: 'remote',
        beforeAgent: async () => ({ remoteReady: true }),
        wrapModelCall: async (request: unknown, handler: (value: unknown) => unknown) => {
          callOrder.push('remote')
          return handler(request)
        },
        tools: [{ name: 'lark_list_messages' }, { name: 'lark_get_message' }, { name: 'lark_get_message_resource' }]
      })
    }
    const strategy = new LarkRuntimeMiddleware(
      localHistoryMiddleware as never,
      notifyMiddleware as never,
      conversationContextMiddleware as never
    )

    const middleware = await strategy.createMiddleware(
      { integrationId: 'integration-must-not-override-trigger' },
      {} as never
    )

    expect(strategy.meta.label.zh_Hans).toBe('飞书运行时')
    expect(strategy.meta.configSchema?.properties).not.toHaveProperty('integrationId')
    expect(strategy.meta.configSchema?.properties).not.toHaveProperty('lookupTools')
    expect(strategy.meta.configSchema?.properties).not.toHaveProperty('recipient_type')
    expect(strategy.meta.configSchema?.properties).not.toHaveProperty('recipient_id')
    expect(strategy.meta.configSchema?.properties?.defaults).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          postLocale: expect.anything(),
          timeoutMs: expect.anything(),
          pageSize: expect.anything(),
          resourceContentMode: expect.anything()
        })
      })
    )
    expect(middleware.tools?.map((item) => item.name)).toEqual([
      'lark_search_chat_history',
      'lark_send_text_notification',
      'lark_send_rich_notification',
      'lark_send_file',
      'lark_update_message',
      'lark_recall_message',
      'lark_list_messages',
      'lark_get_message',
      'lark_get_message_resource'
    ])
    expect(notifyMiddleware.createMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: undefined,
        trustedTriggerOnly: true,
        lookupTools: { enabled: false }
      }),
      expect.anything()
    )
    expect(conversationContextMiddleware.createMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: undefined, trustedTriggerOnly: true, currentChatOnly: true }),
      expect.anything()
    )

    const beforeAgent = middleware.beforeAgent as (state: unknown, runtime: unknown) => Promise<unknown>
    await expect(beforeAgent({}, {})).resolves.toEqual({ remoteReady: true, notifyReady: true })
    const wrapModelCall = middleware.wrapModelCall!
    await wrapModelCall({} as never, async () => {
      callOrder.push('handler')
      return {} as never
    })
    expect(callOrder).toEqual(['remote', 'notify', 'handler'])
  })
})
