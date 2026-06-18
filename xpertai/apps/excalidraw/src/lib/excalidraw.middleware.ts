import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
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
import {
  EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
  EXCALIDRAW_CREATE_DRAWING_TOOL_NAME,
  EXCALIDRAW_FEATURE,
  EXCALIDRAW_GET_DRAWING_TOOL_NAME,
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
  elements: z.array(z.unknown()).min(1).max(20).describe('One element or a small batch of valid full Excalidraw element JSON objects to append. Prefer 1-5 logically related elements per call for complex drawings.'),
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
  includeScene: z.boolean().optional().describe('Set true only when exact Excalidraw elements/geometry are needed. Scene data can be large.'),
  versionId: z.string().optional().describe('Specific version id to fetch when includeScene is true or when inspecting an older version.'),
  versionNumber: z.number().int().min(1).optional().describe('Specific version number to fetch when includeScene is true or when inspecting an older version.'),
  versionLimit: z.number().int().min(1).max(20).optional().describe('Number of version metadata rows to return. Default 5, max 20.'),
  includeLogs: z.boolean().optional().describe('Set true only when recent action log metadata is needed. Log snapshots are not returned.'),
  logLimit: z.number().int().min(1).max(20).optional().describe('Number of recent log metadata rows to return. Default 5, max 20.'),
  includeFiles: z.boolean().optional().describe('Set true only when file payloads are required. Omitted by default because files can be very large.'),
  elementOffset: z.number().int().min(0).optional().describe('Element offset for paged scene retrieval when includeScene is true.'),
  elementLimit: z.number().int().min(1).max(1000).optional().describe('Maximum elements to return when includeScene is true. Default 200, max 1000.')
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
          }), 'Excalidraw drawing was created.')),
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
              'Append one element or a small batch of valid Excalidraw elements to an existing drawing. Use this after excalidraw_create_drawing for staged construction of complex diagrams. Each call validates only the current scene plus this batch; if it fails, fix this batch and retry.',
            schema: addElementsSchema
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeDrawingMutationResult(await this.service.saveSceneVersion(scope, input), 'Excalidraw scene version was saved.')),
          {
            name: EXCALIDRAW_SAVE_SCENE_VERSION_TOOL_NAME,
            description:
              'Save a complete valid Excalidraw scene as a new version for an existing drawing. Call excalidraw_get_drawing first when updating an existing user-edited drawing.',
            schema: saveSceneVersionSchema
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeDrawingMutationResult(await this.service.patchScene(scope, input), 'Excalidraw scene patch was saved.')),
          {
            name: EXCALIDRAW_PATCH_SCENE_TOOL_NAME,
            description:
              'Apply strict add/update/delete element changes to the current drawing version and save the result as a new version. Unknown ids, duplicate ids, type changes, invalid elements, and no-op patches are rejected. Prefer this for small targeted edits.',
            schema: patchSceneSchema
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeDrawingMutationResult(await this.service.saveMermaidDraft(scope, input), 'Mermaid draft was saved.')),
          {
            name: EXCALIDRAW_SAVE_MERMAID_DRAFT_TOOL_NAME,
            description:
              'Save Mermaid source for automatic conversion and version save in the Excalidraw workbench. Use this for flowcharts, architecture flows, state diagrams, and sequence-style drafts before manual review.',
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
              'Get compact drawing metadata and recent version metadata. By default this does not return scene JSON. Set includeScene=true with versionNumber or versionId only when exact elements/geometry are needed; use elementOffset/elementLimit for large scenes and includeFiles only when file payloads are required.',
            schema: getDrawingSchema
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
      ]
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
