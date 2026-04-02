import { AIMessage, BaseMessage, ToolMessage, isAIMessage, isToolMessage } from '@langchain/core/messages'
import { ToolCall } from '@langchain/core/messages/tool'
import { JsonSchemaObjectType, TAgentMiddlewareMeta } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
} from '@xpert-ai/plugin-sdk'
import {
  DANGLING_TOOL_CALL_MIDDLEWARE_NAME,
  DANGLING_TOOL_CALL_PLACEHOLDER_CONTENT,
  DanglingToolCallIcon,
} from './types.js'

const emptyConfigSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {},
}

type MiddlewareConfig = Record<string, never>

@Injectable()
@AgentMiddlewareStrategy(DANGLING_TOOL_CALL_MIDDLEWARE_NAME)
export class DanglingToolCallMiddleware implements IAgentMiddlewareStrategy<MiddlewareConfig> {
  readonly meta: TAgentMiddlewareMeta = {
    name: DANGLING_TOOL_CALL_MIDDLEWARE_NAME,
    label: {
      en_US: 'Dangling Tool Call Middleware',
      zh_Hans: '悬空工具调用处理中间件',
    },
    icon: {
      type: 'svg',
      value: DanglingToolCallIcon,
    },
    description: {
      en_US:
        'Repairs message history with missing tool responses by inserting synthetic error ToolMessages before the next model call.',
      zh_Hans:
        '在下一次模型调用前，为缺失工具响应的消息历史补入合成错误 ToolMessage，修复悬空工具调用。',
    },
    configSchema: emptyConfigSchema,
  }

  createMiddleware(_options: MiddlewareConfig, _context: IAgentMiddlewareContext): AgentMiddleware {
    return {
      name: DANGLING_TOOL_CALL_MIDDLEWARE_NAME,
      wrapModelCall: async (request, handler) => {
        const patchedMessages = buildPatchedMessages(request.messages)

        if (!patchedMessages) {
          return handler(request)
        }

        return handler({
          ...request,
          messages: patchedMessages,
        })
      },
    }
  }
}

function collectExistingToolMessageIds(messages: BaseMessage[]): Set<string> {
  const existingIds = new Set<string>()

  for (const message of messages) {
    if (!isToolMessage(message)) {
      continue
    }

    const toolCallId = message.tool_call_id
    if (typeof toolCallId === 'string' && toolCallId.length > 0) {
      existingIds.add(toolCallId)
    }
  }

  return existingIds
}

function getToolCalls(message: BaseMessage): ToolCall[] {
  if (!isAIMessage(message)) {
    return []
  }

  return Array.isArray(message.tool_calls) ? message.tool_calls : []
}

function buildPatchedMessages(messages: BaseMessage[]): BaseMessage[] | null {
  const existingIds = collectExistingToolMessageIds(messages)

  let needsPatch = false
  for (const message of messages) {
    for (const toolCall of getToolCalls(message)) {
      if (toolCall.id && !existingIds.has(toolCall.id)) {
        needsPatch = true
        break
      }
    }

    if (needsPatch) {
      break
    }
  }

  if (!needsPatch) {
    return null
  }

  const patchedMessages: BaseMessage[] = []
  const patchedIds = new Set<string>()

  for (const message of messages) {
    patchedMessages.push(message)

    for (const toolCall of getToolCalls(message)) {
      const toolCallId = toolCall.id

      if (!toolCallId) {
        continue
      }
      if (existingIds.has(toolCallId)) {
        continue
      }
      if (patchedIds.has(toolCallId)) {
        continue
      }

      patchedMessages.push(buildPlaceholderToolMessage(toolCall))
      patchedIds.add(toolCallId)
    }
  }

  return patchedMessages
}

function buildPlaceholderToolMessage(toolCall: ToolCall): ToolMessage {
  return new ToolMessage({
    content: DANGLING_TOOL_CALL_PLACEHOLDER_CONTENT,
    tool_call_id: toolCall.id,
    name: toolCall.name ?? 'unknown',
    status: 'error',
    metadata: {
      synthetic: true,
      source: DANGLING_TOOL_CALL_MIDDLEWARE_NAME,
      reason: 'missing_tool_response',
    },
  })
}

export const DanglingToolCallTestUtils = {
  buildPatchedMessages,
  buildPlaceholderToolMessage,
  collectExistingToolMessageIds,
  getToolCalls,
}

export type { MiddlewareConfig as DanglingToolCallMiddlewareConfig }
export { AIMessage }
