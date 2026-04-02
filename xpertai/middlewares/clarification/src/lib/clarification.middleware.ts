import { TAgentMiddlewareMeta } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { AIMessage, type BaseMessage, isAIMessage } from '@langchain/core/messages'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { ClarificationService } from './clarification.service.js'
import {
  ASK_CLARIFICATION_TOOL_NAME,
  CLARIFICATION_MIDDLEWARE_NAME,
  type ClarificationPluginConfig,
  ClarificationPluginConfigFormSchema,
  ClarificationPluginIcon
} from './clarification.types.js'

@Injectable()
@AgentMiddlewareStrategy(CLARIFICATION_MIDDLEWARE_NAME)
export class ClarificationMiddleware implements IAgentMiddlewareStrategy<Partial<ClarificationPluginConfig>> {
  constructor(private readonly clarificationService: ClarificationService) {}

  readonly meta: TAgentMiddlewareMeta = {
    name: CLARIFICATION_MIDDLEWARE_NAME,
    label: {
      en_US: 'Clarification Middleware',
      zh_Hans: '澄清中间件'
    },
    description: {
      en_US:
        'Adds an `ask_clarification` tool, rewrites mixed tool batches to clarification-only, and turns clarification requests into readable ToolMessages that end the current run.',
      zh_Hans:
        '提供 `ask_clarification` 工具，将混合工具批次改写为仅澄清调用，并把澄清请求转换为会结束当前轮的可读 ToolMessage。'
    },
    icon: {
      type: 'svg',
      value: ClarificationPluginIcon
    },
    configSchema: ClarificationPluginConfigFormSchema
  }

  createMiddleware(
    options: Partial<ClarificationPluginConfig>,
    _context: IAgentMiddlewareContext
  ): AgentMiddleware {
    const config = this.clarificationService.resolveConfig(options)

    if (!config.enabled) {
      return {
        name: CLARIFICATION_MIDDLEWARE_NAME
      }
    }

    const clarificationTool = this.clarificationService.createTool()

    return {
      name: CLARIFICATION_MIDDLEWARE_NAME,
      tools: [clarificationTool],
      afterModel: {
        hook: async (state) => {
          const rewrittenMessage = rewriteClarificationBatch(state.messages)
          if (!rewrittenMessage) {
            return undefined
          }

          return {
            messages: [rewrittenMessage]
          }
        }
      },
      wrapModelCall: async (request, handler) => {
        if (!config.appendSystemPrompt) {
          return handler(request)
        }

        return handler({
          ...request,
          systemMessage: this.clarificationService.buildSystemMessage(request.systemMessage?.content, config)
        })
      },
      wrapToolCall: async (request, handler) => {
        if (request.toolCall?.name !== ASK_CLARIFICATION_TOOL_NAME) {
          return handler(request)
        }

        try {
          const input = this.clarificationService.resolveInput(request.toolCall?.args)
          return this.clarificationService.buildToolResponse(input, request.toolCall?.id)
        } catch (error) {
          const reason = this.clarificationService.resolveInvalidReason(error)
          return this.clarificationService.buildInvalidToolMessage(request.toolCall?.id, reason)
        }
      }
    }
  }
}

function rewriteClarificationBatch(messages: BaseMessage[] | undefined): AIMessage | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null
  }

  const lastMessage = messages[messages.length - 1]
  if (!isAIMessage(lastMessage) || !Array.isArray(lastMessage.tool_calls) || lastMessage.tool_calls.length === 0) {
    return null
  }

  const clarificationCall = lastMessage.tool_calls.find((toolCall) => toolCall?.name === ASK_CLARIFICATION_TOOL_NAME)
  if (!clarificationCall) {
    return null
  }

  if (lastMessage.tool_calls.length === 1 && clarificationCall === lastMessage.tool_calls[0]) {
    return null
  }

  return cloneAIMessage(lastMessage, {
    tool_calls: [clarificationCall]
  })
}

function cloneAIMessage(message: AIMessage, overrides: Record<string, unknown> = {}): AIMessage {
  const filteredEntries = Object.fromEntries(
    Object.entries(message as unknown as Record<string, unknown>).filter(([key]) => !key.startsWith('lc_'))
  )

  return new AIMessage({
    ...(filteredEntries as Record<string, unknown>),
    ...overrides
  } as ConstructorParameters<typeof AIMessage>[0])
}
