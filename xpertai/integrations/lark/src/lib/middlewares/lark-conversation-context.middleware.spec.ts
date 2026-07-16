jest.mock('@xpert-ai/plugin-sdk', () => {
  const { createLarkPluginSdkMock } = require('../../../../../test-utils/larkPluginSdkMock.cjs')
  return createLarkPluginSdkMock(jest, {
    AgentMiddlewareStrategy: () => (target: unknown) => target
  })
})

import { ToolMessage } from '@langchain/core/messages'
import { Command, getCurrentTaskInput } from '@langchain/langgraph'
import {
  LarkConversationContextMiddleware,
  LarkConversationContextMiddlewareConfig
} from './lark-conversation-context.middleware.js'
import { LarkApplicationPermissionError } from '../lark-context-tool.service.js'

jest.mock('@langchain/langgraph', () => {
  const actual = jest.requireActual('@langchain/langgraph')
  return {
    ...actual,
    getCurrentTaskInput: jest.fn()
  }
})

function createBaseConfig(): LarkConversationContextMiddlewareConfig {
  return {
    integrationId: 'integration-1',
    defaults: {
      timeoutMs: 1000,
      pageSize: 20,
      resourceContentMode: 'metadata'
    }
  }
}

async function createFixture(config?: Partial<LarkConversationContextMiddlewareConfig>) {
  ;(getCurrentTaskInput as jest.Mock).mockReturnValue({
    lark_current_context: {
      chatId: 'oc_123',
      chatType: 'group'
    },
    lark_conversation_context_allowed_message_ids: ['om_1']
  })

  const contextToolService = {
    listMessages: jest.fn().mockResolvedValue({
      items: [{ messageId: 'om_1', msgType: 'text', text: 'hello' }],
      pageToken: 'next-page',
      hasMore: true
    }),
    getMessage: jest.fn().mockResolvedValue({
      item: { messageId: 'om_1', msgType: 'text', text: 'hello' }
    }),
    getMessageResource: jest.fn().mockResolvedValue({
      item: { messageId: 'om_1', fileKey: 'file_1', type: 'file', name: 'report.pdf' }
    }),
    sendApplicationPermissionGuideCard: jest.fn().mockResolvedValue({
      messageId: 'permission-card-1',
      consoleUrl: 'https://open.feishu.cn/app'
    })
  }

  const strategy = new LarkConversationContextMiddleware(contextToolService as any)
  const middleware = await Promise.resolve(
    strategy.createMiddleware(
      {
        ...createBaseConfig(),
        ...(config ?? {}),
        defaults: {
          ...createBaseConfig().defaults,
          ...(config?.defaults ?? {})
        }
      },
      {} as any
    )
  )

  return {
    middleware,
    contextToolService
  }
}

function getTool(middleware: any, name: string) {
  const found = middleware.tools.find((tool: any) => tool.name === name)
  if (!found) {
    throw new Error(`Tool not found: ${name}`)
  }
  return found
}

