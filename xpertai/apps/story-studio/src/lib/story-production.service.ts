import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { FindOptionsWhere, Repository } from 'typeorm'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  ArtifactsRuntimeCapability,
  SandboxJobsRuntimeCapability,
  SYSTEM_GLOBAL_SCOPE,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  isSandboxJobRuntimeError,
  type ManagedQueueJob,
  type ManagedQueueService,
  type RuntimeCapabilityRegistry,
  type SandboxJobsApi,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import {
  STORY_RENDER_JOB_NAME,
  STORY_RENDER_QUEUE_NAME,
  STORY_RENDER_SANDBOX_ACTION,
  STORY_RENDER_SANDBOX_ACTION_VERSION,
  STORY_STUDIO_PLUGIN_NAME
} from './constants.js'
import {
  StoryActionLog,
  StoryProduction,
  StoryProject,
  StoryRender
} from './entities/index.js'
import type {
  GetStoryProductionInput,
  GetStoryRenderInput,
  SaveStoryProductionInput,
  StartStoryRenderInput,
  StoryJsonObject,
  StoryProductionDocument,
  StoryProductionSummary,
  StoryRenderCapability,
  StoryRenderQueueJobData,
  StoryRenderSummary,
  WaitStoryRenderInput
} from './production-types.js'
import { uploadStoryDemoAssets } from './story-demo-assets.js'
import { createStoryboardComposition, totalProductionDuration } from './storyboard-composition.js'
import { createStoryDemoProduction } from './story-demo-case.js'
import {
  prepareRenderMedia,
  sanitizeAssets,
  sanitizeScenes
} from './story-production-media.js'
import { buildStoryScopeKey } from './story-studio.service.js'
import type { StoryScope } from './types.js'

const WAIT_WINDOW_MS = 45_000
const WAIT_POLL_MS = 2_000
const ARTIFACT_BINARY_MIME_TYPE = 'application/octet-stream'
@Injectable()
export class StoryProductionService {
  constructor(
    @InjectRepository(StoryProject)
    private readonly projects: Repository<StoryProject>,
    @InjectRepository(StoryProduction)
    private readonly productions: Repository<StoryProduction>,
    @InjectRepository(StoryRender)
    private readonly renders: Repository<StoryRender>,
    @InjectRepository(StoryActionLog)
    private readonly logs: Repository<StoryActionLog>,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly capabilities?: RuntimeCapabilityRegistry,
    @Optional()
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
    private readonly queue?: ManagedQueueService
  ) {}

