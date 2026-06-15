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
  elements: z.array(z.unknown()).optional().describe('Excalidraw element array. Prefer valid Excalidraw element JSON.'),
  appState: recordSchema.optional().describe('Excalidraw appState JSON. Keep only serializable values.'),
  files: recordSchema.optional().describe('Excalidraw binary files map, when available.'),
  mermaidSource: z.string().optional().describe('Original Mermaid source when this scene came from Mermaid.')
})

const createDrawingSchema = sceneSchema.extend({
  title: z.string().min(1).describe('Human-readable drawing title.'),
  description: z.string().optional(),
  kind: drawingKindSchema.optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional().describe('Short source label, such as user_request, agent_plan, or imported_file.'),
  changeSummary: z.string().optional().describe('Short summary for the initial version.')
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
  drawingId: z.string().min(1)
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
          async (input) => JSON.stringify(await this.service.createDrawing(scope, input), null, 2),
          {
            name: EXCALIDRAW_CREATE_DRAWING_TOOL_NAME,
            description:
              'Create a reviewable Excalidraw drawing. Include initial elements/appState/files when you can produce valid Excalidraw JSON; otherwise create the drawing first and then save a Mermaid draft.',
            schema: createDrawingSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.saveSceneVersion(scope, input), null, 2),
          {
            name: EXCALIDRAW_SAVE_SCENE_VERSION_TOOL_NAME,
            description:
              'Save a complete Excalidraw scene as a new version for an existing drawing. Call excalidraw_get_drawing first when updating an existing user-edited drawing.',
            schema: saveSceneVersionSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.patchScene(scope, input), null, 2),
          {
            name: EXCALIDRAW_PATCH_SCENE_TOOL_NAME,
            description:
              'Apply add/update/delete element changes to the current drawing version and save the result as a new version. Prefer this for small targeted edits.',
            schema: patchSceneSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.saveMermaidDraft(scope, input), null, 2),
          {
            name: EXCALIDRAW_SAVE_MERMAID_DRAFT_TOOL_NAME,
            description:
              'Save Mermaid source for conversion in the Excalidraw workbench. Use this for flowcharts, architecture flows, state diagrams, and sequence-style drafts before manual review.',
            schema: saveMermaidDraftSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.searchDrawings(scope, input), null, 2),
          {
            name: EXCALIDRAW_SEARCH_DRAWINGS_TOOL_NAME,
            description: 'Search existing Excalidraw drawings by status, kind, keyword, and pagination.',
            schema: searchDrawingsSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.getDrawing(scope, input.drawingId), null, 2),
          {
            name: EXCALIDRAW_GET_DRAWING_TOOL_NAME,
            description:
              'Get a drawing with current version, version history, Mermaid source, and recent action logs before making updates.',
            schema: getDrawingSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.updateDrawingStatus(scope, input), null, 2),
          {
            name: EXCALIDRAW_UPDATE_DRAWING_STATUS_TOOL_NAME,
            description: 'Update a drawing status to draft, reviewed, or archived after user confirmation or workflow completion.',
            schema: updateDrawingStatusSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.reportFailure(scope, input), null, 2),
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
