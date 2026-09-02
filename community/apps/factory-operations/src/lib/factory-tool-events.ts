import { Injectable, Inject } from '@nestjs/common'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
  ChatMessageEventTypeEnum,
  ChatMessageStepCategory
} from '@xpert-ai/contracts'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import { FACTORY_CONFIG, type FactoryConfig } from './config.js'
import { FactoryDebugLogger } from './factory-debug.js'

type ToolRequest = Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]
type ToolHandler = Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[1]

@Injectable()
export class FactoryToolEventService {
  private readonly logger: FactoryDebugLogger

  constructor(@Inject(FACTORY_CONFIG) config: FactoryConfig) {
    this.logger = new FactoryDebugLogger('middleware', config)
  }

  wrap(mutationNames: readonly string[], middlewareName: string) {
    const mutationSet = new Set(mutationNames)
    return async (request: ToolRequest, handler: ToolHandler) => {
      const started = Date.now()
      const toolName = request.toolCall.name
      const summary = readChangeSummary(request.toolCall.args)
      if (!summary || !mutationSet.has(toolName)) return handler(request)

      await dispatchEvent(request, middlewareName, summary, 'running')
      this.logger.debug('tool.running', { toolName })
      try {
        const result = await handler(request)
        await dispatchEvent(request, middlewareName, summary, 'success')
        this.logger.debug('tool.success', {
          toolName,
          durationMs: Date.now() - started
        })
        return result
      } catch (error) {
        await dispatchEvent(request, middlewareName, summary, 'fail')
        this.logger.error('tool.fail', {
          toolName,
          durationMs: Date.now() - started,
          error: error instanceof Error ? error.message : 'unknown_error'
        })
        throw error
      }
    }
  }
}

function readChangeSummary(args: ToolRequest['toolCall']['args']) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null
  const value = Reflect.get(args, 'changeSummary')
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function dispatchEvent(
  request: ToolRequest,
  middlewareName: string,
  summary: string,
  status: 'running' | 'success' | 'fail'
) {
  const now = new Date()
  const input = compactToolInput(request.toolCall.args)
  try {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
      id: request.toolCall.id ?? `${request.toolCall.name}:${now.getTime()}`,
      tool_call_id: request.toolCall.id,
      category: 'Tool',
      type: ChatMessageStepCategory.Program,
      toolset: middlewareName,
      tool: request.toolCall.name,
      title: summary,
      message: summary,
      status,
      created_date: now,
      input,
      ...(status === 'running' ? { end_date: null } : { end_date: new Date() })
    })
  } catch {
    // Observational event delivery never changes the business mutation result.
  }
}

function compactToolInput(value: object | string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, string | number | boolean> = {}
  for (const key of ['caseId', 'operationId', 'baseRevision']) {
    const field = Reflect.get(value, key)
    if (
      typeof field === 'string' ||
      typeof field === 'number' ||
      typeof field === 'boolean'
    ) {
      result[key] = field
    }
  }
  return result
}
