import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
  ChatMessageEventTypeEnum,
  ChatMessageStepCategory,
} from '@xpert-ai/contracts'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
type Request = Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]
type Handler = Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[1]
export const toolEvents =
  (names: readonly string[], middleware: string) =>
  async (request: Request, handler: Handler) => {
    if (!names.includes(request.toolCall.name)) return handler(request)
    const parsed = request.toolCall.args
    const summary =
      typeof parsed === 'object' &&
      parsed &&
      typeof parsed['changeSummary'] === 'string'
        ? parsed['changeSummary'].slice(0, 200)
        : request.toolCall.name
    const event = async (status: 'running' | 'success' | 'fail') => {
      try {
        await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
          id: request.toolCall.id,
          tool_call_id: request.toolCall.id,
          category: 'Tool',
          type: ChatMessageStepCategory.Program,
          toolset: middleware,
          tool: request.toolCall.name,
          title: summary,
          message: summary,
          status,
          created_date: new Date(),
          ...(status === 'running' ? {} : { end_date: new Date() }),
        })
      } catch {
        /* Telemetry cannot change a committed domain result. */
      }
    }
    await event('running')
    try {
      const result = await handler(request)
      await event('success')
      return result
    } catch (error) {
      await event('fail')
      throw error
    }
  }
