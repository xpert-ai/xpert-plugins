import { z } from 'zod/v3'
import type { I18nObject } from '@xpert-ai/contracts'
import type { DiagramIrService } from '../diagram-engine/diagram-ir.service.js'
import type {
  ArtifactTemplateDescriptor,
  ArtifactTemplateDefinition,
  DiagramTemplatePayload,
  DiagramValidationReport
} from '../diagram-engine/diagram.types.js'
import type { ExcalidrawReadService, drawingSummary } from '../excalidraw-read.service.js'
import type { Receipt } from './contracts.js'
import { appStateSchema, jsonValueSchema } from './contracts.js'
import { qualityIssueSchema } from './diagram-contracts.js'
import { diagramDiagnostics, diagramIssueDto } from '../diagram-engine/diagram-diagnostics.js'
import * as s from './result-schemas.js'

const storedValidationSchema = z.object({
  valid: z.boolean(),
  summary: z.object({ errors: z.number(), warnings: z.number() }),
  issues: z
    .array(qualityIssueSchema.extend({ message: z.string(), correctionIntent: z.string().optional() }))
    .default([])
})
export function mutationDto(result: Receipt) {
  const validation = result.validation == null ? undefined : storedValidationSchema.parse(result.validation)
  return {
    success: result.success,
    drawingId: result.drawingId,
    sceneRevision: result.sceneRevision,
    irRevision: result.irRevision,
    status: result.status,
    changedCount: result.changedCount,
    ...(result.changedIds?.length ? { changedIds: result.changedIds } : {}),
    versionId: result.versionId,
    versionNumber: result.versionNumber,
    shareUrl: result.shareUrl,
    errorCode: result.errorCode,
    ...(!result.success ? { message: result.message, nextAction: result.nextAction } : {}),
    ...(result.review ? { review: result.review } : {}),
    ...(validation
      ? {
          validation: diagramDiagnostics({
            valid: validation.valid!,
            summary: { errors: validation.summary.errors!, warnings: validation.summary.warnings! },
            issues: validation.issues.map((issue) => ({
              code: issue.code!,
              severity: issue.severity!,
              message: issue.message!,
              targetIds: issue.targetIds!,
              ...(issue.correctionIntent ? { correctionIntent: issue.correctionIntent } : {})
            }))
          })
        }
      : {})
  }
}
function drawingDto(item: ReturnType<typeof drawingSummary>) {
  return {
    drawingId: item.id,
    title: item.title,
    kind: item.kind,
    status: item.status,
    sceneRevision: item.revision,
    versionNumber: item.currentVersionNumber,
    ...(item.tags.length ? { tags: item.tags } : {})
  }
}
export function searchDto(result: Awaited<ReturnType<ExcalidrawReadService['search']>>) {
  return {
    items: result.items.map(drawingDto),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    hasMore: result.hasMore
  }
}
export function drawingResultDto(
  result: Awaited<ReturnType<ExcalidrawReadService['get']>>,
  input: { includeScene?: boolean; elementOffset?: number }
) {
  return {
    ...drawingDto(result.item),
    ...(result.item.description ? { description: result.item.description } : {}),
    ...(result.item.currentVersionId ? { versionId: result.item.currentVersionId } : {}),
    elementTotal: result.elementTotal,
    ...(input.includeScene ? { elementRefs: result.elementRefs } : {}),
    ...(result.hasMore ? { nextElementOffset: (input.elementOffset ?? 0) + result.elementRefs.length } : {})
  }
}
export function versionsDto(result: Awaited<ReturnType<ExcalidrawReadService['listVersions']>>) {
  return {
    drawingId: result.drawingId,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    items: result.items.map((item) => ({
      versionId: item.id,
      versionNumber: item.versionNumber,
      sourceType: item.sourceType,
      ...(item.changeSummary ? { changeSummary: item.changeSummary } : {}),
      ...(item.createdAt ? { createdAt: item.createdAt } : {}),
      ...(item.isCheckpoint ? { isCheckpoint: true } : {})
    }))
  }
}
export function sceneItemDto(result: Awaited<ReturnType<ExcalidrawReadService['item']>>) {
  // Persisted scenes are a trust boundary: the public schema is the field allowlist.
  const item =
    result.itemType === 'element'
      ? s.elementResultSchema.strip().parse(result.item)
      : result.itemType === 'appState'
      ? appStateSchema.strip().parse(result.item)
      : result.item
  return {
    drawingId: result.drawingId,
    sceneRevision: result.sceneRevision,
    itemType: result.itemType,
    item
  }
}
function labelDto(value: I18nObject) {
  return { ...(value.en_US ? { en_US: value.en_US } : {}), ...(value.zh_Hans ? { zh_Hans: value.zh_Hans } : {}) }
}
export function templatesDto(items: ArtifactTemplateDescriptor[]) {
  return {
    items: items.map((item) => ({
      key: item.key,
      version: item.version,
      title: labelDto(item.title),
      category: item.category,
      tags: item.tags
    }))
  }
}
export function templateDto(template: ArtifactTemplateDefinition<DiagramTemplatePayload>) {
  const ir = template.payload.base
  return {
    key: template.descriptor.key,
    version: template.descriptor.version,
    inputSchema: jsonValueSchema.parse(template.inputSchema),
    defaults: template.defaults,
    labels: [...ir.groups, ...ir.nodes, ...ir.edges].map((item) => ({ id: item.id, label: item.label ?? '' }))
  }
}
export function diagramDto(result: Awaited<ReturnType<DiagramIrService['get']>>) {
  return {
    drawingId: result.drawingId,
    irRevision: result.revision,
    status: result.status,
    ir: result.ir
  }
}
export function validationDto(report: DiagramValidationReport | null, offset: number, limit: number) {
  if (!report) return null
  return {
    valid: report.valid,
    errors: report.summary.errors,
    warnings: report.summary.warnings,
    issues: report.issues.slice(offset, offset + limit).map(diagramIssueDto),
    issueTotal: report.issues.length,
    ...(offset + limit < report.issues.length ? { nextIssueOffset: offset + limit } : {})
  }
}
export function qualityDto(
  result: Awaited<ReturnType<DiagramIrService['qualityReport']>>,
  input: { issueOffset?: number; issueLimit?: number; reviewOffset?: number; reviewLimit?: number }
) {
  const offset = input.reviewOffset ?? 0,
    limit = input.reviewLimit ?? 1
  return {
    drawingId: result.drawingId,
    irRevision: result.revision,
    status: result.status,
    ...(typeof result.qualityArtifacts?.qualityRunId === 'string' &&
    typeof result.qualityArtifacts?.attempt === 'number'
      ? {
          activeQualityRun: {
            qualityRunId: result.qualityArtifacts.qualityRunId,
            attempt: result.qualityArtifacts.attempt
          }
        }
      : {}),
    validationReport: validationDto(result.validationReport, input.issueOffset ?? 0, input.issueLimit ?? 20),
    visualReviews: result.visualReviews
      .slice()
      .reverse()
      .slice(offset, offset + limit)
      .map((review) => ({
        qualityRunId: review.qualityRunId,
        attempt: review.attempt,
        decision: review.decision,
        issues: review.issues.map(diagramIssueDto),
        ...(review.notes ? { notes: review.notes } : {})
      })),
    reviewTotal: result.visualReviews.length,
    ...(offset + limit < result.visualReviews.length ? { nextReviewOffset: offset + limit } : {})
  }
}
