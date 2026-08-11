import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  ArtifactsRuntimeCapability,
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  isSandboxJobRuntimeError,
  type ManagedQueueJob,
  type ManagedQueueService,
  type PluginContext,
  type RuntimeCapabilityRegistry,
  type SandboxJobOutput,
  type SandboxJobsApi
} from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import {
  IMG2THREEJS_PLUGIN_NAME,
  IMG2THREEJS_QUEUE_NAME,
  IMG2THREEJS_RENDER_JOB_NAME,
  IMG2THREEJS_SANDBOX_ACTION,
  IMG2THREEJS_SANDBOX_ACTION_VERSION
} from './constants.js'
import type { BrowserRenderReport, CapabilityAvailability, Scope, WorkspaceAssetReference } from './domain/types.js'
import { SandboxRenderReportSchema } from './domain/render-report.schema.js'
import type { SculptSpec } from './domain/sculpt-spec.schema.js'
import {
  CodeVersionEntity,
  ImageEvidenceEntity,
  ModelProjectEntity,
  PipelineRunEntity,
  SculptSpecVersionEntity
} from './entities/index.js'
import type { Img2ThreeJsConfig } from './img2threejs.config.js'
import {
  isTransientWorkspaceInputVisibilityFailure,
  scopedIdWhere,
  scopedProjectWhere,
  scopedRevisionWhere
} from './img2threejs.service-support.js'
import { deriveRenderGateOutcome } from './domain/review-routing.js'
import { resolveWorkspaceScope, toPortableReference } from './platform/capability-adapters.js'
import { IMG2THREEJS_PLUGIN_CONTEXT } from './tokens.js'

export type QueueRenderPayload = { runId: string }

