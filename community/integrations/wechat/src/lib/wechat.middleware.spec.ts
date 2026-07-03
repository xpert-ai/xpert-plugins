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
  WechatConversationService: class WechatConversationService {}
}))

jest.mock('./wechat-channel.strategy.js', () => ({
  WechatChannelStrategy: class WechatChannelStrategy {}
}))

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY,
  XPERT_TASK_SCHEDULE_PROPERTY_PREFIX
} from '@xpert-ai/contracts'
import {
  WECHAT_CANCEL_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_GET_CALLBACK_CONFIG_TOOL_NAME,
  WECHAT_GET_RUNTIME_STATUS_TOOL_NAME,
  WECHAT_LIST_ACCOUNTS_TOOL_NAME,
  WECHAT_LIST_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_MIDDLEWARE_NAME,
  WECHAT_PAUSE_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_REVOKE_WEBHOOK_CREDENTIAL_TOOL_NAME,
  WECHAT_RESUME_OUTBOUND_ACCOUNT_TOOL_NAME,
  WECHAT_RETRY_OUTBOUND_QUEUE_TOOL_NAME,
  WECHAT_ROTATE_WEBHOOK_CREDENTIAL_TOOL_NAME,
  WECHAT_RUNTIME_FEATURE,
  WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME,
  WECHAT_SEARCH_MESSAGE_LOGS_TOOL_NAME,
  WECHAT_SEND_FILE_TOOL_NAME,
  WECHAT_SEND_MESSAGE_TOOL_NAME,
  WECHAT_SET_ACCOUNT_ENABLED_TOOL_NAME,
  WECHAT_WORKBENCH_FEATURE
} from './constants.js'
import { WechatRuntimeMiddleware } from './wechat.middleware.js'

const WECHAT_SCHEDULE_UUID_STATE_KEY = `${XPERT_TASK_SCHEDULE_PROPERTY_PREFIX}uuid`
const WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY = `${XPERT_TASK_SCHEDULE_PROPERTY_PREFIX}contact_id`
const WECHAT_SCHEDULE_CHAT_TYPE_STATE_KEY = `${XPERT_TASK_SCHEDULE_PROPERTY_PREFIX}chat_type`
const WECHAT_SCHEDULE_AT_USERS_STATE_KEY = `${XPERT_TASK_SCHEDULE_PROPERTY_PREFIX}at_users`

