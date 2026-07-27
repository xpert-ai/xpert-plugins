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
  IMG2THREEJS_STAGE_JOB_NAME
} from './constants.js'
import { createServerDebugLogger } from './debug-logger.js'
import {
  assertStageMayRun,
  deterministicReview,
  evaluateStage,
  nextBuildStage,
  queueJobKey
} from './domain/pipeline.js'
import { SculptSpecSchema, type SculptSpec } from './domain/sculpt-spec.schema.js'
import { createDeterministicComparisonSvg, generateThreeJsFactory } from './domain/threejs-generator.js'
import type {
  BuildStage,
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
  mergeStageResult,
  normalizeImageMime,
  readImageDimensions,
  requireRevision,
  revisionConflict,
  runCursor,
  scopeFields,
  scopedIdWhere,
  scopedProjectWhere,
  scopedRevisionWhere,
  sha256Json,
  statusDto,
  summarizeAsset,
  validateReviewDecision,
  type AssetSummary,
  type RunStatusDto
} from './img2threejs.service-support.js'

const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const WAIT_DEADLINE_MS = 45_000
const WAIT_INTERVAL_MS = 2_000

export type SubmitImageInput = {
  filePath: string
  label: string
  view: ImageEvidenceEntity['view']
}

export type QueueStagePayload = {
  runId: string
  requestedStage: BuildStage
  sourceRevision: number
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
      const mimeType = normalizeImageMime(asset.mimeType, item.filePath)
      const failures: string[] = []
      if (!ACCEPTED_IMAGE_TYPES.has(mimeType)) failures.push('unsupported_image_type')
      if (buffer.length === 0) failures.push('empty_image')
      if (buffer.length > this.pluginContext.config.maximumImageBytes) failures.push('image_too_large')
      const dimensions = readImageDimensions(buffer, mimeType)
      if (!dimensions) failures.push('unreadable_image_dimensions')
      const admitted = failures.length === 0
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
        admissionStatus: admitted ? 'admitted' : 'rejected',
        observations: [
          {
            id: `evidence_${asset.sha256.slice(0, 12)}`,
            kind: 'uncertainty',
            description: `Deterministic evidence only: declared view=${item.view}, sha256=${asset.sha256.slice(0, 16)}, dimensions=${dimensions ? `${dimensions.width}x${dimensions.height}` : 'unknown'}. Semantic visual interpretation is not inferred by intake.`,
            confidence: admitted ? 1 : 0
          }
        ],
        confidence: admitted ? 1 : 0,
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
      nextAction: validation.valid ? 'validate_spec' : 'refine_spec'
    }
  }

  async validateCurrentSpec(scope: Scope, projectId: string, expectedRevision?: number): Promise<{
    projectId: string
    revision: number
    specVersionId: string | null
    valid: boolean
    issues: Array<{ path: string; message: string }>
    nextAction: 'enqueue_stage' | 'refine_spec'
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
        nextAction: 'refine_spec'
      }
    }
    const version = await this.requireSpec(scope, project.currentSpecVersionId)
    const validation = await this.validateSpecDocument(scope, project, version.spec)
    return {
      projectId,
      revision: project.revision,
      specVersionId: version.id,
      valid: validation.valid,
      issues: validation.issues.slice(0, 50),
      nextAction: validation.valid ? 'enqueue_stage' : 'refine_spec'
    }
  }

  async readCurrentSpec(scope: Scope, projectId: string, expectedRevision?: number): Promise<{
    projectId: string
    revision: number
    specVersionId: string
    specVersion: number
    checksum: string
    spec: SculptSpec
  }> {
    const project = await this.requireProject(scope, projectId)
    if (expectedRevision !== undefined) requireRevision(project.revision, expectedRevision)
    if (!project.currentSpecVersionId) throw new Error('SCULPT_SPEC_NOT_FOUND')
    const version = await this.requireSpec(scope, project.currentSpecVersionId)
    return {
      projectId,
      revision: project.revision,
      specVersionId: version.id,
      specVersion: version.version,
      checksum: version.checksum,
      spec: version.spec
    }
  }

  async refineCode(scope: Scope, input: {
    projectId: string
    codeVersionId: string
    baseRevision: number
    sourceFilePath: string
    expectedSourceSha256: string
  }): Promise<{
    projectId: string
    codeVersionId: string
    codeVersion: number
    revision: number
    deterministicStatus: 'passed' | 'failed'
    deterministicScore: number
    failureCodes: string[]
    nextAction: 'submit_review' | 'refine_code'
  }> {
    const project = await this.requireProject(scope, input.projectId)
    requireRevision(project.revision, input.baseRevision)
    if (project.currentCodeVersionId !== input.codeVersionId) throw new Error('STALE_CODE_VERSION')
    if (!project.currentSpecVersionId) throw new Error('SCULPT_SPEC_NOT_FOUND')
    const spec = await this.requireSpec(scope, project.currentSpecVersionId)
    const { buffer, asset } = await this.workspaceFiles.read(scope, input.sourceFilePath)
    if (buffer.length > 1_000_000) throw new Error('REFINED_CODE_TOO_LARGE')
    if (asset.sha256 !== input.expectedSourceSha256) throw new Error('SOURCE_CHECKSUM_MISMATCH')
    const source = buffer.toString('utf8')
    const review = deterministicReview(spec.spec, source)
    const failureCodes = review.checks.filter((item) => !item.passed).map((item) => item.code)
    const status = review.status === 'passed' ? 'review_required' : 'failed'
    const activeRun = project.activeRunId ? await this.requireRun(scope, project.activeRunId) : null
    const code = await this.projects.manager.transaction(async (manager) => {
      const codeRepository = manager.getRepository(CodeVersionEntity)
      const projectRepository = manager.getRepository(ModelProjectEntity)
      const runRepository = manager.getRepository(PipelineRunEntity)
      const count = await codeRepository.count({ where: scopedProjectWhere(scope, project.id) })
      const persisted = await codeRepository.save(codeRepository.create({
        ...scopeFields(scope),
        projectId: project.id,
        specVersionId: spec.id,
        version: count + 1,
        sha256: asset.sha256,
        sourceAsset: asset,
        sourcePreview: source.slice(0, 4000),
        deterministicReview: review,
        status: review.status === 'passed' ? 'passed' : 'failed',
        failureReasons: failureCodes
      }))
      const projectUpdate = await projectRepository.update(
        scopedRevisionWhere(scope, project.id, input.baseRevision),
        {
          currentCodeVersionId: persisted.id,
          status,
          nextDecision: review.status === 'passed' ? 'continue' : 'refine-code',
          failureReasons: failureCodes,
          confidence: review.score
        }
      )
      if (projectUpdate.affected !== 1) throw revisionConflict()
      if (activeRun) {
        const runUpdate = await runRepository.update(
          scopedRevisionWhere(scope, activeRun.id, activeRun.revision),
          {
            codeVersionId: persisted.id,
            deterministicReview: review,
            status,
            nextDecision: review.status === 'passed' ? 'continue' : 'refine-code',
            failureReasons: failureCodes,
            confidence: review.score
          }
        )
        if (runUpdate.affected !== 1) throw revisionConflict()
      }
      return persisted
    })
    const updated = await this.requireProject(scope, project.id)
    return {
      projectId: project.id,
      codeVersionId: code.id,
      codeVersion: code.version,
      revision: updated.revision,
      deterministicStatus: code.status,
      deterministicScore: review.score,
      failureCodes,
      nextAction: review.status === 'passed' ? 'submit_review' : 'refine_code'
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
        codeVersionId: null,
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
        requestedStage: input.stage,
        sourceRevision: run.revision
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
    if (run.revision !== payload.sourceRevision + 1 && run.revision !== payload.sourceRevision) {
      throw new Error('STALE_QUEUE_PAYLOAD')
    }
    assertStageMayRun(payload.requestedStage, run.stageResults)
    const specVersion = await this.requireSpec(resourceScope, run.specVersionId)
    await this.runs.update(scopedRevisionWhere(resourceScope, run.id, run.revision), {
      status: 'running',
      currentStage: payload.requestedStage
    })
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
          requestedStage: nextStage,
          sourceRevision: nextSourceRevision
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

  async getStatus(scope: Scope, projectId: string): Promise<RunStatusDto> {
    const project = await this.requireProject(scope, projectId)
    const run = project.activeRunId ? await this.findRun(scope, project.activeRunId) : null
    return statusDto(project, run)
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
    const browserGatePassed = run.renderReport?.status !== 'succeeded' || run.renderReport.quality?.passed === true
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
    sourcePreview: string | null
    sourceAsset: AssetSummary | null
    comparisonAsset: AssetSummary | null
    comparisonPreviewUrl: string | null
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
      sourcePreview: code?.sourcePreview ?? null,
      sourceAsset: summarizeAsset(code?.sourceAsset ?? null),
      comparisonAsset: summarizeAsset(run?.comparisonAsset ?? null),
      comparisonPreviewUrl: run?.renderReport?.comparisonArtifactId && run.renderReport.comparisonArtifactVersionId
        ? await this.artifacts.createSignedPreview({
            artifactId: run.renderReport.comparisonArtifactId,
            artifactVersionId: run.renderReport.comparisonArtifactVersionId
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
    const renderRetryable = run.stageResults.length === 8 &&
      run.renderReport?.status === 'failed' &&
      run.renderReport.failure?.retryable === true
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
      payload: { runId: run.id, requestedStage: stage, sourceRevision: input.baseRevision },
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
    const source = generateThreeJsFactory(specVersion.spec)
    const review = deterministicReview(specVersion.spec, source)
    const versionCount = await this.codes.count({ where: scopedProjectWhere(scope, run.projectId) })
    const sourcePreview = source.slice(0, 4000)
    let sourceAsset: CodeVersionEntity['sourceAsset'] = null
    let comparisonAsset: PipelineRunEntity['comparisonAsset'] = null
    const failures: string[] = []
    try {
      sourceAsset = await this.workspaceFiles.write(scope, {
        folder: `img2threejs/${run.projectId}/versions`,
        fileName: `model-v${versionCount + 1}.ts`,
        mimeType: 'text/typescript',
        buffer: Buffer.from(source, 'utf8')
      })
      const comparisonSvg = createDeterministicComparisonSvg(specVersion.spec, review.score)
      comparisonAsset = await this.workspaceFiles.write(scope, {
        folder: `img2threejs/${run.projectId}/evidence`,
        fileName: `comparison-v${versionCount + 1}.svg`,
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(comparisonSvg, 'utf8')
      })
    } catch (error) {
      failures.push(error instanceof Error ? error.message.split(':')[0] : 'UNKNOWN_ERROR')
    }
    const code = await this.codes.save(this.codes.create({
      ...scopeFields(scope),
      projectId: run.projectId,
      specVersionId: specVersion.id,
      version: versionCount + 1,
      sha256: review.codeSha256 ?? createHash('sha256').update(source).digest('hex'),
      sourceAsset,
      sourcePreview,
      deterministicReview: review,
      status: review.status === 'passed' ? 'passed' : 'failed',
      failureReasons: review.checks.filter((item) => !item.passed).map((item) => item.code)
    }))
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

  private async findRun(scope: Scope, id: string): Promise<PipelineRunEntity | null> {
    return this.runs.findOne({ where: scopedIdWhere(scope, id) })
  }

  private async requireRun(scope: Scope, id: string): Promise<PipelineRunEntity> {
    const entity = await this.findRun(scope, id)
    if (!entity) throw new Error('PIPELINE_RUN_NOT_FOUND')
    return entity
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
