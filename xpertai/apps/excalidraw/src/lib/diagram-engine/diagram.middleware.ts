import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  RequestContext,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import type { ExcalidrawScope } from '../types.js'
import { EXCALIDRAW_ICON } from '../constants.js'
import { ArtifactTemplateCatalogService } from './artifact-template-catalog.service.js'
import { diagramEdgeSchema, diagramGroupSchema, diagramIrSchema, diagramNodeSchema } from './diagram.schema.js'
import { DiagramIrRevisionConflictException, DiagramIrService, DiagramIrValidationException } from './diagram-ir.service.js'
import type { DiagramJsonValue, DiagramWorkspaceFilesApi } from './diagram.types.js'
import { createChangeSummaryToolEventWrapper } from './diagram-tool-events.js'

export const EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME = 'ExcalidrawDiagramEngineMiddleware'

export const EXCALIDRAW_TEMPLATE_TOOL_NAMES = [
  'excalidraw_template_list',
  'excalidraw_template_inspect',
  'excalidraw_template_instantiate'
] as const

export const EXCALIDRAW_DIAGRAM_IR_TOOL_NAMES = [
  'excalidraw_diagram_create',
  'excalidraw_diagram_get',
  'excalidraw_diagram_upsert_group',
  'excalidraw_diagram_upsert_node',
  'excalidraw_diagram_upsert_edge',
  'excalidraw_diagram_remove_items',
  'excalidraw_diagram_render'
] as const

export const EXCALIDRAW_DIAGRAM_QUALITY_TOOL_NAMES = [
  'excalidraw_diagram_validate',
  'excalidraw_diagram_create_preview',
  'excalidraw_diagram_get_quality_report',
  'excalidraw_diagram_record_visual_review'
] as const

export const EXCALIDRAW_DIAGRAM_TOOL_NAMES = [
  ...EXCALIDRAW_TEMPLATE_TOOL_NAMES,
  ...EXCALIDRAW_DIAGRAM_IR_TOOL_NAMES,
  ...EXCALIDRAW_DIAGRAM_QUALITY_TOOL_NAMES
] as const

const CHANGE_SUMMARY_EVENT_TOOL_NAMES = new Set<string>([
  'excalidraw_diagram_create',
  'excalidraw_diagram_upsert_group',
  'excalidraw_diagram_upsert_node',
  'excalidraw_diagram_upsert_edge',
  'excalidraw_diagram_remove_items'
])

const jsonValueSchema: z.ZodType<DiagramJsonValue> = z.lazy(() => z.union([
  z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)
]))
const jsonObjectSchema = z.record(jsonValueSchema)

const templateListSchema = z.object({
  search: z.string().optional(), category: z.string().optional(), tags: z.array(z.string()).max(16).optional()
}).strict()
const templateInspectSchema = z.object({ key: z.string().min(1), version: z.string().optional() }).strict()
const templateInstantiateSchema = z.object({
  key: z.string().min(1),
  version: z.string().optional(),
  parameters: jsonObjectSchema,
  drawingId: z.string().optional(),
  expectedRevision: z.number().int().min(1).optional().describe('Required when replacing an existing DiagramIR.'),
  replaceCurrent: z.boolean().optional().describe('Set true only after the user explicitly confirms replacing the current DiagramIR.')
}).strict()
const diagramCreateSchema = z.object({
  drawingId: z.string().optional(),
  expectedRevision: z.number().int().min(1).optional().describe('Required when replacing an existing DiagramIR.'),
  ir: diagramIrSchema,
  replaceCurrent: z.boolean().optional(),
  changeSummary: z.string().max(240).optional()
}).strict()
const drawingSchema = z.object({ drawingId: z.string().min(1) }).strict()
const revisionReadSchema = z.object({ drawingId: z.string().min(1), expectedRevision: z.number().int().min(1) }).strict()
const mutationBase = { drawingId: z.string().min(1), expectedRevision: z.number().int().min(1), changeSummary: z.string().max(240).optional() }
const upsertGroupSchema = z.object({ ...mutationBase, group: diagramGroupSchema }).strict()
const upsertNodeSchema = z.object({ ...mutationBase, node: diagramNodeSchema }).strict()
const upsertEdgeSchema = z.object({ ...mutationBase, edge: diagramEdgeSchema }).strict()
const removeItemsSchema = z.object({ ...mutationBase, ids: z.array(z.string().min(1)).min(1).max(100) }).strict()
const renderSchema = z.object({
  drawingId: z.string().min(1), expectedRevision: z.number().int().min(1),
  replaceDiverged: z.boolean().optional().describe('Set true only after explicit user confirmation that manual Excalidraw edits may be replaced.')
}).strict()
const previewSchema = z.object({ drawingId: z.string().min(1), expectedRevision: z.number().int().min(1), qualityRunId: z.string().uuid().optional() }).strict()
const qualityIssueSchema = z.object({
  code: z.string().min(1), severity: z.enum(['error', 'warning', 'info']), message: z.string().min(1),
  targetIds: z.array(z.string().min(1)).max(100), correctionIntent: z.string().min(1).max(1000).optional()
}).strict()
const visualReviewSchema = z.object({
  drawingId: z.string().min(1),
  expectedRevision: z.number().int().min(1),
  qualityRunId: z.string().uuid(),
  decision: z.enum(['passed', 'needs_revision', 'skipped']),
  issues: z.array(qualityIssueSchema).max(100),
  notes: z.string().max(2000).optional()
}).strict()

