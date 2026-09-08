import { z } from 'zod/v3'
import {
  filesSchema,
  id,
  summary,
  operation,
  target,
  currentTarget,
  revision,
  drawingKind,
  drawingStatus,
  elementSchema,
  elementUpdateSchema,
  appStateSchema
} from './contracts.js'
export const createDrawingSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    description: z.string().max(10000).optional(),
    kind: drawingKind.optional(),
    tags: z.array(z.string().max(100)).max(50).optional(),
    source: z.string().max(100).optional(),
    ...operation
  })
  .strict()
export const addElementsSchema = z
  .object({
    ...target,
    ...operation,
    elements: z.array(elementSchema).min(1).max(20),
    appStatePatch: appStateSchema.optional(),
    files: filesSchema.optional()
  })
  .strict()
export const saveSceneSchema = z
  .object({
    ...currentTarget,
    ...operation,
    elements: z.array(elementSchema).max(5000),
    appState: appStateSchema.optional(),
    files: filesSchema.optional(),
    mermaidSource: z.string().max(100000).optional(),
    sourceType: z
      .enum(['agent_json', 'agent_patch', 'agent_mermaid', 'workbench', 'workbench_mermaid', 'import', 'restore'])
      .optional()
  })
  .strict()
export const patchSceneSchema = z
  .object({
    ...currentTarget,
    ...operation,
    addElements: z.array(elementSchema).max(20).optional(),
    updateElements: z.array(elementUpdateSchema).max(100).optional(),
    deleteElementIds: z.array(id).max(100).optional(),
    appStatePatch: appStateSchema.optional(),
    files: filesSchema.optional(),
    mermaidSource: z.string().max(100000).optional()
  })
  .strict()
  .refine(
    (v) =>
      !!(
        v.addElements?.length ||
        v.updateElements?.length ||
        v.deleteElementIds?.length ||
        v.appStatePatch ||
        v.files ||
        v.mermaidSource !== undefined
      ),
    'A patch must contain a change.'
  )
export const mermaidSchema = z
  .object({
    ...currentTarget,
    ...operation,
    title: summary.optional(),
    description: z.string().max(10000).optional(),
    kind: drawingKind.optional(),
    mermaidSource: z.string().min(1).max(100000)
  })
  .strict()
export const searchSchema = z
  .object({
    search: z.string().max(240).optional(),
    status: drawingStatus.optional(),
    kind: drawingKind.optional(),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(100).default(20)
  })
  .strict()
export const getDrawingSchema = z
  .object({
    ...target,
    includeScene: z.boolean().optional(),
    versionId: id.optional(),
    versionNumber: revision.optional(),
    versionLimit: z.number().int().min(1).max(20).optional(),
    elementOffset: z.number().int().min(0).max(100000).optional(),
    elementLimit: z.number().int().min(1).max(200).optional()
  })
  .strict()
  .refine((v) => !v.versionId || v.versionNumber === undefined, 'Choose versionId or versionNumber.')
export const getItemSchema = z
  .object({
    ...target,
    itemType: z.enum(['element', 'appState', 'mermaidSource', 'file']),
    versionId: id.optional(),
    versionNumber: revision.optional(),
    elementId: id.optional(),
    fileId: id.optional()
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.versionId && v.versionNumber !== undefined)
      ctx.addIssue({ code: 'custom', path: ['versionId'], message: 'Choose versionId or versionNumber.' })
    if (v.itemType === 'element' && !v.elementId)
      ctx.addIssue({ code: 'custom', path: ['elementId'], message: 'elementId is required.' })
    if (v.itemType === 'file' && !v.fileId)
      ctx.addIssue({ code: 'custom', path: ['fileId'], message: 'fileId is required.' })
  })
export const statusSchema = z
  .object({ ...target, ...operation, status: drawingStatus, reason: z.string().max(1000).optional() })
  .strict()
export const failureSchema = z
  .object({
    ...target,
    ...operation,
    versionId: id.optional(),
    operation: z.string().min(1).max(100),
    errorMessage: z.string().min(1).max(2000),
    recoverable: z.boolean().optional()
  })
  .strict()
export const checkpointSchema = z.object({ ...currentTarget, ...operation }).strict()
export const restoreSchema = z.object({ ...currentTarget, ...operation, versionId: id }).strict()
export const versionsSchema = z
  .object({
    ...target,
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(100).default(20)
  })
  .strict()
export const publishSchema = z
  .object({
    ...currentTarget,
    ...operation,
    accessMode: z.enum(['public_link', 'organization_all', 'workspace_all']).default('public_link')
  })
  .strict()
export const revokeSchema = z.object({ ...target, ...operation }).strict()
export const previewSchema = z.object({ ...currentTarget, ...operation }).strict()
export const exportSchema = z
  .object({ ...currentTarget, ...operation, format: z.enum(['json', 'svg', 'png']) })
  .strict()
export const jobSchema = z.object({ jobId: id }).strict()
export const cancelSchema = z.object({ jobId: id, ...operation }).strict()
export const waitSchema = z.object({ jobId: id, cursor: id }).strict()
export const previewReadSchema = z.object({ previewId: id }).strict()
export const imageResultSchema = z
  .object({
    drawingId: id,
    previewId: id,
    sceneRevision: revision,
    stale: z.boolean(),
    mimeType: z.literal('image/png'),
    kind: z.enum(['scene', 'diagram_ir']),
    irRevision: revision.optional()
  })
  .strict()

export const exportReadSchema = z
  .object({
    jobId: id,
    offset: z.number().int().min(0).max(100000000).default(0),
    limit: z.number().int().min(4).max(32000).multipleOf(4).default(32000)
  })
  .strict()
export const exportResultSchema = z
  .object({
    drawingId: id.optional(),
    jobId: id,
    format: z.enum(['json', 'svg', 'png']).optional(),
    mimeType: z.string().max(100).optional(),
    name: z.string().max(200).optional(),
    size: z.number().int().min(0).optional(),
    sha256: z.string().length(64).optional(),
    encoding: z.literal('base64').optional(),
    data: z.string().max(32000),
    offset: z.number().int().min(0),
    total: z.number().int().min(0).optional(),
    nextOffset: z.number().int().min(0).nullable()
  })
  .strict()
