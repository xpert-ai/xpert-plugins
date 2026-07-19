import { Injectable } from '@nestjs/common'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import {
  CANVAS_AGENT_CAPABILITY,
  CANVAS_CREATE_DOCUMENT_TOOL_NAME,
  CANVAS_FEATURE,
  CANVAS_GET_DOCUMENT_TOOL_NAME,
  CANVAS_GET_RECORD_TOOL_NAME,
  CANVAS_LIST_RECORDS_TOOL_NAME,
  CANVAS_ICON,
  CANVAS_INSERT_IMAGE_TOOL_NAME,
  CANVAS_MIDDLEWARE_NAME,
  CANVAS_PATCH_RECORDS_TOOL_NAME,
  CANVAS_REPORT_FAILURE_TOOL_NAME,
  CANVAS_SEARCH_DOCUMENTS_TOOL_NAME,
  CANVAS_UPDATE_DOCUMENT_STATUS_TOOL_NAME,
  CANVAS_WORKBENCH_CAPABILITY
} from './constants.js'
import {
  stringifyAgentToolResult,
  summarizeDocumentSummaryResult,
  summarizeDocumentMutationResult,
  summarizeFailureResult,
  summarizeGetRecordResult,
  summarizeRecordBatchResult,
  summarizeRecordListResult,
  summarizeSearchResult
} from './canvas-agent-response.js'
import { CanvasService } from './canvas.service.js'
import type {
  ApplyCanvasRecordBatchInput,
  CanvasJsonObject,
  CanvasJsonValue,
  CanvasScope,
  CreateCanvasDocumentInput,
  GetCanvasDocumentSummaryInput,
  GetCanvasRecordForAgentInput,
  InsertCanvasImageInput,
  ListCanvasRecordsInput,
  ReportCanvasFailureInput,
  SearchCanvasDocumentsInput,
  UpdateCanvasDocumentStatusInput
} from './types.js'
import { defineCanvasAgentTool } from './canvas-agent-tool.factory.js'
import {
  applyRecordBatchSchema,
  createDocumentSchema,
  getDocumentSummarySchema,
  getRecordSchema,
  insertImageSchema,
  listRecordsSchema,
  reportFailureSchema,
  searchDocumentsSchema,
  updateDocumentStatusSchema
} from './canvas-agent-tool.schemas.js'

const CHANGE_SUMMARY_EVENT_TOOL_NAMES = new Set([
  CANVAS_CREATE_DOCUMENT_TOOL_NAME,
  CANVAS_PATCH_RECORDS_TOOL_NAME,
  CANVAS_INSERT_IMAGE_TOOL_NAME
])
const AGENT_EDITING_TOOL_NAMES = new Set([
  CANVAS_PATCH_RECORDS_TOOL_NAME,
  CANVAS_INSERT_IMAGE_TOOL_NAME,
  CANVAS_UPDATE_DOCUMENT_STATUS_TOOL_NAME
])

