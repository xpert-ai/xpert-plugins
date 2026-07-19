import { z } from 'zod/v3'
import type { CanvasJsonObject, CanvasJsonValue } from './types.js'

const DOCUMENT_ID_DESCRIPTION =
  'Canvas document UUID from env.canvasDocumentId, canvas_create_document, or canvas_search_documents.'
const JSON_VALUE_MAX_BYTES = 64 * 1024
const RECORD_BATCH_MAX_OPERATIONS = 12
const RECORD_BATCH_RECOMMENDED_OPERATIONS = '6–8'
const RECORD_BATCH_MAX_BYTES = 256 * 1024

const recordArrayLimitMessage = (field: 'createShapes' | 'updateRecords' | 'removeRecords') =>
  `${field} accepts at most ${RECORD_BATCH_MAX_OPERATIONS} items. Before calling canvas_patch_records, split larger plans into semantic stages of preferably ${RECORD_BATCH_RECOMMENDED_OPERATIONS} total operations, then use the prior receipt workingCopyRevision as the next baseRevision.`

const boundedString = (maximum: number) => z.string().trim().min(1).max(maximum)
const documentIdSchema = z.string().uuid().describe(DOCUMENT_ID_DESCRIPTION)
const versionIdSchema = z.string().uuid().describe('Canvas version UUID returned by a Canvas read or mutation receipt.')
const recordIdSchema = boundedString(200)
  .regex(/^[^\s:]+:[^\s]+$/, 'Expected a tldraw record id such as page:page or shape:task-1.')
  .describe('Exact tldraw record id discovered through canvas_list_records or canvas_get_record.')
const shapeIdSchema = boundedString(200)
  .regex(/^shape:[^\s]+$/, 'Expected a shape id such as shape:task-1.')
  .describe('Optional new shape id. Omit it to let Canvas generate a collision-safe id.')
const shapeParentIdSchema = boundedString(200)
  .regex(/^(page|shape):[^\s]+$/, 'Expected an existing page:* or shape:* parent id.')
  .describe('Existing page or container shape id. Omit only when the Canvas has zero or one page.')
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Expected a lowercase SHA-256 checksum.')
const operationIdSchema = z.string().trim().min(8).max(128).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  'Use a stable operation id containing letters, numbers, dot, underscore, colon, or dash.'
)

const jsonValueSchema: z.ZodType<CanvasJsonValue> = z.lazy(() =>
  z.union([
    z.string().max(JSON_VALUE_MAX_BYTES),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema).max(200),
    z.record(jsonValueSchema)
  ])
)

const boundedJsonObjectSchema = z.record(jsonValueSchema).superRefine((value, context) => {
  if (serializedSize(value) > JSON_VALUE_MAX_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `JSON object must be at most ${JSON_VALUE_MAX_BYTES} bytes.` })
  }
}) as z.ZodType<CanvasJsonObject>

const documentKindSchema = z.enum(['canvas', 'whiteboard', 'moodboard', 'wireframe', 'annotation', 'image-board', 'other'])
const documentStatusSchema = z.enum(['draft', 'reviewed', 'archived'])
const shapeColorSchema = z.enum([
  'black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue', 'yellow', 'orange', 'green', 'light-green', 'light-red', 'red', 'white'
])
const shapeSizeSchema = z.enum(['s', 'm', 'l', 'xl'])
const shapeFontSchema = z.enum(['draw', 'sans', 'serif', 'mono'])
const shapeAlignSchema = z.enum(['start', 'middle', 'end'])
const shapeDashSchema = z.enum(['draw', 'solid', 'dashed', 'dotted', 'none'])
const shapeFillSchema = z.enum(['none', 'semi', 'solid', 'pattern', 'fill', 'lined-fill'])
const geoShapeSchema = z.enum([
  'cloud', 'rectangle', 'ellipse', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'rhombus', 'rhombus-2',
  'oval', 'trapezoid', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'x-box', 'check-box', 'heart'
])
const arrowheadSchema = z.enum(['arrow', 'triangle', 'square', 'dot', 'pipe', 'diamond', 'inverted', 'bar', 'none'])
const coordinateSchema = z.number().finite().min(-1_000_000).max(1_000_000)
const dimensionSchema = z.number().finite().positive().max(100_000)
const shapeTextSchema = z.string().min(1).max(8_000)
const shapePlacementFields = {
  id: shapeIdSchema.optional(),
  parentId: shapeParentIdSchema.optional(),
  x: coordinateSchema.describe('Canvas x coordinate in page space.'),
  y: coordinateSchema.describe('Canvas y coordinate in page space.'),
  rotation: z.number().finite().min(-100_000).max(100_000).optional().describe('Rotation in radians; defaults to 0.'),
  opacity: z.number().finite().min(0).max(1).optional().describe('Opacity from 0 to 1; defaults to 1.'),
  isLocked: z.boolean().optional().describe('Defaults to false.')
}
const shapeIdentityFields = {
  id: shapeIdSchema.optional(),
  parentId: shapeParentIdSchema.optional()
}

