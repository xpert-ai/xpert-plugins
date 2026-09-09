import { operation, jsonValueSchema } from './contracts.js'
import { z } from 'zod/v3'
import {
  diagramEdgeSchema,
  diagramGroupSchema,
  diagramIrSchema,
  diagramNodeSchema
} from '../diagram-engine/diagram-input.schema.js'
import type { DiagramJsonValue } from '../diagram-engine/diagram.types.js'
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

export const jsonObjectSchema = z.record(jsonValueSchema)

export const templateListSchema = z
  .object({
    search: z.string().max(1000).optional(),
    category: z.string().max(1000).optional(),
    tags: z.array(z.string().max(100)).max(16).optional()
  })
  .strict()
export const templateInspectSchema = z
  .object({ key: z.string().min(1).max(1000), version: z.string().max(1000).optional() })
  .strict()
export const templateInstantiateSchema = z
  .object({
    ...operation,
    key: z.string().min(1).max(1000),
    version: z.string().max(1000).optional(),
    parameters: jsonObjectSchema,
    drawingId: z.string().max(1000).optional(),
    expectedRevision: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .optional()
      .describe('Required when replacing an existing DiagramIR.'),
    replaceCurrent: z
      .boolean()
      .optional()
      .describe('Set true only after the user explicitly confirms replacing the current DiagramIR.')
  })
  .strict()
export const diagramCreateSchema = z
  .object({
    ...operation,
    drawingId: z.string().max(1000).optional(),
    expectedRevision: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .optional()
      .describe('Required when replacing an existing DiagramIR.'),
    ir: diagramIrSchema,
    replaceCurrent: z.boolean().optional(),
    changeSummary: z.string().max(240).optional()
  })
  .strict()
export const drawingSchema = z.object({ drawingId: z.string().min(1).max(1000) }).strict()
export const revisionReadSchema = z
  .object({
    ...operation,
    drawingId: z.string().min(1).max(1000),
    expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
  })
  .strict()
export const mutationBase = {
  ...operation,
  drawingId: z.string().min(1).max(1000),
  expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  changeSummary: z.string().max(240).optional()
}
export const upsertGroupSchema = z.object({ ...mutationBase, group: diagramGroupSchema }).strict()
export const upsertNodeSchema = z.object({ ...mutationBase, node: diagramNodeSchema }).strict()
export const upsertEdgeSchema = z.object({ ...mutationBase, edge: diagramEdgeSchema }).strict()
export const removeItemsSchema = z
  .object({ ...mutationBase, ids: z.array(z.string().min(1).max(1000)).min(1).max(100) })
  .strict()
export const renderSchema = z
  .object({
    expectedSceneRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    ...operation,
    drawingId: z.string().min(1).max(1000),
    expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    replaceDiverged: z
      .boolean()
      .optional()
      .describe('Set true only after explicit user confirmation that manual Excalidraw edits may be replaced.')
  })
  .strict()
export const previewSchema = z
  .object({
    ...operation,
    drawingId: z.string().min(1).max(1000),
    expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    qualityRunId: z.string().uuid().optional()
  })
  .strict()
export const qualityIssueSchema = z
  .object({
    code: z.string().min(1).max(1000),
    severity: z.enum(['error', 'warning', 'info']),
    message: z.string().min(1).max(1000),
    targetIds: z.array(z.string().min(1).max(1000)).max(100),
    correctionIntent: z.string().min(1).max(1000).optional()
  })
  .strict()
export const visualReviewSchema = z
  .object({
    ...operation,
    drawingId: z.string().min(1).max(1000),
    expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    qualityRunId: z.string().uuid(),
    decision: z.enum(['passed', 'needs_revision', 'skipped']),
    issues: z.array(qualityIssueSchema).max(100),
    notes: z.string().max(2000).optional()
  })
  .strict()

export const qualityReadSchema = drawingSchema.extend({
  issueOffset: z.number().int().min(0).max(100000).optional(),
  issueLimit: z.number().int().min(1).max(100).optional(),
  reviewOffset: z.number().int().min(0).max(100000).optional(),
  reviewLimit: z.number().int().min(1).max(10).optional()
}).strict()