  async saveProduction(scope: StoryScope, input: SaveStoryProductionInput) {
    validateScope(scope)
    const checksum = checksumOf(input.production)
    const operationFingerprint = checksumOf(input)
    return this.projects.manager.transaction(async (manager) => {
      const projectRepository = manager.getRepository(StoryProject)
      const productionRepository = manager.getRepository(StoryProduction)
      const logRepository = manager.getRepository(StoryActionLog)
      const previousLog = await logRepository.findOne({
        where: scopedWhere<StoryActionLog>(scope, { operationId: input.operationId })
      })
      if (previousLog) {
        if (
          previousLog.projectId !== input.projectId ||
          previousLog.operationFingerprint !== operationFingerprint
        ) {
          throw operationConflict()
        }
        const current = await productionRepository.findOne({
          where: scopedWhere<StoryProduction>(scope, { projectId: input.projectId })
        })
        if (!current) throw new ConflictException('The idempotent production record is missing.')
        return {
          success: true,
          duplicate: true,
          projectId: input.projectId,
          revision: previousLog.resultingRevision,
          production: compactProduction(current)
        }
      }

      const project = await requireProject(projectRepository, scope, input.projectId)
      assertRevision(project, input.baseRevision)
      const existing = await productionRepository.findOne({
        where: scopedWhere<StoryProduction>(scope, { projectId: input.projectId })
      })
      const nextRevision = project.revision + 1
      const productionCounts = countProduction(input.production)
      const updated = await projectRepository.update(
        scopedWhere<StoryProject>(scope, { id: project.id, revision: input.baseRevision }),
        {
          revision: nextRevision,
          sourceCount: productionCounts.sources,
          eventCount: productionCounts.beats,
          episodeCount: productionCounts.episodes,
          assetCount: productionCounts.assets,
          shotCount: productionCounts.shots,
          candidateCount: productionCounts.candidates,
          lastEditedById: scope.userId ?? scope.assistantId ?? null,
          lastEditedAt: new Date()
        }
      )
      if (updated.affected !== 1) {
        const latest = await requireProject(projectRepository, scope, input.projectId)
        throw revisionConflict(latest.revision)
      }

      const row = await productionRepository.save(
        productionRepository.create({
          ...(existing ?? {}),
          ...scopeCreate(scope),
          projectId: project.id,
          projectRevision: nextRevision,
          documentRevision: (existing?.documentRevision ?? 0) + 1,
          sourceSynopsis: input.production.sourceSynopsis,
          adaptationGoal: input.production.adaptationGoal,
          visualStyle: input.production.visualStyle,
          audience: input.production.audience ?? null,
          sourceMaterials: input.production.sourceMaterials ?? [],
          storyPlan: input.production.storyPlan ?? null,
          episodes: input.production.episodes ?? [],
          assets: input.production.assets ?? [],
          characters: input.production.characters,
          scenes: [...input.production.scenes].sort((left, right) => left.order - right.order),
          operationId: input.operationId,
          inputChecksum: checksum,
          changeSummary: input.changeSummary,
          lastEditedById: scope.userId ?? scope.assistantId ?? null
        })
      )
      await logRepository.save(
        logRepository.create({
          ...scopeCreate(scope),
          projectId: project.id,
          operationId: input.operationId,
          operationFingerprint,
          action: 'production_saved',
          actorType: scope.assistantId ? 'agent' : scope.userId ? 'user' : 'system',
          actorId: scope.userId ?? scope.assistantId ?? null,
          changeSummary: input.changeSummary,
          previousRevision: project.revision,
          resultingRevision: nextRevision,
          changedFields: ['production']
        })
      )
      return {
        success: true,
        duplicate: false,
        projectId: project.id,
        revision: nextRevision,
        production: compactProduction(row)
      }
    })
  }

  async getProduction(scope: StoryScope, input: GetStoryProductionInput) {
    await requireProject(this.projects, scope, input.projectId)
    const row = await this.productions.findOne({
      where: scopedWhere<StoryProduction>(scope, { projectId: input.projectId })
    })
    if (!row) {
      throw new NotFoundException({
        errorCode: 'story_production_not_found',
        message: 'No production plan has been saved for this project.'
      })
    }
    return compactProduction(row)
  }

  async createDemoProduction(
    scope: StoryScope,
    input: {
      projectId: string
      baseRevision: number
      operationId: string
      changeSummary: string
    }
  ) {
    const project = await requireProject(this.projects, scope, input.projectId)
    assertRevision(project, input.baseRevision)
    const workspaceFiles = this.workspaceFiles()
    const media = await uploadStoryDemoAssets(workspaceFiles, project, scope)
    return this.saveProduction(scope, {
      projectId: input.projectId,
      operationId: input.operationId,
      baseRevision: input.baseRevision,
      production: createStoryDemoProduction(media),
      changeSummary: input.changeSummary
    })
  }

