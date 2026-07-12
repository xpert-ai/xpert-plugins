import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { ExcalidrawService } from '../excalidraw.service.js'
import type { ExcalidrawScope } from '../types.js'
import { ArtifactTemplateCatalogService } from './artifact-template-catalog.service.js'
import { parseDiagramIr } from './diagram.schema.js'
import { DiagramCompilerService, DiagramPreviewService } from './diagram-rendering.service.js'
import type {
  DiagramEdge,
  DiagramGroup,
  DiagramIR,
  DiagramIrRevisionStatus,
  DiagramJsonObject,
  DiagramValidationReport,
  DiagramWorkspaceFilesApi,
  DiagramNode,
  DiagramQualityIssue,
  DiagramVisualReviewDecision,
  DiagramVisualReviewRecord
} from './diagram.types.js'
import { DiagramIrRevision } from './entities/index.js'

type CreateSpecInput = {
  drawingId?: string
  expectedRevision?: number
  ir: DiagramIR
  templateKey?: string
  templateVersion?: string
  replaceCurrent?: boolean
  changeSummary?: string
}

type RevisionMutationInput = {
  drawingId: string
  expectedRevision: number
  changeSummary?: string
}

export class DiagramIrRevisionConflictException extends ConflictException {
  constructor(
    readonly expectedRevision: number | undefined,
    readonly currentRevision: number
  ) {
    super(`DiagramIR revision conflict: expected ${expectedRevision ?? 'missing'}, current ${currentRevision}.`)
  }
}

export class DiagramIrValidationException extends BadRequestException {
  constructor(readonly report: DiagramValidationReport) {
    super('DiagramIR has blocking validation errors. No drawing or DiagramIR revision was created.')
  }
}

@Injectable()
export class DiagramIrService {
  constructor(
    @InjectRepository(DiagramIrRevision)
    private readonly revisionRepository: Repository<DiagramIrRevision>,
    private readonly excalidraw: ExcalidrawService,
    private readonly compiler: DiagramCompilerService,
    private readonly preview: DiagramPreviewService,
    private readonly templates: ArtifactTemplateCatalogService
  ) {}

  async create(scope: ExcalidrawScope, input: CreateSpecInput) {
    const ir = parseDiagramIr(input.ir)
    const compiled = this.compiler.compile(ir)
    if (!compiled.report.valid) throw new DiagramIrValidationException(compiled.report)

    if (input.drawingId) {
      await this.excalidraw.getDrawing(scope, input.drawingId)
      const current = await this.latestOrNull(scope, input.drawingId)
      if (current && !input.replaceCurrent) {
        throw new ConflictException('A DiagramIR already exists for this drawing. Set replaceCurrent=true after explicit user confirmation.')
      }
      if (current && input.expectedRevision !== current.revision) {
        throw new DiagramIrRevisionConflictException(input.expectedRevision, current.revision)
      }
      const revision = await this.saveRevision(scope, {
        drawingId: input.drawingId,
        parent: current,
        ir,
        status: 'draft',
        templateKey: input.templateKey,
        templateVersion: input.templateVersion,
        resolved: compiled.resolved,
        validationReport: compiled.report,
        changeSummary: input.changeSummary ?? 'Created DiagramIR'
      })
      return this.result(revision, 'DiagramIR was created.')
    }

    const drawingId = await this.createDrawing(scope, ir)
    try {
      const revision = await this.saveRevision(scope, {
        drawingId,
        parent: null,
        ir,
        status: 'draft',
        templateKey: input.templateKey,
        templateVersion: input.templateVersion,
        resolved: compiled.resolved,
        validationReport: compiled.report,
        changeSummary: input.changeSummary ?? 'Created DiagramIR'
      })
      return this.result(revision, 'DiagramIR was created.')
    } catch (error) {
      try {
        await this.excalidraw.deleteDrawing(scope, drawingId)
      } catch (rollbackError) {
        console.warn('[DiagramIrService] failed to roll back drawing after DiagramIR persistence failure:', rollbackError)
      }
      throw error
    }
  }

