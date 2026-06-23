import { Injectable } from '@nestjs/common'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
  EXCALIDRAW_CREATE_DRAWING_TOOL_NAME,
  EXCALIDRAW_FEATURE,
  EXCALIDRAW_GET_DRAWING_TOOL_NAME,
  EXCALIDRAW_GET_SCENE_ITEM_TOOL_NAME,
  EXCALIDRAW_ICON,
  EXCALIDRAW_MIDDLEWARE_NAME,
  EXCALIDRAW_PATCH_SCENE_TOOL_NAME,
  EXCALIDRAW_REPORT_FAILURE_TOOL_NAME,
  EXCALIDRAW_SAVE_MERMAID_DRAFT_TOOL_NAME,
  EXCALIDRAW_SAVE_SCENE_VERSION_TOOL_NAME,
  EXCALIDRAW_SEARCH_DRAWINGS_TOOL_NAME,
  EXCALIDRAW_UPDATE_DRAWING_STATUS_TOOL_NAME
} from './constants.js'
import {
  stringifyAgentToolResult,
  summarizeDrawingMutationResult,
  summarizeFailureResult,
  summarizeSearchResult,
  summarizeStatusResult
} from './excalidraw-agent-response.js'
import { ExcalidrawService } from './excalidraw.service.js'
import type { ExcalidrawScope } from './types.js'

const drawingKindSchema = z.enum(['diagram', 'whiteboard', 'flowchart', 'architecture', 'wireframe', 'other'])
const drawingStatusSchema = z.enum(['draft', 'reviewed', 'archived'])
const versionSourceSchema = z.enum([
  'agent_json',
  'agent_patch',
  'agent_mermaid',
  'workbench',
  'workbench_mermaid',
  'import',
  'restore'
])
const recordSchema = z.record(z.unknown())
const elementUpdateSchema = z.object({ id: z.string().min(1) }).catchall(z.unknown())
const sceneSchema = z.object({
  elements: z.array(z.unknown()).optional().describe('Full Excalidraw element JSON array. Elements must include explicit type, id, geometry, style, version, and type-specific fields.'),
  appState: recordSchema.optional().describe('Excalidraw appState JSON. Keep only serializable values.'),
  files: recordSchema.optional().describe('Excalidraw binary files map, when available.'),
  mermaidSource: z.string().optional().describe('Original Mermaid source when this scene came from Mermaid.')
})

const createDrawingSchema = z.object({
  title: z.string().min(1).describe('Human-readable drawing title.'),
  description: z.string().optional(),
  kind: drawingKindSchema.optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional().describe('Short source label, such as user_request, agent_plan, or imported_file.'),
  changeSummary: z.string().optional().describe('Short summary for the initial version.')
})

const addElementsSchema = z.object({
  drawingId: z.string().min(1).describe('Existing Excalidraw drawing id. Create a drawing first, usually without initial elements.'),
  elements: z.array(z.unknown()).min(1).max(20).describe('One element or a small batch to append. You may provide shorthand element JSON with id, type, geometry, and text/points as needed; the service fills common Excalidraw defaults such as style, roughness, locked, frameId, link, roundness, version, text defaults, and arrowhead defaults/aliases. Prefer 1-5 logically related elements per call for complex drawings.'),
  appStatePatch: recordSchema.optional().describe('Optional shallow appState patch. Omit unless this batch needs it.'),
  files: recordSchema.optional().describe('Replacement files map only when this batch adds file-backed elements. Omit otherwise.'),
  mermaidSource: z.string().optional().describe('Optional replacement Mermaid source. Omit to keep current source.'),
  changeSummary: z.string().optional()
})

const saveSceneVersionSchema = sceneSchema.extend({
  drawingId: z.string().min(1).describe('Existing Excalidraw drawing id.'),
  sourceType: versionSourceSchema.optional().describe('Where this version came from. Agent-created JSON should use agent_json.'),
  changeSummary: z.string().optional()
})

