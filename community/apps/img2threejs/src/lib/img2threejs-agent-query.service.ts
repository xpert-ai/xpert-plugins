import { createHash } from 'node:crypto'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import type { ProjectStatus, Scope } from './domain/types.js'
import { CodeVersionEntity, ImageEvidenceEntity, ModelProjectEntity, PipelineRunEntity } from './entities/index.js'
import {
  requireRevision,
  scopedIdWhere,
  scopedProjectWhere
} from './img2threejs.service-support.js'
import {
  ArtifactsAdapter,
  WorkspaceFilesAdapter,
  toPortableReference
} from './platform/capability-adapters.js'

const MULTIMODAL_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_MULTIMODAL_IMAGE_BYTES = 12_000_000

export type ReferenceImageAttachment = {
  type: 'img2threejs.reference-image'
  projectId: string
  revision: number
  evidenceId: string
  label: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number
  height: number
  sha256: string
  dataUrl: string
}

export type VisualDiagnosticImageAttachment = {
  kind: 'comparison' | 'render'
  view: string
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  size: number
  sha256: string
  dataUrl: string
}

export type VisualDiagnosticsAttachment = {
  type: 'img2threejs.visual-diagnostics'
  projectId: string
  revision: number
  runId: string
  runRevision: number
  images: VisualDiagnosticImageAttachment[]
}

type ReadVisualDiagnosticsInput = {
  projectId: string
  runId?: string
  expectedRevision?: number
  view?: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'three-quarter'
  includeComparison: boolean
  includeRender: boolean
}

type DiagnosticImageDescriptor = Omit<VisualDiagnosticImageAttachment, 'dataUrl'> & {
  filePath: string
}

@Injectable()
export class Img2ThreeJsAgentQueryService {
  private readonly artifacts: ArtifactsAdapter
  private readonly workspaceFiles: WorkspaceFilesAdapter

  constructor(
    @InjectRepository(ModelProjectEntity)
    private readonly projects: Repository<ModelProjectEntity>,
    @InjectRepository(ImageEvidenceEntity)
    private readonly images: Repository<ImageEvidenceEntity>,
    @InjectRepository(PipelineRunEntity)
    private readonly runs: Repository<PipelineRunEntity>,
    @InjectRepository(CodeVersionEntity)
    private readonly codes: Repository<CodeVersionEntity>,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    runtimeCapabilities?: RuntimeCapabilityRegistry
  ) {
    this.artifacts = new ArtifactsAdapter(runtimeCapabilities)
    this.workspaceFiles = new WorkspaceFilesAdapter(runtimeCapabilities)
  }

  async listProjects(scope: Scope, input: {
    status?: ProjectStatus
    search?: string
    page: number
    pageSize: number
  }) {
    const builder = this.projects.createQueryBuilder('project')
      .where('project.tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere(
        scope.organizationId
          ? 'project.organizationId = :organizationId'
          : 'project.organizationId IS NULL',
        scope.organizationId ? { organizationId: scope.organizationId } : {}
      )
      .orderBy('project.updatedAt', 'DESC')
      .addOrderBy('project.id', 'ASC')
      .skip((input.page - 1) * input.pageSize)
      .take(input.pageSize)
    if (input.status) builder.andWhere('project.status = :status', { status: input.status })
    if (input.search) {
      builder.andWhere('LOWER(project.name) LIKE :search', {
        search: `%${input.search.toLowerCase()}%`
      })
    }
    const [items, total] = await builder.getManyAndCount()
    return {
      items: items.map((project) => ({
        projectId: project.id,
        name: project.name,
        route: project.route,
        modelingMode: project.modelingMode,
        status: project.status,
        revision: project.revision,
        nextDecision: project.nextDecision,
        updatedAt: project.updatedAt.toISOString()
      })),
      total,
      page: input.page,
      pageSize: input.pageSize
    }
  }

  async listEvidence(scope: Scope, input: {
    projectId: string
    expectedRevision?: number
  }) {
    const project = await this.requireProject(scope, input.projectId)
    if (input.expectedRevision !== undefined) {
      requireRevision(project.revision, input.expectedRevision)
    }
    const evidence = await this.images.find({
      where: scopedProjectWhere(scope, project.id),
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 12
    })
    return {
      projectId: project.id,
      revision: project.revision,
      modelingMode: project.modelingMode,
      images: evidence.map((image) => ({
        evidenceId: image.id,
        label: image.label,
        view: image.view,
        admissionStatus: image.admissionStatus,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        sha256: image.sha256,
        confidence: image.confidence,
        foregroundCoverage: image.foregroundCoverage,
        largestComponentFraction: image.largestComponentFraction,
        maskConfidence: image.maskConfidence,
        pHash: image.pHash,
        viewpointConfidence: image.viewpointConfidence,
        requestInputReason: image.requestInputReason,
        failureReasons: image.failureReasons
      }))
    }
  }