  async getRenderCapability(): Promise<StoryRenderCapability> {
    const jobs = this.sandboxJobs(false)
    if (!jobs) return unavailable('PROVIDER_UNAVAILABLE', 'Platform Sandbox Jobs capability is unavailable.')
    if (!this.capabilities?.get(WorkspaceFilesRuntimeCapability)) {
      return unavailable('WORKSPACE_FILES_UNAVAILABLE', 'Platform Workspace Files capability is unavailable.')
    }
    if (!this.capabilities?.get(ArtifactsRuntimeCapability)) {
      return unavailable('ARTIFACTS_UNAVAILABLE', 'Platform Artifacts capability is unavailable.')
    }
    const action = await jobs
      .getActionHealth({
        pluginName: STORY_STUDIO_PLUGIN_NAME,
        action: STORY_RENDER_SANDBOX_ACTION,
        actionVersion: STORY_RENDER_SANDBOX_ACTION_VERSION
      })
      .catch((error) => ({
        available: false as const,
        reason: 'PROFILE_UNHEALTHY',
        message: errorMessage(error)
      }))
    if (!action.available) {
      return unavailable(
        action.reason ?? 'PROFILE_UNHEALTHY',
        action.message ?? 'Story Studio render Action is unavailable.'
      )
    }
    if (!this.queue) return unavailable('WORKER_UNAVAILABLE', 'Managed Queue is unavailable.')
    const pool = await this.queue
      .getExecutionPoolHealth({ executionPool: 'sandbox-browser' })
      .catch((error) => ({
        available: false,
        workerCount: 0,
        warning: errorMessage(error)
      }))
    if (!pool.available) {
      return unavailable('WORKER_UNAVAILABLE', pool.warning ?? 'No sandbox-browser worker is available.')
    }
    return {
      available: true,
      backend: 'sandbox-job',
      action: STORY_RENDER_SANDBOX_ACTION,
      actionVersion: STORY_RENDER_SANDBOX_ACTION_VERSION,
      runtimeProfile: action.runtimeProfile ?? null,
      workerCount: pool.workerCount
    }
  }

  async startRender(scope: StoryScope, input: StartStoryRenderInput) {
    validateScope(scope)
    const existing = await this.renders.findOne({
      where: scopedWhere<StoryRender>(scope, { operationId: input.operationId })
    })
    if (existing) {
      const expected = checksumOf(renderFingerprintInput(input))
      if (existing.inputChecksum !== expected) throw operationConflict()
      return { success: true, duplicate: true, render: compactRender(existing) }
    }
    const project = await requireProject(this.projects, scope, input.projectId)
    assertRevision(project, input.expectedRevision)
    if (!['planning', 'production', 'review'].includes(project.status)) {
      throw new BadRequestException(
        'Storyboard rendering requires a project in planning, production, or review.'
      )
    }
    const production = await this.productions.findOne({
      where: scopedWhere<StoryProduction>(scope, { projectId: input.projectId })
    })
    if (!production) throw new BadRequestException('Save a production plan before starting a render.')
    if (production.projectRevision !== project.revision) {
      throw new ConflictException('The production plan is stale. Save it against the current project revision.')
    }
    const capability = await this.getRenderCapability()
    if (!capability.available) {
      throw new ServiceUnavailableException(`${capability.reason}: ${capability.message}`)
    }
    if (!this.queue) throw new ServiceUnavailableException('Managed Queue is unavailable.')
    const fingerprint = checksumOf(renderFingerprintInput(input))
    const fileName = sanitizeFileName(input.fileName ?? `${project.title}-storyboard.mp4`)
    const row = await this.renders.save(
      this.renders.create({
        ...scopeCreate(scope),
        projectId: project.id,
        sourceRevision: project.revision,
        operationId: input.operationId,
        inputChecksum: fingerprint,
        status: 'queued',
        progress: 0,
        stage: 'queued',
        quality: input.quality ?? 'standard',
        fps: input.fps ?? 24,
        fileName,
        mimeType: 'video/mp4',
        changeSummary: input.changeSummary,
        createdById: scope.userId ?? null
      })
    )
    const queued = await this.queue
      .enqueue({
        pluginName: STORY_STUDIO_PLUGIN_NAME,
        queueName: STORY_RENDER_QUEUE_NAME,
        jobName: STORY_RENDER_JOB_NAME,
        payload: {
          renderId: row.id,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId ?? null,
          workspaceId: scope.workspaceId ?? null,
          hostProjectId: scope.hostProjectId ?? null
        } satisfies StoryRenderQueueJobData,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        scopeKey: SYSTEM_GLOBAL_SCOPE,
        jobId: `story-studio-render-${row.id}`,
        attempts: 2,
        backoffMs: { type: 'exponential', delay: 5_000 },
        executionPool: 'sandbox-browser',
        removeOnComplete: { age: 86_400, count: 100 },
        removeOnFail: { age: 604_800, count: 100 }
      })
      .catch(async (error) => {
        row.status = 'failed'
        row.stage = 'queueing'
        row.errorMessage = errorMessage(error)
        row.completedAt = new Date()
        await this.renders.save(row)
        throw error
      })
    row.queueJobId = queued.jobId
    await this.renders.save(row)
    await this.writeRenderLog(scope, project, row, 'render_queued')
    return { success: true, duplicate: false, capability, render: compactRender(row) }
  }