@Injectable()
@AgentMiddlewareStrategy(EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME)
export class ExcalidrawDiagramEngineMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta = middlewareMeta(
    EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    'Excalidraw Technical Diagram Engine',
    'Excalidraw 技术图引擎',
    'Select templates, author and render DiagramIR, validate diagrams, create previews, and record bounded visual reviews.'
  )

  constructor(private readonly catalog: ArtifactTemplateCatalogService, private readonly diagrams: DiagramIrService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    return {
      name: EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
      tools: [
        tool((input) => jsonResult(() => {
          const items = this.catalog.list(input)
          return { items, total: items.length }
        }), {
          name: 'excalidraw_template_list',
          description: 'Search the built-in read-only Excalidraw DiagramIR template catalog. Call this before inspecting or instantiating a template.',
          schema: templateListSchema,
          verboseParsingErrors: true
        }),
        tool((input) => jsonResult(() => this.catalog.get(input.key, input.version)), {
          name: 'excalidraw_template_inspect',
          description: 'Inspect one template parameter schema, defaults, examples, builder id, and base DiagramIR before instantiation.',
          schema: templateInspectSchema,
          verboseParsingErrors: true
        }),
        tool((input) => jsonResult(() => this.diagrams.instantiateTemplate(scope, input)), {
          name: 'excalidraw_template_instantiate',
          description: 'Instantiate a validated built-in template as a new DiagramIR. It creates a new drawing by default. Replacing an existing DiagramIR requires drawingId plus replaceCurrent=true after explicit user confirmation.',
          schema: templateInstantiateSchema,
          verboseParsingErrors: true
        }),
        tool((input) => jsonResult(() => this.diagrams.create(scope, input)), {
          name: 'excalidraw_diagram_create', description: 'Prevalidate and create a versioned DiagramIR, linked to a new Excalidraw drawing unless drawingId is supplied. Blocking structural or geometric errors create neither a DiagramIR revision nor an Excalidraw drawing. Use explicit semantic kinds and stable ids.', schema: diagramCreateSchema, verboseParsingErrors: true
        }),
        tool((input) => jsonResult(() => this.diagrams.get(scope, input.drawingId)), {
          name: 'excalidraw_diagram_get', description: 'Read the latest DiagramIR revision, validation report, render link, and visual review state.', schema: drawingSchema, verboseParsingErrors: true
        }),
        tool((input) => jsonResult(() => this.diagrams.upsertGroup(scope, input)), {
          name: 'excalidraw_diagram_upsert_group', description: 'Add or replace one explicit DiagramIR group. Pass the current expectedRevision.', schema: upsertGroupSchema, verboseParsingErrors: true
        }),
        tool((input) => jsonResult(() => this.diagrams.upsertNode(scope, input)), {
          name: 'excalidraw_diagram_upsert_node', description: 'Add or replace one explicit DiagramIR node. Pass the current expectedRevision and keep stable ids.', schema: upsertNodeSchema, verboseParsingErrors: true
        }),
        tool((input) => jsonResult(() => this.diagrams.upsertEdge(scope, input)), {
          name: 'excalidraw_diagram_upsert_edge', description: 'Add or replace one semantic DiagramIR edge after both endpoint nodes exist. Pass the current expectedRevision.', schema: upsertEdgeSchema, verboseParsingErrors: true
        }),
        tool((input) => jsonResult(() => this.diagrams.removeItems(scope, input)), {
          name: 'excalidraw_diagram_remove_items', description: 'Remove DiagramIR groups, nodes, edges, or annotations by stable id. Connected edges are removed with a node.', schema: removeItemsSchema, verboseParsingErrors: true
        }),
        tool((input) => jsonResult(() => this.diagrams.render(scope, input)), {
          name: 'excalidraw_diagram_render', description: 'Validate, deterministically lay out, and render DiagramIR into a new Excalidraw version. Blocking validation errors prevent rendering; diverged scenes require explicit replacement confirmation.', schema: renderSchema, verboseParsingErrors: true
        }),
        tool((input) => jsonResult(() => this.diagrams.validate(scope, input)), {
          name: 'excalidraw_diagram_validate', description: 'Run structural and geometric DiagramIR validation. Pass the latest expectedRevision; validation creates a new revision. On a revision conflict, read the current DiagramIR with excalidraw_diagram_get and retry using its revision.', schema: revisionReadSchema, verboseParsingErrors: true
        }),
        tool(async (input) => {
          try {
            const files = context.runtime.capabilities?.require<DiagramWorkspaceFilesApi>('platform.workspace.files')
            if (!files) throw new ServiceUnavailableException('WorkspaceFilesRuntimeCapability is required to create diagram previews.')
            const result = await this.diagrams.createPreview(scope, files, input)
            return [json(result), { files: [{
              fileName: `diagram-preview-${result.attempt}.png`,
              filePath: result.artifacts.png.workspacePath,
              fileUrl: '',
              mimeType: 'image/png',
              extension: 'png'
            }] }]
          } catch (error) {
            return json(diagramToolFailure(error))
          }
        }, {
          name: 'excalidraw_diagram_create_preview', description: 'Create SVG and PNG quality previews in the current workspace. Reuse qualityRunId across the initial review and at most two correction passes.', schema: previewSchema, verboseParsingErrors: true
        }),
        tool((input) => jsonResult(() => this.diagrams.qualityReport(scope, input.drawingId)), {
          name: 'excalidraw_diagram_get_quality_report', description: 'Read deterministic validation issues, preview artifacts, visual review history, and correction exhaustion state.', schema: drawingSchema, verboseParsingErrors: true
        }),
        tool((input) => jsonResult(() => this.diagrams.recordVisualReview(scope, input)), {
          name: 'excalidraw_diagram_record_visual_review', description: 'Record passed, needs_revision, or skipped after actually inspecting the PNG. needs_revision requires targeted issues. A third failed review becomes exhausted.', schema: visualReviewSchema, verboseParsingErrors: true
        })
      ],
      wrapToolCall: createChangeSummaryToolEventWrapper(CHANGE_SUMMARY_EVENT_TOOL_NAMES)
    }
  }
}