  async instantiateTemplate(scope: ExcalidrawScope, input: {
    key: string
    version?: string
    parameters: DiagramJsonObject
    drawingId?: string
    expectedRevision?: number
    replaceCurrent?: boolean
  }) {
    const version = input.version ?? '1.0.0'
    const ir = this.templates.instantiate(input.key, version, input.parameters)
    return this.create(scope, {
      drawingId: input.drawingId,
      expectedRevision: input.expectedRevision,
      ir,
      templateKey: input.key,
      templateVersion: version,
      replaceCurrent: input.replaceCurrent,
      changeSummary: `Instantiated template ${input.key}@${version}`
    })
  }

  async get(scope: ExcalidrawScope, drawingId: string) {
    const revision = await this.latest(scope, drawingId)
    return this.result(revision, 'DiagramIR was loaded.', {
      includeIr: true,
      includeValidationReport: true,
      includeVisualReviews: true
    })
  }

  async upsertGroup(scope: ExcalidrawScope, input: RevisionMutationInput & { group: DiagramGroup }) {
    return this.mutate(scope, input, (ir) => ({ ...ir, groups: upsertById(ir.groups, input.group) }), `Upserted group ${input.group.id}`)
  }

  async upsertNode(scope: ExcalidrawScope, input: RevisionMutationInput & { node: DiagramNode }) {
    return this.mutate(scope, input, (ir) => ({ ...ir, nodes: upsertById(ir.nodes, input.node) }), `Upserted node ${input.node.id}`)
  }

  async upsertEdge(scope: ExcalidrawScope, input: RevisionMutationInput & { edge: DiagramEdge }) {
    return this.mutate(scope, input, (ir) => ({ ...ir, edges: upsertById(ir.edges, input.edge) }), `Upserted edge ${input.edge.id}`)
  }

  async removeItems(scope: ExcalidrawScope, input: RevisionMutationInput & { ids: string[] }) {
    const ids = new Set(input.ids)
    return this.mutate(scope, input, (ir) => ({
      ...ir,
      groups: ir.groups.filter((item) => !ids.has(item.id)),
      nodes: ir.nodes.filter((item) => !ids.has(item.id)),
      edges: ir.edges.filter((item) => !ids.has(item.id) && !ids.has(item.source.nodeId) && !ids.has(item.target.nodeId)),
      annotations: ir.annotations.filter((item) => !ids.has(item.id) && (!item.targetId || !ids.has(item.targetId)))
    }), `Removed ${input.ids.length} DiagramIR items`)
  }

  async validate(scope: ExcalidrawScope, input: { drawingId: string; expectedRevision: number }) {
    const { drawingId } = input
    const current = await this.assertRevision(scope, drawingId, input.expectedRevision)
    const compiled = this.compiler.compile(current.ir)
    const revision = await this.saveRevision(scope, {
      drawingId,
      parent: current,
      ir: current.ir,
      status: compiled.report.valid ? 'validated' : 'failed',
      resolved: compiled.resolved,
      validationReport: compiled.report,
      renderedExcalidrawVersionId: current.renderedExcalidrawVersionId,
      changeSummary: 'Validated DiagramIR'
    })
    return this.result(revision, compiled.report.valid ? 'DiagramIR validation passed.' : 'DiagramIR validation failed.', {
      includeValidationReport: true
    })
  }