  async getRender(scope: StoryScope, input: GetStoryRenderInput) {
    await requireProject(this.projects, scope, input.projectId)
    const row = input.renderId
      ? await this.renders.findOne({
          where: scopedWhere<StoryRender>(scope, {
            id: input.renderId,
            projectId: input.projectId
          })
        })
      : await this.renders.findOne({
          where: scopedWhere<StoryRender>(scope, { projectId: input.projectId }),
          order: { createdAt: 'DESC' }
        })
    if (!row) throw new NotFoundException('Story Studio render was not found.')
    return this.renderSummary(row)
  }

  async waitRender(scope: StoryScope, input: WaitStoryRenderInput) {
    const deadline = Date.now() + WAIT_WINDOW_MS
    let render = await this.getRender(scope, input)
    let cursor = renderCursor(render)
    while (!terminal(render.status) && cursor === input.cursor && Date.now() < deadline) {
      await delay(WAIT_POLL_MS)
      render = await this.getRender(scope, input)
      cursor = renderCursor(render)
    }
    return {
      render,
      cursor,
      terminal: terminal(render.status),
      message: terminal(render.status)
        ? `Render ${render.status}.`
        : 'Render is still running. Call story_wait_render again with this cursor.'
    }
  }

  async processRender(job: ManagedQueueJob<StoryRenderQueueJobData>) {
    const row = await this.renders.findOne({
      where: {
        id: job.data.renderId,
        tenantId: job.data.tenantId
      }
    })
    if (!row) {
      throw new NotFoundException('Queued Story Studio render was not found.')
    }
    assertQueuedScope(row, job.data)
    if (terminal(row.status)) return
    const scope: StoryScope = {
      tenantId: row.tenantId,
      organizationId: row.organizationId ?? null,
      workspaceId: row.workspaceId ?? null,
      hostProjectId: row.hostProjectId ?? null
    }
    const project = await requireProject(this.projects, scope, row.projectId)
    const production = await this.productions.findOne({
      where: scopedWhere<StoryProduction>(scope, { projectId: row.projectId })
    })
    if (!production) throw new BadRequestException('Render production plan no longer exists.')
    if (project.revision !== row.sourceRevision || production.projectRevision !== row.sourceRevision) {
      throw new ConflictException('Render source changed after queueing.')
    }
    row.status = 'running'
    row.stage = 'sandbox-starting'
    row.progress = 10
    row.sandboxJobId = row.id
    row.errorMessage = null
    await this.renders.save(row)
    try {
      const productionDocument = productionDocumentFromRow(production)
      const renderMedia = prepareRenderMedia(productionDocument, row.tenantId)
      const html = createStoryboardComposition({
        title: project.title,
        aspectRatio: project.aspectRatio,
        production: productionDocument,
        mediaSources: Object.fromEntries(
          renderMedia.map((item) => [item.candidateId, item.browserPath])
        )
      })
      const result = await this.sandboxJobs().run({
        jobId: row.id,
        action: STORY_RENDER_SANDBOX_ACTION,
        actionVersion: STORY_RENDER_SANDBOX_ACTION_VERSION,
        idempotencyKey: `story-studio:${row.id}:${row.inputChecksum}`,
        scope: {
          tenantId: row.tenantId,
          organizationId: row.organizationId ?? null,
          userId: row.createdById ?? null,
          pluginName: STORY_STUDIO_PLUGIN_NAME,
          businessResourceType: 'storyboard-render',
          businessResourceId: row.id
        },
        payload: {
          compositionHtml: html,
          quality: row.quality,
          fps: row.fps
        },
        files: renderMedia.map((item) => ({
          reference: item.reference,
          targetPath: item.targetPath,
          size: item.size,
          sha256: item.sha256,
          access: 'read-only-seekable' as const
        })),
        outputs: [
          {
            path: 'storyboard.mp4',
            originalName: row.fileName,
            mimeType: 'video/mp4',
            destination: renderDestination(project, row)
          },
          {
            path: 'report.json',
            originalName: `${row.fileName}.report.json`,
            mimeType: 'application/json',
            destination: {
              ...renderDestination(project, row),
              folder: `${renderDestination(project, row).folder}/reports`
            }
          }
        ],
        timeoutMs: 20 * 60_000
      })
      const output = result.outputs.find((candidate) => candidate.path === 'storyboard.mp4')
      if (!output) throw new Error('Storyboard render did not return storyboard.mp4.')
      row.status = 'succeeded'
      row.stage = 'complete'
      row.progress = 100
      row.sandboxJobId = result.id
      row.filePath = output.workspacePath ?? null
      row.fileReference = output.reference as unknown as StoryJsonObject
      row.fileUrl = output.fileUrl ?? null
      row.mimeType = output.mimeType
      row.size = output.size
      row.checksum = output.sha256
      const artifacts = this.capabilities?.get(ArtifactsRuntimeCapability)
      if (!artifacts) {
        throw new ServiceUnavailableException('Platform Artifacts capability is unavailable.')
      }
      const artifact = await artifacts.createArtifact({
        source: {
          pluginName: STORY_STUDIO_PLUGIN_NAME,
          resourceType: 'storyboard_video',
          resourceId: project.id,
          checksum: output.sha256
        },
        kind: 'file',
        title: `${project.title} · Storyboard`,
        description: production.adaptationGoal,
        scope: artifactScope(project, row),
        metadata: {
          storyProjectId: project.id,
          sourceRevision: row.sourceRevision,
          renderQuality: row.quality,
          fps: row.fps,
          mediaType: row.mimeType
        }
      })
      const ensured = await artifacts.ensureArtifactVersion({
        artifactId: artifact.id,
        workspaceFileRef: output.reference,
        mimeType: ARTIFACT_BINARY_MIME_TYPE,
        fileName: row.fileName,
        title: `${project.title} · Storyboard`,
        description: production.adaptationGoal,
        size: output.size,
        sha256: output.sha256,
        sourceVersionId: row.id,
        checksum: row.inputChecksum,
        setCurrent: true,
        idempotencyKey: `story-studio-render:${row.id}:${output.sha256}`,
        metadata: {
          storyProjectId: project.id,
          sourceRevision: row.sourceRevision,
          mediaType: row.mimeType
        }
      })
      row.artifactId = artifact.id
      row.artifactVersionId = ensured.version.id
      row.completedAt = new Date()
      row.report = compactReport(result)
      await this.renders.save(row)
      await this.writeRenderLog(scope, project, row, 'render_completed')
    } catch (error) {
      const attempts = readAttempts(job)
      const attempt = job.attemptsMade + 1
      const retryable = !isSandboxJobRuntimeError(error) || error.retryable
      const willRetry = retryable && attempt < attempts
      row.status = willRetry ? 'queued' : 'failed'
      row.stage = willRetry ? 'retrying' : 'failed'
      row.progress = willRetry ? 0 : row.progress
      row.errorMessage = errorMessage(error)
      row.completedAt = willRetry ? null : new Date()
      await this.renders.save(row)
      if (!willRetry) {
        await this.writeRenderLog(scope, project, row, 'render_failed')
        return
      }
      throw error
    }
  }