@Injectable()
export class Img2ThreeJsRenderService {
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
    private readonly capabilities?: RuntimeCapabilityRegistry
  ) {}

  async availability(): Promise<CapabilityAvailability> {
    const jobs = this.sandboxJobs(false)
    if (!jobs) return unavailable('runtime_unavailable', 'The platform Sandbox Jobs runtime capability is not registered.')
    if (!this.capabilities?.get(WorkspaceFilesRuntimeCapability)) {
      return unavailable('runtime_unavailable', 'The platform Workspace Files runtime capability is not registered.')
    }
    const action = await jobs.getActionHealth({
      pluginName: IMG2THREEJS_PLUGIN_NAME,
      action: IMG2THREEJS_SANDBOX_ACTION,
      actionVersion: IMG2THREEJS_SANDBOX_ACTION_VERSION
    }).catch((error) => ({
      available: false as const,
      reason: 'PROFILE_UNHEALTHY' as const,
      message: errorMessage(error)
    }))
    if (!action.available) {
      return unavailable(
        action.reason === 'ACTION_MISSING' || action.reason === 'ACTION_INVALID' ? 'action_unavailable' : 'runtime_unavailable',
        action.message ?? `Sandbox Action health failed: ${action.reason ?? 'unknown'}.`
      )
    }
    let queue: ManagedQueueService
    try {
      queue = this.queue()
    } catch (error) {
      return unavailable('worker_unavailable', errorMessage(error))
    }
    const pool = await queue.getExecutionPoolHealth({ executionPool: 'sandbox-browser' }).catch((error) => ({
      available: false,
      workerCount: 0,
      warning: errorMessage(error)
    }))
    if (!pool.available) return unavailable('worker_unavailable', pool.warning ?? 'No sandbox-browser worker is available.')
    return {
      available: true,
      code: 'available',
      action: IMG2THREEJS_SANDBOX_ACTION,
      actionVersion: IMG2THREEJS_SANDBOX_ACTION_VERSION,
      runtimeProfile: action.runtimeProfile ?? null,
      workerCount: pool.workerCount
    }
  }

  async enqueueIfAvailable(scope: Scope, runId: string): Promise<CapabilityAvailability> {
    const capability = await this.availability()
    const run = await this.requireRun(scope, runId)
    if (!capability.available) {
      await this.runs.update(scopedRevisionWhere(scope, run.id, run.revision), {
        renderReport: {
          status: 'unavailable',
          action: IMG2THREEJS_SANDBOX_ACTION,
          actionVersion: IMG2THREEJS_SANDBOX_ACTION_VERSION,
          failure: { code: capability.code, message: capability.reason ?? 'Browser render unavailable.', retryable: false }
        },
        visualReview: {
          ...run.visualReview,
          renderStatus: 'unavailable',
          capabilityReason: capability.reason
        }
      })
      return capability
    }
    const queueJobId = renderQueueJobKey(run.id, run.revision)
    const queued = await this.queue().enqueue<QueueRenderPayload>({
      pluginName: IMG2THREEJS_PLUGIN_NAME,
      queueName: IMG2THREEJS_QUEUE_NAME,
      jobName: IMG2THREEJS_RENDER_JOB_NAME,
      payload: { runId: run.id },
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      scopeKey: this.pluginContext.scopeKey,
      userId: scope.userId,
      jobId: queueJobId,
      attempts: this.pluginContext.config.queueAttempts,
      backoffMs: { type: 'exponential', delay: this.pluginContext.config.queueBackoffMs },
      executionPool: 'sandbox-browser',
      removeOnComplete: { age: 86_400, count: 100 },
      removeOnFail: { age: 604_800, count: 100 }
    })
    const update = await this.runs.update(scopedRevisionWhere(scope, run.id, run.revision), {
      status: 'queued',
      renderQueueJobId: queued.jobId,
      renderReport: {
        status: 'queued',
        action: IMG2THREEJS_SANDBOX_ACTION,
        actionVersion: IMG2THREEJS_SANDBOX_ACTION_VERSION,
        runtimeProfile: capability.runtimeProfile
      },
      visualReview: {
        ...run.visualReview,
        status: 'pending_human',
        renderStatus: 'queued',
        capabilityReason: undefined,
        notes: undefined
      },
      humanReviewStatus: 'pending'
    })
    if (update.affected !== 1) {
      await this.queue().cancel({ jobId: queued.jobId, executionPool: 'sandbox-browser' })
      throw new Error('REVISION_CONFLICT')
    }
    await this.updateProjectStatus(scope, run.projectId, 'building')
    return capability
  }

  async processRender(job: ManagedQueueJob<QueueRenderPayload>, owner: {
    tenantId: string
    organizationId: string | null
    userId: string | null
  }): Promise<void> {
    const scope: Scope = {
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      userId: owner.userId ?? '',
      workspaceId: null,
      projectId: null,
      xpertId: null
    }
    let run = await this.requireRun(scope, job.data.runId)
    if (run.status === 'cancelled' || run.renderReport?.status === 'succeeded') return
    const previousReport = run.renderReport
    const resourceScope = scopeFromRun(run)
    const code = run.codeVersionId
      ? await this.codes.findOne({ where: scopedIdWhere(resourceScope, run.codeVersionId) })
      : null
    const spec = await this.specs.findOne({ where: scopedIdWhere(resourceScope, run.specVersionId) })
    if (!code?.sourceAsset || !spec) throw new Error('EXPORT_INPUT_INVALID: durable code and Sculpt Spec are required.')
    const references = await this.images.find({
      where: { ...scopedProjectWhere<ImageEvidenceEntity>(resourceScope, run.projectId), admissionStatus: 'admitted' },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 20
    })
    if (!references.length) throw new Error('EXPORT_INPUT_INVALID: admitted image evidence is required.')
    const referenceReview = resolveReferenceReviewContract(spec.spec, references)

    await this.runs.update(scopedRevisionWhere(resourceScope, run.id, run.revision), {
      status: 'running',
      sandboxJobId: run.id,
      renderReport: {
        status: 'running',
        action: IMG2THREEJS_SANDBOX_ACTION,
        actionVersion: IMG2THREEJS_SANDBOX_ACTION_VERSION
      },
      visualReview: { ...run.visualReview, renderStatus: 'running' }
    })
    run = await this.requireRun(resourceScope, run.id)
    const views = [...new Set(spec.spec.qualityContract.requiredViews)]
    const destination = { ...resolveWorkspaceScope(resourceScope), folder: `img2threejs/${run.projectId}/browser-evidence` }
    const referenceDescriptors = references.map((reference, index) => ({
      evidenceId: reference.id,
      label: reference.label,
      view: reference.view,
      mimeType: reference.mimeType,
      path: `references/${String(index + 1).padStart(2, '0')}-${safeExtension(reference.mimeType)}`
    }))
    try {
      const result = await this.sandboxJobs().run({
        jobId: run.id,
        action: IMG2THREEJS_SANDBOX_ACTION,
        actionVersion: IMG2THREEJS_SANDBOX_ACTION_VERSION,
        idempotencyKey: `img2threejs:${run.id}:${code.sha256}:${views.join(',')}`,
        scope: {
          tenantId: run.tenantId,
          organizationId: run.organizationId,
          userId: run.createdById,
          pluginName: IMG2THREEJS_PLUGIN_NAME,
          businessResourceType: 'model-review-render',
          businessResourceId: run.id
        },
        payload: {
          projectName: spec.spec.projectName,
          codeSha256: code.sha256,
          views,
          references: referenceDescriptors,
          referenceCamera: referenceReview.referenceCamera,
          featureReviewTargets: referenceReview.featureReviewTargets,
          quality: {
            maximumTriangles: spec.spec.qualityContract.maximumTriangles,
            maximumDrawCalls: spec.spec.qualityContract.maximumDrawCalls,
            minimumRuntimeMeshCount: spec.spec.modelingMode === 'semantic-3d'
              ? spec.spec.qualityContract.minimumComponentCount
              : 1,
            minimumSilhouetteIoU: spec.spec.qualityContract.minimumSilhouetteIoU ?? 0.3,
            minimumScaleScore: spec.spec.qualityContract.minimumScaleScore ?? 0.7,
            minimumEdgeScore: spec.spec.qualityContract.minimumEdgeScore ?? 0.15,
            minimumPerceptualScore: spec.spec.qualityContract.minimumPerceptualScore ?? 0.1,
            minimumReferenceMaskConfidence: spec.spec.qualityContract.minimumReferenceMaskConfidence ?? 0.25,
            minimumMultiAngleSilhouetteRetention:
              spec.spec.qualityContract.minimumMultiAngleSilhouetteRetention ?? 0.1,
            minimumVolumeAxisRatio: spec.spec.qualityContract.minimumVolumeAxisRatio ?? 0.015
          }
        },
        files: [
          {
            reference: toPortableReference(code.sourceAsset),
            targetPath: 'model/model.ts',
            size: code.sourceAsset.size,
            sha256: code.sourceAsset.sha256
          },
          ...references.map((reference, index) => ({
            reference: toPortableReference(reference.asset),
            targetPath: referenceDescriptors[index].path,
            size: reference.asset.size,
            sha256: reference.asset.sha256
          }))
        ],
        outputs: [
          ...views.map((view) => ({
            path: `render-${view}.png`,
            originalName: `render-${view}.png`,
            mimeType: 'image/png',
            destination
          })),
          { path: 'model.glb', originalName: 'model.glb', mimeType: 'model/gltf-binary', destination },
          { path: 'comparison.png', originalName: 'comparison-browser.png', mimeType: 'image/png', destination },
          {
            path: 'render-report.json',
            originalName: 'render-report.json',
            mimeType: 'application/json',
            destination: { ...destination, folder: `${destination.folder}/reports` }
          }
        ],
        timeoutMs: 5 * 60_000
      })
      const modelOutput = result.outputs.find((output) => output.path === 'model.glb')
      const comparison = result.outputs.find((output) => output.path === 'comparison.png')
      const reportOutput = result.outputs.find((output) => output.path === 'render-report.json')
      if (!modelOutput || !comparison || !reportOutput) throw new Error('EXPORT_OUTPUT_INVALID: browser model, comparison, or report is missing.')
      const workspace = this.capabilities?.get(WorkspaceFilesRuntimeCapability)
      if (!workspace) throw new Error('WORKSPACE_FILES_UNAVAILABLE')
      const reportFile = await workspace.readBuffer(reportOutput.reference)
      const parsedReport = parseReport(reportFile.buffer)
      const gate = deriveRenderGateOutcome(
        parsedReport.quality,
        spec.spec.qualityContract.maximumCorrectionIterations ?? 4,
        previousReport
      )
      const passed = gate.passed
      const modelAsset = outputAsset(modelOutput, resourceScope)
      const browserAsset = outputAsset(comparison, resourceScope)
      const [modelArtifact, previewArtifact] = await Promise.all([
        this.publishBrowserModel(resourceScope, run, modelOutput),
        this.publishBrowserComparison(resourceScope, run, comparison)
      ])
      const current = await this.requireRun(resourceScope, run.id)
      const report: BrowserRenderReport = {
        status: 'succeeded',
        action: IMG2THREEJS_SANDBOX_ACTION,
        actionVersion: IMG2THREEJS_SANDBOX_ACTION_VERSION,
        runtimeProfile: result.runtimeProfile,
        sandboxRuntimeVersion: result.sandboxRuntimeVersion,
        attempt: result.attempt,
        ...(previewArtifact
          ? {
              comparisonArtifactId: previewArtifact.artifactId,
              comparisonArtifactVersionId: previewArtifact.versionId
            }
          : {}),
        ...(modelArtifact
          ? {
              modelArtifactId: modelArtifact.artifactId,
              modelArtifactVersionId: modelArtifact.versionId
            }
          : {}),
        outputs: result.outputs.map((output) => ({
          path: output.path,
          name: output.originalName,
          mimeType: output.mimeType,
          size: output.size,
          sha256: output.sha256,
          filePath: output.reference.filePath
        })),
        quality: parsedReport.quality,
        correction: gate.correction
      }
      await this.runs.update(scopedRevisionWhere(resourceScope, current.id, current.revision), {
        status: 'review_required',
        humanReviewStatus: 'pending',
        sandboxJobId: result.id,
        renderReport: report,
        comparisonAsset: browserAsset,
        visualReview: {
          status: passed ? 'pending_human' : 'changes_requested',
          evidenceKind: 'browser_render',
          renderStatus: 'succeeded',
          comparisonAsset: browserAsset,
          modelAsset,
          capabilityReason: passed
            ? undefined
            : `Reference fidelity gate failed: ${gate.failureCodes.join(', ')}.`
        },
        nextDecision: gate.nextDecision,
        failureReasons: passed
          ? current.failureReasons.filter((reason) => !reason.startsWith('browser_'))
          : [...new Set([...current.failureReasons, ...gate.failureCodes.map((code) => `browser_${code}`)])]
      })
      await this.updateProjectStatus(resourceScope, run.projectId, 'review_required', gate.nextDecision)
    } catch (error) {
      const attempts = readAttempts(job)
      const attempt = job.attemptsMade + 1
      const retryable = isSandboxJobRuntimeError(error) && (
        error.retryable ||
        isTransientWorkspaceInputVisibilityFailure({ code: error.code, message: error.message })
      )
      const willRetry = retryable && attempt < attempts
      const current = await this.requireRun(resourceScope, run.id)
      await this.runs.update(scopedRevisionWhere(resourceScope, current.id, current.revision), {
        status: willRetry ? 'queued' : 'review_required',
        sandboxJobId: isSandboxJobRuntimeError(error) ? error.jobId ?? current.sandboxJobId : current.sandboxJobId,
        renderReport: {
          status: willRetry ? 'queued' : 'failed',
          action: IMG2THREEJS_SANDBOX_ACTION,
          actionVersion: IMG2THREEJS_SANDBOX_ACTION_VERSION,
          attempt,
          failure: {
            code: isSandboxJobRuntimeError(error) ? error.code : 'SANDBOX_START_FAILED',
            message: errorMessage(error).slice(0, 500),
            retryable
          }
        },
        visualReview: {
          ...current.visualReview,
          status: 'pending_human',
          renderStatus: willRetry ? 'queued' : 'failed',
          capabilityReason: errorMessage(error).slice(0, 500),
          notes: undefined
        },
        humanReviewStatus: 'pending',
        failureReasons: willRetry
          ? current.failureReasons
          : [...new Set([...current.failureReasons, isSandboxJobRuntimeError(error) ? error.code : 'browser_render_failed'])]
      })
      if (!willRetry) {
        await this.updateProjectStatus(resourceScope, run.projectId, 'review_required')
        return
      }
      throw error
    }
  }

  async cancel(scope: Scope, run: PipelineRunEntity): Promise<void> {
    if (run.renderQueueJobId) {
      await this.queue().cancel({ jobId: run.renderQueueJobId, executionPool: 'sandbox-browser' }).catch(() => undefined)
    }
    if (run.sandboxJobId) await this.sandboxJobs(false)?.cancel({ jobId: run.sandboxJobId }).catch(() => undefined)
  }

  async retry(scope: Scope, run: PipelineRunEntity): Promise<{ queueJobId: string }> {
    const capability = await this.availability()
    if (!capability.available) throw new Error(`${capability.code}:${capability.reason ?? 'Browser render unavailable.'}`)
    const queueJobId = renderQueueJobKey(run.id, run.revision)
    const queued = await this.queue().enqueue<QueueRenderPayload>({
      pluginName: IMG2THREEJS_PLUGIN_NAME,
      queueName: IMG2THREEJS_QUEUE_NAME,
      jobName: IMG2THREEJS_RENDER_JOB_NAME,
      payload: { runId: run.id },
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      scopeKey: this.pluginContext.scopeKey,
      userId: scope.userId,
      jobId: queueJobId,
      attempts: this.pluginContext.config.queueAttempts,
      backoffMs: { type: 'exponential', delay: this.pluginContext.config.queueBackoffMs },
      executionPool: 'sandbox-browser'
    })
    const update = await this.runs.update(scopedRevisionWhere(scope, run.id, run.revision), {
      status: 'queued',
      renderQueueJobId: queued.jobId,
      renderReport: {
        status: 'queued',
        action: IMG2THREEJS_SANDBOX_ACTION,
        actionVersion: IMG2THREEJS_SANDBOX_ACTION_VERSION,
        runtimeProfile: capability.runtimeProfile,
        quality: run.renderReport?.quality,
        correction: run.renderReport?.correction
      },
      visualReview: {
        ...run.visualReview,
        status: 'pending_human',
        renderStatus: 'queued',
        capabilityReason: undefined,
        notes: undefined
      },
      humanReviewStatus: 'pending',
      failureReasons: run.failureReasons.filter((reason) => reason !== 'browser_render_failed')
    })
    if (update.affected !== 1) {
      await this.queue().cancel({ jobId: queued.jobId, executionPool: 'sandbox-browser' })
      throw new Error('REVISION_CONFLICT')
    }
    await this.updateProjectStatus(scope, run.projectId, 'building')
    return { queueJobId: queued.jobId }
  }

  private queue(): ManagedQueueService {
    if (!this.managedQueue) this.managedQueue = this.pluginContext.resolve(MANAGED_QUEUE_SERVICE_TOKEN)
    return this.managedQueue
  }
  private sandboxJobs(required?: true): SandboxJobsApi
  private sandboxJobs(required: false): SandboxJobsApi | undefined
  private sandboxJobs(required = true): SandboxJobsApi | undefined {
    const jobs = this.capabilities?.get(SandboxJobsRuntimeCapability)
    if (!jobs && required) throw new Error('SANDBOX_JOBS_UNAVAILABLE')
    return jobs
  }
  private async requireRun(scope: Scope, id: string): Promise<PipelineRunEntity> {
    const run = await this.runs.findOne({ where: scopedIdWhere(scope, id) })
    if (!run) throw new Error('PIPELINE_RUN_NOT_FOUND')
    return run
  }
  private async updateProjectStatus(
    scope: Scope,
    projectId: string,
    status: ModelProjectEntity['status'],
    nextDecision?: ModelProjectEntity['nextDecision']
  ): Promise<void> {
    const project = await this.projects.findOne({ where: scopedIdWhere(scope, projectId) })
    if (!project) throw new Error('PROJECT_NOT_FOUND')
    const result = await this.projects.update(scopedRevisionWhere(scope, project.id, project.revision), {
      status,
      ...(nextDecision ? { nextDecision } : {})
    })
    if (result.affected !== 1) throw new Error('REVISION_CONFLICT')
  }

  private async publishBrowserComparison(
    scope: Scope,
    run: PipelineRunEntity,
    output: SandboxJobOutput
  ): Promise<{ artifactId: string; versionId: string } | null> {
    const artifacts = this.capabilities?.get(ArtifactsRuntimeCapability)
    if (!artifacts) return null
    const artifact = await artifacts.createArtifact({
      source: {
        pluginName: IMG2THREEJS_PLUGIN_NAME,
        resourceType: 'threejs-browser-comparison',
        resourceId: run.id,
        checksum: output.sha256
      },
      kind: 'file',
      title: `Three.js browser comparison · ${run.projectId}`,
      description: 'Reference-versus-browser-render review evidence.',
      scope: {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        xpertId: scope.xpertId
      },
      metadata: { artifactNamespace: 'img2threejs', pipelineRunId: run.id }
    })
    const ensured = await artifacts.ensureArtifactVersion({
      artifactId: artifact.id,
      idempotencyKey: `img2threejs-browser-comparison:${run.id}:${output.sha256}`,
      workspaceFileRef: output.reference,
      mimeType: output.mimeType,
      fileName: output.originalName,
      title: 'Browser comparison evidence',
      description: 'Reference-versus-browser-render review evidence.',
      size: output.size,
      sha256: output.sha256,
      checksum: output.sha256,
      setCurrent: true,
      metadata: { artifactNamespace: 'img2threejs', pipelineRunId: run.id }
    })
    return { artifactId: artifact.id, versionId: ensured.version.id }
  }

  private async publishBrowserModel(
    scope: Scope,
    run: PipelineRunEntity,
    output: SandboxJobOutput
  ): Promise<{ artifactId: string; versionId: string } | null> {
    const artifacts = this.capabilities?.get(ArtifactsRuntimeCapability)
    if (!artifacts) return null
    const artifact = await artifacts.createArtifact({
      source: {
        pluginName: IMG2THREEJS_PLUGIN_NAME,
        resourceType: 'threejs-browser-model',
        resourceId: run.id,
        checksum: output.sha256
      },
      kind: 'file',
      title: `Three.js browser model · ${run.projectId}`,
      description: 'Validated binary glTF model for the interactive review workbench.',
      scope: {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        xpertId: scope.xpertId
      },
      metadata: { artifactNamespace: 'img2threejs', pipelineRunId: run.id }
    })
    const ensured = await artifacts.ensureArtifactVersion({
      artifactId: artifact.id,
      idempotencyKey: `img2threejs-browser-model:${run.id}:${output.sha256}`,
      workspaceFileRef: output.reference,
      // The platform file-artifact allowlist uses octet-stream for binary 3D formats.
      mimeType: 'application/octet-stream',
      fileName: output.originalName,
      title: 'Interactive browser model',
      description: 'Validated binary glTF model for the interactive review workbench.',
      size: output.size,
      sha256: output.sha256,
      checksum: output.sha256,
      setCurrent: true,
      metadata: { artifactNamespace: 'img2threejs', pipelineRunId: run.id, sourceMimeType: output.mimeType }
    })
    return { artifactId: artifact.id, versionId: ensured.version.id }
  }
}