const createTextShapeSchema = z.object({
  ...shapePlacementFields,
  type: z.literal('text'),
  text: shapeTextSchema.describe('Plain text. Canvas converts it to tldraw richText.'),
  width: dimensionSchema.optional().describe('Initial text width; defaults to tldraw auto-size width.'),
  color: shapeColorSchema.optional(),
  size: shapeSizeSchema.optional(),
  font: shapeFontSchema.optional(),
  textAlign: shapeAlignSchema.optional(),
  autoSize: z.boolean().optional()
}).strict()

const createGeoShapeSchema = z.object({
  ...shapePlacementFields,
  type: z.literal('geo'),
  geo: geoShapeSchema.optional().describe('Geometry; defaults to rectangle.'),
  width: dimensionSchema.optional().describe('Defaults to 100.'),
  height: dimensionSchema.optional().describe('Defaults to 100.'),
  text: z.string().max(8_000).optional().describe('Optional plain-text label.'),
  color: shapeColorSchema.optional(),
  labelColor: shapeColorSchema.optional(),
  fill: shapeFillSchema.optional(),
  dash: shapeDashSchema.optional(),
  size: shapeSizeSchema.optional(),
  font: shapeFontSchema.optional(),
  align: shapeAlignSchema.optional(),
  verticalAlign: shapeAlignSchema.optional()
}).strict()

const createNoteShapeSchema = z.object({
  ...shapePlacementFields,
  type: z.literal('note'),
  text: shapeTextSchema.describe('Plain note text. Canvas converts it to tldraw richText.'),
  color: shapeColorSchema.optional(),
  labelColor: shapeColorSchema.optional(),
  size: shapeSizeSchema.optional(),
  font: shapeFontSchema.optional(),
  align: shapeAlignSchema.optional(),
  verticalAlign: shapeAlignSchema.optional()
}).strict()

const createFrameShapeSchema = z.object({
  ...shapePlacementFields,
  type: z.literal('frame'),
  name: z.string().trim().max(500).optional(),
  width: dimensionSchema.optional().describe('Defaults to 320.'),
  height: dimensionSchema.optional().describe('Defaults to 180.'),
  color: shapeColorSchema.optional()
}).strict()

const pointSchema = z.object({ x: coordinateSchema, y: coordinateSchema }).strict()
const createArrowShapeSchema = z.object({
  ...shapeIdentityFields,
  type: z.literal('arrow'),
  start: pointSchema.describe('Absolute start point in page space.'),
  end: pointSchema.describe('Absolute end point in page space.'),
  rotation: z.number().finite().min(-100_000).max(100_000).optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  isLocked: z.boolean().optional(),
  text: z.string().max(8_000).optional().describe('Optional plain-text arrow label.'),
  color: shapeColorSchema.optional(),
  labelColor: shapeColorSchema.optional(),
  fill: shapeFillSchema.optional(),
  dash: shapeDashSchema.optional(),
  size: shapeSizeSchema.optional(),
  font: shapeFontSchema.optional(),
  bend: z.number().finite().min(-1_000_000).max(1_000_000).optional(),
  arrowheadStart: arrowheadSchema.optional(),
  arrowheadEnd: arrowheadSchema.optional()
}).strict()