  private sandboxJobs(required?: true): SandboxJobsApi
  private sandboxJobs(required: false): SandboxJobsApi | undefined
  private sandboxJobs(required = true): SandboxJobsApi | undefined {
    const jobs = this.capabilities?.get(SandboxJobsRuntimeCapability)
    if (!jobs && required) {
      throw new ServiceUnavailableException('Platform Sandbox Jobs capability is unavailable.')
    }
    return jobs
  }

  private workspaceFiles(): WorkspaceFilesApi {
    const workspaceFiles = this.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!workspaceFiles) {
      throw new ServiceUnavailableException('Platform Workspace Files capability is unavailable.')
    }
    return workspaceFiles
  }

  private async renderSummary(row: StoryRender) {
    if (
      row.status !== 'succeeded' ||
      !row.artifactId ||
      !row.artifactVersionId
    ) {
      return compactRender(row)
    }
    // Artifacts v1 versions MP4 as a safe binary file. Keep playback on the
    // scoped Workspace URL so the browser receives the real video/mp4 type.
    if (row.mimeType === 'video/mp4') return compactRender(row)
    const artifacts = this.capabilities?.get(ArtifactsRuntimeCapability)
    if (!artifacts) return compactRender(row)
    const preview = await artifacts
      .createSignedPreviewLink({
        artifactId: row.artifactId,
        artifactVersionId: row.artifactVersionId,
        versionMode: 'version',
        ttlSeconds: 600,
        presentation: {
          disposition: 'inline',
          allowDownload: true
        },
        metadata: { storyRenderId: row.id }
      })
      .catch(() => null)
    return compactRender(row, preview?.publicUrl ?? row.fileUrl ?? null)
  }

  private async writeRenderLog(
    scope: StoryScope,
    project: StoryProject,
    render: StoryRender,
    action: 'render_queued' | 'render_completed' | 'render_failed'
  ) {
    await this.logs.save(
      this.logs.create({
        ...scopeCreate(scope),
        projectId: project.id,
        operationId:
          action === 'render_queued' ? render.operationId : `${action}:${render.id}`,
        operationFingerprint: render.inputChecksum,
        action,
        actorType: scope.assistantId ? 'agent' : scope.userId ? 'user' : 'system',
        actorId: scope.userId ?? scope.assistantId ?? null,
        changeSummary:
          action === 'render_queued'
            ? render.changeSummary
            : action === 'render_completed'
              ? `Completed storyboard video ${render.fileName}.`
              : `Storyboard video render failed: ${render.errorMessage ?? 'unknown error'}`,
        previousRevision: project.revision,
        resultingRevision: project.revision,
        changedFields: ['render']
      })
    )
  }
}