function unavailable(code: CapabilityAvailability['code'], reason: string): CapabilityAvailability {
  return {
    available: false,
    code,
    reason,
    action: IMG2THREEJS_SANDBOX_ACTION,
    actionVersion: IMG2THREEJS_SANDBOX_ACTION_VERSION
  }
}
function scopeFromRun(run: PipelineRunEntity): Scope {
  return {
    tenantId: run.tenantId,
    organizationId: run.organizationId,
    userId: run.createdById,
    workspaceId: run.workspaceId,
    projectId: run.platformProjectId,
    xpertId: run.xpertId
  }
}
function outputAsset(output: SandboxJobOutput, scope: Scope): WorkspaceAssetReference {
  const reference = output.reference
  if (reference.catalog !== 'projects' && reference.catalog !== 'xperts') throw new Error('EXPORT_OUTPUT_INVALID: unsupported output catalog.')
  if (!reference.scopeId || !reference.workspacePath) throw new Error('EXPORT_OUTPUT_INVALID: incomplete output reference.')
  return {
    source: 'platform.workspace.files',
    tenantId: scope.tenantId,
    userId: scope.userId,
    catalog: reference.catalog,
    scopeId: reference.scopeId,
    projectId: reference.projectId ?? undefined,
    xpertId: reference.xpertId ?? undefined,
    isolateByUser: false,
    filePath: reference.filePath,
    workspacePath: reference.workspacePath,
    name: output.originalName,
    mimeType: output.mimeType,
    size: output.size,
    sha256: output.sha256
  }
}
function parseReport(buffer: Buffer): { quality: NonNullable<BrowserRenderReport['quality']> } {
  if (!buffer.length || buffer.length > 1_000_000) throw new Error('EXPORT_OUTPUT_INVALID: render report size is invalid.')
  const parsed = SandboxRenderReportSchema.safeParse(JSON.parse(buffer.toString('utf8')))
  if (!parsed.success) throw new Error('EXPORT_OUTPUT_INVALID: render report contract is invalid.')
  return { quality: parsed.data.quality }
}

