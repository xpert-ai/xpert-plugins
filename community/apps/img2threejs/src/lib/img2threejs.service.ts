import { createHash } from 'node:crypto'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ManagedQueueService,
  type PluginContext,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import {
  IMG2THREEJS_PLUGIN_NAME,
  IMG2THREEJS_QUEUE_NAME,
  IMG2THREEJS_SANDBOX_ACTION,
  IMG2THREEJS_SANDBOX_ACTION_VERSION,
  IMG2THREEJS_STAGE_JOB_NAME
} from './constants.js'
import { createServerDebugLogger } from './debug-logger.js'
import {
  admissionFailureSummary,
  analyzeImageAdmission
} from './domain/admission/image-admission.js'
import {
  assertStageMayRun,
  deterministicReview,
  evaluateStage,
  nextBuildStage,
  queueJobKey
} from './domain/pipeline.js'
import {
  SculptSpecSchema,
  referenceCameraFrameCorrectionHint,
  type ReferenceCameraFrameCorrectionHint,
  type SculptSpec
} from './domain/sculpt-spec.schema.js'
import { createDeterministicComparisonSvg, generateThreeJsFactory } from './domain/threejs-generator.js'
import type {
  BuildStage,
  DeterministicReview,
  HumanReviewStatus,
  ModelRoute,
  ModelingMode,
  NextDecision,
  Scope,
  StageGateResult
} from './domain/types.js'
import {
  CodeVersionEntity,
  ImageEvidenceEntity,
  ModelProjectEntity,
  PipelineRunEntity,
  SculptSpecVersionEntity
} from './entities/index.js'
import {
  ArtifactsAdapter,
  WorkspaceFilesAdapter
} from './platform/capability-adapters.js'
import { Img2ThreeJsRenderService, type QueueRenderPayload } from './img2threejs-render.service.js'
import { IMG2THREEJS_PLUGIN_CONTEXT } from './tokens.js'
import type { Img2ThreeJsConfig } from './img2threejs.config.js'
import {
  abortableDelay,
  averageStageScore,
  decisionToNextAction,
  isTransientWorkspaceInputVisibilityFailure,
  mergeStageResult,
  normalizeImageMime,
  requireRevision,
  revisionConflict,
  runCursor,
  runNextAction,
  scopeFields,
  scopedIdWhere,
  scopedProjectWhere,
  scopedRevisionWhere,
  sha256Json,
  statusDto,
  summarizeAsset,
  validateApprovedReviewEvidence,
  validateReviewDecision,
  type AssetSummary,
  type RunStatusDto
} from './img2threejs.service-support.js'

const WAIT_DEADLINE_MS = 45_000
const WAIT_INTERVAL_MS = 2_000
const VISUAL_QUALITY_FLOOR_KEYS = [
  'minimumEvidenceCoverage',
  'minimumDeterministicScore',
  'minimumSilhouetteIoU',
  'minimumScaleScore',
  'minimumEdgeScore',
  'minimumPerceptualScore',
  'minimumReferenceMaskConfidence',
  'minimumMultiAngleSilhouetteRetention',
  'minimumVolumeAxisRatio'
] as const satisfies ReadonlyArray<keyof SculptSpec['qualityContract']>

function specCorrectionHints(spec: SculptSpec): ReferenceCameraFrameCorrectionHint[] {
  const cameraHint = referenceCameraFrameCorrectionHint(spec)
  return cameraHint ? [cameraHint] : []
}

function stageProcessingFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/Conversation file not found|Workspace file not found/i.test(message)) return 'WORKSPACE_SOURCE_UNAVAILABLE'
  if (/STALE_QUEUE_PAYLOAD/i.test(message)) return 'QUEUE_JOB_FAILED'
  const explicitCode = /^([A-Z][A-Z0-9_]{2,63})(?::|$)/.exec(message)?.[1]
  return explicitCode ?? 'STAGE_PROCESSING_FAILED'
}

export type SubmitImageInput = {
  filePath: string
  label: string
  view: ImageEvidenceEntity['view']
}

export type QueueStagePayload = {
  runId: string
  requestedStage: BuildStage
}

@Injectable()
export class Img2ThreeJsService {
  private readonly workspaceFiles: WorkspaceFilesAdapter
  private readonly artifacts: ArtifactsAdapter
  private readonly logger
  private managedQueue?: ManagedQueueService