@Injectable()
@AgentMiddlewareStrategy(CANVAS_MIDDLEWARE_NAME)
export class CanvasMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: CANVAS_MIDDLEWARE_NAME,
    label: {
      en_US: 'Canvas',
      zh_Hans: 'Canvas 画布'
    },
    description: {
      en_US: 'Create, update, search, annotate, and recover tldraw canvas working copies from an Agent. Versions remain human-controlled.',
      zh_Hans: '让 Agent 创建、更新、检索、标注和恢复 tldraw 画布工作副本；版本仅由人工创建。'
    },
    icon: {
      type: 'svg',
      value: CANVAS_ICON,
      color: '#0f766e'
    },
    features: [CANVAS_FEATURE, CANVAS_AGENT_CAPABILITY, CANVAS_WORKBENCH_CAPABILITY],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: CanvasService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: CANVAS_MIDDLEWARE_NAME,
      tools: [
        defineCanvasAgentTool(
          async (input: CreateCanvasDocumentInput) => stringifyAgentToolResult(summarizeDocumentMutationResult(await this.service.createDocument(scope, input), 'Canvas document was created.')),
          {
            name: CANVAS_CREATE_DOCUMENT_TOOL_NAME,
            description:
              'Create Canvas metadata only when there is no current Workbench canvas or the user explicitly asks for a new canvas. This tool never accepts or writes a complete snapshot. After creation, discover the page with canvas_list_records and add content through bounded canvas_patch_records stages. If env.canvasDocumentId is present, use that existing document instead.',
            schema: createDocumentSchema,
            verboseParsingErrors: true
          }
        ),
        defineCanvasAgentTool(
          async (input: ApplyCanvasRecordBatchInput) => stringifyAgentToolResult(summarizeRecordBatchResult(await this.service.applyAgentRecordBatch(scope, input))),
          {
            name: CANVAS_PATCH_RECORDS_TOOL_NAME,
            description:
              'Apply one visible, idempotent stage of at most 12 shape or record operations to the live Canvas. Before calling, count createShapes + updateRecords + removeRecords. If the planned total exceeds 12, do not call yet: split it into semantic stages, preferably 6–8 operations each; the first creation call is not an exception. For example, split 16 shapes into 8 + 8, wait for the first receipt, then pass its workingCopyRevision as the second stage baseRevision. Create text, geo, note, frame, or arrow shapes with simplified createShapes inputs; Canvas generates shape ids when omitted, resolves the only/default page, assigns valid indices, fills tldraw defaults, and converts plain text to richText. Patch existing records with updateRecords and checksums from canvas_list_records/canvas_get_record; remove existing records with removeRecords and checksums. Chain stages by reusing batchId, incrementing stageIndex, using a new operationId, and passing the prior receipt workingCopyRevision as baseRevision. Never send a complete snapshot or raw tldraw create record.',
            schema: applyRecordBatchSchema,
            verboseParsingErrors: true
          }
        ),
        defineCanvasAgentTool(
          async (input: InsertCanvasImageInput) => stringifyAgentToolResult(summarizeDocumentMutationResult(await this.service.insertImage(scope, input), 'Image was inserted into the canvas.')),
          {
            name: CANVAS_INSERT_IMAGE_TOOL_NAME,
            description:
              'Insert one generated bitmap into the current Canvas working copy. This does not create a version. Use documentId from env.canvasDocumentId or target.documentId from env.canvasInsertionTargetJson. Pass exactly one image source: workspaceFilePath, dataUrl, or base64. If env.canvasInsertionTargetJson is present, parse it and pass it as target; the backend infers page, selected holder, size, and replacement behavior. Do not create a new canvas for image insertion.',
            schema: insertImageSchema,
            verboseParsingErrors: true
          }
        ),
        defineCanvasAgentTool(
          async (input: SearchCanvasDocumentsInput) => stringifyAgentToolResult(summarizeSearchResult(await this.service.searchDocuments(scope, input))),
          {
            name: CANVAS_SEARCH_DOCUMENTS_TOOL_NAME,
            description: 'Search existing Canvas documents by status, kind, keyword, and pagination. Returns document metadata only.',
            schema: searchDocumentsSchema,
            verboseParsingErrors: true
          }
        ),
        defineCanvasAgentTool(
          async (input: GetCanvasDocumentSummaryInput) => stringifyAgentToolResult(summarizeDocumentSummaryResult(await this.service.getDocumentSummaryForAgent(scope, input))),
          {
            name: CANVAS_GET_DOCUMENT_TOOL_NAME,
            description:
              'Get a compact Canvas summary with identity, status, workingCopyRevision, checksum, and record counts. It never returns the scene or a complete snapshot. Continue with canvas_list_records for bounded discovery.',
            schema: getDocumentSummarySchema,
            verboseParsingErrors: true
          }
        ),
        defineCanvasAgentTool(
          async (input: ListCanvasRecordsInput) => stringifyAgentToolResult(summarizeRecordListResult(await this.service.listRecordsForAgent(scope, input))),
          {
            name: CANVAS_LIST_RECORDS_TOOL_NAME,
            description:
              'List one bounded page of Canvas record summaries at an exact workingCopyRevision. Filter by persistent record type, shape type, page, parent, or query. Follow nextCursor only when hasMore is true; call canvas_get_record for one exact item before changing or removing it.',
            schema: listRecordsSchema,
            verboseParsingErrors: true
          }
        ),
        defineCanvasAgentTool(
          async (input: GetCanvasRecordForAgentInput) => stringifyAgentToolResult(summarizeGetRecordResult(await this.service.getRecordForAgent(scope, input))),
          {
            name: CANVAS_GET_RECORD_TOOL_NAME,
            description:
              'Fetch one exact, allowlisted tldraw working-copy record at an exact revision. The response includes its checksum for an updateRecords or removeRecords precondition. Read only records needed for the next edit stage.',
            schema: getRecordSchema,
            verboseParsingErrors: true
          }
        ),
        defineCanvasAgentTool(
          async (input: UpdateCanvasDocumentStatusInput) => stringifyAgentToolResult(summarizeDocumentMutationResult(await this.service.updateDocumentStatus(scope, input), 'Canvas status was updated.')),
          {
            name: CANVAS_UPDATE_DOCUMENT_STATUS_TOOL_NAME,
            description: 'Update a Canvas document status to draft, reviewed, or archived after user confirmation.',
            schema: updateDocumentStatusSchema,
            verboseParsingErrors: true
          }
        ),
        defineCanvasAgentTool(
          async (input: ReportCanvasFailureInput) => stringifyAgentToolResult(summarizeFailureResult(await this.service.reportFailure(scope, input))),
          {
            name: CANVAS_REPORT_FAILURE_TOOL_NAME,
            description:
              'Record a failed Canvas generation, snapshot validation, image insertion, import, or patch attempt with recoverability and evidence.',
            schema: reportFailureSchema,
            verboseParsingErrors: true
          }
        )
      ],
      wrapToolCall: async (request, handler) => {
        const changeSummary = readChangeSummaryMessage(request.toolCall.args)
        const toolName = request.toolCall.name
        const documentId = readDocumentIdFromArgs(request.toolCall.args)
        const actor = documentId && typeof this.service.createAgentCollaborationActor === 'function'
          ? this.service.createAgentCollaborationActor(scope, documentId)
          : null
        const createdAt = new Date()
        if (documentId && actor) {
          await publishCanvasAgentPresence(
            this.service,
            scope,
            documentId,
            actor,
            toolName,
            AGENT_EDITING_TOOL_NAMES.has(toolName) ? 'editing' : 'thinking'
          )
        }
        if (changeSummary && CHANGE_SUMMARY_EVENT_TOOL_NAMES.has(toolName)) {
          await dispatchCanvasToolStepEvent({ request, message: changeSummary, status: 'running', createdAt })
        }

        try {
          const result = await handler(request)
          if (documentId && actor) {
            await publishCanvasAgentPresence(this.service, scope, documentId, actor, toolName, 'done')
          }
          if (changeSummary && CHANGE_SUMMARY_EVENT_TOOL_NAMES.has(toolName)) {
            await dispatchCanvasToolStepEvent({ request, message: changeSummary, status: 'success', createdAt })
          }
          return result
        } catch (error) {
          if (documentId && actor) {
            await publishCanvasAgentPresence(this.service, scope, documentId, actor, toolName, 'failed')
          }
          if (changeSummary && CHANGE_SUMMARY_EVENT_TOOL_NAMES.has(toolName)) {
            await dispatchCanvasToolStepEvent({
              request,
              message: changeSummary,
              status: 'fail',
              createdAt,
              error: getErrorMessage(error instanceof Error ? error : String(error))
            })
          }
          throw error
        }
      }
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): CanvasScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId,
    conversationId: context.conversationId ?? null,
    assistantId: context.xpertId ?? null,
    assistantDisplayName: readContextDisplayName(context)
  }
}