function resolveReferenceReviewContract(
  spec: SculptSpec,
  references: ImageEvidenceEntity[]
): Pick<SculptSpec, 'referenceCamera' | 'featureReviewTargets'> {
  if (spec.referenceCamera && spec.featureReviewTargets?.length) {
    return {
      referenceCamera: spec.referenceCamera,
      featureReviewTargets: spec.featureReviewTargets
    }
  }
  const evidence = references.find((item) => isReviewView(item.view)) ?? references[0]
  const view: SculptSpec['referenceCamera']['view'] = isReviewView(evidence.view)
    ? evidence.view
    : 'front'
  const componentIds = spec.components.slice(0, 20).map((component) => component.id)
  return {
    referenceCamera: {
      evidenceId: evidence.id,
      view,
      projection: 'perspective',
      position: view === 'three-quarter' ? [2.8, 1.6, 2.8] : [0, 1, 4],
      target: [0, 0.8, 0],
      up: [0, 1, 0],
      fovDegrees: 35,
      orthographicHeight: null,
      framing: { subjectFillRatio: 0.62, tolerance: 0.18 },
      confidence: 0.5
    },
    featureReviewTargets: [{
      id: 'legacy_primary_silhouette',
      label: 'Legacy primary silhouette migration gate',
      evidenceId: evidence.id,
      componentIds: componentIds.length ? componentIds : ['root'],
      view,
      region: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
      metric: 'silhouette',
      criticality: 'critical',
      threshold: 0.45,
      confidence: 0.5,
      acceptance: 'Refine this legacy spec with an evidence-aligned fixed camera and explicit feature targets.'
    }]
  }
}

function isReviewView(
  value: ImageEvidenceEntity['view']
): value is SculptSpec['referenceCamera']['view'] {
  return value === 'front' ||
    value === 'back' ||
    value === 'left' ||
    value === 'right' ||
    value === 'top' ||
    value === 'bottom' ||
    value === 'three-quarter'
}
function renderQueueJobKey(runId: string, revision: number): string {
  return `img2threejs__${runId}__browser-render__r${revision}`
}
function safeExtension(mimeType: string): string {
  return mimeType === 'image/jpeg' ? 'reference.jpg' : mimeType === 'image/webp' ? 'reference.webp' : 'reference.png'
}
function readAttempts(job: ManagedQueueJob<QueueRenderPayload>): number {
  const attempts = job.opts?.attempts
  return typeof attempts === 'number' && Number.isFinite(attempts) ? Math.max(1, attempts) : 1
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