  constructor(
    @InjectRepository(ModelProjectEntity)
    private readonly projects: Repository<ModelProjectEntity>,
    @InjectRepository(ImageEvidenceEntity)
    private readonly images: Repository<ImageEvidenceEntity>,
    @InjectRepository(SculptSpecVersionEntity)
    private readonly specs: Repository<SculptSpecVersionEntity>,
    @InjectRepository(CodeVersionEntity)
    private readonly codes: Repository<CodeVersionEntity>,
    @InjectRepository(PipelineRunEntity)
    private readonly runs: Repository<PipelineRunEntity>,
    @Inject(IMG2THREEJS_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext<Img2ThreeJsConfig>,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    runtimeCapabilities?: RuntimeCapabilityRegistry,
    @Optional()
    private readonly renderer?: Img2ThreeJsRenderService
  ) {
    this.workspaceFiles = new WorkspaceFilesAdapter(runtimeCapabilities)
    this.artifacts = new ArtifactsAdapter(runtimeCapabilities)
    this.logger = createServerDebugLogger(pluginContext.config.debug)
  }

  async createProject(scope: Scope, input: {
    name: string
    route: ModelRoute
    modelingMode: ModelingMode
  }): Promise<{
    projectId: string
    revision: number
    status: string
    nextAction: 'submit_images'
  }> {
    const entity = this.projects.create({
      ...scopeFields(scope),
      name: input.name,
      route: input.route,
      modelingMode: input.modelingMode,
      status: 'awaiting_images',
      currentSpecVersionId: null,
      currentCodeVersionId: null,
      activeRunId: null,
      nextDecision: 'continue',
      humanReviewStatus: 'pending',
      confidence: 0,
      failureReasons: [],
      cancelRequested: false
    })
    const saved = await this.projects.save(entity)
    return {
      projectId: saved.id,
      revision: saved.revision,
      status: saved.status,
      nextAction: 'submit_images'
    }
  }

  async submitImages(scope: Scope, input: {
    projectId: string
    baseRevision: number
    images: SubmitImageInput[]
  }): Promise<{
    projectId: string
    revision: number
    admitted: number
    rejected: number
    evidenceIds: string[]
    status: string
    nextAction: 'update_spec' | 'request_input'
  }> {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    const evidence: ImageEvidenceEntity[] = []

    for (const item of input.images) {
      const { buffer, asset } = await this.workspaceFiles.read(scope, item.filePath)
      const mimeType = normalizeImageMime(asset.mimeType, item.filePath, buffer)
      const diagnostics = await analyzeImageAdmission(buffer, mimeType, {
        maximumBytes: this.pluginContext.config.maximumImageBytes
      })
      const failures = [...diagnostics.failureCodes]
      const actualSha256 = createHash('sha256').update(buffer).digest('hex')
      if (actualSha256 !== asset.sha256) failures.push('workspace_checksum_mismatch')
      const admissionStatus = failures.length === 0
        ? diagnostics.status
        : 'rejected'
      const admitted = admissionStatus === 'admitted'
      const dimensions = diagnostics.sourceWidth > 0 && diagnostics.sourceHeight > 0
        ? { width: diagnostics.sourceWidth, height: diagnostics.sourceHeight }
        : null
      const persistedDiagnostics = failures.length === 0
        ? diagnostics
        : { ...diagnostics, status: admissionStatus, failureCodes: failures }
      evidence.push(this.images.create({
        ...scopeFields(scope),
        projectId: project.id,
        label: item.label,
        view: item.view,
        asset: { ...asset, mimeType },
        sha256: asset.sha256,
        mimeType,
        size: buffer.length,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        admissionStatus,
        observations: [
          {
            id: `evidence_${asset.sha256.slice(0, 12)}`,
            kind: 'silhouette',
            description: `Foreground admission: ${admissionFailureSummary(persistedDiagnostics)} Declared view=${item.view}, dimensions=${dimensions ? `${dimensions.width}x${dimensions.height}` : 'unknown'}. Semantic visual interpretation remains Agent-owned.`,
            confidence: persistedDiagnostics.maskConfidence
          },
          {
            id: `mask_${asset.sha256.slice(0, 12)}`,
            kind: 'uncertainty',
            description: `Mask coverage=${persistedDiagnostics.foregroundCoverage.toFixed(3)}, largest component=${persistedDiagnostics.largestComponentFraction.toFixed(3)}, pHash=${persistedDiagnostics.pHash}.`,
            confidence: persistedDiagnostics.maskConfidence
          }
        ],
        confidence: admitted ? persistedDiagnostics.maskConfidence : 0,
        admissionDiagnostics: persistedDiagnostics,
        foregroundCoverage: persistedDiagnostics.foregroundCoverage,
        largestComponentFraction: persistedDiagnostics.largestComponentFraction,
        maskConfidence: persistedDiagnostics.maskConfidence,
        pHash: persistedDiagnostics.pHash,
        viewpointConfidence: viewpointConfidence(item.view),
        requestInputReason: admissionStatus === 'request-input' ? admissionFailureSummary(persistedDiagnostics) : null,
        failureReasons: failures
      }))
    }

    const saved = await this.projects.manager.transaction(async (manager) => {
      const imageRepository = manager.getRepository(ImageEvidenceEntity)
      const projectRepository = manager.getRepository(ModelProjectEntity)
      const persisted = await imageRepository.save(evidence)
      const admittedCount = persisted.filter((item) => item.admissionStatus === 'admitted').length
      const update = await projectRepository.update(
        scopedRevisionWhere(scope, project.id, input.baseRevision),
        {
          status: admittedCount > 0 ? 'awaiting_spec' : 'awaiting_images',
          confidence: admittedCount / persisted.length,
          failureReasons: persisted.flatMap((item) => item.failureReasons)
        }
      )
      if (update.affected !== 1) throw revisionConflict()
      return persisted
    })
    const admitted = saved.filter((item) => item.admissionStatus === 'admitted')
    const updated = await this.requireProject(scope, project.id)
    return {
      projectId: project.id,
      revision: updated.revision,
      admitted: admitted.length,
      rejected: saved.length - admitted.length,
      evidenceIds: admitted.map((item) => item.id),
      status: updated.status,
      nextAction: admitted.length > 0 ? 'update_spec' : 'request_input'
    }
  }

  async updateSpec(scope: Scope, input: {
    projectId: string
    baseRevision: number
    spec: SculptSpec
    confidence: number
    changeSummary: string
  }): Promise<{
    projectId: string
    specVersionId: string
    specVersion: number
    revision: number
    validationStatus: 'valid' | 'invalid'
    issueCount: number
    issues: Array<{ path: string; message: string }>
    correctionHints: ReferenceCameraFrameCorrectionHint[]
    nextAction: 'validate_spec' | 'refine_spec'
  }> {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    const validation = await this.validateSpecDocument(scope, project, input.spec)
    const checksum = sha256Json(input.spec)
    const version = await this.projects.manager.transaction(async (manager) => {
      const specRepository = manager.getRepository(SculptSpecVersionEntity)
      const projectRepository = manager.getRepository(ModelProjectEntity)
      const count = await specRepository.count({ where: scopedProjectWhere(scope, project.id) })
      const persisted = await specRepository.save(specRepository.create({
        ...scopeFields(scope),
        projectId: project.id,
        version: count + 1,
        spec: input.spec,
        checksum,
        validationStatus: validation.valid ? 'valid' : 'invalid',
        validationIssues: validation.issues,
        confidence: input.confidence,
        changeSummary: input.changeSummary
      }))
      const update = await projectRepository.update(
        scopedRevisionWhere(scope, project.id, input.baseRevision),
        {
          currentSpecVersionId: persisted.id,
          status: validation.valid ? 'spec_ready' : 'awaiting_spec',
          // A newly persisted Spec supersedes the review decision on the
          // previous run. Keeping `changes_requested` here would route an
          // already-valid refinement back into another Assistant rewrite.
          humanReviewStatus: 'pending',
          confidence: input.confidence,
          failureReasons: validation.issues.map((issue) => `${issue.path}: ${issue.message}`),
          nextDecision: validation.valid ? 'continue' : 'refine-spec'
        }
      )
      if (update.affected !== 1) throw revisionConflict()
      return persisted
    })
    const updated = await this.requireProject(scope, project.id)
    return {
      projectId: project.id,
      specVersionId: version.id,
      specVersion: version.version,
      revision: updated.revision,
      validationStatus: version.validationStatus,
      issueCount: version.validationIssues.length,
      issues: version.validationIssues.slice(0, 50),
      correctionHints: specCorrectionHints(version.spec),
      nextAction: validation.valid ? 'validate_spec' : 'refine_spec'
    }
  }

  async patchRuntimeContract(scope: Scope, input: {
    projectId: string
    baseRevision: number
    sourceSpecVersionId: string
    minimumRuntimeMeshCount: number
    confidence: number
    changeSummary: string
  }): Promise<Awaited<ReturnType<Img2ThreeJsService['updateSpec']>>> {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (project.currentSpecVersionId !== input.sourceSpecVersionId) throw new Error('STALE_SPEC_VERSION')
    const source = await this.requireSpec(scope, input.sourceSpecVersionId)
    if (source.spec.modelingMode !== 'semantic-3d') throw new Error('SEMANTIC_3D_REQUIRED')
    if (input.minimumRuntimeMeshCount < source.spec.qualityContract.minimumComponentCount) {
      throw new Error('RUNTIME_MESH_FLOOR_CANNOT_DECREASE')
    }
    const spec = structuredClone(source.spec)
    spec.qualityContract.minimumComponentCount = input.minimumRuntimeMeshCount
    return this.updateSpec(scope, {
      projectId: input.projectId,
      baseRevision: input.baseRevision,
      spec,
      confidence: input.confidence,
      changeSummary: input.changeSummary
    })
  }

  async patchSpec(scope: Scope, input: {
    projectId: string
    baseRevision: number
    sourceSpecVersionId: string
    referenceCamera?: SculptSpec['referenceCamera']
    silhouetteIntent?: string
    componentPatches: Array<{
      componentId: string
      parentId?: string | null
      name?: string
      semanticType?: SculptSpec['components'][number]['semanticType']
      primitive?: SculptSpec['components'][number]['primitive']
      geometry?: SculptSpec['components'][number]['geometry'] | null
      transform?: Partial<SculptSpec['components'][number]['transform']>
      materialId?: string
      deformable?: boolean
      confidence?: number
    }>
    materialPatches: Array<{
      materialId: string
      baseColor?: string
      roughness?: number
      metalness?: number
      opacity?: number
      transparent?: boolean
      emissive?: string
      emissiveIntensity?: number
      clearcoat?: number
      clearcoatRoughness?: number
    }>
    confidence: number
    changeSummary: string
  }): Promise<Awaited<ReturnType<Img2ThreeJsService['updateSpec']>>> {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (project.currentSpecVersionId !== input.sourceSpecVersionId) throw new Error('STALE_SPEC_VERSION')
    const source = await this.requireSpec(scope, input.sourceSpecVersionId)
    const spec = structuredClone(source.spec)

    if (input.referenceCamera !== undefined) spec.referenceCamera = input.referenceCamera
    if (input.silhouetteIntent !== undefined) spec.silhouetteIntent = input.silhouetteIntent

    const componentsById = new Map(spec.components.map((component) => [component.id, component]))
    for (const patch of input.componentPatches) {
      const component = componentsById.get(patch.componentId)
      if (!component) throw new Error(`COMPONENT_NOT_FOUND:${patch.componentId}`)
      if (patch.parentId !== undefined) component.parentId = patch.parentId
      if (patch.name !== undefined) component.name = patch.name
      if (patch.semanticType !== undefined) component.semanticType = patch.semanticType
      if (patch.primitive !== undefined) component.primitive = patch.primitive
      if (Object.prototype.hasOwnProperty.call(patch, 'geometry')) {
        if (patch.geometry === null) delete component.geometry
        else component.geometry = patch.geometry
      }
      if (patch.transform !== undefined) {
        component.transform = { ...component.transform, ...patch.transform }
      }
      if (patch.materialId !== undefined) component.materialId = patch.materialId
      if (patch.deformable !== undefined) component.deformable = patch.deformable
      if (patch.confidence !== undefined) component.confidence = patch.confidence
    }

    const materialsById = new Map(spec.materials.map((material) => [material.id, material]))
    for (const patch of input.materialPatches) {
      const material = materialsById.get(patch.materialId)
      if (!material) throw new Error(`MATERIAL_NOT_FOUND:${patch.materialId}`)
      if (patch.baseColor !== undefined) material.baseColor = patch.baseColor
      if (patch.roughness !== undefined) material.roughness = patch.roughness
      if (patch.metalness !== undefined) material.metalness = patch.metalness
      if (patch.opacity !== undefined) material.opacity = patch.opacity
      if (patch.transparent !== undefined) material.transparent = patch.transparent
      if (patch.emissive !== undefined) material.emissive = patch.emissive
      if (patch.emissiveIntensity !== undefined) material.emissiveIntensity = patch.emissiveIntensity
      if (patch.clearcoat !== undefined) material.clearcoat = patch.clearcoat
      if (patch.clearcoatRoughness !== undefined) material.clearcoatRoughness = patch.clearcoatRoughness
    }

    spec.nextDecision = 'continue'
    return this.updateSpec(scope, {
      projectId: input.projectId,
      baseRevision: input.baseRevision,
      spec,
      confidence: input.confidence,
      changeSummary: input.changeSummary
    })
  }

  async reconcileCurrentSpecRuntimeContract(scope: Scope, input: {
    projectId: string
    baseRevision: number
  }): Promise<Awaited<ReturnType<Img2ThreeJsService['updateSpec']>> | null> {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (!project.currentSpecVersionId) return null
    const source = await this.requireSpec(scope, project.currentSpecVersionId)
    if (source.spec.modelingMode !== 'semantic-3d' || source.validationStatus === 'valid') return null
    const outstandingReview = await this.outstandingReviewConstraints(scope, project)
    const requiredMinimum = outstandingReview
      ? minimumComponentCountFromReview(outstandingReview.notes)
      : null
    if (requiredMinimum === null) return null
    const spec = structuredClone(source.spec)
    spec.qualityContract.minimumComponentCount = Math.max(
      spec.qualityContract.minimumComponentCount,
      requiredMinimum
    )
    const validation = await this.validateSpecDocument(scope, project, spec)
    if (!validation.valid) {
      throw new Error(
        `RUNTIME_CONTRACT_RECONCILIATION_NOT_APPLICABLE:${validation.issues
          .map((issue) => `${issue.path}:${issue.message}`)
          .join('|')}`
      )
    }
    return this.updateSpec(scope, {
      projectId: project.id,
      baseRevision: project.revision,
      spec,
      confidence: source.confidence,
      changeSummary: `Reconciled persisted human review into a runtime Mesh floor of ${requiredMinimum}; semantic blueprint and evidence-backed geometry are unchanged.`
    })
  }

  async validateCurrentSpec(scope: Scope, projectId: string, expectedRevision?: number): Promise<{
    projectId: string
    revision: number
    specVersionId: string | null
    valid: boolean
    issues: Array<{ path: string; message: string }>
    correctionHints: ReferenceCameraFrameCorrectionHint[]
    nextAction: 'author_code' | 'enqueue_stage' | 'refine_spec'
  }> {
    const project = await this.requireProject(scope, projectId)
    if (expectedRevision !== undefined) requireRevision(project.revision, expectedRevision)
    if (!project.currentSpecVersionId) {
      return {
        projectId,
        revision: project.revision,
        specVersionId: null,
        valid: false,
        issues: [{ path: 'spec', message: 'No Sculpt Spec has been saved.' }],
        correctionHints: [],
        nextAction: 'refine_spec'
      }
    }
    const version = await this.requireSpec(scope, project.currentSpecVersionId)
    const validation = await this.validateSpecDocument(scope, project, version.spec)
    const codeReady = validation.valid && await this.hasCurrentAssistantCode(scope, project, version)
    return {
      projectId,
      revision: project.revision,
      specVersionId: version.id,
      valid: validation.valid,
      issues: validation.issues.slice(0, 50),
      correctionHints: specCorrectionHints(version.spec),
      nextAction: validation.valid ? codeReady ? 'enqueue_stage' : 'author_code' : 'refine_spec'
    }
  }

  async readCurrentSpec(scope: Scope, projectId: string, expectedRevision?: number): Promise<{
    projectId: string
    revision: number
    specVersionId: string
    specVersion: number
    checksum: string
    validationStatus: 'valid' | 'invalid'
    issues: Array<{ path: string; message: string }>
    correctionHints: ReferenceCameraFrameCorrectionHint[]
    spec: SculptSpec
  }> {
    const project = await this.requireProject(scope, projectId)
    if (expectedRevision !== undefined) requireRevision(project.revision, expectedRevision)
    if (!project.currentSpecVersionId) throw new Error('SCULPT_SPEC_NOT_FOUND')
    const version = await this.requireSpec(scope, project.currentSpecVersionId)
    const validation = await this.validateSpecDocument(scope, project, version.spec)
    return {
      projectId,
      revision: project.revision,
      specVersionId: version.id,
      specVersion: version.version,
      checksum: version.checksum,
      validationStatus: validation.valid ? 'valid' : 'invalid',
      issues: validation.issues.slice(0, 50),
      correctionHints: specCorrectionHints(version.spec),
      spec: version.spec
    }
  }

  async readCurrentCode(scope: Scope, input: {
    projectId: string
    codeVersionId: string
    expectedRevision: number
    includeSource?: boolean
  }): Promise<{
    projectId: string
    revision: number
    specVersionId: string
    codeVersionId: string
    codeVersion: number
    sha256: string
    authorship: NonNullable<import('./domain/types.js').DeterministicReview['authorship']>
    sourceFilePath: string
    sourceSize: number
    deterministicStatus: 'passed' | 'failed'
    deterministicScore: number
    failedChecks: Array<{ code: string; detail: string }>
    source?: string
  }> {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.expectedRevision)
    if (project.currentCodeVersionId !== input.codeVersionId) throw new Error('STALE_CODE_VERSION')
    if (!project.currentSpecVersionId) throw new Error('SCULPT_SPEC_NOT_FOUND')
    const code = await this.requireCode(scope, input.codeVersionId)
    if (!code.sourceAsset) throw new Error('CODE_SOURCE_ASSET_UNAVAILABLE')
    const { buffer, asset } = await this.workspaceFiles.read(scope, code.sourceAsset.filePath)
    if (buffer.length > 1_000_000) throw new Error('CODE_SOURCE_TOO_LARGE')
    if (asset.sha256 !== code.sha256 || createHash('sha256').update(buffer).digest('hex') !== code.sha256) {
      throw new Error('CODE_SOURCE_CHECKSUM_MISMATCH: call img2threejs_inspect_code_file on the exact sourceFilePath after the final edit, then retry with its returned sha256')
    }
    const spec = await this.requireSpec(scope, code.specVersionId)
    const currentReview = deterministicReview(
      spec.spec,
      buffer.toString('utf8'),
      code.deterministicReview.authorship,
      code.deterministicReview.changeSummary
    )
    return {
      projectId: project.id,
      revision: project.revision,
      specVersionId: code.specVersionId,
      codeVersionId: code.id,
      codeVersion: code.version,
      sha256: code.sha256,
      authorship: code.deterministicReview.authorship ?? 'deterministic-generator',
      sourceFilePath: asset.workspacePath,
      sourceSize: buffer.length,
      deterministicStatus: code.status,
      deterministicScore: code.deterministicReview.score,
      failedChecks: failedDeterministicChecks(currentReview),
      ...(input.includeSource ? { source: buffer.toString('utf8') } : {})
    }
  }

