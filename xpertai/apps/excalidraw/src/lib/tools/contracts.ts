import { z } from 'zod/v3'
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
function boundedJson(depth: number): z.ZodType<JsonValue> {
  const primitive = z.union([z.string().max(200_000), z.number().finite(), z.boolean(), z.null()])
  if (depth === 0) return primitive
  const child = boundedJson(depth - 1)
  return z.union([
    primitive,
    z.array(child).max(5000),
    z
      .record(z.string().max(200), child)
      .refine((value) => Object.keys(value).length <= 1000, 'Too many object properties.')
  ])
}
export const jsonValueSchema = boundedJson(12)
export const id = z.string().trim().min(1).max(100)
export const summary = z.string().trim().min(1).max(240)
export const operation = {
  operationId: id.optional().describe('Reuse this stable operation id for a retry. Required for MCP mutations.'),
  changeSummary: summary.optional()
}
export const target = {
  drawingId: id
    .optional()
    .describe('Drawing id. MCP callers must provide it; only an Agent with active Workbench context may omit it.')
}
export const revision = z.number().int().min(0)
export const currentTarget = {
  ...target,
  expectedRevision: revision
    .optional()
    .describe('Scene revision read before planning a replacement. Required for destructive replacement and restore.')
}
export const drawingKind = z.enum(['diagram', 'whiteboard', 'flowchart', 'architecture', 'wireframe', 'other'])
export const drawingStatus = z.enum(['draft', 'reviewed', 'archived'])
export const emptySchema = z.object({}).strict()
export const point = z.tuple([z.number().finite(), z.number().finite()])
const binding = z
  .object({
    elementId: id,
    focus: z.number().finite().optional(),
    gap: z.number().finite().optional(),
    fixedPoint: point.nullable().optional()
  })
  .strict()
  .nullable()
export const elementSchema = z
  .object({
    id,
    type: z.enum([
      'rectangle',
      'diamond',
      'ellipse',
      'line',
      'arrow',
      'text',
      'freedraw',
      'image',
      'frame',
      'magicframe',
      'embeddable',
      'iframe'
    ]),
    x: z.number().finite().min(-100000).max(100000),
    y: z.number().finite().min(-100000).max(100000),
    width: z.number().finite().min(0).max(100000).optional(),
    height: z.number().finite().min(0).max(100000).optional(),
    angle: z.number().finite().optional(),
    strokeColor: z.string().max(100).optional(),
    backgroundColor: z.string().max(100).optional(),
    fillStyle: z.enum(['solid', 'hachure', 'cross-hatch', 'zigzag']).optional(),
    strokeWidth: z.number().min(0).max(100).optional(),
    strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
    roughness: z.number().min(0).max(10).optional(),
    opacity: z.number().min(0).max(100).optional(),
    text: z.string().max(10000).optional(),
    originalText: z.string().max(10000).optional(),
    fontSize: z.number().positive().max(1000).optional(),
    fontFamily: z.number().int().positive().max(100).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
    lineHeight: z.number().positive().max(10).optional(),
    autoResize: z.boolean().optional(),
    lastCommittedPoint: point.nullable().optional(),
    points: z.array(point).max(2000).optional(),
    pressures: z.array(z.number().min(0).max(1)).max(2000).optional(),
    simulatePressure: z.boolean().optional(),
    startArrowhead: z.string().max(40).nullable().optional(),
    endArrowhead: z.string().max(40).nullable().optional(),
    startBinding: binding.optional(),
    endBinding: binding.optional(),
    groupIds: z.array(id).max(100).optional(),
    frameId: id.nullable().optional(),
    containerId: id.nullable().optional(),
    boundElements: z
      .array(z.object({ id, type: z.enum(['arrow', 'text']) }).strict())
      .max(200)
      .nullable()
      .optional(),
    roundness: z
      .object({ type: z.number().int(), value: z.number().finite().optional() })
      .strict()
      .nullable()
      .optional(),
    seed: z.number().int().optional(),
    version: z.number().int().min(1).optional(),
    versionNonce: z.number().int().optional(),
    updated: z.number().finite().optional(),
    index: z.string().max(100).nullable().optional(),
    isDeleted: z.boolean().optional(),
    locked: z.boolean().optional(),
    link: z.string().max(2000).nullable().optional(),
    fileId: id.nullable().optional(),
    status: z.enum(['pending', 'saved', 'error']).optional(),
    scale: point.optional(),
    crop: jsonValueSchema.optional(),
    elbowed: z.boolean().optional(),
    fixedSegments: z.array(jsonValueSchema).max(500).nullable().optional(),
    startIsSpecial: z.boolean().optional(),
    endIsSpecial: z.boolean().optional(),
    name: z.string().max(240).nullable().optional(),
    customData: z.record(jsonValueSchema).optional()
  })
  .strict()