function middlewareMeta(name: string, en_US: string, zh_Hans: string, description: string): TAgentMiddlewareMeta {
  return {
    name,
    label: { en_US, zh_Hans },
    description: { en_US: description, zh_Hans: description },
    icon: { type: 'svg', value: EXCALIDRAW_ICON, color: '#6965db' },
    features: ['excalidraw', 'diagram-ir'],
    configSchema: { type: 'object', properties: {}, required: [] }
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

function json(value: unknown) {
  return JSON.stringify(value)
}

async function jsonResult(action: () => PromiseOrValue<unknown>) {
  try {
    return json(await action())
  } catch (error) {
    return json(diagramToolFailure(error))
  }
}

function diagramToolFailure(error: unknown) {
  if (error instanceof DiagramIrValidationException) {
    return {
      success: false,
      message: error.message,
      created: false,
      validation: error.report,
      error: {
        code: 'diagram_validation_failed',
        statusCode: 400,
        retryable: true,
        recovery: 'Correct the reported target node or edge ids in the input DiagramIR, then call excalidraw_diagram_create again.'
      }
    }
  }

  if (error instanceof DiagramIrRevisionConflictException) {
    return {
      success: false,
      message: error.message,
      error: {
        code: 'diagram_revision_conflict',
        statusCode: 409,
        retryable: true,
        expectedRevision: error.expectedRevision ?? null,
        currentRevision: error.currentRevision,
        recoveryTool: 'excalidraw_diagram_get',
        recovery: 'Read the latest DiagramIR, reapply the intended change if still needed, and retry with the returned revision.'
      }
    }
  }

  const statusCode = readStatusCode(error)
  const publicMessage = statusCode < 500 ? readErrorMessage(error) : statusCode === 503
    ? readErrorMessage(error)
    : 'Diagram tool execution failed.'
  return {
    success: false,
    message: publicMessage,
    error: {
      code: statusCode === 400
        ? 'diagram_invalid_request'
        : statusCode === 404
          ? 'diagram_not_found'
          : statusCode === 409
            ? 'diagram_conflict'
            : statusCode === 503
              ? 'diagram_runtime_capability_unavailable'
              : 'diagram_tool_failed',
      statusCode,
      retryable: statusCode === 409 || statusCode === 503
    }
  }
}

function readStatusCode(error: unknown) {
  if (!error || typeof error !== 'object') return 500
  const getStatus = Reflect.get(error, 'getStatus')
  if (typeof getStatus === 'function') {
    const status = getStatus.call(error)
    if (typeof status === 'number') return status
  }
  const status = Reflect.get(error, 'status')
  if (typeof status === 'number') return status
  const response = Reflect.get(error, 'response')
  if (response && typeof response === 'object') {
    const responseStatus = Reflect.get(response, 'statusCode')
    if (typeof responseStatus === 'number') return responseStatus
  }
  return 500
}

function readErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Diagram tool execution failed.'
}