  async inspectCodeFile(scope: Scope, input: {
    projectId: string
    baseRevision: number
    sourceFilePath: string
  }): Promise<{
    projectId: string
    revision: number
    sourceFilePath: string
    sourceSha256: string
    size: number
    mimeType: string
  }> {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    const { buffer, asset } = await this.readAssistantCodeFile(scope, input.sourceFilePath)
    return {
      projectId: project.id,
      revision: project.revision,
      sourceFilePath: asset.workspacePath,
      sourceSha256: createHash('sha256').update(buffer).digest('hex'),
      size: buffer.length,
      mimeType: asset.mimeType
    }
  }

  async authorCodeFile(scope: Scope, input: {
    projectId: string
    specVersionId: string
    baseRevision: number
    mode: 'create' | 'refine'
    baseCodeVersionId: string | null
    sourceFilePath: string
    changeSummary: string
  }) {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    const { buffer, asset } = await this.readAssistantCodeFile(scope, input.sourceFilePath)
    const checksum = createHash('sha256').update(buffer).digest('hex')
    if (asset.sha256 !== checksum) throw new Error('CODE_SOURCE_STORAGE_CHECKSUM_MISMATCH')
    return this.persistAssistantSource(scope, {
      projectId: input.projectId,
      specVersionId: input.specVersionId,
      baseRevision: input.baseRevision,
      mode: input.mode,
      baseCodeVersionId: input.baseCodeVersionId,
      source: buffer.toString('utf8'),
      changeSummary: input.changeSummary
    })
  }

  async authorCode(scope: Scope, input: {
    projectId: string
    specVersionId: string
    baseRevision: number
    mode: 'create' | 'refine'
    baseCodeVersionId: string | null
    source: string
    changeSummary: string
  }) {
    if (Buffer.byteLength(input.source, 'utf8') > 1_000_000) throw new Error('CODE_SOURCE_TOO_LARGE')
    return this.persistAssistantSource(scope, input)
  }

  private async readAssistantCodeFile(scope: Scope, sourceFilePath: string) {
    const { buffer, asset } = await this.workspaceFiles.read(scope, sourceFilePath)
    if (buffer.length < 500) throw new Error('CODE_SOURCE_TOO_SMALL')
    if (buffer.length > 1_000_000) throw new Error('CODE_SOURCE_TOO_LARGE')
    const source = buffer.toString('utf8')
    if (!Buffer.from(source, 'utf8').equals(buffer)) throw new Error('CODE_SOURCE_INVALID_UTF8')
    return { buffer, asset }
  }

  private async persistAssistantSource(scope: Scope, input: {
    projectId: string
    specVersionId: string
    baseRevision: number
    mode: 'create' | 'refine'
    baseCodeVersionId: string | null
    source: string
    changeSummary: string
  }) {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (project.currentSpecVersionId !== input.specVersionId) throw new Error('STALE_SPEC_VERSION')
    const spec = await this.requireSpec(scope, input.specVersionId)
    if (spec.validationStatus !== 'valid') throw new Error('SCULPT_SPEC_INVALID')

    let authorship: NonNullable<CodeVersionEntity['deterministicReview']['authorship']> = 'assistant-authored'
    if (input.mode === 'refine') {
      if (!input.baseCodeVersionId) throw new Error('BASE_CODE_VERSION_REQUIRED')
      if (project.currentCodeVersionId !== input.baseCodeVersionId) throw new Error('STALE_CODE_VERSION')
      await this.requireCode(scope, input.baseCodeVersionId)
      authorship = 'assistant-refined'
    }

    if (input.mode === 'create' && input.baseCodeVersionId !== null) throw new Error('CREATE_CODE_BASE_MUST_BE_NULL')
    if (input.mode === 'create' && project.currentCodeVersionId) throw new Error('CODE_VERSION_EXISTS_USE_REFINE')
    const review = deterministicReview(spec.spec, input.source, authorship, input.changeSummary)
    const versionCount = await this.codes.count({ where: scopedProjectWhere(scope, project.id) })
    const sourceAsset = await this.workspaceFiles.write(scope, {
      folder: `img2threejs/${project.id}/versions`,
      fileName: `model-v${versionCount + 1}.ts`,
      mimeType: 'text/typescript',
      buffer: Buffer.from(input.source, 'utf8')
    })
    const persisted = await this.codes.save(this.codes.create({
      ...scopeFields(scope),
      projectId: project.id,
      specVersionId: spec.id,
      version: versionCount + 1,
      sha256: sourceAsset.sha256,
      sourceAsset,
      sourcePreview: input.source.slice(0, 4000),
      deterministicReview: review,
      status: review.status === 'passed' ? 'passed' : 'failed',
      failureReasons: review.checks.filter((item) => !item.passed).map((item) => item.code)
    }))
    const failureCodes = persisted.failureReasons
    const update = await this.projects.update(
      scopedRevisionWhere(scope, project.id, input.baseRevision),
      {
        currentCodeVersionId: persisted.id,
        activeRunId: null,
        status: review.status === 'passed' ? 'spec_ready' : 'failed',
        humanReviewStatus: 'pending',
        nextDecision: review.status === 'passed' ? 'continue' : 'refine-code',
        failureReasons: failureCodes,
        confidence: review.score
      }
    )
    if (update.affected !== 1) throw revisionConflict()
    const updated = await this.requireProject(scope, project.id)
    return {
      projectId: project.id,
      specVersionId: spec.id,
      codeVersionId: persisted.id,
      codeVersion: persisted.version,
      revision: updated.revision,
      authorship: review.authorship,
      sourceSha256: persisted.sha256,
      deterministicStatus: persisted.status,
      deterministicScore: review.score,
      failureCodes,
      failedChecks: failedDeterministicChecks(review),
      nextAction: review.status === 'passed' ? 'enqueue_stage' as const : 'refine_code' as const
    }
  }

  async revalidateCode(scope: Scope, input: {
    projectId: string
    codeVersionId: string
    baseRevision: number
    changeSummary: string
  }): Promise<{
    projectId: string
    specVersionId: string
    codeVersionId: string
    codeVersion: number
    revision: number
    authorship: NonNullable<CodeVersionEntity['deterministicReview']['authorship']>
    sourceSha256: string
    deterministicStatus: 'passed' | 'failed'
    deterministicScore: number
    failureCodes: string[]
    failedChecks: Array<{ code: string; detail: string }>
    nextAction: 'enqueue_stage' | 'refine_code'
  }> {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (project.currentCodeVersionId !== input.codeVersionId) throw new Error('STALE_CODE_VERSION')
    if (!project.currentSpecVersionId) throw new Error('SCULPT_SPEC_NOT_FOUND')
    const spec = await this.requireSpec(scope, project.currentSpecVersionId)
    if (spec.validationStatus !== 'valid') throw new Error('SCULPT_SPEC_INVALID')
    const current = await this.requireCode(scope, input.codeVersionId)
    const authorship = current.deterministicReview.authorship ?? 'deterministic-generator'
    if (!['assistant-authored', 'assistant-refined'].includes(authorship)) {
      throw new Error('AGENT_AUTHORED_CODE_REQUIRED')
    }
    if (!current.sourceAsset) throw new Error('CODE_SOURCE_ASSET_UNAVAILABLE')
    const { buffer, asset } = await this.workspaceFiles.read(scope, current.sourceAsset.filePath)
    if (buffer.length > 1_000_000) throw new Error('CODE_SOURCE_TOO_LARGE')
    const checksum = createHash('sha256').update(buffer).digest('hex')
    if (
      asset.sha256 !== current.sha256 ||
      checksum !== current.sha256
    ) {
      throw new Error('CODE_SOURCE_CHECKSUM_MISMATCH: call img2threejs_inspect_code_file on the exact sourceFilePath after the final edit, then retry with its returned sha256')
    }
    const source = buffer.toString('utf8')
    const review = deterministicReview(spec.spec, source, authorship, input.changeSummary)
    const failureCodes = review.checks.filter((item) => !item.passed).map((item) => item.code)
    const versionCount = await this.codes.count({ where: scopedProjectWhere(scope, project.id) })
    const persisted = await this.codes.save(this.codes.create({
      ...scopeFields(scope),
      projectId: project.id,
      specVersionId: spec.id,
      version: versionCount + 1,
      sha256: current.sha256,
      sourceAsset: asset,
      sourcePreview: source.slice(0, 4000),
      deterministicReview: review,
      status: review.status === 'passed' ? 'passed' : 'failed',
      failureReasons: failureCodes
    }))
    const update = await this.projects.update(
      scopedRevisionWhere(scope, project.id, input.baseRevision),
      {
        currentCodeVersionId: persisted.id,
        activeRunId: null,
        status: review.status === 'passed' ? 'spec_ready' : 'failed',
        humanReviewStatus: 'pending',
        nextDecision: review.status === 'passed' ? 'continue' : 'refine-code',
        failureReasons: failureCodes,
        confidence: review.score
      }
    )
    if (update.affected !== 1) throw revisionConflict()
    const updated = await this.requireProject(scope, project.id)
    return {
      projectId: project.id,
      specVersionId: spec.id,
      codeVersionId: persisted.id,
      codeVersion: persisted.version,
      revision: updated.revision,
      authorship,
      sourceSha256: persisted.sha256,
      deterministicStatus: persisted.status,
      deterministicScore: review.score,
      failureCodes,
      failedChecks: failedDeterministicChecks(review),
      nextAction: review.status === 'passed' ? 'enqueue_stage' : 'refine_code'
    }
  }

