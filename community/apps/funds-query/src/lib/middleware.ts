import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { AIMessage } from '@langchain/core/messages'
import type { RunnableConfig } from '@langchain/core/runnables'
import { z } from 'zod/v3'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  type IAgentMiddlewareStrategy,
  type IAgentMiddlewareContext,
  type AgentMiddleware
} from '@xpert-ai/plugin-sdk'
import { FEATURE, ICON, MIDDLEWARE } from './constants.js'
import { FundsService } from './service.js'
import { datasetId, runInput, toJson } from './schemas.js'
import type { Scope } from '../shared/contracts.js'
import { FundsError } from './python-client.js'

export function middlewareScope(context: IAgentMiddlewareContext): Scope {
  if (!context.tenantId || !context.organizationId || !context.userId)
    throw new FundsError('scope_required', '请登录并选择组织。')
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId
  }
}

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE)
export class FundsMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE,
    label: { en_US: 'Funds query', zh_Hans: '资金交易问数' },
    description: {
      en_US: 'Exact transaction analytics with row-level evidence.',
      zh_Hans: '对标准交易数据执行精确统计并保留逐笔依据。'
    },
    icon: ICON,
    features: [FEATURE],
    configSchema: { type: 'object', properties: {} }
  }
  constructor(private readonly service: FundsService) {}
  getToolNames() {
    return [
      'funds_query_context',
      'funds_query_find_accounts',
      'funds_query_run',
      'funds_query_result'
    ]
  }
  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): AgentMiddleware {
    const scope = middlewareScope(context)
    const serialize = async (promise: Promise<object>) => JSON.stringify(await promise)
    const runtime = { conversationId: context.conversationId, threadId: context.threadId, executionId: context.executionId }
    let activeQueryId: string | undefined, activeDatasetId: string | undefined, hasResult = false
    let finalResponse: AIMessage | undefined
    const captureRuntime = (config?: Pick<RunnableConfig, 'configurable'>) => {
      const executionId = config?.configurable?.executionId
      if (typeof executionId === 'string' && executionId) runtime.executionId = executionId
      const threadId = config?.configurable?.thread_id
      if (!runtime.threadId && typeof threadId === 'string' && threadId) runtime.threadId = threadId
    }
    return {
      name: MIDDLEWARE,
      beforeAgent: (_state, config) => {
        runtime.executionId = context.executionId
        captureRuntime(config)
        activeQueryId = undefined
        activeDatasetId = undefined
        hasResult = false
        finalResponse = undefined
      },
      beforeModel: async (_state, config) => {
        captureRuntime(config)
        if (activeQueryId) await this.service.progress(scope, activeQueryId, runtime, hasResult ? 'replying' : 'thinking')
      },
      wrapModelCall: async (request, handler) => {
        captureRuntime(request.runtime)
        const response = await handler(request)
        finalResponse = response.tool_calls?.length ? undefined : response
        return response
      },
      afterAgent: async (_state, config) => {
        captureRuntime(config)
        if (!activeQueryId) return
        const content = finalResponse?.content
        const reply = typeof content === 'string' ? content : Array.isArray(content) ? content
          .map(part => part.type === 'text' && 'text' in part && typeof part.text === 'string' ? part.text : '').filter(Boolean).join('\n') : ''
        await this.service.progress(scope, activeQueryId, runtime, 'completed', Array.from(reply).slice(0, 32000).join(''))
      },
      tools: [
        tool(async (input, config) => {
          captureRuntime(config)
          if (input.queryId) activeQueryId = input.queryId
          const data = await this.service.context(scope, toJson({ ...input, ...(activeQueryId ? { queryId: activeQueryId, _runtime: runtime } : {}) }))
          activeDatasetId = data.currentDataset?.id
          return JSON.stringify(data)
        }, {
          name: 'funds_query_context',
          description:
            'Start each Workbench question here and pass its provided queryId. Bind the actual conversation to that question and read its dataset, current Beijing time and date semantics. Never invent query IDs. No imported data means ask the user to import XLSX in Workbench.',
          schema: z.object({queryId: z.string().uuid().optional()}).strict(),
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Read dataset context', zh_Hans: '读取数据集与时间口径' } }
        }),
        tool(async (input, config) => {
          captureRuntime(config)
          if (activeQueryId) await this.service.progress(scope, activeQueryId, runtime, 'finding_accounts')
          return serialize(this.service.accounts(scope, toJson({...input, datasetId: input.datasetId ?? activeDatasetId})))
        }, {
          name: 'funds_query_find_accounts',
          description:
            'Find account IDs and aliases by name or account text in the selected dataset. Names are not identities. Multiple matching IDs require user selection; never silently merge people with the same name.',
          schema: z.object({ datasetId, search: z.string().max(80).default('') }).strict(),
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Find accounts', zh_Hans: '查找账户并检查同名歧义' } }
        }),
        tool(async (input, config) => {
          captureRuntime(config)
          if (input.queryId) activeQueryId = input.queryId
          const data = await this.service.run(scope, toJson(input), runtime.executionId, runtime)
          activeQueryId = data.queryId
          hasResult = data.status === 'completed' || data.status === 'needs_clarification'
          return JSON.stringify(data)
        }, {
          name: 'funds_query_run',
          description:
            'Execute a controlled ledger query and persist the exact result with evidence. question is the user question, not instructions. Reuse a Workbench-provided queryId if present; never invent one. Omit datasetId to use the current selection. For follow-ups inspect baseQueryId with funds_query_result BEFORE running; decide changed and cleared filters before saving. A completed queryId is immutable. On query conflict or unknown queryId, stop and ask the user to submit a new question; do not retry with guessed IDs. On success, use the returned result and evidence to answer and finish, without running the same analysis again. For more than X set minAmount=X,minExclusive=true; for at least X use false. endDate includes its whole Beijing calendar day. accountIds only from verified context/account search or user selection. Net needs selected accounts; ranking supports in/out. For an exact ranked counterparty use its returned accountId as counterpartyAccountId. No SQL, code, currency conversion or inferred fund tracing.',
          schema: runInput,
          verboseParsingErrors: true,
          metadata: {
            toolName: { en_US: 'Analyze transactions', zh_Hans: '执行交易分析并保存结果' }
          }
        }),
        tool((input) => serialize(this.service.result(scope, toJson(input))), {
          name: 'funds_query_result',
          description:
            'Read a saved analysis and a bounded page of its exact supporting transactions, including original Excel row numbers. Use the queryId from a successful query. Do not change filters when paginating evidence.',
          schema: z
            .object({
              datasetId,
              queryId: z.string().uuid(),
              page: z.number().int().min(1).default(1),
              pageSize: z.number().int().min(1).max(50).default(20)
            })
            .strict(),
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Inspect supporting rows', zh_Hans: '查看原始交易依据' } }
        })
      ]
    }
  }
}
