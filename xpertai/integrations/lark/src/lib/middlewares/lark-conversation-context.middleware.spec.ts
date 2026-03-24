import { ToolMessage } from '@langchain/core/messages'
import { Command, getCurrentTaskInput } from '@langchain/langgraph'
import {
  LarkConversationContextMiddleware,
  LarkConversationContextMiddlewareConfig
} from './lark-conversation-context.middleware.js'

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
      timeoutMs: 1000
    })
    expect(result).toBeInstanceOf(Command)
    expect(result.update.lark_conversation_context_last_result.tool).toBe('lark_list_messages')
    expect(result.update.messages[0]).toBeInstanceOf(ToolMessage)
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
      timeoutMs: 1000
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
      timeoutMs: 1000
    })
    expect(result).toBeInstanceOf(Command)
  })
})