  async patchCode(scope: Scope, input: {
    projectId: string
    codeVersionId: string
    baseRevision: number
    replacements: Array<{ oldText: string; newText: string; allOccurrences?: boolean }>
    changeSummary: string
  }): Promise<{
    projectId: string
    specVersionId: string
    codeVersionId: string
    codeVersion: number
    revision: number
    authorship: 'assistant-refined'
    sourceSha256: string
    deterministicStatus: 'passed' | 'failed'
    deterministicScore: number
    failureCodes: string[]
    failedChecks: Array<{ code: string; detail: string }>
    nextAction: 'enqueue_stage' | 'refine_code'
  }> {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (project.currentCodeVersionId !== input.codeVersionId) throw new Error('STALE_CODE_VERSION')
    if (!project.currentSpecVersionId) throw new Error('SCULPT_SPEC_NOT_FOUND')
    const spec = await this.requireSpec(scope, project.currentSpecVersionId)
    if (spec.validationStatus !== 'valid') throw new Error('SCULPT_SPEC_INVALID')
    const current = await this.requireCode(scope, input.codeVersionId)
    if (!['assistant-authored', 'assistant-refined'].includes(current.deterministicReview.authorship ?? '')) {
      throw new Error('AGENT_AUTHORED_CODE_REQUIRED')
    }
    if (!current.sourceAsset) throw new Error('CODE_SOURCE_ASSET_UNAVAILABLE')
    const { buffer, asset } = await this.workspaceFiles.read(scope, current.sourceAsset.filePath)
    if (buffer.length > 1_000_000) throw new Error('CODE_SOURCE_TOO_LARGE')
    const checksum = createHash('sha256').update(buffer).digest('hex')
    if (
      asset.sha256 !== current.sha256 ||
      checksum !== current.sha256
    ) {
      throw new Error('CODE_SOURCE_CHECKSUM_MISMATCH: call img2threejs_inspect_code_file on the exact sourceFilePath after the final edit, then retry with its returned sha256')
    }
    let source = buffer.toString('utf8')
    for (let index = 0; index < input.replacements.length; index += 1) {
      const replacement = input.replacements[index]!
      if (replacement.allOccurrences) {
        if (
          !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(replacement.oldText) ||
          !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(replacement.newText)
        ) {
          throw new Error(`CODE_PATCH_ALL_OCCURRENCES_IDENTIFIER_REQUIRED:${index}`)
        }
        const identifierPattern = new RegExp(
          `(?<![A-Za-z0-9_$])${escapeRegExp(replacement.oldText)}(?![A-Za-z0-9_$])`,
          'g'
        )
        const matchCount = source.match(identifierPattern)?.length ?? 0
        if (matchCount < 1 || matchCount > 500) {
          throw new Error(`CODE_PATCH_MATCH_COUNT:${index}:${matchCount}`)
        }
        source = source.replace(identifierPattern, replacement.newText)
      } else {
        const matchCount = source.split(replacement.oldText).length - 1
        if (matchCount !== 1) throw new Error(`CODE_PATCH_MATCH_COUNT:${index}:${matchCount}`)
        source = source.replace(replacement.oldText, replacement.newText)
      }
    }
    if (source === buffer.toString('utf8')) throw new Error('CODE_PATCH_NO_CHANGE')
    if (Buffer.byteLength(source, 'utf8') > 1_000_000) throw new Error('CODE_SOURCE_TOO_LARGE')
    const review = deterministicReview(spec.spec, source, 'assistant-refined', input.changeSummary)
    const failureCodes = review.checks.filter((item) => !item.passed).map((item) => item.code)
    const versionCount = await this.codes.count({ where: scopedProjectWhere(scope, project.id) })
    const sourceAsset = await this.workspaceFiles.write(scope, {
      folder: `img2threejs/${project.id}/versions`,
      fileName: `model-v${versionCount + 1}.ts`,
      mimeType: 'text/typescript',
      buffer: Buffer.from(source, 'utf8')
    })
    const persisted = await this.codes.save(this.codes.create({
      ...scopeFields(scope),
      projectId: project.id,
      specVersionId: spec.id,
      version: versionCount + 1,
      sha256: sourceAsset.sha256,
      sourceAsset,
      sourcePreview: source.slice(0, 4000),
      deterministicReview: review,
      status: review.status === 'passed' ? 'passed' : 'failed',
      failureReasons: failureCodes
    }))
    const update = await this.projects.update(
      scopedRevisionWhere(scope, project.id, input.baseRevision),
      {
        currentCodeVersionId: persisted.id,
        activeRunId: null,
        status: review.status === 'passed' ? 'spec_ready' : 'failed',
        humanReviewStatus: 'pending',
        nextDecision: review.status === 'passed' ? 'continue' : 'refine-code',
        failureReasons: failureCodes,
        confidence: review.score
      }
    )
    if (update.affected !== 1) throw revisionConflict()
    const updated = await this.requireProject(scope, project.id)
    return {
      projectId: project.id,
      specVersionId: spec.id,
      codeVersionId: persisted.id,
      codeVersion: persisted.version,
      revision: updated.revision,
      authorship: 'assistant-refined',
      sourceSha256: persisted.sha256,
      deterministicStatus: persisted.status,
      deterministicScore: review.score,
      failureCodes,
      failedChecks: failedDeterministicChecks(review),
      nextAction: review.status === 'passed' ? 'enqueue_stage' : 'refine_code'
    }
  }

  async refineCode(scope: Scope, input: {
    projectId: string
    codeVersionId: string
    baseRevision: number
    sourceFilePath: string
    changeSummary?: string
  }): Promise<{
    projectId: string
    codeVersionId: string
    codeVersion: number
    revision: number
    deterministicStatus: 'passed' | 'failed'
    deterministicScore: number
    failureCodes: string[]
    failedChecks: Array<{ code: string; detail: string }>
    runId?: string
    runRevision?: number
    cursor?: string
    nextAction: 'wait_run' | 'submit_review' | 'refine_code'
  }> {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (project.currentCodeVersionId !== input.codeVersionId) throw new Error('STALE_CODE_VERSION')
    if (!project.currentSpecVersionId) throw new Error('SCULPT_SPEC_NOT_FOUND')
    const spec = await this.requireSpec(scope, project.currentSpecVersionId)
    const { buffer, asset } = await this.workspaceFiles.read(scope, input.sourceFilePath)
    if (buffer.length > 1_000_000) throw new Error('REFINED_CODE_TOO_LARGE')
    const checksum = createHash('sha256').update(buffer).digest('hex')
    if (asset.sha256 !== checksum) throw new Error('CODE_SOURCE_STORAGE_CHECKSUM_MISMATCH')
    const source = buffer.toString('utf8')
    const review = deterministicReview(spec.spec, source, 'assistant-refined', input.changeSummary)
    const failureCodes = review.checks.filter((item) => !item.passed).map((item) => item.code)
    const codeStatus = review.status === 'passed' ? 'review_required' : 'failed'
    const activeRun = project.activeRunId ? await this.requireRun(scope, project.activeRunId) : null
    const mayReuseActiveRun = Boolean(
      activeRun &&
      activeRun.specVersionId === spec.id &&
      !['completed', 'cancelled'].includes(activeRun.status)
    )
    const refinement = await this.projects.manager.transaction(async (manager) => {
      const codeRepository = manager.getRepository(CodeVersionEntity)
      const projectRepository = manager.getRepository(ModelProjectEntity)
      const runRepository = manager.getRepository(PipelineRunEntity)
      const count = await codeRepository.count({ where: scopedProjectWhere(scope, project.id) })
      const persisted = await codeRepository.save(codeRepository.create({
        ...scopeFields(scope),
        projectId: project.id,
        specVersionId: spec.id,
        version: count + 1,
        sha256: checksum,
        sourceAsset: asset,
        sourcePreview: source.slice(0, 4000),
        deterministicReview: review,
        status: review.status === 'passed' ? 'passed' : 'failed',
        failureReasons: failureCodes
      }))
      let reviewRunId: string
      if (activeRun && mayReuseActiveRun) {
        const priorRenderReport = activeRun.renderReport
        const runUpdate = await runRepository.update(
          scopedRevisionWhere(scope, activeRun.id, activeRun.revision),
          {
            codeVersionId: persisted.id,
            deterministicReview: review,
            status: codeStatus,
            renderQueueJobId: null,
            sandboxJobId: null,
            renderReport: priorRenderReport
              ? {
                  status: 'unavailable',
                  action: priorRenderReport.action,
                  actionVersion: priorRenderReport.actionVersion,
                  runtimeProfile: priorRenderReport.runtimeProfile,
                  quality: priorRenderReport.quality,
                  correction: priorRenderReport.correction
                }
              : null,
            visualReview: {
              status: 'unavailable',
              evidenceKind: 'none',
              renderStatus: 'not_requested',
              capabilityReason: review.status === 'failed'
                ? 'The current code candidate failed deterministic review; prior browser diagnostics were superseded.'
                : 'The current code candidate is awaiting a fresh browser review.'
            },
            comparisonAsset: null,
            humanReviewStatus: 'pending',
            nextDecision: review.status === 'passed' ? 'continue' : 'refine-code',
            failureReasons: failureCodes,
            confidence: review.score
          }
        )
        if (runUpdate.affected !== 1) throw revisionConflict()
        reviewRunId = activeRun.id
      } else {
        const reviewRun = await runRepository.save(runRepository.create({
          ...scopeFields(scope),
          projectId: project.id,
          specVersionId: spec.id,
          codeVersionId: persisted.id,
          status: codeStatus,
          currentStage: null,
          queueJobId: null,
          renderQueueJobId: null,
          sandboxJobId: null,
          renderReport: null,
          stageResults: [],
          deterministicReview: review,
          visualReview: {
            status: 'unavailable',
            evidenceKind: 'none',
            capabilityReason: 'Refined code is awaiting browser review.'
          },
          comparisonAsset: null,
          humanReviewStatus: 'pending',
          nextDecision: review.status === 'passed' ? 'continue' : 'refine-code',
          confidence: review.score,
          failureReasons: failureCodes,
          completionMode: 'agent_poll'
        }))
        reviewRunId = reviewRun.id
      }
      const projectUpdate = await projectRepository.update(
        scopedRevisionWhere(scope, project.id, input.baseRevision),
        {
          currentCodeVersionId: persisted.id,
          activeRunId: reviewRunId,
          status: codeStatus,
          humanReviewStatus: 'pending',
          nextDecision: review.status === 'passed' ? 'continue' : 'refine-code',
          failureReasons: failureCodes,
          confidence: review.score
        }
      )
      if (projectUpdate.affected !== 1) throw revisionConflict()
      return { code: persisted, reviewRunId }
    })
    let queuedBrowserReview = false
    if (review.status === 'passed' && this.renderer) {
      const currentRun = await this.requireRun(scope, refinement.reviewRunId)
      const capability = await this.renderer.availability()
      if (capability.available) {
        await this.renderer.retry({
          tenantId: currentRun.tenantId,
          organizationId: currentRun.organizationId,
          userId: currentRun.createdById,
          workspaceId: currentRun.workspaceId,
          projectId: currentRun.platformProjectId,
          xpertId: currentRun.xpertId
        }, currentRun)
        queuedBrowserReview = true
      }
    }
    const updated = await this.requireProject(scope, project.id)
    const refreshedStatus = queuedBrowserReview ? await this.getStatus(scope, project.id) : null
    return {
      projectId: project.id,
      codeVersionId: refinement.code.id,
      codeVersion: refinement.code.version,
      revision: updated.revision,
      deterministicStatus: refinement.code.status,
      deterministicScore: review.score,
      failureCodes,
      failedChecks: failedDeterministicChecks(review),
      ...(refreshedStatus?.runId && refreshedStatus.runRevision != null
        ? {
            runId: refreshedStatus.runId,
            runRevision: refreshedStatus.runRevision,
            cursor: refreshedStatus.cursor
          }
        : {}),
      nextAction: review.status === 'passed'
        ? queuedBrowserReview
          ? 'wait_run'
          : 'submit_review'
        : 'refine_code'
    }
  }