  async readEvidence(scope: Scope, input: {
    projectId: string
    evidenceId: string
    expectedRevision?: number
  }) {
    const project = await this.requireProject(scope, input.projectId)
    if (input.expectedRevision !== undefined) {
      requireRevision(project.revision, input.expectedRevision)
    }
    const image = await this.images.findOne({ where: scopedIdWhere(scope, input.evidenceId) })
    if (!image || image.projectId !== project.id) throw new Error('REFERENCE_IMAGE_NOT_FOUND')
    const previewUrl = image.admissionStatus === 'admitted'
      ? await this.artifacts.createReferenceImagePreview(scope, {
          evidenceId: image.id,
          label: image.label,
          asset: image.asset
        })
      : null
    return {
      projectId: project.id,
      revision: project.revision,
      modelingMode: project.modelingMode,
      evidence: {
        evidenceId: image.id,
        label: image.label,
        view: image.view,
        admissionStatus: image.admissionStatus,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        sha256: image.sha256,
        observations: image.observations,
        admissionDiagnostics: image.admissionDiagnostics,
        foregroundCoverage: image.foregroundCoverage,
        largestComponentFraction: image.largestComponentFraction,
        maskConfidence: image.maskConfidence,
        pHash: image.pHash,
        viewpointConfidence: image.viewpointConfidence,
        requestInputReason: image.requestInputReason,
        previewUrl,
        workspaceFile: image.admissionStatus === 'admitted'
          ? toPortableReference(image.asset)
          : null
      },
      semanticAnalysisOwner: 'agent-chat',
      nextAction: image.admissionStatus === 'admitted'
        ? 'inspect_image_multimodally'
        : 'request_input'
    }
  }