const createShapeSchema = z.discriminatedUnion('type', [
  createTextShapeSchema,
  createGeoShapeSchema,
  createNoteShapeSchema,
  createFrameShapeSchema,
  createArrowShapeSchema
]).superRefine((value, context) => {
  if (value.type === 'arrow' && value.start.x === value.end.x && value.start.y === value.end.y) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['end'], message: 'Arrow start and end points must differ.' })
  }
})

export const createDocumentSchema = z.object({
  title: boundedString(160).describe('Human-readable Canvas title. This creates metadata only; add records in later stages.'),
  description: z.string().trim().max(2_000).optional(),
  kind: documentKindSchema.optional(),
  tags: z.array(boundedString(64)).max(20).optional(),
  source: boundedString(64).optional().describe('Short source label such as user_request, imported_file, or agent_plan.'),
  changeSummary: boundedString(240).optional()
}).strict()

const recordPatchSchema = z.object({
  name: z.string().max(500).optional(),
  parentId: recordIdSchema.optional(),
  index: boundedString(80).optional(),
  x: z.number().finite().min(-1_000_000).max(1_000_000).optional(),
  y: z.number().finite().min(-1_000_000).max(1_000_000).optional(),
  rotation: z.number().finite().min(-100_000).max(100_000).optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  isLocked: z.boolean().optional(),
  fromId: recordIdSchema.optional(),
  toId: recordIdSchema.optional(),
  props: boundedJsonObjectSchema.optional().describe('Shallow props patch. Unspecified props are preserved.'),
  meta: boundedJsonObjectSchema.optional().describe('Shallow meta patch. Unspecified metadata is preserved.'),
  unsetProps: z.array(boundedString(100)).max(30).optional(),
  unsetMeta: z.array(boundedString(100)).max(30).optional()
}).strict().refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: 'patch must change at least one field.'
})

const updateRecordSchema = z.object({
  id: recordIdSchema,
  expectedChecksum: checksumSchema.describe('Record checksum returned by canvas_list_records or canvas_get_record.'),
  patch: recordPatchSchema
}).strict()

const removeRecordSchema = z.object({
  id: recordIdSchema,
  expectedChecksum: checksumSchema.describe('Record checksum returned by canvas_list_records or canvas_get_record.')
}).strict()

