import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { SystemMessage, ToolMessage } from '@langchain/core/messages'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory } from '@xpert-ai/contracts'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import {
  EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
  EXCALIDRAW_CREATE_DRAWING_TOOL_NAME,
  EXCALIDRAW_GET_DRAWING_TOOL_NAME,
  EXCALIDRAW_GET_SCENE_ITEM_TOOL_NAME,
  EXCALIDRAW_MIDDLEWARE_NAME,
  EXCALIDRAW_PATCH_SCENE_TOOL_NAME,
  EXCALIDRAW_PUBLISH_ARTIFACT_LINK_TOOL_NAME,
  EXCALIDRAW_REVOKE_ARTIFACT_LINK_TOOL_NAME,
  EXCALIDRAW_SAVE_MERMAID_DRAFT_TOOL_NAME,
  EXCALIDRAW_SAVE_SCENE_VERSION_TOOL_NAME,
  EXCALIDRAW_UPDATE_DRAWING_STATUS_TOOL_NAME
} from '../constants.js'
const CHANGE_SUMMARY_EVENT_TOOL_NAMES = new Set([
  EXCALIDRAW_CREATE_DRAWING_TOOL_NAME,
  EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
  EXCALIDRAW_SAVE_SCENE_VERSION_TOOL_NAME,
  EXCALIDRAW_PATCH_SCENE_TOOL_NAME,
  EXCALIDRAW_SAVE_MERMAID_DRAFT_TOOL_NAME
])

const DRAWING_ID_CONTEXT_TOOL_NAMES = new Set([
  'excalidraw_checkpoint_version',
  'excalidraw_restore_version',
  'excalidraw_list_versions',
  'excalidraw_create_preview',
  'excalidraw_export_drawing',
  'excalidraw_convert_mermaid',
  EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
  EXCALIDRAW_SAVE_SCENE_VERSION_TOOL_NAME,
  EXCALIDRAW_PATCH_SCENE_TOOL_NAME,
  EXCALIDRAW_SAVE_MERMAID_DRAFT_TOOL_NAME,
  EXCALIDRAW_GET_DRAWING_TOOL_NAME,
  EXCALIDRAW_GET_SCENE_ITEM_TOOL_NAME,
  EXCALIDRAW_PUBLISH_ARTIFACT_LINK_TOOL_NAME,
  EXCALIDRAW_REVOKE_ARTIFACT_LINK_TOOL_NAME,
  EXCALIDRAW_UPDATE_DRAWING_STATUS_TOOL_NAME
])

const REQUIRED_DRAWING_ID_TOOL_NAMES = new Set([
  'excalidraw_checkpoint_version',
  'excalidraw_restore_version',
  'excalidraw_list_versions',
  'excalidraw_create_preview',
  'excalidraw_export_drawing',
  'excalidraw_convert_mermaid',
  EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
  EXCALIDRAW_SAVE_SCENE_VERSION_TOOL_NAME,
  EXCALIDRAW_PATCH_SCENE_TOOL_NAME,
  EXCALIDRAW_GET_DRAWING_TOOL_NAME,
  EXCALIDRAW_GET_SCENE_ITEM_TOOL_NAME,
  EXCALIDRAW_PUBLISH_ARTIFACT_LINK_TOOL_NAME,
  EXCALIDRAW_REVOKE_ARTIFACT_LINK_TOOL_NAME,
  EXCALIDRAW_UPDATE_DRAWING_STATUS_TOOL_NAME
])

type RuntimeContextRecord = Record<string, unknown>

type CurrentExcalidrawWorkbenchDrawing = {
  drawingId: string
  title?: string
  currentVersionId?: string
  currentVersionNumber?: number
  isDirty?: boolean
  selectionType?: string
  selectedElementIds?: string[]
  selectedElementCount?: number
}

const MISSING_DRAWING_CONTEXT_MESSAGE = '未找到当前 Excalidraw Workbench 图形，请先打开图形或显式传 drawingId。'

export function excalidrawMiddlewareExtensions(): Omit<AgentMiddleware, 'name' | 'tools'> {
  return {
    wrapModelCall: (request, handler) => {
      const currentDrawing = resolveCurrentWorkbenchDrawing(request.runtime)
      if (!currentDrawing?.drawingId) {
        return handler(request)
      }

      return handler({
        ...request,
        systemMessage: appendSystemMessage(request.systemMessage, buildCurrentDrawingSystemPrompt(currentDrawing))
      })
    },
    wrapToolCall: async (request, handler) => {
      const preparedRequest = prepareExcalidrawToolRequest(request)
      if (preparedRequest instanceof ToolMessage) {
        return preparedRequest
      }

      const changeSummary = readChangeSummaryMessage(preparedRequest.toolCall.args)
      if (!changeSummary || !CHANGE_SUMMARY_EVENT_TOOL_NAMES.has(request.toolCall.name)) {
        return handler(preparedRequest)
      }

      const createdAt = new Date()
      await dispatchExcalidrawToolStepEvent({
        request: preparedRequest,
        message: changeSummary,
        status: 'running',
        createdAt
      })

      try {
        const result = await handler(preparedRequest)
        await dispatchExcalidrawToolStepEvent({
          request: preparedRequest,
          message: changeSummary,
          status: 'success',
          createdAt,
          output: readToolMessageOutput(result)
        })
        return result
      } catch (error) {
        await dispatchExcalidrawToolStepEvent({
          request: preparedRequest,
          message: changeSummary,
          status: 'fail',
          createdAt,
          error: getErrorMessage(error)
        })
        throw error
      }
    }
  }
}
type ExcalidrawToolCallRequest = Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]

