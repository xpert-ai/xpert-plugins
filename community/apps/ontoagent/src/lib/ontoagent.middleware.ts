import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ONTOAGENT_FEATURE, ONTOAGENT_ICON, ONTOAGENT_MIDDLEWARE_NAME } from './constants.js'
import { OntoAgentService } from './ontoagent.service.js'
import type { OntoAgentMiddlewareOptions, OntoAgentScope } from './types.js'
import { GOVERNED_CONTEXT_CONTRACT_HEADER } from './vendor/dsh-ontology-core/index.js'
import type { PreparedPrompt } from './vendor/pipeline-types.js'

const prepareSchema = z.object({
  task: z.string().min(1).describe('业务问题或任务原文，用于组装完整术语包。')
})
const querySchema = z.object({
  termId: z.string().min(1).describe('auto:term: 开头的术语 ID（由 ontology_search 返回）。')
})
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

@Injectable()
@AgentMiddlewareStrategy(ONTOAGENT_MIDDLEWARE_NAME)
export class OntoAgentGovernedContextMiddleware implements IAgentMiddlewareStrategy<OntoAgentMiddlewareOptions> {
  constructor(private readonly service: OntoAgentService) {}

  meta: TAgentMiddlewareMeta = {
    name: ONTOAGENT_MIDDLEWARE_NAME,
    label: {
      en_US: 'OntoAgent Governed Context',
      zh_Hans: 'OntoAgent 受治理本体上下文'
    },
    description: {
      en_US:
        'Inject versioned, certified ontology term packets before each model call, with read-only ontology tools. Auto mode is read-only: no ontology generation or writes.',
      zh_Hans:
        '在每次模型调用前注入带版本、已认证的完整术语包，并提供只读本体的工具。Auto 模式只读：不生成本体、不写本体。'
    },
    icon: { type: 'svg', value: ONTOAGENT_ICON, color: '#4f46e5' },
    features: [ONTOAGENT_FEATURE],
    configSchema: {
      type: 'object',
      properties: {
        maxTerms: { type: 'number', title: text('Max Terms', '最大术语数') },
        maxAssertions: { type: 'number', title: text('Max Assertions', '最大断言数') },
        maxChars: { type: 'number', title: text('Max Chars', '渲染字符预算') },
        injectHeader: {
          type: 'boolean',
          title: text('Inject Contract Header', '注入只读契约头'),
          description: text(
            'Inject the stable read-only contract before the governed packet.',
            '在术语包前注入稳定的只读使用契约。'
          )
        }
      },
      required: []
    }
  }

  createMiddleware(
    options: OntoAgentMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const scope: OntoAgentScope = {
      tenantId: context.tenantId ?? RequestContext.currentTenantId(),
      userId: context.userId ?? RequestContext.currentUserId(),
      organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
      assistantId: context.xpertId,
      conversationId: context.conversationId
    }
    const service = this.service

    const prepareTool = tool(
      async (input: z.infer<typeof prepareSchema>) => stringify(await service.toolPrepare(scope, input.task)),
      {
        name: 'ontology_prepare',
        description:
          'Read-only. Assemble the governed, versioned ontology term packet for a business task, including definitions, certifications, columns, SQL and retrieval summary. Does not modify the ontology.',
        schema: prepareSchema
      }
    )
    const sliceTool = tool(
      async (input: z.infer<typeof prepareSchema>) => stringify(service.toolSlice(scope, input.task)),
      {
        name: 'ontology_slice',
        description:
          'Read-only. Compile the complete term packets and required joins for a task directly from the current mirror, with atomic budget truncation. No coverage means no injection, never nearest assertions.',
        schema: prepareSchema
      }
    )
    const queryTool = tool(
      async (input: z.infer<typeof querySchema>) => {
        try {
          return stringify(service.toolQuery(scope, input.termId))
        } catch (error) {
          return stringify({ error: messageOf(error) })
        }
      },
      {
        name: 'ontology_query',
        description: 'Read-only. Fetch the complete packet of one certified term by its auto:term: id.',
        schema: querySchema
      }
    )
    const searchTool = tool(
      async (input: z.infer<typeof prepareSchema>) => stringify(service.toolSearch(scope, input.task)),
      {
        name: 'ontology_search',
        description: 'Read-only. Find certified terms related to a task and return their ids and labels for ontology_query.',
        schema: prepareSchema
      }
    )

    return {
      name: ONTOAGENT_MIDDLEWARE_NAME,
      stateSchema: z.object({
        ontoagentLastTask: z.string().optional(),
        ontoagentPrepared: z.record(z.unknown()).optional(),
        ontoagentRecordError: z.string().optional()
      }),
      tools: [prepareTool, sliceTool, queryTool, searchTool],
      beforeModel: async (state) => {
        const task = lastText(state.messages, HumanMessage)
        if (!task) return {}
        try {
          const { prepared } = await service.prepareForTask(scope, task, options)
          const header = options.injectHeader === false ? '' : GOVERNED_CONTEXT_CONTRACT_HEADER + '\n\n'
          const content = header + prepared.prompt
          const last = state.messages[state.messages.length - 1]
          const preparedState = {
            ontoagentLastTask: task,
            ontoagentPrepared: prepared as unknown as Record<string, unknown>
          }
          if (last instanceof SystemMessage && last.content === content) {
            return preparedState
          }
          return { messages: [...state.messages, new SystemMessage(content)], ...preparedState }
        } catch (error) {
          // 失败可见：显式降级，不把异常伪装成空上下文
          const reason = messageOf(error)
          return {
            messages: [
              ...state.messages,
              new SystemMessage(
                '# GOVERNED ONTOLOGY CONTEXT\n- 本体上下文准备失败（' +
                  reason +
                  '）；本轮未注入本体，不得声称来自已认证本体口径。'
              )
            ],
            ontoagentLastTask: task,
            ontoagentRecordError: reason
          }
        }
      },
      afterAgent: async (state) => {
        const answer = lastText(state.messages, AIMessage)
        const question = state.ontoagentLastTask ?? lastText(state.messages, HumanMessage)
        const prepared = state.ontoagentPrepared as unknown as PreparedPrompt | undefined
        if (!answer || !question || !prepared) return {}
        try {
          await service.recordProposedAnswer(scope, {
            question,
            answer,
            prepared,
            error: state.ontoagentRecordError
          })
          return {}
        } catch (error) {
          return { ontoagentRecordError: messageOf(error) }
        }
      }
    }
  }
}

function lastText(messages: BaseMessage[], type: typeof HumanMessage | typeof AIMessage): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message instanceof type) {
      const content = message.content
      if (typeof content === 'string') return content.trim() ? content : ''
      if (Array.isArray(content)) {
        const text = content
          .filter((part) => typeof part === 'object' && part !== null && (part as { type?: string }).type === 'text')
          .map((part) => (part as { text?: string }).text ?? '')
          .join('\n')
        return text.trim() ? text : ''
      }
      return ''
    }
  }
  return ''
}

function stringify(value: unknown) {
  return JSON.stringify(value)
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error)
}