  async enqueueStage(scope: Scope, input: {
    projectId: string
    baseRevision: number
    stage: BuildStage
  }): Promise<{
    projectId: string
    runId: string
    runRevision: number
    queueJobId: string
    stage: BuildStage
    status: 'queued'
    cursor: string
    nextAction: 'wait_run'
  }> {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (!project.currentSpecVersionId) throw new Error('SCULPT_SPEC_NOT_FOUND')
    const spec = await this.requireSpec(scope, project.currentSpecVersionId)
    if (spec.validationStatus !== 'valid') throw new Error('SCULPT_SPEC_INVALID')
    const authoredCode = project.currentCodeVersionId
      ? await this.codes.findOne({ where: scopedIdWhere(scope, project.currentCodeVersionId) })
      : null
    if (
      spec.spec.modelingMode === 'semantic-3d' &&
      (!authoredCode ||
        authoredCode.specVersionId !== spec.id ||
        authoredCode.status !== 'passed' ||
        !['assistant-authored', 'assistant-refined'].includes(authoredCode.deterministicReview.authorship ?? ''))
    ) {
      throw new Error('AGENT_AUTHORED_CODE_REQUIRED')
    }

    let run = project.activeRunId ? await this.findRun(scope, project.activeRunId) : null
    const specChanged = Boolean(run && run.specVersionId !== spec.id)
    if (specChanged && run && ['queued', 'running'].includes(run.status)) {
      throw new Error('ACTIVE_RUN_IN_PROGRESS')
    }
    if (!run || specChanged || ['completed', 'failed', 'cancelled'].includes(run.status)) {
      run = await this.runs.save(this.runs.create({
        ...scopeFields(scope),
        projectId: project.id,
        specVersionId: spec.id,
        codeVersionId: authoredCode?.id ?? null,
        status: 'queued',
        currentStage: input.stage,
        queueJobId: null,
        renderQueueJobId: null,
        sandboxJobId: null,
        renderReport: null,
        stageResults: [],
        deterministicReview: { status: 'not_run', score: 0, checks: [] },
        visualReview: { status: 'unavailable', evidenceKind: 'none', capabilityReason: 'Not run.' },
        comparisonAsset: null,
        humanReviewStatus: 'pending',
        nextDecision: 'continue',
        confidence: 0,
        failureReasons: [],
        completionMode: 'agent_poll'
      }))
    }
    assertStageMayRun(input.stage, run.stageResults)
    const queueResult = await this.queue().enqueue<QueueStagePayload>({
      pluginName: IMG2THREEJS_PLUGIN_NAME,
      queueName: IMG2THREEJS_QUEUE_NAME,
      jobName: IMG2THREEJS_STAGE_JOB_NAME,
      payload: {
        runId: run.id,
        requestedStage: input.stage
      },
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      scopeKey: this.pluginContext.scopeKey,
      userId: scope.userId,
      jobId: queueJobKey(run.id, input.stage, run.revision),
      attempts: this.pluginContext.config.queueAttempts,
      backoffMs: { type: 'exponential', delay: this.pluginContext.config.queueBackoffMs }
    })
    await this.runs.update(scopedRevisionWhere(scope, run.id, run.revision), {
      status: 'queued',
      currentStage: input.stage,
      queueJobId: queueResult.jobId,
      failureReasons: []
    })
    const projectUpdate = await this.projects.update(
      scopedRevisionWhere(scope, project.id, input.baseRevision),
      { activeRunId: run.id, status: 'queued', nextDecision: 'continue', cancelRequested: false }
    )
    if (projectUpdate.affected !== 1) {
      await this.queue().cancel({ jobId: queueResult.jobId })
      throw revisionConflict()
    }
    const updatedRun = await this.requireRun(scope, run.id)
    return {
      projectId: project.id,
      runId: updatedRun.id,
      runRevision: updatedRun.revision,
      queueJobId: queueResult.jobId,
      stage: input.stage,
      status: 'queued',
      cursor: runCursor(updatedRun),
      nextAction: 'wait_run'
    }
  }

  async processStage(scope: Scope, payload: QueueStagePayload): Promise<void> {
    const run = await this.requireRun(scope, payload.runId)
    const resourceScope: Scope = {
      ...scope,
      userId: run.createdById,
      workspaceId: run.workspaceId,
      projectId: run.platformProjectId,
      xpertId: run.xpertId
    }
    if (run.status === 'cancelled') return
    if (run.stageResults.some((result) => result.stage === payload.requestedStage && result.status === 'passed')) return
    if (run.currentStage && run.currentStage !== payload.requestedStage) return
    assertStageMayRun(payload.requestedStage, run.stageResults)
    const specVersion = await this.requireSpec(resourceScope, run.specVersionId)
    const claimed = await this.runs.update(scopedRevisionWhere(resourceScope, run.id, run.revision), {
      status: 'running',
      currentStage: payload.requestedStage
    })
    // Multiple API workers may observe the same physical queue retry. Only the
    // worker that atomically advances the entity revision owns this attempt.
    if (claimed.affected !== 1) return
    const running = await this.requireRun(resourceScope, run.id)
    const gate = evaluateStage(payload.requestedStage, specVersion.spec)
    const stageResults = mergeStageResult(running.stageResults, gate)
    if (gate.status !== 'passed') {
      await this.runs.update(scopedRevisionWhere(resourceScope, running.id, running.revision), {
        status: 'failed',
        stageResults,
        failureReasons: gate.checks.filter((item) => !item.passed).map((item) => item.code),
        nextDecision: 'refine-spec'
      })
      await this.updateProjectFromRun(resourceScope, running.projectId, {
        status: 'failed',
        nextDecision: 'refine-spec',
        failureReasons: gate.checks.filter((item) => !item.passed).map((item) => item.code)
      })
      return
    }

    const nextStage = nextBuildStage(stageResults)
    if (nextStage) {
      // Semantic interpretation remains an Agent responsibility. Once a valid
      // Sculpt Spec exists, deterministic build stages are chained by Managed
      // Queue so a single Agent turn does not have to spend one tool call per
      // stage. Concurrency=1 plus the next-stage assertion preserves ordering.
      const nextSourceRevision = running.revision + 1
      const queueResult = await this.queue().enqueue<QueueStagePayload>({
        pluginName: IMG2THREEJS_PLUGIN_NAME,
        queueName: IMG2THREEJS_QUEUE_NAME,
        jobName: IMG2THREEJS_STAGE_JOB_NAME,
        payload: {
          runId: running.id,
          requestedStage: nextStage
        },
        tenantId: resourceScope.tenantId,
        organizationId: resourceScope.organizationId,
        scopeKey: this.pluginContext.scopeKey,
        userId: resourceScope.userId,
        jobId: queueJobKey(running.id, nextStage, nextSourceRevision),
        attempts: this.pluginContext.config.queueAttempts,
        backoffMs: { type: 'exponential', delay: this.pluginContext.config.queueBackoffMs }
      })
      const chained = await this.runs.update(
        scopedRevisionWhere(resourceScope, running.id, running.revision),
        {
          status: 'queued',
          currentStage: nextStage,
          queueJobId: queueResult.jobId,
          stageResults,
          confidence: averageStageScore(stageResults),
          nextDecision: 'continue',
          failureReasons: []
        }
      )
      if (chained.affected !== 1) {
        await this.queue().cancel({ jobId: queueResult.jobId })
        throw revisionConflict()
      }
      await this.updateProjectFromRun(resourceScope, running.projectId, {
        status: 'queued',
        nextDecision: 'continue',
        failureReasons: []
      })
      return
    }
    await this.finalizeCodeAndEvidence(resourceScope, running, specVersion, stageResults)
  }

  async recordStageProcessingFailure(scope: Scope, payload: QueueStagePayload, error: unknown): Promise<void> {
    const run = await this.requireRun(scope, payload.runId)
    if (['completed', 'cancelled'].includes(run.status)) return
    if (run.currentStage !== payload.requestedStage) return
    if (run.stageResults.some((result) => result.stage === payload.requestedStage && result.status === 'passed')) return
    const resourceScope: Scope = {
      ...scope,
      userId: run.createdById,
      workspaceId: run.workspaceId,
      projectId: run.platformProjectId,
      xpertId: run.xpertId
    }
    const failureCode = stageProcessingFailureCode(error)
    const updated = await this.runs.update(scopedRevisionWhere(resourceScope, run.id, run.revision), {
      status: 'failed',
      failureReasons: [failureCode],
      nextDecision: 'continue'
    })
    if (updated.affected !== 1) return
    await this.updateProjectFromRun(resourceScope, run.projectId, {
      status: 'failed',
      failureReasons: [failureCode],
      nextDecision: 'continue'
    })
  }