function prepareExcalidrawToolRequest(request: ExcalidrawToolCallRequest): ExcalidrawToolCallRequest | ToolMessage {
  if (!DRAWING_ID_CONTEXT_TOOL_NAMES.has(request.toolCall.name)) {
    return request
  }

  const args = isPlainObject(request.toolCall.args) ? request.toolCall.args : {}
  const explicitDrawingId = getString(args.drawingId)
  const currentDrawing = resolveCurrentWorkbenchDrawing(request.runtime)
  const targetDrawingId = explicitDrawingId ?? currentDrawing?.drawingId
  if (
    request.toolCall.name === EXCALIDRAW_PUBLISH_ARTIFACT_LINK_TOOL_NAME &&
    currentDrawing?.isDirty === true &&
    targetDrawingId === currentDrawing.drawingId
  ) {
    return new ToolMessage({
      content:
        'The current Excalidraw Workbench drawing has unsynchronized changes. Save or synchronize it before creating an Artifact link.',
      tool_call_id: request.toolCall.id ?? 'unknown',
      name: request.toolCall.name,
      status: 'error'
    })
  }
  if (explicitDrawingId) {
    return request
  }

  if (currentDrawing?.drawingId) {
    return {
      ...request,
      toolCall: {
        ...request.toolCall,
        args: {
          ...args,
          drawingId: currentDrawing.drawingId
        }
      }
    }
  }

  if (!REQUIRED_DRAWING_ID_TOOL_NAMES.has(request.toolCall.name)) {
    return request
  }

  return new ToolMessage({
    content: MISSING_DRAWING_CONTEXT_MESSAGE,
    tool_call_id: request.toolCall.id ?? 'unknown',
    name: request.toolCall.name,
    status: 'error'
  })
}

function resolveCurrentWorkbenchDrawing(runtime: unknown): CurrentExcalidrawWorkbenchDrawing | null {
  const runtimeContext = resolveRuntimeContext(runtime)
  const excalidrawContext = getRecord(runtimeContext, 'excalidraw')
  const currentDrawing = getRecord(excalidrawContext, 'currentDrawing')
  const env = getRecord(runtimeContext, 'env')
  const contextJson = parseJsonRecord(getString(env?.excalidrawContextJson))
  const jsonCurrentDrawing = getRecord(contextJson, 'currentDrawing')
  const selection = getRecord(currentDrawing, 'selection') ?? getRecord(jsonCurrentDrawing, 'selection')
  const drawingId =
    getString(currentDrawing?.drawingId) ??
    getString(jsonCurrentDrawing?.drawingId) ??
    getString(env?.excalidrawDrawingId)

  if (!drawingId) {
    return null
  }

  const envSelectedElementIds = parseJsonStringArray(getString(env?.excalidrawSelectedElementIdsJson))
  const selectedElementIds = getStringArray(selection?.selectedElementIds) ?? envSelectedElementIds

  return {
    drawingId,
    title: getString(currentDrawing?.title) ?? getString(jsonCurrentDrawing?.title),
    currentVersionId:
      getString(currentDrawing?.currentVersionId) ??
      getString(jsonCurrentDrawing?.currentVersionId) ??
      getString(env?.excalidrawVersionId),
    currentVersionNumber:
      getNumber(currentDrawing?.currentVersionNumber) ??
      getNumber(jsonCurrentDrawing?.currentVersionNumber) ??
      getNumberFromString(getString(env?.excalidrawVersionNumber)),
    isDirty:
      getBoolean(currentDrawing?.isDirty) ??
      getBoolean(jsonCurrentDrawing?.isDirty) ??
      getBooleanFromString(getString(env?.excalidrawSceneDirty)),
    selectionType: getString(selection?.type),
    selectedElementIds,
    selectedElementCount:
      getNumber(selection?.selectedElementCount) ?? (selectedElementIds ? selectedElementIds.length : undefined)
  }
}

function resolveRuntimeContext(runtime: unknown): RuntimeContextRecord | null {
  if (!isPlainObject(runtime)) {
    return null
  }

  const directContext = getRecord(runtime, 'context')
  if (directContext) {
    return directContext
  }

  return getRecord(getRecord(runtime, 'configurable'), 'context')
}