describe('LarkConversationContextMiddleware', () => {
  afterEach(() => {
    jest.clearAllMocks()
    ;(getCurrentTaskInput as jest.Mock).mockReturnValue({})
  })

  it('exposes the three required Lark conversation context tools', async () => {
    const { middleware } = await createFixture()

    expect(middleware.tools.map((tool: any) => tool.name)).toEqual([
      'lark_list_messages',
      'lark_get_message',
      'lark_get_message_resource'
    ])
  })

  it('routes lark_list_messages through the context tool service and wraps the result as a Command', async () => {
    const { middleware, contextToolService } = await createFixture({
      defaults: {
        pageSize: 30
      }
    })

    const result = await getTool(middleware, 'lark_list_messages').invoke(
      {
        containerIdType: 'chat',
        containerId: 'oc_123'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-list'
        }
      }
    )

    expect(contextToolService.listMessages).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      containerIdType: 'chat',
      containerId: 'oc_123',
      startTime: undefined,
      endTime: undefined,
      sortType: 'ByCreateTimeDesc',
      pageSize: 30,
      pageToken: undefined,
      timeoutMs: 1000,
      expectedChatId: 'oc_123'
    })
    expect(result).toBeInstanceOf(Command)
    expect(result.update.lark_conversation_context_last_result.tool).toBe('lark_list_messages')
    expect(result.update.messages[0]).toBeInstanceOf(ToolMessage)
  })

  it('sends an administrator permission card and stops retrying when the app scope is missing', async () => {
    const { middleware, contextToolService } = await createFixture({ currentChatOnly: true })
    ;(getCurrentTaskInput as jest.Mock).mockReturnValue({
      lark_current_context: {
        integrationId: 'integration-1',
        chatId: 'oc_chat_current',
        chatType: 'group'
      }
    })
    contextToolService.listMessages.mockRejectedValue(
      new LarkApplicationPermissionError(
        99991679,
        ['im:message.group_msg'],
        '[lark_list_messages] missing permission'
      )
    )

    const result = await getTool(middleware, 'lark_list_messages').invoke(
      {},
      { metadata: { tool_call_id: 'tool-call-permission' } }
    )

    expect(contextToolService.sendApplicationPermissionGuideCard).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      chatId: 'oc_chat_current',
      scopes: ['im:message.group_msg'],
      toolCallId: 'tool-call-permission'
    })
    expect(result).toBeInstanceOf(Command)
    expect(result.update.lark_conversation_context_last_result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'lark_application_permission_required',
        requiredScopes: ['im:message.group_msg'],
        permissionGuideSent: true
      })
    )
    expect((result as any).goto).toEqual(['end'])
  })

  it('keeps the agent response available when the administrator permission card cannot be sent', async () => {
    const { middleware, contextToolService } = await createFixture({ currentChatOnly: true })
    contextToolService.sendApplicationPermissionGuideCard.mockRejectedValue(new Error('send failed'))
    contextToolService.listMessages.mockRejectedValue(
      new LarkApplicationPermissionError(
        99991679,
        ['im:message.group_msg'],
        '[lark_list_messages] missing permission'
      )
    )

    const result = await getTool(middleware, 'lark_list_messages').invoke(
      {},
      { metadata: { tool_call_id: 'tool-call-permission-failed' } }
    )

    expect((result as any).goto).toEqual([])
    expect(result.update.lark_conversation_context_last_result).toEqual(
      expect.objectContaining({
        permissionGuideSent: false,
        permissionGuideError: 'send failed'
      })
    )
  })

  it('uses the trigger runtime integration before a stored middleware integration', async () => {
    const { middleware, contextToolService } = await createFixture({
      integrationId: 'integration-stored'
    })
    ;(getCurrentTaskInput as jest.Mock).mockReturnValue({
      lark_conversation_context_current_integration_id: 'integration-trigger',
      lark_current_context: {
        chatId: 'oc_123',
        chatType: 'group'
      }
    })

    await getTool(middleware, 'lark_list_messages').invoke({
      containerIdType: 'chat',
      containerId: 'oc_123'
    })

    expect(contextToolService.listMessages).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: 'integration-trigger' })
    )
    ;(getCurrentTaskInput as jest.Mock).mockReturnValue({})
  })

  it('routes lark_get_message_resource and respects the configured default content mode', async () => {
    const { middleware, contextToolService } = await createFixture({
      defaults: {
        resourceContentMode: 'base64'
      }
    })

    const result = await getTool(middleware, 'lark_get_message_resource').invoke(
      {
        messageId: 'om_1',
        fileKey: 'file_1',
        type: 'file'
      },
      {
        metadata: {
          tool_call_id: 'tool-call-resource'
        }
      }
    )

    expect(contextToolService.getMessageResource).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      messageId: 'om_1',
      fileKey: 'file_1',
      type: 'file',
      contentMode: 'base64',
      timeoutMs: 1000,
      expectedChatId: 'oc_123'
    })
    expect(result).toBeInstanceOf(Command)
    expect(result.update.messages[0]).toBeInstanceOf(ToolMessage)
  })

  it('defaults lark_list_messages to the current Lark chat from state when containerId is omitted', async () => {
    const { middleware, contextToolService } = await createFixture()
    ;(getCurrentTaskInput as jest.Mock).mockReturnValue({
      lark_current_context: {
        chatId: 'oc_chat_current',
        chatType: 'group',
        senderOpenId: 'ou_sender_1'
      }
    })

    const result = await getTool(middleware, 'lark_list_messages').invoke(
      {},
      {
        metadata: {
          tool_call_id: 'tool-call-list-default'
        }
      }
    )

    expect(contextToolService.listMessages).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      containerIdType: 'chat',
      containerId: 'oc_chat_current',
      startTime: undefined,
      endTime: undefined,
      sortType: 'ByCreateTimeDesc',
      pageSize: 20,
      pageToken: undefined,
      timeoutMs: 1000,
      expectedChatId: 'oc_chat_current'
    })
    expect(result).toBeInstanceOf(Command)
  })

  it('hard-locks remote list queries to the current chat in unified runtime mode', async () => {
    const { middleware, contextToolService } = await createFixture({
      currentChatOnly: true
    })
    ;(getCurrentTaskInput as jest.Mock).mockReturnValue({
      lark_current_context: {
        chatId: 'oc_chat_current',
        chatType: 'group'
      }
    })

    const listTool = getTool(middleware, 'lark_list_messages')
    const result = await listTool.invoke({
      containerIdType: 'chat',
      containerId: 'oc_chat_other'
    })

    expect(listTool.schema.shape).not.toHaveProperty('containerIdType')
    expect(listTool.schema.shape).not.toHaveProperty('containerId')
    expect(contextToolService.listMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        containerIdType: 'chat',
        containerId: 'oc_chat_current',
        expectedChatId: 'oc_chat_current'
      })
    )
    expect(result.update.lark_conversation_context_allowed_message_ids).toEqual(['om_1'])
  })

  it('rejects arbitrary message ids before calling Lark in current-chat-only mode', async () => {
    const { middleware, contextToolService } = await createFixture({
      currentChatOnly: true
    })
    ;(getCurrentTaskInput as jest.Mock).mockReturnValue({
      lark_current_context: {
        chatId: 'oc_chat_current',
        chatType: 'group'
      },
      lark_conversation_context_allowed_message_ids: ['om_current']
    })

    await expect(
      getTool(middleware, 'lark_get_message').invoke({ messageId: 'om_other_chat' })
    ).rejects.toThrow('messageId must come from lark_list_messages for the current Lark chat')
    await expect(
      getTool(middleware, 'lark_get_message_resource').invoke({
        messageId: 'om_other_chat',
        fileKey: 'file_1',
        type: 'file'
      })
    ).rejects.toThrow('messageId must come from lark_list_messages for the current Lark chat')
    expect(contextToolService.getMessage).not.toHaveBeenCalled()
    expect(contextToolService.getMessageResource).not.toHaveBeenCalled()
  })

  it('passes the trusted current chat to message and resource reads after listing', async () => {
    const { middleware, contextToolService } = await createFixture({
      currentChatOnly: true
    })
    ;(getCurrentTaskInput as jest.Mock).mockReturnValue({
      lark_current_context: {
        chatId: 'oc_chat_current',
        chatType: 'group'
      },
      lark_conversation_context_allowed_message_ids: ['om_1']
    })

    await getTool(middleware, 'lark_get_message').invoke({ messageId: 'om_1' })
    await getTool(middleware, 'lark_get_message_resource').invoke({
      messageId: 'om_1',
      fileKey: 'file_1',
      type: 'file'
    })

    expect(contextToolService.getMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'om_1', expectedChatId: 'oc_chat_current' })
    )
    expect(contextToolService.getMessageResource).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'om_1', expectedChatId: 'oc_chat_current' })
    )
  })
})