  async render(scope: ExcalidrawScope, input: { drawingId: string; expectedRevision: number; replaceDiverged?: boolean }) {
    const current = await this.assertRevision(scope, input.drawingId, input.expectedRevision)
    if (current.status === 'diverged' && !input.replaceDiverged) {
      throw new ConflictException('The Excalidraw scene diverged from DiagramIR. Set replaceDiverged=true only after explicit user confirmation.')
    }
    const compiled = this.compiler.compile(current.ir)
    if (!compiled.report.valid) throw new BadRequestException('DiagramIR has blocking validation errors and cannot be rendered.')
    const saved = await this.excalidraw.saveSceneVersion(scope, {
      drawingId: input.drawingId,
      sourceType: 'agent_diagram_ir',
      elements: compiled.elements,
      appState: compiled.appState,
      files: compiled.files,
      changeSummary: `Rendered DiagramIR revision ${current.revision}`
    })
    const revision = await this.saveRevision(scope, {
      drawingId: input.drawingId,
      parent: current,
      ir: current.ir,
      status: 'rendered',
      resolved: compiled.resolved,
      validationReport: compiled.report,
      renderedExcalidrawVersionId: saved.version.id,
      changeSummary: `Rendered DiagramIR to Excalidraw version ${saved.version.versionNumber}`
    })
    return this.result(revision, 'DiagramIR was rendered to a new Excalidraw version.', {
      includeValidationReport: true
    })
  }

  async createPreview(scope: ExcalidrawScope, workspaceFiles: DiagramWorkspaceFilesApi, input: {
    drawingId: string
    expectedRevision: number
    qualityRunId?: string
  }) {
    const current = await this.assertRevision(scope, input.drawingId, input.expectedRevision)
    const qualityRunId = input.qualityRunId ?? randomUUID()
    const reviews = (current.visualReviews ?? []).filter((review) => review.qualityRunId === qualityRunId)
    const attempt = reviews.length
    if (attempt > 2 || reviews.some((review) => review.decision !== 'needs_revision')) {
      throw new ConflictException('This quality run is already complete or exhausted.')
    }
    const compiled = this.compiler.compile(current.ir)
    const artifacts = await this.preview.createPreview(workspaceFiles, {
      drawingId: input.drawingId,
      qualityRunId,
      attempt,
      svg: compiled.svg
    })
    const revision = await this.saveRevision(scope, {
      drawingId: input.drawingId,
      parent: current,
      ir: current.ir,
      status: compiled.report.valid ? current.status : 'failed',
      resolved: compiled.resolved,
      validationReport: compiled.report,
      visualReviews: current.visualReviews ?? [],
      qualityArtifacts: { qualityRunId, attempt, ...artifacts },
      renderedExcalidrawVersionId: current.renderedExcalidrawVersionId,
      changeSummary: `Created quality preview ${qualityRunId} attempt ${attempt}`
    })
    return { ...this.result(revision, 'Diagram quality preview was created.'), qualityRunId, attempt, artifacts }
  }

  async qualityReport(scope: ExcalidrawScope, drawingId: string) {
    const current = await this.latest(scope, drawingId)
    return {
      drawingId,
      revision: current.revision,
      status: current.status,
      renderedExcalidrawVersionId: current.renderedExcalidrawVersionId ?? null,
      validationReport: current.validationReport ?? null,
      visualReviews: current.visualReviews ?? [],
      qualityArtifacts: current.qualityArtifacts ?? null
    }
  }