function compactProduction(row: StoryProduction): StoryProductionSummary {
  const shots = row.scenes.flatMap((scene) => scene.shots)
  const candidates = [
    ...(row.assets ?? []).flatMap((asset) => asset.candidates ?? []),
    ...shots.flatMap((shot) => shot.candidates ?? [])
  ]
  return {
    id: row.id,
    projectId: row.projectId,
    projectRevision: row.projectRevision,
    documentRevision: row.documentRevision,
    sourceSynopsis: row.sourceSynopsis,
    adaptationGoal: row.adaptationGoal,
    visualStyle: row.visualStyle,
    audience: row.audience ?? null,
    sourceMaterials: row.sourceMaterials ?? [],
    storyPlan: row.storyPlan ?? null,
    episodes: row.episodes ?? [],
    assets: sanitizeAssets(row.assets ?? []),
    characters: row.characters,
    scenes: sanitizeScenes(row.scenes),
    counts: {
      sources: row.sourceMaterials?.length ?? 0,
      beats: row.storyPlan?.beats.length ?? 0,
      episodes: row.episodes?.length ?? 0,
      assets: row.assets?.length ?? 0,
      characters: row.characters.length,
      scenes: row.scenes.length,
      shots: shots.length,
      candidates: candidates.length,
      selectedCandidates: candidates.filter((candidate) => candidate.selected).length
    },
    totalDurationSeconds: totalProductionDuration(productionDocumentFromRow(row)),
    updatedAt: row.updatedAt?.toISOString() ?? null
  }
}

