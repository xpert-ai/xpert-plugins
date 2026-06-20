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
  DRAWIO_CREATE_DRAWING_TOOL_NAME,
  DRAWIO_FEATURE,
  DRAWIO_GET_DRAWING_TOOL_NAME,
  DRAWIO_ICON,
  DRAWIO_MIDDLEWARE_NAME,
  DRAWIO_PATCH_SCENE_TOOL_NAME,
  DRAWIO_REPORT_FAILURE_TOOL_NAME,
  DRAWIO_SAVE_MERMAID_DRAFT_TOOL_NAME,
  DRAWIO_SAVE_SCENE_VERSION_TOOL_NAME,
  DRAWIO_SEARCH_DRAWINGS_TOOL_NAME,
  DRAWIO_UPDATE_DRAWING_STATUS_TOOL_NAME
} from './constants.js'
import { DrawioService } from './drawio.service.js'
import type { DrawioScope } from './types.js'

const drawingKindSchema = z.enum(['diagram', 'flowchart', 'architecture', 'network', 'wireframe', 'sequence', 'other'])
const drawingStatusSchema = z.enum(['draft', 'reviewed', 'archived'])
const versionSourceSchema = z.enum(['agent_xml', 'agent_patch', 'agent_mermaid', 'workbench', 'workbench_mermaid', 'import', 'restore'])
const recordSchema = z.record(z.unknown())
const sceneSchema = z.object({
  xml: z.string().optional().describe('draw.io XML, usually an <mxfile> or <mxGraphModel> document.'),
  mermaidSource: z.string().optional().describe('Original Mermaid source when this diagram came from Mermaid.'),
  previewSvg: z.string().optional().describe('Optional SVG preview exported from diagrams.net.'),
  previewPng: z.string().optional().describe('Optional PNG data URI preview exported from diagrams.net.'),
  descriptor: recordSchema.optional().describe('Optional diagrams.net JSON protocol descriptor, such as {format:"mermaid",data:"..."}')
})

const createDrawingSchema = sceneSchema.extend({
  title: z.string().min(1).describe('Human-readable diagram title.'),
  description: z.string().optional(),
  kind: drawingKindSchema.optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional().describe('Short source label, such as user_request, agent_plan, or imported_file.'),
  changeSummary: z.string().optional().describe('Short summary for the initial version.')
})

const saveSceneVersionSchema = sceneSchema.extend({
  drawingId: z.string().min(1).describe('Existing draw.io diagram id.'),
  sourceType: versionSourceSchema.optional().describe('Where this version came from. Agent-created XML should use agent_xml.'),
  changeSummary: z.string().optional()
})

const patchSceneSchema = sceneSchema.extend({
  drawingId: z.string().min(1).describe('Existing draw.io diagram id.'),
  changeSummary: z.string().optional()
})

const saveMermaidDraftSchema = z.object({
  drawingId: z.string().optional().describe('Existing diagram id. Omit to create a new diagram for this Mermaid draft.'),
  title: z.string().optional().describe('Required when drawingId is omitted; otherwise used only as context.'),
  description: z.string().optional(),
  kind: drawingKindSchema.optional(),
  mermaidSource: z.string().min(1).describe('Mermaid diagram source. The Workbench loads it via diagrams.net descriptor import.'),
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
@AgentMiddlewareStrategy(DRAWIO_MIDDLEWARE_NAME)
export class DrawioMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: DRAWIO_MIDDLEWARE_NAME,
    label: {
      en_US: 'draw.io',
      zh_Hans: 'draw.io 绘图'
    },
    description: {
      en_US: 'Create, update, version, search, and recover draw.io diagrams from an Agent.',
      zh_Hans: '让 Agent 创建、更新、版本化、检索和恢复 draw.io 图形。'
    },
    icon: {
      type: 'svg',
      value: DRAWIO_ICON,
      color: '#f59e0b'
    },
    features: [DRAWIO_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: DrawioService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: DRAWIO_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input) => JSON.stringify(await this.service.createDrawing(scope, input), null, 2),
          {
            name: DRAWIO_CREATE_DRAWING_TOOL_NAME,
            description:
              'Create a reviewable draw.io diagram. Include initial XML when you can produce valid diagrams.net XML; otherwise create a diagram and save a Mermaid draft.',
            schema: createDrawingSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.saveSceneVersion(scope, input), null, 2),
          {
            name: DRAWIO_SAVE_SCENE_VERSION_TOOL_NAME,
            description:
              'Save a complete draw.io XML scene as a new version for an existing diagram. Call drawio_get_diagram first when updating a user-edited diagram.',
            schema: saveSceneVersionSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.patchScene(scope, input), null, 2),
          {
            name: DRAWIO_PATCH_SCENE_TOOL_NAME,
            description:
              'Save a targeted replacement of the current draw.io XML, Mermaid source, descriptor, or preview fields as a new version.',
            schema: patchSceneSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.saveMermaidDraft(scope, input), null, 2),
          {
            name: DRAWIO_SAVE_MERMAID_DRAFT_TOOL_NAME,
            description:
              'Save Mermaid source for conversion in the draw.io workbench. Use this for flowcharts, architecture flows, state diagrams, and sequence-style drafts.',
            schema: saveMermaidDraftSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.searchDrawings(scope, input), null, 2),
          {
            name: DRAWIO_SEARCH_DRAWINGS_TOOL_NAME,
            description: 'Search existing draw.io diagrams by status, kind, keyword, and pagination.',
            schema: searchDrawingsSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.getDrawing(scope, input.drawingId), null, 2),
          {
            name: DRAWIO_GET_DRAWING_TOOL_NAME,
            description: 'Get a diagram with current XML version, Mermaid source, version history, and recent action logs.',
            schema: getDrawingSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.updateDrawingStatus(scope, input), null, 2),
          {
            name: DRAWIO_UPDATE_DRAWING_STATUS_TOOL_NAME,
            description: 'Update a draw.io diagram status to draft, reviewed, or archived after user confirmation.',
            schema: updateDrawingStatusSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.reportFailure(scope, input), null, 2),
          {
            name: DRAWIO_REPORT_FAILURE_TOOL_NAME,
            description:
              'Record a failed draw.io generation, XML import, Mermaid conversion, or export attempt with recoverability and evidence.',
            schema: reportFailureSchema
          }
        )
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): DrawioScope {
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