  async recordVisualReview(scope: ExcalidrawScope, input: {
    drawingId: string
    expectedRevision: number
    qualityRunId: string
    decision: Exclude<DiagramVisualReviewDecision, 'exhausted'>
    issues: DiagramQualityIssue[]
    notes?: string
  }) {
    const current = await this.assertRevision(scope, input.drawingId, input.expectedRevision)
    const existing = (current.visualReviews ?? []).filter((review) => review.qualityRunId === input.qualityRunId)
    const attempt = existing.length
    if (attempt > 2 || existing.some((review) => review.decision !== 'needs_revision')) {
      throw new ConflictException('This quality run is already complete or exhausted.')
    }
    if (input.decision === 'needs_revision' && !input.issues.length) {
      throw new BadRequestException('needs_revision requires at least one targeted visual issue.')
    }
    if (input.decision === 'needs_revision' && input.issues.some((item) => !item.targetIds.length)) {
      throw new BadRequestException('Every visual revision issue must identify target node or edge ids.')
    }
    if (input.decision === 'needs_revision' && input.issues.some((item) => !item.correctionIntent?.trim())) {
      throw new BadRequestException('Every visual revision issue must include a correction intent.')
    }
    const artifactRunId = typeof current.qualityArtifacts?.qualityRunId === 'string'
      ? current.qualityArtifacts.qualityRunId
      : undefined
    if (input.decision !== 'skipped' && (artifactRunId !== input.qualityRunId || !readQualityArtifacts(current.qualityArtifacts).png)) {
      throw new BadRequestException('passed and needs_revision require a PNG preview from the same quality run.')
    }
    const decision: DiagramVisualReviewDecision = input.decision === 'needs_revision' && attempt >= 2 ? 'exhausted' : input.decision
    const artifacts = readQualityArtifacts(current.qualityArtifacts)
    const review: DiagramVisualReviewRecord = {
      qualityRunId: input.qualityRunId,
      attempt,
      decision,
      issues: input.issues,
      notes: input.notes,
      reviewedAt: new Date().toISOString(),
      svgFile: artifacts.svg,
      pngFile: artifacts.png
    }
    const visualReviews = [...(current.visualReviews ?? []), review]
    const status: DiagramIrRevisionStatus = decision === 'passed' ? 'reviewed' : decision === 'exhausted' ? 'failed' : current.status
    const revision = await this.saveRevision(scope, {
      drawingId: input.drawingId,
      parent: current,
      ir: current.ir,
      status,
      resolved: current.resolved,
      validationReport: current.validationReport,
      visualReviews,
      qualityArtifacts: current.qualityArtifacts,
      renderedExcalidrawVersionId: current.renderedExcalidrawVersionId,
      changeSummary: `Recorded visual review: ${decision}`
    })
    return { ...this.result(revision, `Visual review recorded as ${decision}.`), review }
  }

  async markDiverged(scope: ExcalidrawScope, drawingId: string, excalidrawVersionId?: string) {
    const current = await this.latestOrNull(scope, drawingId)
    if (!current || current.status === 'diverged') return null
    if (excalidrawVersionId && current.renderedExcalidrawVersionId === excalidrawVersionId) return current
    return this.saveRevision(scope, {
      drawingId,
      parent: current,
      ir: current.ir,
      status: 'diverged',
      resolved: current.resolved,
      validationReport: current.validationReport,
      visualReviews: current.visualReviews,
      qualityArtifacts: current.qualityArtifacts,
      renderedExcalidrawVersionId: current.renderedExcalidrawVersionId,
      changeSummary: 'Excalidraw scene was edited outside DiagramIR'
    })
  }

  private async mutate(scope: ExcalidrawScope, input: RevisionMutationInput, update: (ir: DiagramIR) => DiagramIR, fallbackSummary: string) {
    const current = await this.assertRevision(scope, input.drawingId, input.expectedRevision)
    const ir = parseDiagramIr(update(structuredClone(current.ir)))
    const revision = await this.saveRevision(scope, {
      drawingId: input.drawingId,
      parent: current,
      ir,
      status: 'draft',
      templateKey: current.templateKey ?? undefined,
      templateVersion: current.templateVersion ?? undefined,
      visualReviews: current.visualReviews,
      changeSummary: input.changeSummary ?? fallbackSummary
    })
    return this.result(revision, 'DiagramIR revision was saved.')
  }

  private async createDrawing(scope: ExcalidrawScope, ir: DiagramIR) {
    const result = await this.excalidraw.createDrawing(scope, { title: ir.title, description: ir.subtitle, kind: kindForDrawing(ir.kind), source: 'diagram_ir' })
    if (!result.item.id) throw new Error('Excalidraw drawing id was not created.')
    return result.item.id
  }

  private async assertRevision(scope: ExcalidrawScope, drawingId: string, expectedRevision: number) {
    const current = await this.latest(scope, drawingId)
    if (current.revision !== expectedRevision) throw new DiagramIrRevisionConflictException(expectedRevision, current.revision)
    return current
  }

  private async latest(scope: ExcalidrawScope, drawingId: string) {
    const revision = await this.latestOrNull(scope, drawingId)
    if (!revision) throw new NotFoundException('DiagramIR was not found for this drawing.')
    return revision
  }