export const elementUpdateSchema = elementSchema.partial().required({ id: true })
export const appStateSchema = z
  .object({
    viewBackgroundColor: z.string().max(100).optional(),
    gridSize: z.number().min(1).max(1000).nullable().optional(),
    gridStep: z.number().min(1).max(1000).optional(),
    gridModeEnabled: z.boolean().optional(),
    exportBackground: z.boolean().optional(),
    exportWithDarkMode: z.boolean().optional(),
    exportScale: z.number().positive().max(4).optional()
  })
  .strict()
export const receiptSchema = z
  .object({
    success: z.boolean(),
    drawingId: id.optional(),
    sceneRevision: revision.optional(),
    irRevision: revision.optional(),
    versionId: id.optional(),
    versionNumber: revision.optional(),
    status: z.string().max(80).optional(),
    message: z.string().max(1000),
    changedIds: z.array(id).max(220).optional(),
    changedCount: z.number().int().min(0).optional(),
    jobId: id.optional(),
    previewId: id.optional(),
    cursor: id.optional(),
    terminal: z.boolean().optional(),
    shareUrl: z.string().max(4096).optional(),
    errorCode: z.string().max(100).optional(),
    nextAction: z.string().max(500).optional(),
    review: z.object({ qualityRunId: id, attempt: revision, decision: z.enum(['passed', 'needs_revision', 'skipped', 'exhausted']) }).strict().optional(),
    validation: jsonValueSchema.optional()
  })
  .strict()
export type Receipt = z.infer<typeof receiptSchema>
export const itemSchema = z
  .object({
    id,
    title: z.string().max(1000),
    description: z.string().max(10000).nullable().optional(),
    kind: drawingKind.optional(),
    status: drawingStatus.optional(),
    revision,
    currentVersionId: id.nullable().optional(),
    currentVersionNumber: revision,
    tags: z.array(z.string().max(100)).max(50),
    updatedAt: z.string().max(100).optional()
  })
  .strict()
export const searchResultSchema = z
  .object({
    items: z.array(itemSchema).max(100),
    total: z.number().int().min(0),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100),
    hasMore: z.boolean()
  })
  .strict()
export const versionSchema = z
  .object({
    id,
    drawingId: id,
    versionNumber: revision,
    sourceType: z.string().max(80),
    changeSummary: z.string().max(1000).nullable().optional(),
    createdAt: z.string().max(100).optional(),
    isCheckpoint: z.boolean().optional()
  })
  .strict()
export const drawingResultSchema = z
  .object({
    drawingId: id,
    item: itemSchema,
    sceneRevision: revision,
    versions: z.array(versionSchema).max(20),
    elementRefs: z
      .array(z.object({ id, type: z.string().max(80), text: z.string().max(240).optional() }).strict())
      .max(200),
    elementTotal: z.number().int().min(0),
    hasMore: z.boolean()
  })
  .strict()
export const sceneItemResultSchema = z
  .object({
    drawingId: id,
    sceneRevision: revision,
    itemType: z.enum(['element', 'appState', 'mermaidSource', 'file']),
    item: jsonValueSchema
  })
  .strict()
export const listVersionsResultSchema = z
  .object({
    drawingId: id,
    items: z.array(versionSchema).max(100),
    total: z.number().int().min(0),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100)
  })
  .strict()
export const catalogResultSchema = z
  .object({ items: z.array(jsonValueSchema).max(100), total: z.number().int().min(0) })
  .strict()
export const dataResultSchema = z
  .object({ drawingId: id.optional(), irRevision: revision.optional(), data: jsonValueSchema })
  .strict()

export const filesSchema = z
  .record(
    id,
    z
      .object({
        id,
        mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']),
        dataURL: z
          .string()
          .max(200000)
          .regex(/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/),
        created: z.number().finite(),
        lastRetrieved: z.number().finite().optional()
      })
      .strict()
  )
  .refine((value) => Object.keys(value).length <= 20, 'At most 20 files per call.')