function compactRender(
  row: StoryRender,
  previewUrl: string | null = row.fileUrl ?? null
): StoryRenderSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceRevision: row.sourceRevision,
    status: row.status,
    progress: row.progress,
    stage: row.stage,
    quality: row.quality,
    fps: row.fps,
    fileName: row.fileName,
    filePath: row.filePath ?? null,
    fileUrl: previewUrl,
    artifactId: row.artifactId ?? null,
    artifactVersionId: row.artifactVersionId ?? null,
    mimeType: row.mimeType,
    size: row.size ?? null,
    checksum: row.checksum ?? null,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null
  }
}

function productionDocumentFromRow(row: StoryProduction): StoryProductionDocument {
  return {
    sourceSynopsis: row.sourceSynopsis,
    adaptationGoal: row.adaptationGoal,
    visualStyle: row.visualStyle,
    ...(row.audience ? { audience: row.audience } : {}),
    sourceMaterials: row.sourceMaterials ?? [],
    ...(row.storyPlan ? { storyPlan: row.storyPlan } : {}),
    episodes: row.episodes ?? [],
    assets: row.assets ?? [],
    characters: row.characters,
    scenes: row.scenes
  }
}

async function requireProject(
  repository: Repository<StoryProject>,
  scope: StoryScope,
  projectId: string
) {
  validateScope(scope)
  const project = await repository.findOne({
    where: scopedWhere<StoryProject>(scope, { id: projectId })
  })
  if (!project) throw new NotFoundException('Story project was not found.')
  return project
}

function scopedWhere<T>(
  scope: StoryScope,
  extra: FindOptionsWhere<T>
): FindOptionsWhere<T> {
  return {
    tenantId: scope.tenantId,
    scopeKey: buildStoryScopeKey(scope),
    ...extra
  } as FindOptionsWhere<T>
}

function scopeCreate(scope: StoryScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    hostProjectId: scope.hostProjectId ?? null,
    scopeKey: buildStoryScopeKey(scope)
  }
}

function assertQueuedScope(row: StoryRender, data: StoryRenderQueueJobData) {
  const queuedOrganizationId = data.organizationId ?? null
  if ((row.organizationId ?? null) !== queuedOrganizationId) {
    throw new NotFoundException('Queued Story Studio render scope does not match.')
  }
  if (
    data.workspaceId !== undefined &&
    (row.workspaceId ?? null) !== (data.workspaceId ?? null)
  ) {
    throw new NotFoundException('Queued Story Studio render workspace does not match.')
  }
  if (
    data.hostProjectId !== undefined &&
    (row.hostProjectId ?? null) !== (data.hostProjectId ?? null)
  ) {
    throw new NotFoundException('Queued Story Studio render host project does not match.')
  }
}

