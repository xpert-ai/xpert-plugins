import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory } from '@xpert-ai/contracts'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'

type ToolCallRequest = Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]
type ToolCallHandler = Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[1]
type ToolStepStatus = 'running' | 'success' | 'fail'

export function createChangeSummaryToolEventWrapper(toolNames: ReadonlySet<string>) {
  return async (request: ToolCallRequest, handler: ToolCallHandler) => {
    const changeSummary = readChangeSummary(request.toolCall.args)
    if (!changeSummary || !toolNames.has(request.toolCall.name)) {
      return handler(request)
    }

    const createdAt = new Date()
    await dispatchToolStep(request, changeSummary, 'running', createdAt)
    try {
      const result = await handler(request)
      await dispatchToolStep(request, changeSummary, 'success', createdAt, readToolOutput(result))
      return result
    } catch (error) {
      await dispatchToolStep(request, changeSummary, 'fail', createdAt, undefined, readErrorMessage(error))
      throw error
    }
  }
}

function readChangeSummary(args: unknown) {
  if (!isPlainObject(args)) return undefined
  const value = args.changeSummary
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function dispatchToolStep(
  request: ToolCallRequest,
  message: string,
  status: ToolStepStatus,
  createdAt: Date,
  output?: string,
  error?: string
) {
  const toolCall = request.toolCall
  const runtimeMetadata = request.runtime && typeof request.runtime === 'object'
    ? Reflect.get(request.runtime, 'metadata')
    : undefined
  const metadata = isPlainObject(runtimeMetadata) ? runtimeMetadata : {}
  const toolset = readString(metadata.toolset) ?? 'ExcalidrawDiagramEngine'
  const toolsetId = readString(metadata.toolsetId)
  const toolCallId = readString(toolCall.id) ?? `${toolCall.name}:${stableStringify(toolCall.args)}`
  const payload = {
    id: toolCallId,
    tool_call_id: toolCall.id,
    category: 'Tool',
    type: ChatMessageStepCategory.Program,
    toolset,
    ...(toolsetId ? { toolset_id: toolsetId } : {}),
    tool: toolCall.name,
    title: message,
    message,
    status,
    created_date: createdAt,
    input: toolCall.args,
    ...(status === 'running' ? { end_date: null } : { end_date: new Date() }),
    ...(output !== undefined ? { output } : {}),
    ...(error ? { error } : {})
  }

  try {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, payload)
  } catch (dispatchError) {
    console.warn('[ExcalidrawDiagramEngine] dispatch tool message failed:', readErrorMessage(dispatchError))
  }
}

function readToolOutput(result: unknown) {
  if (typeof result === 'string') return result
  if (result && typeof result === 'object') {
    const content = Reflect.get(result, 'content')
    if (typeof content === 'string') return content
    if (content !== undefined) return stableStringify(content)
  }
  return stableStringify(result)
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stableStringify(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function readErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Diagram tool execution failed.'
}