  async getStatus(scope: Scope, projectId: string): Promise<RunStatusDto> {
    const project = await this.requireProject(scope, projectId)
    let run = project.activeRunId ? await this.findRun(scope, project.activeRunId) : null
    if (run && ['queued', 'running'].includes(run.status) && run.queueJobId) {
      try {
        const queueJob = await this.queue().getJob({ jobId: run.queueJobId })
        if (queueJob?.state === 'failed') {
          await this.recordStageProcessingFailure(
            scope,
            { runId: run.id, requestedStage: run.currentStage ?? 'blockout' },
            queueJob.failedReason ?? 'QUEUE_JOB_FAILED'
          )
          run = await this.findRun(scope, run.id)
        }
      } catch {
        // Status reads remain available when Managed Queue diagnostics are not.
      }
    }
    if (run && ['queued', 'running'].includes(run.status) && run.renderQueueJobId) {
      try {
        const queueJob = await this.queue().getJob({
          jobId: run.renderQueueJobId,
          executionPool: 'sandbox-browser'
        })
        if (queueJob?.state === 'failed') {
          run = await this.recordRenderQueueFailure(
            scope,
            run,
            queueJob.failedReason ?? 'Managed browser-render queue job failed.'
          )
        }
      } catch {
        // Status reads remain available when Managed Queue diagnostics are not.
      }
    }
    const currentCode = project.currentCodeVersionId
      ? await this.codes.findOne({ where: scopedIdWhere(scope, project.currentCodeVersionId) })
      : null
    const currentCodeReview = currentCode
      ? await this.currentCodeDiagnosticReview(scope, currentCode)
      : null
    const currentSpec = project.currentSpecVersionId
      ? await this.specs.findOne({ where: scopedIdWhere(scope, project.currentSpecVersionId) })
      : null
    const status = statusDto(
      project,
      run,
      await this.hasCurrentAssistantCode(scope, project),
      currentCodeReview ? failedDeterministicChecks(currentCodeReview) : [],
      currentSpec ? specCorrectionHints(currentSpec.spec) : []
    )
    if (status.nextAction !== 'author_code') return status
    if (!project.currentSpecVersionId) return status
    const sourceFilePath = `/workspace/img2threejs-assistant/${project.id}/model-spec-${project.currentSpecVersionId}.ts`
    try {
      const { buffer, asset } = await this.workspaceFiles.read(scope, sourceFilePath)
      if (buffer.length < 500 || buffer.length > 1_000_000) return status
      if (!Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer)) return status
      return {
        ...status,
        assistantCodeCandidate: {
          sourceFilePath: asset.workspacePath,
          sourceSha256: createHash('sha256').update(buffer).digest('hex'),
          size: buffer.length
        }
      }
    } catch {
      return status
    }
  }

  async waitRun(
    scope: Scope,
    input: { projectId: string; cursor: string },
    signal?: AbortSignal
  ): Promise<RunStatusDto & { changed: boolean; terminal: boolean; cursor: string }> {
    const deadline = Date.now() + WAIT_DEADLINE_MS
    while (true) {
      if (signal?.aborted) throw new Error('ABORTED')
      const snapshot = await this.getStatus(scope, input.projectId)
      const cursor = snapshot.cursor
      const terminal = ['completed', 'failed', 'cancelled'].includes(snapshot.status)
      if (cursor !== input.cursor || terminal) return { ...snapshot, changed: cursor !== input.cursor, terminal, cursor }
      if (Date.now() >= deadline) return { ...snapshot, changed: false, terminal: false, cursor }
      await abortableDelay(Math.min(WAIT_INTERVAL_MS, deadline - Date.now()), signal)
    }
  }

  async submitReview(scope: Scope, input: {
    projectId: string
    runId: string
    baseRevision: number
    humanReviewStatus: HumanReviewStatus
    decision: NextDecision
    notes?: string
  }): Promise<{
    projectId: string
    runId: string
    revision: number
    status: string
    humanReviewStatus: HumanReviewStatus
    nextDecision: NextDecision
    nextAction: string
    alreadyPersisted: boolean
  }> {
    const run = await this.requireRun(scope, input.runId)
    if (run.projectId !== input.projectId) throw new Error('RUN_PROJECT_MISMATCH')
    requireRevision(run.revision, input.baseRevision)
    validateApprovedReviewEvidence(run, input.humanReviewStatus)
    if (
      run.humanReviewStatus === input.humanReviewStatus &&
      run.nextDecision === input.decision &&
      (run.visualReview.notes ?? undefined) === (input.notes ?? undefined)
    ) {
      return {
        projectId: run.projectId,
        runId: run.id,
        revision: run.revision,
        status: run.status,
        humanReviewStatus: run.humanReviewStatus,
        nextDecision: run.nextDecision,
        nextAction: decisionToNextAction(run.nextDecision),
        alreadyPersisted: true
      }
    }
    validateReviewDecision(run, input.humanReviewStatus, input.decision)
    const browserGatePassed = run.renderReport?.status === 'succeeded' && run.renderReport.quality?.passed === true
    const completed =
      input.humanReviewStatus === 'approved' &&
      input.decision === 'stop' &&
      run.deterministicReview.status === 'passed' &&
      browserGatePassed
    const status = completed ? 'completed' : 'review_required'
    const update = await this.runs.update(
      scopedRevisionWhere(scope, run.id, input.baseRevision),
      {
        status,
        humanReviewStatus: input.humanReviewStatus,
        nextDecision: input.decision,
        visualReview: {
          ...run.visualReview,
          status: input.humanReviewStatus === 'approved' ? 'approved' : 'changes_requested',
          notes: input.notes
        }
      }
    )
    if (update.affected !== 1) throw revisionConflict()
    await this.updateProjectFromRun(scope, run.projectId, {
      status: completed ? 'completed' : 'review_required',
      humanReviewStatus: input.humanReviewStatus,
      nextDecision: input.decision,
      failureReasons: []
    })
    const updated = await this.requireRun(scope, run.id)
    return {
      projectId: run.projectId,
      runId: run.id,
      revision: updated.revision,
      status: updated.status,
      humanReviewStatus: updated.humanReviewStatus,
      nextDecision: updated.nextDecision,
      nextAction: decisionToNextAction(updated.nextDecision),
      alreadyPersisted: false
    }
  }

  async readArtifact(scope: Scope, projectId: string): Promise<{
    projectId: string
    codeVersionId: string | null
    codeSha256: string | null
    codeAuthorship: CodeVersionEntity['deterministicReview']['authorship'] | null
    sourcePreview: string | null
    sourceAsset: AssetSummary | null
    comparisonAsset: AssetSummary | null
    modelAsset: AssetSummary | null
    comparisonPreviewUrl: string | null
    modelPreviewUrl: string | null
    visualReview: PipelineRunEntity['visualReview'] | null
    renderReport: PipelineRunEntity['renderReport'] | null
    capabilities: {
      workspaceFiles: ReturnType<WorkspaceFilesAdapter['availability']>
      artifacts: ReturnType<ArtifactsAdapter['availability']>
      sandboxRender: Awaited<ReturnType<Img2ThreeJsRenderService['availability']>>
    }
  }> {
    const project = await this.requireProject(scope, projectId)
    const code = project.currentCodeVersionId
      ? await this.codes.findOne({ where: scopedIdWhere(scope, project.currentCodeVersionId) })
      : null
    const run = project.activeRunId ? await this.findRun(scope, project.activeRunId) : null
    return {
      projectId,
      codeVersionId: code?.id ?? null,
      codeSha256: code?.sha256 ?? null,
      codeAuthorship: code?.deterministicReview.authorship ?? null,
      sourcePreview: code?.sourcePreview ?? null,
      sourceAsset: summarizeAsset(code?.sourceAsset ?? null),
      comparisonAsset: summarizeAsset(run?.comparisonAsset ?? null),
      modelAsset: summarizeAsset(run?.visualReview?.modelAsset ?? null),
      comparisonPreviewUrl: run?.renderReport?.comparisonArtifactId && run.renderReport.comparisonArtifactVersionId
        ? await this.artifacts.createSignedPreview({
            artifactId: run.renderReport.comparisonArtifactId,
            artifactVersionId: run.renderReport.comparisonArtifactVersionId
          })
        : null,
      modelPreviewUrl: run?.renderReport?.modelArtifactId && run.renderReport.modelArtifactVersionId
        ? await this.artifacts.createSignedPreview({
            artifactId: run.renderReport.modelArtifactId,
            artifactVersionId: run.renderReport.modelArtifactVersionId
          })
        : null,
      visualReview: run?.visualReview ?? null,
      renderReport: run?.renderReport ?? null,
      capabilities: {
        workspaceFiles: this.workspaceFiles.availability(),
        artifacts: this.artifacts.availability(),
        sandboxRender: this.renderer
          ? await this.renderer.availability()
          : {
              available: false,
              code: 'runtime_unavailable',
              reason: 'Browser render coordinator is unavailable.'
            }
      }
    }
  }

  async exportArtifact(scope: Scope, projectId: string): Promise<{
    projectId: string
    status: 'artifact_published' | 'workspace_package_ready' | 'unavailable'
    codeVersionId: string | null
    sourceAsset: AssetSummary | null
    comparisonAsset: AssetSummary | null
    publishedArtifacts: Awaited<ReturnType<ArtifactsAdapter['publishModelArtifacts']>> | null
    artifactCapability: ReturnType<ArtifactsAdapter['availability']>
    nextAction: 'read_platform_artifact' | 'download_workspace_assets' | 'generate_model_first'
  }> {
    const project = await this.requireProject(scope, projectId)
    const code = project.currentCodeVersionId
      ? await this.codes.findOne({ where: scopedIdWhere(scope, project.currentCodeVersionId) })
      : null
    const run = project.activeRunId ? await this.findRun(scope, project.activeRunId) : null
    const sourceAsset = code?.sourceAsset ?? null
    const comparisonAsset = run?.comparisonAsset ?? null
    const capability = this.artifacts.availability()
    if (!code || !sourceAsset) {
      return {
        projectId,
        status: 'unavailable',
        codeVersionId: code?.id ?? null,
        sourceAsset: null,
        comparisonAsset: summarizeAsset(comparisonAsset),
        publishedArtifacts: null,
        artifactCapability: capability,
        nextAction: 'generate_model_first'
      }
    }
    if (!capability.available) {
      return {
        projectId,
        status: 'workspace_package_ready',
        codeVersionId: code.id,
        sourceAsset: summarizeAsset(sourceAsset),
        comparisonAsset: summarizeAsset(comparisonAsset),
        publishedArtifacts: null,
        artifactCapability: capability,
        nextAction: 'download_workspace_assets'
      }
    }
    const publishedArtifacts = await this.artifacts.publishModelArtifacts(scope, {
      projectId,
      projectName: project.name,
      sourceAsset,
      comparisonAsset
    })
    return {
      projectId,
      status: 'artifact_published',
      codeVersionId: code.id,
      sourceAsset: summarizeAsset(sourceAsset),
      comparisonAsset: summarizeAsset(comparisonAsset),
      publishedArtifacts,
      artifactCapability: capability,
      nextAction: 'read_platform_artifact'
    }
  }

  async cancelRun(scope: Scope, input: {
    projectId: string
    runId: string
    baseRevision: number
  }): Promise<{ projectId: string; runId: string; revision: number; status: 'cancelled' }> {
    const run = await this.requireRun(scope, input.runId)
    if (run.projectId !== input.projectId) throw new Error('RUN_PROJECT_MISMATCH')
    requireRevision(run.revision, input.baseRevision)
    if (run.queueJobId) await this.queue().cancel({ jobId: run.queueJobId })
    await this.renderer?.cancel(scope, run)
    const update = await this.runs.update(scopedRevisionWhere(scope, run.id, input.baseRevision), {
      status: 'cancelled',
      nextDecision: 'stop',
      failureReasons: ['cancelled_by_user'],
      renderReport: run.renderReport
        ? { ...run.renderReport, status: 'cancelled' }
        : null,
      visualReview: {
        ...run.visualReview,
        renderStatus: run.renderReport ? 'cancelled' : run.visualReview.renderStatus
      }
    })
    if (update.affected !== 1) throw revisionConflict()
    await this.updateProjectFromRun(scope, run.projectId, {
      status: 'cancelled',
      nextDecision: 'stop',
      failureReasons: ['cancelled_by_user'],
      cancelRequested: true
    })
    const updated = await this.requireRun(scope, run.id)
    return { projectId: run.projectId, runId: run.id, revision: updated.revision, status: 'cancelled' }
  }

  async retryRun(scope: Scope, input: {
    projectId: string
    runId: string
    baseRevision: number
  }): Promise<{
    projectId: string
    runId: string
    revision: number
    queueJobId: string
    stage: BuildStage | 'browser-render'
    status: 'queued'
  }> {
    const run = await this.requireRun(scope, input.runId)
    if (run.projectId !== input.projectId) throw new Error('RUN_PROJECT_MISMATCH')
    requireRevision(run.revision, input.baseRevision)
    if (run.renderReport?.status === 'failed' && runNextAction(run) !== 'retry_run') {
      throw new Error(
        'RUN_REQUIRES_CODE_REFINEMENT: call img2threejs_read_visual_diagnostics, author a new Workspace Files candidate, and submit it in refine mode.'
      )
    }
    const renderRetryable = Boolean(run.codeVersionId) &&
      run.deterministicReview.status === 'passed' &&
      run.renderReport?.status === 'failed' &&
      (
        run.renderReport.failure?.retryable === true ||
        isTransientWorkspaceInputVisibilityFailure(run.renderReport.failure)
      )
    if (renderRetryable && this.renderer) {
      const queued = await this.renderer.retry(scope, run)
      const updated = await this.requireRun(scope, run.id)
      return {
        projectId: run.projectId,
        runId: run.id,
        revision: updated.revision,
        queueJobId: queued.queueJobId,
        stage: 'browser-render',
        status: 'queued'
      }
    }
    if (!['failed', 'cancelled'].includes(run.status)) throw new Error('RUN_NOT_RETRYABLE')
    const failedStage = run.stageResults.find((item) => item.status === 'failed')?.stage
    const stage = failedStage ?? nextBuildStage(run.stageResults.filter((item) => item.status === 'passed'))
    if (!stage) throw new Error('PIPELINE_ALREADY_COMPLETE')
    const preserved = run.stageResults.filter((item) => item.stage !== stage)
    const queueResult = await this.queue().enqueue<QueueStagePayload>({
      pluginName: IMG2THREEJS_PLUGIN_NAME,
      queueName: IMG2THREEJS_QUEUE_NAME,
      jobName: IMG2THREEJS_STAGE_JOB_NAME,
      payload: { runId: run.id, requestedStage: stage },
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      scopeKey: this.pluginContext.scopeKey,
      userId: scope.userId,
      jobId: queueJobKey(run.id, stage, input.baseRevision),
      attempts: this.pluginContext.config.queueAttempts,
      backoffMs: { type: 'exponential', delay: this.pluginContext.config.queueBackoffMs }
    })
    const update = await this.runs.update(scopedRevisionWhere(scope, run.id, input.baseRevision), {
      status: 'queued',
      currentStage: stage,
      queueJobId: queueResult.jobId,
      stageResults: preserved,
      failureReasons: [],
      nextDecision: 'continue'
    })
    if (update.affected !== 1) {
      await this.queue().cancel({ jobId: queueResult.jobId })
      throw revisionConflict()
    }
    await this.updateProjectFromRun(scope, run.projectId, {
      status: 'queued',
      nextDecision: 'continue',
      failureReasons: [],
      cancelRequested: false
    })
    const updated = await this.requireRun(scope, run.id)
    return {
      projectId: run.projectId,
      runId: run.id,
      revision: updated.revision,
      queueJobId: queueResult.jobId,
      stage,
      status: 'queued'
    }
  }

  private async finalizeCodeAndEvidence(
    scope: Scope,
    run: PipelineRunEntity,
    specVersion: SculptSpecVersionEntity,
    stageResults: StageGateResult[]
  ): Promise<void> {
    let code: CodeVersionEntity
    let review: CodeVersionEntity['deterministicReview']
    let comparisonAsset: PipelineRunEntity['comparisonAsset'] = null
    const failures: string[] = []

    if (specVersion.spec.modelingMode === 'semantic-3d') {
      if (!run.codeVersionId) throw new Error('AGENT_AUTHORED_CODE_REQUIRED')
      code = await this.requireCode(scope, run.codeVersionId)
      if (
        code.specVersionId !== specVersion.id ||
        code.status !== 'passed' ||
        !['assistant-authored', 'assistant-refined'].includes(code.deterministicReview.authorship ?? '') ||
        !code.sourceAsset
      ) {
        throw new Error('AGENT_AUTHORED_CODE_REQUIRED')
      }
      const { buffer, asset } = await this.workspaceFiles.read(scope, code.sourceAsset.filePath)
      const checksum = createHash('sha256').update(buffer).digest('hex')
      if (asset.sha256 !== code.sha256 || checksum !== code.sha256) {
        throw new Error('CODE_SOURCE_CHECKSUM_MISMATCH: call img2threejs_inspect_code_file on the exact sourceFilePath after the final edit, then retry with its returned sha256')
      }
      review = deterministicReview(
        specVersion.spec,
        buffer.toString('utf8'),
        code.deterministicReview.authorship,
        code.deterministicReview.changeSummary
      )
      if (review.status !== 'passed') throw new Error('AGENT_AUTHORED_CODE_INVALID')
    } else {
      const source = generateThreeJsFactory(specVersion.spec)
      review = deterministicReview(specVersion.spec, source)
      const versionCount = await this.codes.count({ where: scopedProjectWhere(scope, run.projectId) })
      let sourceAsset: CodeVersionEntity['sourceAsset'] = null
      try {
        sourceAsset = await this.workspaceFiles.write(scope, {
          folder: `img2threejs/${run.projectId}/versions`,
          fileName: `model-v${versionCount + 1}.ts`,
          mimeType: 'text/typescript',
          buffer: Buffer.from(source, 'utf8')
        })
      } catch (error) {
        failures.push(error instanceof Error ? error.message.split(':')[0] : 'UNKNOWN_ERROR')
      }
      code = await this.codes.save(this.codes.create({
        ...scopeFields(scope),
        projectId: run.projectId,
        specVersionId: specVersion.id,
        version: versionCount + 1,
        sha256: review.codeSha256 ?? createHash('sha256').update(source).digest('hex'),
        sourceAsset,
        sourcePreview: source.slice(0, 4000),
        deterministicReview: review,
        status: review.status === 'passed' ? 'passed' : 'failed',
        failureReasons: review.checks.filter((item) => !item.passed).map((item) => item.code)
      }))
    }

    try {
      const comparisonSvg = createDeterministicComparisonSvg(specVersion.spec, review.score)
      comparisonAsset = await this.workspaceFiles.write(scope, {
        folder: `img2threejs/${run.projectId}/evidence`,
        fileName: `comparison-v${code.version}.svg`,
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(comparisonSvg, 'utf8')
      })
    } catch (error) {
      failures.push(error instanceof Error ? error.message.split(':')[0] : 'UNKNOWN_ERROR')
    }
    const status = review.status === 'passed' ? 'review_required' : 'failed'
    await this.runs.update(scopedRevisionWhere(scope, run.id, run.revision), {
      status,
      codeVersionId: code.id,
      stageResults,
      deterministicReview: review,
      visualReview: {
        status: comparisonAsset ? 'pending_human' : 'unavailable',
        evidenceKind: comparisonAsset ? 'deterministic_projection' : 'none',
        renderStatus: review.status === 'passed' ? 'not_requested' : 'unavailable',
        comparisonAsset: comparisonAsset ?? undefined,
        capabilityReason: review.status === 'passed' ? 'Browser render is pending capability admission.' : 'Deterministic code gate failed.'
      },
      comparisonAsset,
      confidence: averageStageScore(stageResults) * review.score,
      failureReasons: [...failures, ...code.failureReasons],
      nextDecision: review.status === 'passed' ? 'continue' : 'refine-code'
    })
    await this.updateProjectFromRun(scope, run.projectId, {
      status,
      currentCodeVersionId: code.id,
      confidence: averageStageScore(stageResults) * review.score,
      failureReasons: [...failures, ...code.failureReasons],
      nextDecision: review.status === 'passed' ? 'continue' : 'refine-code'
    })
    if (review.status === 'passed' && this.renderer) {
      await this.renderer.enqueueIfAvailable(scope, run.id)
    }
  }

  async processRender(
    job: import('@xpert-ai/plugin-sdk').ManagedQueueJob<QueueRenderPayload>,
    owner: { tenantId: string; organizationId: string | null; userId: string | null }
  ): Promise<void> {
    if (!this.renderer) throw new Error('SANDBOX_RENDER_COORDINATOR_UNAVAILABLE')
    await this.renderer.processRender(job, owner)
  }

  private async validateSpecDocument(
    scope: Scope,
    project: ModelProjectEntity,
    spec: SculptSpec
  ): Promise<{ valid: boolean; issues: Array<{ path: string; message: string }> }> {
    const parsed = SculptSpecSchema.safeParse(spec)
    const issues = parsed.success
      ? []
      : parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    if (spec.route !== project.route) {
      issues.push({ path: 'route', message: `Spec route '${spec.route}' does not match project route '${project.route}'.` })
    }
    if (spec.modelingMode !== project.modelingMode) {
      issues.push({
        path: 'modelingMode',
        message: `Spec modeling mode '${spec.modelingMode}' does not match project mode '${project.modelingMode}'.`
      })
    }
    const admitted = await this.images.find({
      where: { ...scopedProjectWhere(scope, project.id), admissionStatus: 'admitted' },
      select: { id: true }
    })
    const admittedIds = new Set(admitted.map((item) => item.id))
    if (parsed.success) {
      const outstandingReview = await this.outstandingReviewConstraints(scope, project)
      if (outstandingReview) {
        const requiredMinimum = minimumComponentCountFromReview(outstandingReview.notes)
        if (requiredMinimum !== null && parsed.data.qualityContract.minimumComponentCount < requiredMinimum) {
          issues.push({
            path: 'qualityContract.minimumComponentCount',
            message: `Outstanding human review requires minimumComponentCount >= ${requiredMinimum} runtime visible meshes; received ${parsed.data.qualityContract.minimumComponentCount}. Keep the Spec as a compact semantic blueprint and satisfy this count in Assistant-authored TypeScript; human review constraints cannot be lowered.`
          })
        }
        for (const key of VISUAL_QUALITY_FLOOR_KEYS) {
          const previous = outstandingReview.spec.qualityContract[key]
          const proposed = parsed.data.qualityContract[key]
          if (proposed < previous) {
            issues.push({
              path: `qualityContract.${key}`,
              message: `Outstanding human review forbids lowering ${key}: previous ${previous}, received ${proposed}.`
            })
          }
        }
        const proposedTargets = new Map(parsed.data.featureReviewTargets.map((target) => [target.id, target]))
        for (const previous of outstandingReview.spec.featureReviewTargets) {
          const proposed = proposedTargets.get(previous.id)
          if (!proposed) {
            issues.push({
              path: 'featureReviewTargets',
              message: `Outstanding human review target '${previous.id}' must be preserved until it passes.`
            })
            continue
          }
          if (proposed.threshold < previous.threshold) {
            issues.push({
              path: `featureReviewTargets.${previous.id}.threshold`,
              message: `Outstanding human review forbids lowering target '${previous.id}' from ${previous.threshold} to ${proposed.threshold}.`
            })
          }
          if (previous.criticality === 'critical' && proposed.criticality !== 'critical') {
            issues.push({
              path: `featureReviewTargets.${previous.id}.criticality`,
              message: `Outstanding critical target '${previous.id}' cannot be downgraded.`
            })
          }
        }
      }
      const cited = [
        parsed.data.referenceCamera.evidenceId,
        ...parsed.data.components.flatMap((item) => item.evidenceIds),
        ...parsed.data.proportions.flatMap((item) => item.evidenceIds),
        ...parsed.data.details.flatMap((item) => item.evidenceIds),
        ...parsed.data.featureReviewTargets.map((item) => item.evidenceId)
      ]
      for (const evidenceId of cited) {
        if (!admittedIds.has(evidenceId)) {
          issues.push({ path: 'evidenceIds', message: `Evidence '${evidenceId}' is missing, rejected, or outside scope.` })
        }
      }
      const coverage = cited.length === 0 ? 0 : new Set(cited).size / Math.max(admittedIds.size, 1)
      if (coverage < parsed.data.qualityContract.minimumEvidenceCoverage) {
        issues.push({
          path: 'qualityContract.minimumEvidenceCoverage',
          message: `Evidence coverage ${coverage.toFixed(3)} is below ${parsed.data.qualityContract.minimumEvidenceCoverage}.`
        })
      }
    }
    return { valid: issues.length === 0, issues }
  }

  private async outstandingReviewConstraints(
    scope: Scope,
    project: ModelProjectEntity
  ): Promise<{ notes: string; spec: SculptSpec } | null> {
    if (!project.activeRunId) return null
    const run = await this.findRun(scope, project.activeRunId)
    if (!run || run.status !== 'review_required' || run.humanReviewStatus !== 'changes_requested' ||
      run.nextDecision !== 'refine-spec') return null
    const notes = run.visualReview.notes?.trim()
    if (!notes) return null
    const spec = await this.specs.findOne({ where: scopedIdWhere(scope, run.specVersionId) })
    return spec ? { notes, spec: spec.spec } : null
  }

  private queue(): ManagedQueueService {
    if (!this.managedQueue) {
      this.managedQueue = this.pluginContext.resolve(MANAGED_QUEUE_SERVICE_TOKEN)
    }
    return this.managedQueue
  }

  private async requireProject(scope: Scope, id: string): Promise<ModelProjectEntity> {
    const entity = await this.projects.findOne({ where: scopedIdWhere(scope, id) })
    if (!entity) throw new Error('PROJECT_NOT_FOUND')
    return entity
  }

  private async requireSpec(scope: Scope, id: string): Promise<SculptSpecVersionEntity> {
    const entity = await this.specs.findOne({ where: scopedIdWhere(scope, id) })
    if (!entity) throw new Error('SCULPT_SPEC_NOT_FOUND')
    return entity
  }

  private async requireCode(scope: Scope, id: string): Promise<CodeVersionEntity> {
    const entity = await this.codes.findOne({ where: scopedIdWhere(scope, id) })
    if (!entity) throw new Error('CODE_VERSION_NOT_FOUND')
    return entity
  }

  private async currentCodeDiagnosticReview(
    scope: Scope,
    code: CodeVersionEntity
  ): Promise<DeterministicReview> {
    if (!code.sourceAsset) return code.deterministicReview
    try {
      const spec = await this.requireSpec(scope, code.specVersionId)
      const { buffer, asset } = await this.workspaceFiles.read(scope, code.sourceAsset.filePath)
      const checksum = createHash('sha256').update(buffer).digest('hex')
      if (asset.sha256 !== code.sha256 || checksum !== code.sha256) return code.deterministicReview
      return deterministicReview(
        spec.spec,
        buffer.toString('utf8'),
        code.deterministicReview.authorship,
        code.deterministicReview.changeSummary
      )
    } catch {
      // Status remains available even if its immutable source asset is temporarily
      // unavailable; the persisted review is still the authoritative fallback.
      return code.deterministicReview
    }
  }

  async hasCurrentAssistantCode(
    scope: Scope,
    project: ModelProjectEntity,
    spec?: SculptSpecVersionEntity
  ): Promise<boolean> {
    const currentSpec = spec ?? (project.currentSpecVersionId
      ? await this.specs.findOne({ where: scopedIdWhere(scope, project.currentSpecVersionId) })
      : null)
    const code = project.currentCodeVersionId
      ? await this.codes.findOne({ where: scopedIdWhere(scope, project.currentCodeVersionId) })
      : null
    return Boolean(
      currentSpec &&
      code &&
      code.specVersionId === currentSpec.id &&
      code.status === 'passed' &&
      ['assistant-authored', 'assistant-refined'].includes(code.deterministicReview.authorship ?? '')
    )
  }

  private async findRun(scope: Scope, id: string): Promise<PipelineRunEntity | null> {
    return this.runs.findOne({ where: scopedIdWhere(scope, id) })
  }

  private async requireRun(scope: Scope, id: string): Promise<PipelineRunEntity> {
    const entity = await this.findRun(scope, id)
    if (!entity) throw new Error('PIPELINE_RUN_NOT_FOUND')
    return entity
  }

  private async recordRenderQueueFailure(
    scope: Scope,
    run: PipelineRunEntity,
    failedReason: string
  ): Promise<PipelineRunEntity> {
    const message = failedReason.replace(/\s+/gu, ' ').trim().slice(0, 500) ||
      'Managed browser-render queue job failed.'
    const failureReasons = [...new Set([...run.failureReasons, 'browser_render_failed'])]
    const updated = await this.runs.update(scopedRevisionWhere(scope, run.id, run.revision), {
      status: 'failed',
      renderReport: {
        ...(run.renderReport ?? {
          action: IMG2THREEJS_SANDBOX_ACTION,
          actionVersion: IMG2THREEJS_SANDBOX_ACTION_VERSION
        }),
        status: 'failed',
        failure: {
          code: 'MANAGED_QUEUE_JOB_FAILED',
          message,
          retryable: true
        }
      },
      visualReview: {
        ...run.visualReview,
        status: 'pending_human',
        renderStatus: 'failed',
        capabilityReason: message,
        notes: undefined
      },
      humanReviewStatus: 'pending',
      nextDecision: 'continue',
      failureReasons
    })
    if (updated.affected === 1) {
      await this.updateProjectFromRun(scope, run.projectId, {
        status: 'failed',
        humanReviewStatus: 'pending',
        nextDecision: 'continue',
        failureReasons
      })
    }
    return await this.findRun(scope, run.id) ?? run
  }

  private async updateProjectFromRun(
    scope: Scope,
    projectId: string,
    patch: Partial<Pick<
      ModelProjectEntity,
      'status' | 'nextDecision' | 'humanReviewStatus' | 'confidence' | 'failureReasons' | 'currentCodeVersionId' | 'cancelRequested'
    >>
  ): Promise<void> {
    const project = await this.requireProject(scope, projectId)
    const result = await this.projects.update(scopedRevisionWhere(scope, project.id, project.revision), patch)
    if (result.affected !== 1) throw revisionConflict()
  }
}

function viewpointConfidence(view: ImageEvidenceEntity['view']): number {
  if (view === 'unknown') return 0.35
  if (view === 'detail') return 0.7
  return 0.9
}

function failedDeterministicChecks(review: DeterministicReview): Array<{ code: string; detail: string }> {
  return review.checks
    .filter((item) => !item.passed)
    .map(({ code, detail }) => ({ code, detail }))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function minimumComponentCountFromReview(notes: string): number | null {
  const patterns = [
    /minimumComponentCount[^\d]{0,32}(\d+)/giu,
    /至少\s*(\d+)\s*个(?:可见体块|可审计(?:部件|组件)|部件|组件)/gu,
    /(?:at\s+least|minimum(?:\s+of)?)\s*(\d+)\s*(?:visible\s+|auditable\s+)?(?:components?|parts?|blocks?)/giu
  ]
  const values: number[] = []
  for (const pattern of patterns) {
    for (const match of notes.matchAll(pattern)) {
      const value = Number(match[1])
      if (Number.isSafeInteger(value) && value > 0 && value <= 250) values.push(value)
    }
  }
  return values.length > 0 ? Math.max(...values) : null
}
