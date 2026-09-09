import { z } from 'zod/v3'
import {
  id,
  revision,
  drawingKind,
  drawingStatus,
  elementSchema,
  appStateSchema,
  jsonValueSchema
} from './contracts.js'
import { diagramIrSchema } from '../diagram-engine/diagram-input.schema.js'
import { qualityIssueSchema } from './diagram-contracts.js'

export const validationSummarySchema = z
  .object({
    valid: z.boolean(),
    errors: revision,
    warnings: revision,
    issues: z.array(qualityIssueSchema).max(20),
    issueTotal: revision,
    nextIssueOffset: revision.optional()
  })
  .strict()

export const mutationResultSchema = z
  .object({
    success: z.boolean(),
    drawingId: id.optional(),
    sceneRevision: revision.optional(),
    irRevision: revision.optional(),
    status: z.string().max(80).optional(),
    changedCount: revision.optional(),
    changedIds: z.array(id).max(220).optional(),
    versionId: id.optional(),
    versionNumber: revision.optional(),
    shareUrl: z.string().max(4096).optional(),
    errorCode: z.string().max(100).optional(),
    message: z.string().max(1000).optional(),
    nextAction: z.string().max(500).optional(),
    review: z
      .object({
        qualityRunId: id,
        attempt: revision,
        decision: z.enum(['passed', 'needs_revision', 'skipped', 'exhausted'])
      })
      .strict()
      .optional(),
    validation: validationSummarySchema.optional()
  })
  .strict()

export const drawingSummarySchema = z
  .object({
    drawingId: id,
    title: z.string().max(240),
    kind: drawingKind,
    status: drawingStatus,
    sceneRevision: revision,
    versionNumber: revision,
    tags: z.array(z.string().max(100)).max(50).optional()
  })
  .strict()
export const drawingResultSchema = drawingSummarySchema
  .extend({
    description: z.string().max(10000).optional(),
    versionId: id.optional(),
    elementTotal: revision,
    elementRefs: z
      .array(z.object({ id, type: z.string().max(80), text: z.string().max(240).optional() }).strict())
      .max(200)
      .optional(),
    nextElementOffset: revision.optional()
  })
  .strict()
export const searchResultSchema = z
  .object({
    items: z.array(drawingSummarySchema).max(100),
    total: revision,
    page: revision,
    pageSize: revision,
    hasMore: z.boolean()
  })
  .strict()
export const versionResultSchema = z
  .object({
    versionId: id,
    versionNumber: revision,
    sourceType: z.string().max(80),
    changeSummary: z.string().max(1000).optional(),
    createdAt: z.string().max(100).optional(),
    isCheckpoint: z.boolean().optional()
  })
  .strict()
export const versionsResultSchema = z
  .object({
    drawingId: id,
    items: z.array(versionResultSchema).max(100),
    total: revision,
    page: revision,
    pageSize: revision
  })
  .strict()

// Read editable properties without CRDT bookkeeping or plugin-owned metadata.
export const elementResultSchema = elementSchema
  .omit({
    seed: true,
    version: true,
    versionNonce: true,
    updated: true,
    index: true,
    isDeleted: true,
    originalText: true,
    customData: true,
    lastCommittedPoint: true
  })
  .strict()
export const sceneItemResultSchema = z
  .object({
    drawingId: id,
    sceneRevision: revision,
    itemType: z.enum(['element', 'appState', 'mermaidSource', 'file']),
    item: z.union([
      elementResultSchema,
      appStateSchema,
      z.object({ fileId: id, mimeType: z.string().max(100).nullable() }).strict(),
      z.string().max(100000)
    ])
  })
  .strict()
export const fontsResultSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id,
            label: z.string().max(160),
            fontFamilyId: z.number().int().positive(),
            excalidrawFamily: z.string().max(160),
            languages: z.array(z.string().max(40)).max(10)
          })
          .strict()
      )
      .max(100)
  })
  .strict()
const labelSchema = z
  .object({ en_US: z.string().max(500).optional(), zh_Hans: z.string().max(500).optional() })
  .strict()
export const templatesResultSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            key: id,
            version: id,
            title: labelSchema,
            category: z.string().max(100),
            tags: z.array(z.string().max(100)).max(50)
          })
          .strict()
      )
      .max(100)
  })
  .strict()
export const templateResultSchema = z
  .object({
    key: id,
    version: id,
    inputSchema: jsonValueSchema,
    defaults: z.record(jsonValueSchema),
    labels: z.array(z.object({ id, label: z.string().max(240) }).strict()).max(1000)
  })
  .strict()
export const diagramStatusSchema = z.enum(['draft', 'validated', 'rendered', 'reviewed', 'diverged', 'failed'])
export const diagramResultSchema = z
  .object({ drawingId: id, irRevision: revision, status: diagramStatusSchema, ir: diagramIrSchema })
  .strict()
export const qualityResultSchema = z
  .object({
    drawingId: id,
    irRevision: revision,
    status: diagramStatusSchema,
    validationReport: validationSummarySchema
      .extend({
        issues: z.array(qualityIssueSchema).max(100),
        issueTotal: revision,
        nextIssueOffset: revision.optional()
      })
      .strict()
      .nullable(),
    visualReviews: z
      .array(
        z
          .object({
            qualityRunId: id,
            attempt: revision,
            decision: z.enum(['passed', 'needs_revision', 'skipped', 'exhausted']),
            issues: z.array(qualityIssueSchema).max(100),
            notes: z.string().max(2000).optional()
          })
          .strict()
      )
      .max(10),
    reviewTotal: revision,
    activeQualityRun: z.object({ qualityRunId: id, attempt: revision }).strict().optional(),
    nextReviewOffset: revision.optional()
  })
  .strict()