describe('WechatRuntimeMiddleware', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function createTempFile(name = 'report.txt', content = 'hello file') {
    const dir = await mkdtemp(join(tmpdir(), 'wechat-middleware-file-'))
    tempDirs.push(dir)
    const filePath = join(dir, name)
    await writeFile(filePath, content)
    return { filePath, content }
  }

  function createMiddleware(conversationService: Record<string, unknown> = {}, wechatChannel: Record<string, unknown> = {}) {
    const outboundQueue = {
      cancelOutboundQueueItem: jest.fn(async () => ({ success: true })),
      retryOutboundQueueItem: jest.fn(async () => ({ success: true })),
      pauseOutboundAccount: jest.fn(async () => undefined),
      resumeOutboundAccount: jest.fn(async () => 0)
    }
    return new WechatRuntimeMiddleware(conversationService as any, wechatChannel as any, outboundQueue as any)
  }

  it('exposes runtime features for agent view discovery', () => {
    const middleware = createMiddleware()

    expect(middleware.meta.name).toBe(WECHAT_MIDDLEWARE_NAME)
    expect(middleware.meta.features).toEqual(
      expect.arrayContaining([WECHAT_RUNTIME_FEATURE, WECHAT_WORKBENCH_FEATURE])
    )
  })

  it('keeps scheduled send parameters in runtime state instead of middleware config targets', () => {
    const middleware = createMiddleware()
    const configSchema = middleware.meta.configSchema as { properties?: Record<string, unknown> }
    const runtime = middleware.createMiddleware(
      { integrationId: 'integration-1', toolMode: 'user' },
      { node: { options: {} } } as any
    ) as any
    const properties = runtime.stateFormSchema.properties as Record<string, any>

    expect(configSchema.properties?.scheduleTargets).toBeUndefined()
    expect((middleware.meta as { scheduleTarget?: unknown }).scheduleTarget).toBeUndefined()
    expect(runtime.stateSchema.shape[WECHAT_SCHEDULE_UUID_STATE_KEY]).toBeDefined()
    expect(properties[WECHAT_SCHEDULE_UUID_STATE_KEY]).toBeDefined()
    expect(properties[WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY]).toBeDefined()
    expect(properties[WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY].type).toBe('array')
    expect(properties[WECHAT_SCHEDULE_CHAT_TYPE_STATE_KEY]['x-ui'].enumLabels.group.zh_Hans).toBe('群聊')
  })

  it('registers WeChat management tools', async () => {
    const middleware = await Promise.resolve(
      createMiddleware().createMiddleware(
        { integrationId: 'integration-1', toolMode: 'admin' },
        {
          node: {
            key: 'Middleware_WechatRuntime',
            options: {}
          }
        } as any
      )
    )

    expect(middleware.name).toBe(WECHAT_MIDDLEWARE_NAME)
    expect((middleware.tools ?? []).map((item: any) => item.name).sort()).toEqual(
      [
        WECHAT_GET_CALLBACK_CONFIG_TOOL_NAME,
        WECHAT_GET_RUNTIME_STATUS_TOOL_NAME,
        WECHAT_LIST_ACCOUNTS_TOOL_NAME,
        WECHAT_LIST_OUTBOUND_QUEUE_TOOL_NAME,
        WECHAT_CANCEL_OUTBOUND_QUEUE_TOOL_NAME,
        WECHAT_RETRY_OUTBOUND_QUEUE_TOOL_NAME,
        WECHAT_PAUSE_OUTBOUND_ACCOUNT_TOOL_NAME,
        WECHAT_RESUME_OUTBOUND_ACCOUNT_TOOL_NAME,
        WECHAT_ROTATE_WEBHOOK_CREDENTIAL_TOOL_NAME,
        WECHAT_REVOKE_WEBHOOK_CREDENTIAL_TOOL_NAME,
        WECHAT_SEARCH_MESSAGE_LOGS_TOOL_NAME,
        WECHAT_SET_ACCOUNT_ENABLED_TOOL_NAME
      ].sort()
    )
    expect((middleware.tools ?? []).map((item: any) => item.name)).not.toContain(WECHAT_SEND_MESSAGE_TOOL_NAME)
    expect((middleware.tools ?? []).map((item: any) => item.name)).not.toContain(WECHAT_SEND_FILE_TOOL_NAME)
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

    expect((middleware.tools ?? []).map((item: any) => item.name)).toEqual([
      WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME,
      WECHAT_SEND_MESSAGE_TOOL_NAME,
      WECHAT_SEND_FILE_TOOL_NAME
    ])
  })

  it('registers controlled user-facing chat tools for assistants', async () => {
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

    expect((middleware.tools ?? []).map((item: any) => item.name)).toEqual([
      WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME,
      WECHAT_SEND_MESSAGE_TOOL_NAME,
      WECHAT_SEND_FILE_TOOL_NAME
    ])
    expect(middleware.stateSchema).toBeDefined()

    const historyTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME
    ) as any
    expect(Object.keys(historyTool.schema.shape)).toEqual(['keyword', 'direction', 'before', 'after', 'limit'])
  })

  it('searches current WeChat chat history from runtime configurable context', async () => {
    const conversationService = {
      searchChatHistory: jest.fn(async () => ({
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        items: [],
        totalScanned: 0,
        hasMore: false
      }))
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService).createMiddleware(
        { toolMode: 'user' },
        {
          xpertId: 'xpert-1',
          node: {
            options: {}
          }
        } as any
      )
    )

    const historyTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME
    ) as any
    const result = JSON.parse(
      await historyTool.handler(
        { keyword: '合同', limit: 5 },
        {
          configurable: {
            context: {
              integrationId: 'integration-1',
              uuid: 'uuid-1',
              contactId: 'room@chatroom',
              chatType: 'group',
              senderId: 'wxid_sender'
            }
          }
        }
      )
    )

    expect(conversationService.searchChatHistory).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        keyword: '合同',
        limit: 5,
        enforceTriggerFilters: true
      })
    )
    expect(result).toEqual(expect.objectContaining({ success: true }))
  })

  it('reads current WeChat context from tool runtime configurable context', async () => {
    const conversationService = {
      searchChatHistory: jest.fn(async () => ({
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        items: [],
        totalScanned: 0,
        hasMore: false
      }))
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService).createMiddleware(
        { toolMode: 'user' },
        {
          xpertId: 'xpert-1',
          node: {
            options: {}
          }
        } as any
      )
    )
    const historyTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME
    ) as any
    const toolHandler = jest.fn(async (request) => historyTool.handler(request.toolCall.args, request.runtime))

    await middleware.wrapToolCall?.(
      {
        toolCall: {
          id: 'tool-call-1',
          name: WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME,
          type: 'tool_call',
          args: {
            direction: 'inbound'
          }
        },
        tool: historyTool,
        state: {},
        runtime: {
          configurable: {
            context: {
              integrationId: 'integration-1',
              uuid: 'uuid-1',
              contactId: 'room@chatroom',
              chatType: 'group',
              sourceMessageLogIds: ['inbound-log-1']
            }
          }
        }
      } as any,
      toolHandler as any
    )

    expect(toolHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          args: expect.objectContaining({
            direction: 'inbound'
          })
        })
      })
    )
    expect(toolHandler.mock.calls[0][0].toolCall.args).toEqual({ direction: 'inbound' })
    expect(conversationService.searchChatHistory).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'room@chatroom',
        chatType: 'group',
        direction: 'inbound',
        excludedLogIds: ['inbound-log-1'],
        enforceTriggerFilters: true
      })
    )
  })

  it('uses single scheduled target state as chat history runtime context', async () => {
    const conversationService = {
      searchChatHistory: jest.fn(async () => ({
        integrationId: 'integration-1',
        uuid: 'uuid-1',
        contactId: 'daily@chatroom',
        chatType: 'group',
        items: [],
        totalScanned: 0,
        hasMore: false
      }))
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService).createMiddleware(
        { integrationId: 'integration-1', toolMode: 'user' },
        {
          xpertId: 'xpert-1',
          node: {
            options: {}
          }
        } as any
      )
    )
    const historyTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME
    ) as any
    const toolHandler = jest.fn(async (request) => historyTool.handler(request.toolCall.args, request.runtime))
    const result = JSON.parse(
      `${await middleware.wrapToolCall?.(
        {
          toolCall: {
            id: 'tool-call-1',
            name: WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME,
            type: 'tool_call',
            args: {
              keyword: '日报',
              limit: 10
            }
          },
          tool: historyTool,
          state: {
            [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]: 'daily-news:2026-06-16',
            [WECHAT_SCHEDULE_UUID_STATE_KEY]: 'uuid-1',
            [WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY]: 'daily@chatroom',
            [WECHAT_SCHEDULE_CHAT_TYPE_STATE_KEY]: 'group'
          },
          runtime: {}
        } as any,
        toolHandler as any
      )}`
    )

    expect(toolHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({
          configurable: expect.objectContaining({
            context: expect.objectContaining({
              uuid: 'uuid-1',
              contactId: 'daily@chatroom',
              chatId: 'daily@chatroom',
              chatType: 'group'
            })
          })
        })
      })
    )
    expect(conversationService.searchChatHistory).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'daily@chatroom',
        chatType: 'group',
        keyword: '日报',
        limit: 10,
        enforceTriggerFilters: true
      })
    )
    expect(result).toEqual(expect.objectContaining({ success: true }))
  })

  it('rejects scheduled chat history search for multiple targets', async () => {
    const conversationService = {
      searchChatHistory: jest.fn()
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService).createMiddleware(
        { integrationId: 'integration-1', toolMode: 'user' },
        {
          node: {
            options: {}
          }
        } as any
      )
    )
    const historyTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME
    ) as any
    const toolHandler = jest.fn(async (request) => historyTool.handler(request.toolCall.args, request.runtime))
    const result = JSON.parse(
      `${await middleware.wrapToolCall?.(
        {
          toolCall: {
            id: 'tool-call-1',
            name: WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME,
            type: 'tool_call',
            args: {
              keyword: '日报'
            }
          },
          tool: historyTool,
          state: {
            [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]: 'daily-news:2026-06-16',
            [WECHAT_SCHEDULE_UUID_STATE_KEY]: 'uuid-1',
            [WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY]: ['room-a@chatroom', 'wxid_friend']
          },
          runtime: {}
        } as any,
        toolHandler as any
      )}`
    )

    expect(toolHandler).not.toHaveBeenCalled()
    expect(conversationService.searchChatHistory).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('exactly one target'),
        data: expect.objectContaining({
          targetCount: 2,
          targets: [
            expect.objectContaining({ contactId: 'room-a@chatroom', chatType: 'group' }),
            expect.objectContaining({ contactId: 'wxid_friend', chatType: 'private' })
          ]
        })
      })
    )
  })

  it('requires chat target identifiers when history tool has no runtime context', async () => {
    const conversationService = {
      searchChatHistory: jest.fn()
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService).createMiddleware(
        { integrationId: 'integration-1', toolMode: 'user' },
        {
          node: {
            options: {}
          }
        } as any
      )
    )

    const historyTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME
    ) as any
    const result = JSON.parse(await historyTool.handler({}))

    expect(conversationService.searchChatHistory).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('uuid or contactId')
      })
    )
  })

  it('sends a generated file to the current WeChat conversation context', async () => {
    const file = await createTempFile('report.txt', 'hello file')
    const conversationService = {
      findOutboundByIdempotencyKey: jest.fn(async () => null),
      logOutbound: jest.fn(async () => undefined)
    }
    const wechatChannel = {
      sendFileByIntegrationId: jest.fn(async () => ({
        success: true,
        queued: true,
        outboundLogId: 'outbound-log-1',
        queueJobId: 'queue-job-1'
      }))
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService, wechatChannel).createMiddleware(
        { toolMode: 'user' },
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

    const sendFileTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_SEND_FILE_TOOL_NAME
    ) as any
    const result = JSON.parse(
      await sendFileTool.handler(
        {
          file: {
            path: file.filePath,
            originalName: 'report.txt',
            mimeType: 'text/plain'
          }
        },
        {
          configurable: {
            context: {
              integrationId: 'integration-1',
              uuid: 'uuid-1',
              contactId: 'wxid_friend',
              chatType: 'private'
            }
          }
        }
      )
    )

    expect(wechatChannel.sendFileByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        source: 'agent_tool',
        file: expect.objectContaining({
          filePath: file.filePath,
          fileName: 'report.txt',
          mimeType: 'text/plain',
          size: Buffer.byteLength(file.content),
          fileContent: Buffer.from(file.content).toString('base64')
        }),
        context: expect.objectContaining({
          tenantId: 'tenant-1',
          contactId: 'wxid_friend',
          chatType: 'private'
        })
      })
    )
    expect(conversationService.findOutboundByIdempotencyKey).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          validatedFile: expect.objectContaining({
            filePath: file.filePath,
            fileName: 'report.txt',
            size: Buffer.byteLength(file.content),
            sha256: expect.any(String)
          }),
          targetCount: 1,
          successCount: 1,
          outboundLogId: 'outbound-log-1'
        })
      })
    )
  })

  it('rejects manually supplied file send targets without middleware injection', async () => {
    const file = await createTempFile('report.txt', 'hello file')
    const conversationService = {
      findOutboundByIdempotencyKey: jest.fn(async () => null)
    }
    const wechatChannel = {
      sendFileByIntegrationId: jest.fn()
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService, wechatChannel).createMiddleware(
        { integrationId: 'integration-1', toolMode: 'user' },
        {
          node: {
            options: {}
          }
        } as any
      )
    )

    const sendFileTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_SEND_FILE_TOOL_NAME
    ) as any
    const result = JSON.parse(
      await sendFileTool.handler({
        file: { path: file.filePath },
        __wechatRuntimeSend: {
          uuid: 'uuid-1',
          contactId: 'wxid_friend'
        }
      })
    )

    expect(wechatChannel.sendFileByIntegrationId).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: 'WeChat scheduled send parameters were not provided in runtime state.'
      })
    )
  })

  it('returns file validation errors without calling the WeChat channel', async () => {
    const conversationService = {
      findOutboundByIdempotencyKey: jest.fn(async () => null)
    }
    const wechatChannel = {
      sendFileByIntegrationId: jest.fn()
    }
    const middleware = await Promise.resolve(
      createMiddleware(conversationService, wechatChannel).createMiddleware(
        { integrationId: 'integration-1', toolMode: 'user' },
        {
          node: {
            options: {}
          }
        } as any
      )
    )

    const sendFileTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_SEND_FILE_TOOL_NAME
    ) as any
    const result = JSON.parse(
      await sendFileTool.handler(
        {
          file: { path: '/tmp/not-found-wechat-file.txt' }
        },
        {
          configurable: {
            context: {
              integrationId: 'integration-1',
              uuid: 'uuid-1',
              contactId: 'wxid_friend'
            }
          }
        }
      )
    )

    expect(wechatChannel.sendFileByIntegrationId).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('无法读取文件')
      })
    )
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
      (item: any) => item.name === WECHAT_GET_RUNTIME_STATUS_TOOL_NAME
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
      (item: any) => item.name === WECHAT_GET_RUNTIME_STATUS_TOOL_NAME
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
      (item: any) => item.name === WECHAT_SEND_MESSAGE_TOOL_NAME
    ) as any
    const result = JSON.parse(
      await sendTool.handler({
        content: '早报',
        idempotencyKey: 'daily-news:2026-06-16',
        __wechatRuntimeSend: {
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
        message: 'WeChat scheduled send parameters were not provided in runtime state.'
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
      (item: any) => item.name === WECHAT_SEND_MESSAGE_TOOL_NAME
    ) as any
    const toolHandler = jest.fn(async (request) => sendTool.handler(request.toolCall.args))
    const result = JSON.parse(
      `${await middleware.wrapToolCall?.(
        {
          toolCall: {
            id: 'tool-call-1',
            name: WECHAT_SEND_MESSAGE_TOOL_NAME,
            type: 'tool_call',
            args: {
              content: '今日新闻'
            }
          },
          tool: sendTool,
          state: {
            [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]: 'daily-news:2026-06-16',
            [WECHAT_SCHEDULE_UUID_STATE_KEY]: 'uuid-1',
            [WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY]: 'daily@chatroom',
            [WECHAT_SCHEDULE_CHAT_TYPE_STATE_KEY]: 'group',
            [WECHAT_SCHEDULE_AT_USERS_STATE_KEY]: ['wxid_state']
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
            __wechatRuntimeSend: {
              targets: [
                expect.objectContaining({
                  uuid: 'uuid-1',
                  contactId: 'daily@chatroom',
                  chatType: 'group',
                  atUsers: ['wxid_state']
                })
              ]
            },
            __wechatRuntimeSendToken: expect.any(String)
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
          channelSource: 'wechat_agent_tool'
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

  it('uses scheduled send parameters for file delivery tools', async () => {
    const file = await createTempFile('report.pdf', 'file bytes')
    const conversationService = {
      findOutboundByIdempotencyKey: jest.fn(async () => null),
      logOutbound: jest.fn(async () => undefined)
    }
    const wechatChannel = {
      sendFileByIntegrationId: jest.fn(async () => ({
        success: true,
        queued: true,
        outboundLogId: 'outbound-file-log-1'
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
    const sendFileTool = (middleware.tools ?? []).find(
      (item: any) => item.name === WECHAT_SEND_FILE_TOOL_NAME
    ) as any
    const toolHandler = jest.fn(async (request) => sendFileTool.handler(request.toolCall.args))
    const result = JSON.parse(
      `${await middleware.wrapToolCall?.(
        {
          toolCall: {
            id: 'tool-call-1',
            name: WECHAT_SEND_FILE_TOOL_NAME,
            type: 'tool_call',
            args: {
              file: {
                path: file.filePath,
                originalName: 'report.pdf'
              }
            }
          },
          tool: sendFileTool,
          state: {
            [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]: 'file-send:2026-06-16',
            [WECHAT_SCHEDULE_UUID_STATE_KEY]: 'uuid-1',
            [WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY]: 'daily@chatroom',
            [WECHAT_SCHEDULE_CHAT_TYPE_STATE_KEY]: 'group'
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
            idempotencyKey: 'file-send:2026-06-16',
            __wechatRuntimeSend: {
              targets: [
                expect.objectContaining({
                  uuid: 'uuid-1',
                  contactId: 'daily@chatroom',
                  chatType: 'group'
                })
              ]
            },
            __wechatRuntimeSendToken: expect.any(String)
          })
        })
      })
    )
    expect(conversationService.findOutboundByIdempotencyKey).toHaveBeenCalledWith(
      'integration-1',
      'file-send:2026-06-16'
    )
    expect(wechatChannel.sendFileByIntegrationId).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'daily@chatroom',
        source: 'scheduled_agent',
        idempotencyKey: 'file-send:2026-06-16',
        file: expect.objectContaining({
          filePath: file.filePath,
          fileName: 'report.pdf',
          fileContent: Buffer.from(file.content).toString('base64')
        }),
        context: expect.objectContaining({
          chatType: 'group',
          contactId: 'daily@chatroom'
        })
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          validatedFile: expect.objectContaining({
            fileName: 'report.pdf'
          }),
          contactId: 'daily@chatroom',
          outboundLogId: 'outbound-file-log-1'
        })
      })
    )
  })

  it('sends scheduled content to every configured runtime destination', async () => {
    const conversationService = {
      findOutboundByIdempotencyKey: jest.fn(async () => null),
      logOutbound: jest.fn(async () => undefined)
    }
    const wechatChannel = {
      sendReplyByIntegrationId: jest.fn(async (_integrationId, input) => ({
        success: true,
        queued: true,
        outboundLogId: `outbound-log-${input.contactId}`,
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
      (item: any) => item.name === WECHAT_SEND_MESSAGE_TOOL_NAME
    ) as any
    const toolHandler = jest.fn(async (request) => sendTool.handler(request.toolCall.args))
    const result = JSON.parse(
      `${await middleware.wrapToolCall?.(
        {
          toolCall: {
            id: 'tool-call-1',
            name: WECHAT_SEND_MESSAGE_TOOL_NAME,
            type: 'tool_call',
            args: {
              content: '群公告'
            }
          },
          tool: sendTool,
          state: {
            [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]: 'notice:2026-06-22',
            [WECHAT_SCHEDULE_UUID_STATE_KEY]: 'uuid-1',
            [WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY]: ['room-a@chatroom', 'wxid_friend'],
            [WECHAT_SCHEDULE_AT_USERS_STATE_KEY]: ['wxid_state']
          },
          runtime: {}
        } as any,
        toolHandler as any
      )}`
    )

    expect(conversationService.findOutboundByIdempotencyKey).toHaveBeenCalledTimes(2)
    const idempotencyKeys = (conversationService.findOutboundByIdempotencyKey as jest.Mock).mock.calls.map(
      (call) => call[1]
    )
    expect(new Set(idempotencyKeys).size).toBe(2)
    expect(idempotencyKeys[0]).toContain('notice:2026-06-22:target:uuid-1:')
    expect(idempotencyKeys[1]).toContain('notice:2026-06-22:target:uuid-1:')
    expect(wechatChannel.sendReplyByIntegrationId).toHaveBeenNthCalledWith(
      1,
      'integration-1',
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'room-a@chatroom',
        content: '群公告',
        atUsers: ['wxid_state'],
        source: 'scheduled_agent',
        idempotencyKey: idempotencyKeys[0],
        context: expect.objectContaining({
          chatType: 'group',
          contactId: 'room-a@chatroom'
        })
      })
    )
    expect(wechatChannel.sendReplyByIntegrationId).toHaveBeenNthCalledWith(
      2,
      'integration-1',
      expect.objectContaining({
        uuid: 'uuid-1',
        contactId: 'wxid_friend',
        content: '群公告',
        atUsers: ['wxid_state'],
        source: 'scheduled_agent',
        idempotencyKey: idempotencyKeys[1],
        context: expect.objectContaining({
          chatType: 'private',
          contactId: 'wxid_friend'
        })
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          targetCount: 2,
          successCount: 2,
          failureCount: 0,
          targets: [
            expect.objectContaining({ contactId: 'room-a@chatroom', success: true }),
            expect.objectContaining({ contactId: 'wxid_friend', success: true })
          ]
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
            key: 'Middleware_WechatRuntime',
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
          [WECHAT_SCHEDULE_UUID_STATE_KEY]: 'uuid-1',
          [WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY]: 'daily@chatroom'
        },
        systemMessage: { content: 'base' },
        messages: [],
        tools: [],
        runtime: {}
      } as any,
      handler as any
    )

    expect(content).toContain('base')
    expect(content).toContain('trusted WeChat scheduled-send parameters')
    expect(content).toContain(WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME)
    expect(content).toContain(WECHAT_SEND_MESSAGE_TOOL_NAME)
    expect(content).toContain(WECHAT_SEND_FILE_TOOL_NAME)
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
      (item: any) => item.name === WECHAT_SEND_MESSAGE_TOOL_NAME
    ) as any
    const toolHandler = jest.fn(async (request) => sendTool.handler(request.toolCall.args))
    const result = JSON.parse(
      `${await middleware.wrapToolCall?.(
        {
          toolCall: {
            id: 'tool-call-1',
            name: WECHAT_SEND_MESSAGE_TOOL_NAME,
            type: 'tool_call',
            args: {
              content: '早报'
            }
          },
          tool: sendTool,
          state: {
            [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]: 'daily-news:2026-06-16',
            [WECHAT_SCHEDULE_UUID_STATE_KEY]: 'uuid-1',
            [WECHAT_SCHEDULE_CONTACT_ID_STATE_KEY]: 'room@chatroom'
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
