import { z } from 'zod/v3'

const idSchema = z
  .string()
  .min(1)
  .max(36)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._~-]*$/)
  .describe('Stable Lucid item id: 1-36 alphanumeric or -_.~ characters.')
const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/)
  .describe('Hex RGB or RGBA color such as #2563EB or #2563EBCC.')
const finiteNumberSchema = z.number().finite()
const documentKindSchema = z.enum(['diagram', 'flowchart', 'architecture', 'process', 'wireframe', 'orgchart', 'network', 'other'])

export const createAgentDocumentSchema = z
  .object({
    title: z.string().min(1).max(200).describe('Human-readable Lucidchart document title.'),
    description: z.string().max(2_000).optional(),
    kind: documentKindSchema.optional(),
    tags: z.array(z.string().min(1).max(80)).max(20).optional(),
    source: z.string().min(1).max(100).optional().describe('Short source label such as user_request.')
  })
  .strict()

export const agentShapeSchema = z
  .object({
    id: idSchema,
    type: z.enum(['rectangle', 'text', 'stickyNote', 'decision', 'database', 'data', 'document', 'process', 'terminator', 'note']),
    x: finiteNumberSchema,
    y: finiteNumberSchema,
    width: finiteNumberSchema.positive().max(20_000),
    height: finiteNumberSchema.positive().max(20_000),
    text: z.string().max(2_000).optional(),
    fillColor: colorSchema.optional(),
    strokeColor: colorSchema.optional(),
    strokeWidth: finiteNumberSchema.min(0).max(50).optional(),
    strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
    textColor: colorSchema.optional(),
    rounding: z.number().int().min(0).max(200).optional(),
    rotation: finiteNumberSchema.min(0).max(360).optional(),
    opacity: z.number().int().min(0).max(100).optional(),
    zIndex: z.number().int().min(-10_000).max(10_000).optional()
  })
  .strict()

export const agentLineSchema = z
  .object({
    id: idSchema,
    fromShapeId: idSchema,
    toShapeId: idSchema,
    lineType: z.enum(['straight', 'elbow', 'curved']).optional(),
    startStyle: z.enum(['none', 'arrow', 'openArrow', 'hollowArrow']).optional(),
    endStyle: z.enum(['none', 'arrow', 'openArrow', 'hollowArrow']).optional(),
    label: z.string().max(500).optional(),
    strokeColor: colorSchema.optional(),
    strokeWidth: finiteNumberSchema.min(0).max(50).optional(),
    strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
    zIndex: z.number().int().min(-10_000).max(10_000).optional()
  })
  .strict()

const pageSettingsSchema = z
  .object({
    fillColor: colorSchema.optional(),
    infiniteCanvas: z.boolean().optional(),
    width: z.number().int().min(1).max(20_000).optional(),
    height: z.number().int().min(1).max(20_000).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.width === undefined) !== (value.height === undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'width and height must be provided together.' })
    }
  })

export const applyDiagramStageSchema = z
  .object({
    documentId: z.string().min(1).describe('Existing Lucidchart plugin document id.'),
    expectedRevision: z.number().int().min(0).describe('draftRevision returned by create/get/apply immediately before this call.'),
    pageId: idSchema,
    pageTitle: z.string().min(1).max(200).optional().describe('Required when creating a new page.'),
    pageSettings: pageSettingsSchema.optional(),
    shapes: z.array(agentShapeSchema).max(12).optional(),
    lines: z.array(agentLineSchema).max(12).optional(),
    removeShapeIds: z.array(idSchema).max(12).optional(),
    removeLineIds: z.array(idSchema).max(12).optional(),
    stageName: z.string().min(1).max(200).describe('Short semantic stage name for the audit log.')
  })
  .strict()
  .superRefine((value, context) => {
    const operationCount =
      (value.shapes?.length ?? 0) +
      (value.lines?.length ?? 0) +
      (value.removeShapeIds?.length ?? 0) +
      (value.removeLineIds?.length ?? 0)
    if (operationCount > 12) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'A stage may contain at most 12 total element operations.' })
    }
    if (operationCount === 0 && !value.pageTitle && !value.pageSettings) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'A stage must create/update a page or contain at least one element operation.' })
    }
  })

export const finalizeDocumentSchema = z
  .object({
    documentId: z.string().min(1),
    expectedRevision: z.number().int().min(0).describe('Latest draftRevision returned by lucidchart_apply_diagram_stage.'),
    changeSummary: z.string().min(1).max(500).optional()
  })
  .strict()

export const getDiagramPageSchema = z
  .object({
    documentId: z.string().min(1),
    pageId: idSchema,
    offset: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(20).optional()
  })
  .strict()