export const applyRecordBatchSchema = z.object({
  documentId: documentIdSchema,
  operationId: operationIdSchema.describe('Unique id for this stage call. Reuse exactly on retry; never reuse it for different content.'),
  batchId: operationIdSchema.describe('Stable id shared by every stage of one user-requested Canvas edit.'),
  stageIndex: z.number().int().min(1).max(100).describe('One-based stage number within batchId.'),
  stageLabel: boundedString(120).describe('Short name for this visible stage.'),
  isFinalStage: z.boolean().describe('True only for the last planned stage.'),
  baseRevision: z.number().int().min(0).describe('workingCopyRevision from the latest Canvas summary or mutation receipt.'),
  createShapes: z.array(createShapeSchema).max(RECORD_BATCH_MAX_OPERATIONS, recordArrayLimitMessage('createShapes')).optional()
    .describe('Simplified new text, geo, note, frame, or arrow shapes. Canvas generates ids, parent page, indices, defaults, and richText. Count all createShapes, updateRecords, and removeRecords before calling; if their total exceeds 12, split the plan first.'),
  updateRecords: z.array(updateRecordSchema).max(RECORD_BATCH_MAX_OPERATIONS, recordArrayLimitMessage('updateRecords')).optional()
    .describe('Small field patches for existing records, guarded by record checksums. Count all stage operations before calling and split totals above 12 first.'),
  removeRecords: z.array(removeRecordSchema).max(RECORD_BATCH_MAX_OPERATIONS, recordArrayLimitMessage('removeRecords')).optional()
    .describe('Existing records to remove, guarded by record checksums. Count all stage operations before calling and split totals above 12 first.'),
  changeSummary: boundedString(240).describe('Short operational description shown while this stage is applied.')
}).strict().superRefine((value, context) => {
  const groups = [value.createShapes ?? [], value.updateRecords ?? [], value.removeRecords ?? []]
  const operationCount = groups.reduce((sum, group) => sum + group.length, 0)
  if (operationCount < 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one create, update, or remove operation is required.' })
  }
  const hasOversizedGroup = groups.some((group) => group.length > RECORD_BATCH_MAX_OPERATIONS)
  if (operationCount > RECORD_BATCH_MAX_OPERATIONS && !hasOversizedGroup) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `This stage contains ${operationCount} record operations across createShapes, updateRecords, and removeRecords; the maximum is ${RECORD_BATCH_MAX_OPERATIONS}. Split the plan before calling, preferably into semantic stages of ${RECORD_BATCH_RECOMMENDED_OPERATIONS} operations, and chain them with the prior receipt workingCopyRevision.`
    })
  }
  if (serializedSize(value) > RECORD_BATCH_MAX_BYTES) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `A stage payload must be at most ${RECORD_BATCH_MAX_BYTES} bytes. Split it into smaller semantic stages.`
    })
  }
  const seen = new Set<string>()
  for (const group of groups) {
    for (const item of group) {
      if (!item.id) continue
      if (seen.has(item.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Record ${item.id} appears more than once in the stage.` })
      }
      seen.add(item.id)
    }
  }
})

export const insertImageSchema = z.object({
  documentId: documentIdSchema.optional(),
  workspaceFilePath: z.string().trim().min(1).max(1_024).refine((value) => !value.startsWith('/'), {
    message: 'Use a portable Workspace file path, not an absolute host path.'
  }).optional(),
  dataUrl: z.string().max(28 * 1024 * 1024).optional(),
  base64: z.string().max(28 * 1024 * 1024).optional(),
  mimeType: boundedString(100).optional(),
  target: z.object({
    documentId: documentIdSchema.optional(),
    pageId: recordIdSchema.optional(),
    shapeId: recordIdSchema.optional(),
    width: z.number().int().positive().max(100_000).optional(),
    height: z.number().int().positive().max(100_000).optional()
  }).strict().optional(),
  changeSummary: boundedString(240).optional()
}).strict().superRefine((value, context) => {
  const sourceCount = [value.workspaceFilePath, value.dataUrl, value.base64].filter(Boolean).length
  if (sourceCount !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Pass exactly one image source: workspaceFilePath, dataUrl, or base64.' })
  }
  if (!value.documentId && !value.target?.documentId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['documentId'], message: 'documentId or target.documentId is required.' })
  }
})

export const searchDocumentsSchema = z.object({
  status: documentStatusSchema.optional(),
  kind: documentKindSchema.optional(),
  search: z.string().trim().max(160).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  pageSize: z.number().int().min(1).max(50).optional()
}).strict()

export const getDocumentSummarySchema = z.object({
  documentId: documentIdSchema,
  expectedRevision: z.number().int().min(0).optional().describe('Optional revision guard for a repeated summary read.')
}).strict()

export const listRecordsSchema = z.object({
  documentId: documentIdSchema,
  expectedRevision: z.number().int().min(0).describe('workingCopyRevision returned by canvas_get_document.'),
  cursor: z.string().trim().min(1).max(400).optional(),
  limit: z.number().int().min(1).max(40).optional(),
  typeNames: z.array(z.enum(['document', 'page', 'shape', 'asset', 'binding'])).min(1).max(5).optional(),
  shapeTypes: z.array(boundedString(80)).min(1).max(20).optional(),
  pageId: recordIdSchema.optional(),
  parentId: recordIdSchema.optional(),
  query: z.string().trim().min(1).max(160).optional()
}).strict()

export const getRecordSchema = z.object({
  documentId: documentIdSchema,
  recordId: recordIdSchema,
  expectedRevision: z.number().int().min(0).describe('workingCopyRevision returned by the summary or record list.')
}).strict()

export const updateDocumentStatusSchema = z.object({
  documentId: documentIdSchema,
  status: documentStatusSchema,
  reason: z.string().trim().max(500).optional()
}).strict()

export const reportFailureSchema = z.object({
  documentId: documentIdSchema.optional(),
  versionId: versionIdSchema.optional(),
  operation: boundedString(100),
  errorMessage: boundedString(2_000),
  recoverable: z.boolean().optional(),
  evidence: jsonValueSchema.optional()
}).strict().superRefine((value, context) => {
  if (value.evidence !== undefined && serializedSize(value.evidence) > JSON_VALUE_MAX_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence'], message: 'evidence is too large.' })
  }
})

function serializedSize(value: object | CanvasJsonValue) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}