function appendSystemMessage(systemMessage: unknown, addition: string) {
  const content =
    systemMessage instanceof SystemMessage
      ? systemMessage.content
      : isPlainObject(systemMessage) && typeof systemMessage.content === 'string'
      ? systemMessage.content
      : ''

  return new SystemMessage(
    [typeof content === 'string' ? content : stringifyValue(content), addition].filter(Boolean).join('\n\n')
  )
}

function buildCurrentDrawingSystemPrompt(drawing: CurrentExcalidrawWorkbenchDrawing) {
  const lines = [
    'Current Excalidraw Workbench drawing context:',
    `- excalidrawDrawingId: ${drawing.drawingId}`,
    drawing.title ? `- title: ${drawing.title}` : null,
    drawing.currentVersionId ? `- excalidrawVersionId: ${drawing.currentVersionId}` : null,
    drawing.currentVersionNumber !== undefined ? `- excalidrawVersionNumber: ${drawing.currentVersionNumber}` : null,
    `- excalidrawSceneDirty: ${drawing.isDirty === true ? 'true' : 'false'}`,
    drawing.selectionType ? `- selectionType: ${drawing.selectionType}` : null,
    drawing.selectedElementIds
      ? `- excalidrawSelectedElementIdsJson: ${JSON.stringify(drawing.selectedElementIds)}`
      : null,
    drawing.selectedElementCount !== undefined ? `- selectedElementCount: ${drawing.selectedElementCount}` : null,
    'Excalidraw tools may omit drawingId when operating on this current Workbench drawing.',
    'Do not create a new drawing for additions, blank-area insertions, title edits, restyling, or other updates to this current drawing.'
  ]

  return lines.filter(Boolean).join('\n')
}

function getRecord(record: unknown, key: string): RuntimeContextRecord | null {
  if (!isPlainObject(record)) {
    return null
  }
  const value = record[key]
  return isPlainObject(value) ? value : null
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function getNumberFromString(value: string | undefined) {
  if (!value) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function getBooleanFromString(value: string | undefined) {
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  return undefined
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }
  const values = value.map((item) => getString(item)).filter((item): item is string => Boolean(item))
  return values.length ? values : undefined
}

function parseJsonRecord(value: string | undefined): RuntimeContextRecord | null {
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(value)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function parseJsonStringArray(value: string | undefined) {
  if (!value) {
    return undefined
  }
  try {
    return getStringArray(JSON.parse(value))
  } catch {
    return undefined
  }
}

function readChangeSummaryMessage(args: unknown) {
  if (!isPlainObject(args)) {
    return undefined
  }
  const value = args.changeSummary
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

type ExcalidrawToolStepStatus = 'running' | 'success' | 'fail'

async function dispatchExcalidrawToolStepEvent({
  request,
  message,
  status,
  createdAt,
  output,
  error
}: {
  request: Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]
  message: string
  status: ExcalidrawToolStepStatus
  createdAt: Date
  output?: string
  error?: string
}) {
  const toolCall = request.toolCall
  const runtimeMetadata =
    request.runtime && typeof request.runtime === 'object' ? Reflect.get(request.runtime, 'metadata') : undefined
  const metadata = isPlainObject(runtimeMetadata) ? runtimeMetadata : {}
  const toolName = toolCall.name
  const toolCallId = getToolCallDisplayId(toolCall)
  const toolset = readStringField(metadata, ['toolset']) ?? EXCALIDRAW_MIDDLEWARE_NAME
  const toolsetId = readStringField(metadata, ['toolsetId'])
  const title = message
  const payload = {
    id: toolCallId,
    tool_call_id: toolCall.id,
    category: 'Tool',
    type: ChatMessageStepCategory.Program,
    toolset,
    ...(toolsetId ? { toolset_id: toolsetId } : {}),
    tool: toolName,
    title,
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
    if (process.env.XPERT_EXCALIDRAW_DEBUG === 'true')
      console.warn('[ExcalidrawMiddleware] dispatch tool message failed')
  }
}

function getToolCallDisplayId(toolCall: { id?: string; name: string; args?: unknown }) {
  if (typeof toolCall.id === 'string' && toolCall.id.trim()) {
    return toolCall.id.trim()
  }
  return `${toolCall.name}:${stringifyValue(toolCall.args)}`
}

function readToolMessageOutput(value: unknown) {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const content = Reflect.get(value, 'content')
  if (typeof content === 'string') {
    return content
  }
  if (content === undefined) {
    return undefined
  }
  return stringifyValue(content)
}

function readStringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function stringifyValue(value: unknown) {
  if (typeof value === 'string') {
    return value
  }
  if (value == null) {
    return ''
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return stringifyValue(error) || 'Unknown error'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