const patchSceneSchema = z.object({
  drawingId: z.string().min(1),
  addElements: z.array(z.unknown()).optional().describe('Elements to append to the current scene.'),
  updateElements: z.array(elementUpdateSchema).optional().describe('Shallow element updates keyed by id.'),
  deleteElementIds: z.array(z.string()).optional().describe('Element ids to remove from the current scene.'),
  appStatePatch: recordSchema.optional().describe('Shallow appState patch.'),
  files: recordSchema.optional().describe('Replacement files map. Omit to keep current files.'),
  mermaidSource: z.string().optional().describe('Replacement Mermaid source. Omit to keep current source.'),
  changeSummary: z.string().optional()
})

const saveMermaidDraftSchema = z.object({
  drawingId: z.string().optional().describe('Existing drawing id. Omit to create a new drawing for this Mermaid draft.'),
  title: z.string().optional().describe('Required when drawingId is omitted; otherwise used only as context.'),
  description: z.string().optional(),
  kind: drawingKindSchema.optional(),
  mermaidSource: z.string().min(1).describe('Mermaid diagram source. Flowcharts convert to editable Excalidraw elements best.'),
  changeSummary: z.string().optional()
})

const searchDrawingsSchema = z.object({
  status: drawingStatusSchema.optional(),
  kind: drawingKindSchema.optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional()
})

const getDrawingSchema = z.object({
  drawingId: z.string().min(1),
  includeScene: z.boolean().optional().describe('Set true to fetch paged lightweight element refs for one version. Full elements are returned by excalidraw_get_scene_item.'),
  versionId: z.string().optional().describe('Specific version id to inspect. Use this to choose the scene version for includeScene or follow-up item reads.'),
  versionNumber: z.number().int().min(1).optional().describe('Specific version number to inspect. Use this to choose the scene version for includeScene or follow-up item reads.'),
  versionLimit: z.number().int().min(1).max(20).optional().describe('Number of lightweight version refs to return. Default 3, max 20.'),
  includeLogs: z.boolean().optional().describe('Set true only when recent action log metadata is needed. Log snapshots are not returned.'),
  logLimit: z.number().int().min(1).max(20).optional().describe('Number of recent log metadata rows to return. Default 5, max 20.'),
  includeFiles: z.boolean().optional().describe('Deprecated compatibility flag. File payloads are not returned here; use excalidraw_get_scene_item with itemType=file and fileId.'),
  elementOffset: z.number().int().min(0).optional().describe('Element offset for paged scene retrieval when includeScene is true.'),
  elementLimit: z.number().int().min(1).max(200).optional().describe('Maximum lightweight element refs to return when includeScene is true. Default 50, max 200.')
})

const sceneItemTypeSchema = z.enum(['element', 'appState', 'file', 'mermaidSource'])
const getSceneItemSchema = z.object({
  drawingId: z.string().min(1),
  itemType: sceneItemTypeSchema.describe('Explicit scene data type to retrieve.'),
  versionId: z.string().optional().describe('Specific version id. Omit both versionId and versionNumber to use the current version.'),
  versionNumber: z.number().int().min(1).optional().describe('Specific version number. Omit both versionId and versionNumber to use the current version.'),
  elementId: z.string().optional().describe('Required when itemType is element.'),
  fileId: z.string().optional().describe('Required when itemType is file.')
})

const updateDrawingStatusSchema = z.object({
  drawingId: z.string().min(1),
  status: drawingStatusSchema,
  reason: z.string().optional()
})

const reportFailureSchema = z.object({
  drawingId: z.string().optional(),
  versionId: z.string().optional(),
  operation: z.string().min(1),
  errorMessage: z.string().min(1),
  recoverable: z.boolean().optional(),
  evidence: z.unknown().optional()
})