  async readEvidenceImage(scope: Scope, input: {
    projectId: string
    evidenceId: string
    expectedRevision?: number
  }): Promise<ReferenceImageAttachment> {
    const project = await this.requireProject(scope, input.projectId)
    if (input.expectedRevision !== undefined) {
      requireRevision(project.revision, input.expectedRevision)
    }
    const image = await this.images.findOne({ where: scopedIdWhere(scope, input.evidenceId) })
    if (!image || image.projectId !== project.id) throw new Error('REFERENCE_IMAGE_NOT_FOUND')
    if (image.admissionStatus !== 'admitted') {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image was not admitted.')
    }
    if (!MULTIMODAL_IMAGE_MIME_TYPES.has(image.mimeType)) {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image MIME type is not supported.')
    }
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height) ||
      (image.width ?? 0) <= 0 || (image.height ?? 0) <= 0) {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image dimensions are unavailable.')
    }
    if (image.asset.tenantId !== scope.tenantId ||
      image.asset.userId !== scope.userId ||
      image.asset.projectId !== (scope.projectId ?? undefined)) {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image scope does not match the Agent session.')
    }
    const resolved = await this.workspaceFiles.read(scope, image.asset.filePath)
    if (resolved.buffer.length > MAX_MULTIMODAL_IMAGE_BYTES) {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image exceeds the multimodal attachment limit.')
    }
    if (!hasExpectedImageSignature(resolved.buffer, image.mimeType)) {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image bytes do not match the admitted MIME type.')
    }
    const sha256 = createHash('sha256').update(resolved.buffer).digest('hex')
    if (sha256 !== image.sha256 || sha256 !== image.asset.sha256) {
      throw new Error('MULTIMODAL_IMAGE_UNAVAILABLE: reference image checksum changed after admission.')
    }
    const mimeType = image.mimeType as ReferenceImageAttachment['mimeType']
    return {
      type: 'img2threejs.reference-image',
      projectId: project.id,
      revision: project.revision,
      evidenceId: image.id,
      label: image.label,
      mimeType,
      width: image.width as number,
      height: image.height as number,
      sha256,
      dataUrl: `data:${mimeType};base64,${resolved.buffer.toString('base64')}`
    }
  }

  async readVisualDiagnostics(scope: Scope, input: ReadVisualDiagnosticsInput) {
    const project = await this.requireProject(scope, input.projectId)
    if (input.expectedRevision !== undefined) {
      requireRevision(project.revision, input.expectedRevision)
    }
    const run = await this.resolveDiagnosticRun(scope, project, input.runId)
    const deterministicFailed = run.deterministicReview.status === 'failed'
    const historicalVisualDiagnosticsDiscarded = deterministicFailed && Boolean(
      run.renderReport ||
      run.comparisonAsset ||
      run.visualReview.evidenceKind !== 'none' ||
      run.visualReview.notes
    )
    // A browser render belongs to the code candidate that produced it. Legacy
    // runs may still carry that render after a newer candidate fails the
    // deterministic review. Never attach or describe those pixels as evidence
    // for the current failed candidate.
    const images = deterministicFailed ? [] : this.resolveDiagnosticImages(run, input)
    const code = run.codeVersionId
      ? await this.codes.findOne({ where: scopedIdWhere(scope, run.codeVersionId) })
      : null
    const sourceBuildDiagnostics = diagnoseAssistantSourceImports(code?.sourcePreview ?? '')
    return {
      projectId: project.id,
      revision: project.revision,
      currentSpecVersionId: project.currentSpecVersionId,
      currentCodeVersionId: project.currentCodeVersionId,
      runId: run.id,
      runRevision: run.revision,
      runStatus: run.status,
      specVersionId: run.specVersionId,
      codeVersionId: run.codeVersionId,
      deterministicReview: {
        status: run.deterministicReview.status,
        score: run.deterministicReview.score,
        failedChecks: run.deterministicReview.checks
          .filter((check) => !check.passed)
          .map(({ code: failureCode, detail }) => ({ code: failureCode, detail }))
      },
      visualReview: deterministicFailed
        ? {
            status: 'unavailable',
            evidenceKind: 'none',
            renderStatus: 'not_requested',
            capabilityReason: 'The current code candidate failed deterministic review. Any prior browser render is historical and is not valid evidence for this candidate.',
            notes: null
          }
        : {
            status: run.visualReview.status,
            evidenceKind: run.visualReview.evidenceKind,
            renderStatus: run.visualReview.renderStatus ?? null,
            capabilityReason: run.visualReview.capabilityReason ?? null,
            notes: run.visualReview.notes ?? null
          },
      historicalVisualDiagnosticsDiscarded,
      quality: deterministicFailed ? null : run.renderReport?.quality ?? null,
      correction: deterministicFailed ? null : run.renderReport?.correction ?? null,
      renderFailure: deterministicFailed ? null : run.renderReport?.failure ?? null,
      sourceBuildDiagnostics,
      failureReasons: run.failureReasons,
      images: images.map(({ filePath: _filePath, ...image }) => image),
      modelVisionRequired: !deterministicFailed,
      semanticDiagnosisOwner: 'agent-chat',
      nextAction: deterministicFailed
        ? 'repair_current_candidate_from_deterministic_failures_then_submit_refine_code'
        : images.length > 0
        ? 'inspect_attached_render_pixels_then_decide_refine_spec_or_refine_code'
        : sourceBuildDiagnostics.length > 0
          ? 'author_new_candidate_from_source_build_diagnostics_then_submit_refine'
          : 'inspect_render_failure_then_refine_code'
    }
  }

  async readVisualDiagnosticImages(
    scope: Scope,
    input: ReadVisualDiagnosticsInput
  ): Promise<VisualDiagnosticsAttachment> {
    const project = await this.requireProject(scope, input.projectId)
    if (input.expectedRevision !== undefined) {
      requireRevision(project.revision, input.expectedRevision)
    }
    const run = await this.resolveDiagnosticRun(scope, project, input.runId)
    if (run.deterministicReview.status === 'failed') {
      throw new Error(
        'VISUAL_DIAGNOSTICS_UNAVAILABLE: the current code candidate failed deterministic review; prior render images are historical.'
      )
    }
    const descriptors = this.resolveDiagnosticImages(run, input)
    if (descriptors.length === 0) {
      throw new Error('VISUAL_DIAGNOSTICS_UNAVAILABLE: the selected run has no successful render images.')
    }
    const images = await Promise.all(descriptors.map(async (descriptor) => {
      const resolved = await this.workspaceFiles.read(scope, descriptor.filePath)
      if (resolved.buffer.length > MAX_MULTIMODAL_IMAGE_BYTES) {
        throw new Error(`VISUAL_DIAGNOSTICS_UNAVAILABLE: ${descriptor.name} exceeds the multimodal attachment limit.`)
      }
      if (!hasExpectedImageSignature(resolved.buffer, descriptor.mimeType)) {
        throw new Error(`VISUAL_DIAGNOSTICS_UNAVAILABLE: ${descriptor.name} bytes do not match its MIME type.`)
      }
      const sha256 = createHash('sha256').update(resolved.buffer).digest('hex')
      if (sha256 !== descriptor.sha256 || sha256 !== resolved.asset.sha256) {
        throw new Error(`VISUAL_DIAGNOSTICS_UNAVAILABLE: ${descriptor.name} checksum does not match the run report.`)
      }
      if (resolved.asset.tenantId !== scope.tenantId ||
        resolved.asset.userId !== scope.userId ||
        resolved.asset.projectId !== (scope.projectId ?? undefined) ||
        resolved.asset.xpertId !== (scope.xpertId ?? undefined)) {
        throw new Error(`VISUAL_DIAGNOSTICS_UNAVAILABLE: ${descriptor.name} scope does not match the Agent session.`)
      }
      return {
        kind: descriptor.kind,
        view: descriptor.view,
        name: descriptor.name,
        mimeType: descriptor.mimeType,
        size: resolved.buffer.length,
        sha256,
        dataUrl: `data:${descriptor.mimeType};base64,${resolved.buffer.toString('base64')}`
      }
    }))
    return {
      type: 'img2threejs.visual-diagnostics',
      projectId: project.id,
      revision: project.revision,
      runId: run.id,
      runRevision: run.revision,
      images
    }
  }

  private async resolveDiagnosticRun(
    scope: Scope,
    project: ModelProjectEntity,
    runId?: string
  ): Promise<PipelineRunEntity> {
    const selectedId = runId ?? project.activeRunId
    const run = selectedId
      ? await this.runs.findOne({ where: scopedIdWhere(scope, selectedId) })
      : await this.runs.findOne({
          where: scopedProjectWhere(scope, project.id),
          order: { createdAt: 'DESC', id: 'DESC' }
        })
    if (!run || run.projectId !== project.id) throw new Error('VISUAL_DIAGNOSTICS_RUN_NOT_FOUND')
    return run
  }

  private resolveDiagnosticImages(
    run: PipelineRunEntity,
    input: Pick<ReadVisualDiagnosticsInput, 'view' | 'includeComparison' | 'includeRender'>
  ): DiagnosticImageDescriptor[] {
    if (run.renderReport?.status !== 'succeeded') return []
    const images: DiagnosticImageDescriptor[] = []
    if (input.includeComparison && run.comparisonAsset) {
      const asset = run.comparisonAsset
      if (MULTIMODAL_IMAGE_MIME_TYPES.has(asset.mimeType)) {
        images.push({
          kind: 'comparison',
          view: 'reference-vs-render',
          name: asset.name,
          mimeType: asset.mimeType as VisualDiagnosticImageAttachment['mimeType'],
          size: asset.size,
          sha256: asset.sha256,
          filePath: asset.filePath
        })
      }
    }
    if (input.includeRender) {
      const outputs = run.renderReport.outputs ?? []
      const preferredName = input.view ? `render-${input.view}.png` : 'render-three-quarter.png'
      const render = outputs.find((output) => output.name === preferredName) ??
        outputs.find((output) => output.name.startsWith('render-') && MULTIMODAL_IMAGE_MIME_TYPES.has(output.mimeType))
      if (render && MULTIMODAL_IMAGE_MIME_TYPES.has(render.mimeType)) {
        images.push({
          kind: 'render',
          view: render.name.replace(/^render-|\.[^.]+$/g, ''),
          name: render.name,
          mimeType: render.mimeType as VisualDiagnosticImageAttachment['mimeType'],
          size: render.size,
          sha256: render.sha256,
          filePath: render.filePath ?? `img2threejs/${run.projectId}/browser-evidence/${render.name}`
        })
      }
    }
    return images
  }

  private async requireProject(scope: Scope, id: string): Promise<ModelProjectEntity> {
    const project = await this.projects.findOne({ where: scopedIdWhere(scope, id) })
    if (!project) throw new Error('PROJECT_NOT_FOUND')
    return project
  }
}

export function diagnoseAssistantSourceImports(source: string): Array<{
  code: 'ESM_IMPORT_EXTENSION_MISSING'
  line: number
  moduleSpecifier: string
  detail: string
}> {
  const diagnostics: Array<{
    code: 'ESM_IMPORT_EXTENSION_MISSING'
    line: number
    moduleSpecifier: string
    detail: string
  }> = []
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const moduleSpecifier = line.match(/(?:from\s+|import\s*)['"]([^'"]+)['"]/)?.[1]
    if (!moduleSpecifier?.startsWith('three/examples/jsm/') || moduleSpecifier.endsWith('.js')) continue
    diagnostics.push({
      code: 'ESM_IMPORT_EXTENSION_MISSING',
      line: index + 1,
      moduleSpecifier,
      detail: `The browser ESM build requires an explicit .js suffix for '${moduleSpecifier}'. Author a new Assistant candidate with a resolvable module specifier; do not retry the immutable code version.`
    })
  }
  return diagnostics
}

function hasExpectedImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  return false
}