  private latestOrNull(scope: ExcalidrawScope, drawingId: string) {
    return this.revisionRepository.findOne({
      where: scopedWhere(scope, { drawingId }),
      order: { revision: 'DESC' }
    })
  }

  private async saveRevision(scope: ExcalidrawScope, input: {
    drawingId: string
    parent: DiagramIrRevision | null
    ir: DiagramIR
    status: DiagramIrRevisionStatus
    templateKey?: string
    templateVersion?: string
    resolved?: DiagramIrRevision['resolved']
    validationReport?: DiagramIrRevision['validationReport']
    visualReviews?: DiagramVisualReviewRecord[] | null
    qualityArtifacts?: Record<string, unknown> | null
    renderedExcalidrawVersionId?: string | null
    changeSummary?: string
  }) {
    try {
      return await this.revisionRepository.save(this.revisionRepository.create({
        ...scopedCreate(scope),
        drawingId: input.drawingId,
        revision: (input.parent?.revision ?? 0) + 1,
        parentRevision: input.parent?.revision ?? null,
        templateKey: input.templateKey ?? input.parent?.templateKey ?? null,
        templateVersion: input.templateVersion ?? input.parent?.templateVersion ?? null,
        status: input.status,
        ir: input.ir,
        resolved: input.resolved ?? null,
        validationReport: input.validationReport ?? null,
        visualReviews: input.visualReviews ?? input.parent?.visualReviews ?? [],
        qualityArtifacts: input.qualityArtifacts ?? null,
        renderedExcalidrawVersionId: input.renderedExcalidrawVersionId ?? null,
        createdById: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null,
        changeSummary: input.changeSummary ?? null
      }))
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('DiagramIR revision conflict: another writer saved the next revision first.')
      }
      throw error
    }
  }

  private result(revision: DiagramIrRevision, message: string, options: {
    includeIr?: boolean
    includeValidationReport?: boolean
    includeVisualReviews?: boolean
  } = {}) {
    return {
      success: true,
      message,
      drawingId: revision.drawingId,
      revision: revision.revision,
      status: revision.status,
      templateKey: revision.templateKey ?? null,
      renderedExcalidrawVersionId: revision.renderedExcalidrawVersionId ?? null,
      ...(options.includeIr ? { ir: revision.ir } : {}),
      ...(options.includeValidationReport ? { validationReport: revision.validationReport ?? null } : {}),
      ...(options.includeVisualReviews ? { visualReviews: revision.visualReviews ?? [] } : {})
    }
  }
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const found = items.some((candidate) => candidate.id === item.id)
  return found ? items.map((candidate) => candidate.id === item.id ? item : candidate) : [...items, item]
}

function kindForDrawing(kind: DiagramIR['kind']) {
  if (kind === 'architecture') return 'architecture' as const
  if (kind === 'flowchart') return 'flowchart' as const
  return 'diagram' as const
}

function scopedWhere<T extends object>(scope: ExcalidrawScope, extra: T) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}),
    ...(scope.projectId ? { projectId: scope.projectId } : {}),
    ...extra
  }
}

function scopedCreate(scope: ExcalidrawScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null
  }
}

function readQualityArtifacts(value: Record<string, unknown> | null | undefined) {
  const svgValue = value?.svg
  const pngValue = value?.png
  return {
    svg: readFileReference(svgValue),
    png: readFileReference(pngValue)
  }
}

function readFileReference(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const fileRef = Reflect.get(value, 'fileRef')
  if (!fileRef || typeof fileRef !== 'object' || Array.isArray(fileRef)) return undefined
  return fileRef as DiagramVisualReviewRecord['svgFile']
}

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = Reflect.get(error, 'code') ?? Reflect.get(Reflect.get(error, 'driverError') ?? {}, 'code')
  return code === '23505' || code === 'SQLITE_CONSTRAINT' || code === 'ER_DUP_ENTRY'
}