const CHANGE_SUMMARY_EVENT_TOOL_NAMES = new Set([
  EXCALIDRAW_CREATE_DRAWING_TOOL_NAME,
  EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
  EXCALIDRAW_SAVE_SCENE_VERSION_TOOL_NAME,
  EXCALIDRAW_PATCH_SCENE_TOOL_NAME,
  EXCALIDRAW_SAVE_MERMAID_DRAFT_TOOL_NAME
])

@Injectable()
@AgentMiddlewareStrategy(EXCALIDRAW_MIDDLEWARE_NAME)
export class ExcalidrawMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: EXCALIDRAW_MIDDLEWARE_NAME,
    label: {
      en_US: 'Excalidraw',
      zh_Hans: 'Excalidraw 绘图'
    },
    description: {
      en_US: 'Create, update, version, search, and recover Excalidraw diagrams from an Agent.',
      zh_Hans: '让 Agent 创建、更新、版本化、检索和恢复 Excalidraw 图形。'
    },
    icon: {
      type: 'svg',
      value: EXCALIDRAW_ICON,
      color: '#2563eb'
    },
    features: [EXCALIDRAW_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: ExcalidrawService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: EXCALIDRAW_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input) => stringifyAgentToolResult(summarizeDrawingMutationResult(await this.service.createDrawing(scope, {
            title: input.title,
            description: input.description,
            kind: input.kind,
            tags: input.tags,
            source: input.source,
            changeSummary: input.changeSummary
          }), 'Excalidraw drawing was created.', { includeDrawingId: true })),
          {
            name: EXCALIDRAW_CREATE_DRAWING_TOOL_NAME,
            description:
              'Create a reviewable Excalidraw drawing record with metadata only. This tool does not accept elements, appState, files, or Mermaid source. After it succeeds, call excalidraw_add_elements in small batches or excalidraw_save_mermaid_draft for Mermaid.',
            schema: createDrawingSchema
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeDrawingMutationResult(
            await this.service.patchScene(scope, {
              drawingId: input.drawingId,
              addElements: input.elements,
              appStatePatch: input.appStatePatch,
              files: input.files,
              mermaidSource: input.mermaidSource,
              changeSummary: input.changeSummary
            }),
            'Excalidraw elements were added.'
          )),
          {
            name: EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
            description:
              'Append one element or a small batch of Excalidraw elements to the existing drawing current version without creating a new version. This is the default creation path for editable diagrams after excalidraw_create_drawing. Shorthand elements are accepted; common Excalidraw defaults and arrowhead aliases are filled automatically. Use small staged batches for complex diagrams so the Workbench can show incremental progress. Each call validates only the current scene plus this batch; if it fails, fix this batch and retry.',
            schema: addElementsSchema
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeDrawingMutationResult(await this.service.saveCurrentScene(scope, input), 'Excalidraw current scene was saved.')),
          {
            name: EXCALIDRAW_SAVE_SCENE_VERSION_TOOL_NAME,
            description:
              'Save a complete valid Excalidraw scene into the drawing current version without creating a new version. Use only for intentional full-scene creation or replacement; prefer excalidraw_add_elements for staged creation and excalidraw_patch_scene for targeted edits. Call excalidraw_get_drawing first when updating an existing user-edited drawing.',
            schema: saveSceneVersionSchema
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeDrawingMutationResult(await this.service.patchScene(scope, input), 'Excalidraw scene patch was saved.')),
          {
            name: EXCALIDRAW_PATCH_SCENE_TOOL_NAME,
            description:
              'Apply strict add/update/delete element changes to the current drawing version without creating a new version. Unknown ids, duplicate ids, type changes, invalid elements, and no-op patches are rejected; common arrowhead aliases and none/null values are normalized before validation. Prefer this for small targeted edits.',
            schema: patchSceneSchema
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeDrawingMutationResult(await this.service.saveMermaidDraft(scope, input), 'Mermaid draft was saved.', { includeDrawingId: true })),
          {
            name: EXCALIDRAW_SAVE_MERMAID_DRAFT_TOOL_NAME,
            description:
              'Save Mermaid source for automatic conversion into the drawing current version in the Excalidraw workbench. Use this only when the user explicitly asks for Mermaid, provides Mermaid source, or wants a very quick low-fidelity draft. For new editable diagrams, prefer excalidraw_create_drawing followed by excalidraw_add_elements.',
            schema: saveMermaidDraftSchema
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeSearchResult(await this.service.searchDrawings(scope, input))),
          {
            name: EXCALIDRAW_SEARCH_DRAWINGS_TOOL_NAME,
            description: 'Search existing Excalidraw drawings by status, kind, keyword, and pagination. Returns drawing metadata only, not scene JSON.',
            schema: searchDrawingsSchema
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(await this.service.getDrawingForAgent(scope, input)),
          {
            name: EXCALIDRAW_GET_DRAWING_TOOL_NAME,
            description:
              'Get compact drawing metadata, lightweight version refs, and optional paged lightweight element refs. This tool avoids full scene JSON. Use excalidraw_get_scene_item for full element JSON, appState, file payloads, or Mermaid source.',
            schema: getDrawingSchema
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(await this.service.getSceneItemForAgent(scope, input)),
          {
            name: EXCALIDRAW_GET_SCENE_ITEM_TOOL_NAME,
            description:
              'Fetch one explicit full scene item from a drawing version. Use itemType=element with elementId for full element JSON, itemType=appState for full appState, itemType=file with fileId for a file payload, or itemType=mermaidSource for full Mermaid source.',
            schema: getSceneItemSchema
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeStatusResult(await this.service.updateDrawingStatus(scope, input))),
          {
            name: EXCALIDRAW_UPDATE_DRAWING_STATUS_TOOL_NAME,
            description: 'Update a drawing status to draft, reviewed, or archived after user confirmation or workflow completion.',
            schema: updateDrawingStatusSchema
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeFailureResult(await this.service.reportFailure(scope, input))),
          {
            name: EXCALIDRAW_REPORT_FAILURE_TOOL_NAME,
            description:
              'Record a failed drawing or conversion attempt with recoverability and evidence. Use this instead of silently dropping bad source material.',
            schema: reportFailureSchema
          }
        )
      ],
      wrapToolCall: async (request, handler) => {
        const changeSummary = readChangeSummaryMessage(request.toolCall.args)
        if (!changeSummary || !CHANGE_SUMMARY_EVENT_TOOL_NAMES.has(request.toolCall.name)) {
          return handler(request)
        }

        const createdAt = new Date()
        await dispatchExcalidrawToolStepEvent({
          request,
          message: changeSummary,
          status: 'running',
          createdAt
        })

        try {
          const result = await handler(request)
          await dispatchExcalidrawToolStepEvent({
            request,
            message: changeSummary,
            status: 'success',
            createdAt,
            output: readToolMessageOutput(result)
          })
          return result
        } catch (error) {
          await dispatchExcalidrawToolStepEvent({
            request,
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
}

function scopeFromContext(context: IAgentMiddlewareContext): ExcalidrawScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId,
    conversationId: context.conversationId ?? null,
    assistantId: context.xpertId ?? null
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
  const runtimeMetadata = request.runtime && typeof request.runtime === 'object'
    ? Reflect.get(request.runtime, 'metadata')
    : undefined
  const metadata = isPlainObject(runtimeMetadata) ? runtimeMetadata : {}
  const toolName = toolCall.name
  const toolCallId = getToolCallDisplayId(toolCall)
  const toolset = readStringField(metadata, ['toolset']) ?? EXCALIDRAW_MIDDLEWARE_NAME
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
    ...(output !== undefined ? { output } : {}),
    ...(error ? { error } : {})
  }

  try {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, payload)
  } catch (dispatchError) {
    console.warn('[ExcalidrawMiddleware] dispatch tool message failed:', getErrorMessage(dispatchError))
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