type ToolArgsValue = CanvasJsonValue | object | null | undefined

function readChangeSummaryMessage(args: ToolArgsValue) {
  if (!isPlainObject(args)) {
    return undefined
  }
  const value = args.changeSummary
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readDocumentIdFromArgs(args: ToolArgsValue) {
  if (!isPlainObject(args)) return undefined
  const direct = args.documentId
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const target = args.target
  if (isPlainObject(target) && typeof target.documentId === 'string' && target.documentId.trim()) return target.documentId.trim()
  return undefined
}

function readContextDisplayName(context: IAgentMiddlewareContext) {
  const node = context.node && typeof context.node === 'object' ? context.node : null
  const title = node ? Reflect.get(node, 'title') : null
  return typeof title === 'string' && title.trim() ? title.trim() : null
}

async function publishCanvasAgentPresence(
  service: CanvasService,
  scope: CanvasScope,
  documentId: string,
  actor: ReturnType<CanvasService['createAgentCollaborationActor']>,
  toolName: string,
  status: 'thinking' | 'editing' | 'done' | 'failed'
) {
  try {
    await service.publishAgentAwareness(scope, documentId, actor, {
      protocolVersion: 1,
      mode: 'edit',
      status,
      toolName,
      operationLabel: TOOL_OPERATION_LABELS[toolName] ?? toolName
    })
  } catch {
    // Presence is ephemeral and must never fail the underlying Canvas tool call.
  }
}

const TOOL_OPERATION_LABELS: Record<string, string> = {
  [CANVAS_PATCH_RECORDS_TOOL_NAME]: 'Applying a canvas stage',
  [CANVAS_INSERT_IMAGE_TOOL_NAME]: 'Inserting image',
  [CANVAS_GET_DOCUMENT_TOOL_NAME]: 'Reading canvas summary',
  [CANVAS_LIST_RECORDS_TOOL_NAME]: 'Listing canvas records',
  [CANVAS_GET_RECORD_TOOL_NAME]: 'Inspecting canvas record',
  [CANVAS_UPDATE_DOCUMENT_STATUS_TOOL_NAME]: 'Updating canvas status'
}

type CanvasToolStepStatus = 'running' | 'success' | 'fail'

async function dispatchCanvasToolStepEvent({
  request,
  message,
  status,
  createdAt,
  error
}: {
  request: Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]
  message: string
  status: CanvasToolStepStatus
  createdAt: Date
  error?: string
}) {
  const toolCall = request.toolCall
  const runtimeMetadata = request.runtime && typeof request.runtime === 'object'
    ? Reflect.get(request.runtime, 'metadata')
    : undefined
  const metadata = isPlainObject(runtimeMetadata) ? runtimeMetadata : {}
  const toolName = toolCall.name
  const toolCallId = getToolCallDisplayId(toolCall)
  const toolset = readStringField(metadata, ['toolset']) ?? CANVAS_MIDDLEWARE_NAME
  const toolsetId = readStringField(metadata, ['toolsetId'])
  const title = readStringField(metadata, ['toolName', toolName]) ?? toolName
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
    ...(error ? { error } : {})
  }
  try {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, payload)
  } catch (error) {
    console.warn('[CanvasMiddleware] dispatch tool message failed:', getErrorMessage(error instanceof Error ? error : String(error)))
  }
}

function getToolCallDisplayId(toolCall: { id?: string; name: string; args?: ToolArgsValue }) {
  if (typeof toolCall.id === 'string' && toolCall.id.trim()) {
    return toolCall.id.trim()
  }
  return `${toolCall.name}:${stringifyValue(toolCall.args)}`
}

function stringifyValue(value: ToolArgsValue) {
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

function readStringField(record: CanvasJsonObject, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function getErrorMessage(error: Error | string) {
  return error instanceof Error ? error.message : stringifyValue(error) || 'Unknown error'
}

function isPlainObject(value: ToolArgsValue): value is CanvasJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