function renderDestination(project: StoryProject, render: StoryRender) {
  const folder = `story-studio/${project.id}/renders`
  if (project.hostProjectId) {
    return {
      catalog: 'projects' as const,
      scopeId: project.hostProjectId,
      projectId: project.hostProjectId,
      tenantId: project.tenantId,
      userId: render.createdById ?? null,
      folder
    }
  }
  if (!project.assistantId) {
    throw new ServiceUnavailableException('Story render requires a host project or Assistant workspace scope.')
  }
  return {
    catalog: 'xperts' as const,
    scopeId: project.assistantId,
    xpertId: project.assistantId,
    tenantId: project.tenantId,
    userId: render.createdById ?? null,
    isolateByUser: false,
    folder
  }
}

function artifactScope(project: StoryProject, render: StoryRender) {
  return {
    tenantId: project.tenantId,
    organizationId: project.organizationId ?? null,
    userId: render.createdById ?? null,
    workspaceId: project.workspaceId ?? null,
    projectId: project.hostProjectId ?? null,
    xpertId: project.hostProjectId ? null : project.assistantId ?? null
  }
}

function compactReport(result: {
  action: string
  actionVersion: string
  runtimeProfile?: string
  sandboxRuntimeVersion?: string
  id: string
  attempt: number
}): StoryJsonObject {
  return {
    action: result.action,
    actionVersion: result.actionVersion,
    ...(result.runtimeProfile ? { runtimeProfile: result.runtimeProfile } : {}),
    ...(result.sandboxRuntimeVersion
      ? { sandboxRuntimeVersion: result.sandboxRuntimeVersion }
      : {}),
    sandboxJobId: result.id,
    attempt: result.attempt
  }
}

function renderFingerprintInput(input: StartStoryRenderInput) {
  return {
    projectId: input.projectId,
    operationId: input.operationId,
    expectedRevision: input.expectedRevision,
    quality: input.quality ?? 'standard',
    fps: input.fps ?? 24,
    fileName: input.fileName ?? null,
    changeSummary: input.changeSummary
  }
}

function countProduction(production: StoryProductionDocument) {
  const shots = production.scenes.flatMap((scene) => scene.shots)
  const assetCandidates = (production.assets ?? []).flatMap(
    (asset) => asset.candidates ?? []
  )
  return {
    sources: production.sourceMaterials?.length ?? 0,
    beats: production.storyPlan?.beats.length ?? 0,
    episodes: production.episodes?.length ?? 0,
    assets: production.assets?.length ?? 0,
    characters: production.characters.length,
    scenes: production.scenes.length,
    shots: shots.length,
    candidates:
      assetCandidates.length +
      shots.reduce(
        (total, shot) => total + (shot.candidates?.length ?? 0),
        0
      )
  }
}

function checksumOf(value: unknown) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function assertRevision(project: StoryProject, expected: number) {
  if (project.revision !== expected) throw revisionConflict(project.revision)
}

function revisionConflict(currentRevision: number) {
  return new ConflictException({
    errorCode: 'story_revision_conflict',
    message: 'Story project changed. Refresh the project and retry.',
    currentRevision
  })
}

function operationConflict() {
  return new ConflictException({
    errorCode: 'story_operation_payload_conflict',
    message: 'operationId was already used with a different payload.'
  })
}

function unavailable(reason: string, message: string): StoryRenderCapability {
  return { available: false, backend: 'sandbox-job', reason, message }
}

function validateScope(scope: StoryScope) {
  if (!scope.tenantId?.trim()) throw new BadRequestException('Tenant scope is required.')
}

function sanitizeFileName(value: string) {
  const safe = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim()
  if (!safe) return 'storyboard.mp4'
  return safe.toLowerCase().endsWith('.mp4') ? safe : `${safe}.mp4`
}

function terminal(status: StoryRenderSummary['status']) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled'
}

function renderCursor(render: StoryRenderSummary) {
  return `${render.status}:${render.progress}:${render.completedAt ?? render.createdAt ?? render.id}`
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function readAttempts(job: ManagedQueueJob<StoryRenderQueueJobData>) {
  const attempts = job.opts?.attempts
  return typeof attempts === 'number' && Number.isFinite(attempts) ? Math.max(1, attempts) : 1
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
