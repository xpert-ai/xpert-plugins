import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import {
  In,
  type FindOptionsWhere,
  type Repository
} from 'typeorm'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  RequestContext,
  SandboxJobsRuntimeCapability,
  SYSTEM_GLOBAL_SCOPE,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ManagedQueueService,
  type PluginContext,
  type RuntimeCapabilityRegistry,
  type WorkspacePortableFileReference,
  type WorkspaceRuntimeFileBuffer
} from '@xpert-ai/plugin-sdk'
import {
  STORY_STUDIO_PLUGIN_NAME,
  STORY_VIDEO_GENERATION_POLL_JOB,
  STORY_VIDEO_GENERATION_QUEUE,
  STORY_VIDEO_FRAME_ACTION,
  STORY_VIDEO_FRAME_ACTION_VERSION,
  STORY_VIDEO_GENERATION_SUBMIT_JOB
} from './constants.js'
import {
  StoryActionLog,
  StoryProduction,
  StoryProject,
  StoryShotContinuityBoundary,
  StoryVideoGenerationTask
} from './entities/index.js'
import type {
  StoryMediaCandidate,
  StoryPortableFileReference,
  StoryScene,
  StoryShot
} from './production-types.js'
import { storyActor } from './story-actor.js'
import { STORY_STUDIO_PLUGIN_CONTEXT } from './story-studio.tokens.js'
import { buildStoryScopeKey } from './story-studio.service.js'
import type { StoryScope } from './types.js'
import {
  STORY_ACTIVE_VIDEO_GENERATION_STATUSES,
  type GenerateStoryShotTakesInput,
  type GetStoryVideoTaskInput,
  type ListStoryVideoTasksInput,
  type ManageStoryVideoTaskInput,
  type SelectStoryShotVideoInput,
  type SetStoryVideoGeneratorInput,
  type StoryVideoGenerationRequestSnapshot,
  type StoryVideoGenerationStatus,
  type StoryVideoTaskSummary
} from './story-video-generation.types.js'
import { buildStoryVideoGenerationRequest } from './story-video-generation-request.js'
import {
  STORY_VIDEO_GENERATOR_FAMILIES,
  VIDEO_GENERATION_PERMISSION_SERVICE_TOKEN,
  type StoryVideoGenerationPlatformService,
  type StoryVideoGeneratorFamily,
  type StoryVideoGeneratorSummary
} from './story-video-generation.platform.js'

const MAX_TRACKING_MS = 24 * 60 * 60 * 1_000
const POLL_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 60_000] as const
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024
const ACTIVE_STATUSES = Array.from(STORY_ACTIVE_VIDEO_GENERATION_STATUSES)

type StoryVideoGenerationQueuePayload = { taskId: string }

@Injectable()
export class StoryVideoGenerationService {
  private readonly logger = new Logger(StoryVideoGenerationService.name)
  private platformService?: StoryVideoGenerationPlatformService

  constructor(
    @InjectRepository(StoryProject)
    private readonly projects: Repository<StoryProject>,
    @InjectRepository(StoryProduction)
    private readonly productions: Repository<StoryProduction>,
    @InjectRepository(StoryVideoGenerationTask)
    private readonly tasks: Repository<StoryVideoGenerationTask>,
    @InjectRepository(StoryShotContinuityBoundary)
    private readonly continuityBoundaries: Repository<StoryShotContinuityBoundary>,
    @InjectRepository(StoryActionLog)
    private readonly logs: Repository<StoryActionLog>,
    @Inject(STORY_STUDIO_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext,
    @Optional()
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
    private readonly queue?: ManagedQueueService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly capabilities?: RuntimeCapabilityRegistry
  ) {}

  async listGenerators(scope: StoryScope, projectId: string) {
    const project = await this.requireProject(scope, projectId)
    const xpertId = requireAssistantId(scope, project)
    const available = (await this.platform().listGenerators({ xpertId })).generators
    const selected = selectDefaultGenerator(project, available)
    const generators: Array<StoryVideoGeneratorSummary & {
      available: boolean
      unavailableReason?: 'workspace_not_configured'
    }> = []
    for (const family of STORY_VIDEO_GENERATOR_FAMILIES) {
      const familyItems = available.filter((item) => item.family === family)
      if (familyItems.length) {
        generators.push(...familyItems.map((item) => ({ ...item, available: true })))
      } else {
        generators.push({
          id: `unavailable:${family}`,
          family,
          name: familyDisplayName(family),
          displayName: familyDisplayName(family),
          linkedToXpert: false,
          modes: [],
          models: [],
          defaultModel: '',
          resolutions: [],
          aspectRatios: [],
          durationSeconds: { min: 0, max: 0, default: 0 },
          supportsAudio: false,
          supportsCancel: false,
          available: false,
          unavailableReason: 'workspace_not_configured'
        })
      }
    }
    return {
      selectedToolsetId: selected?.id ?? null,
      generators
    }
  }

  async setProjectGenerator(scope: StoryScope, input: SetStoryVideoGeneratorInput) {
    const project = await this.requireProject(scope, input.projectId)
    const generators = (await this.platform().listGenerators({
      xpertId: requireAssistantId(scope, project)
    })).generators
    const selected = generators.find((item) => item.id === input.toolsetId)
    if (!selected) throw new NotFoundException('story_video_generator_not_available')
    await this.projects.update(projectWhere(scope, { id: project.id }), {
      preferredVideoGeneratorToolsetId: selected.id,
      preferredVideoGeneratorFamily: selected.family,
      lastEditedById: storyActor(scope).actorId,
      lastEditedAt: new Date()
    })
    return { projectId: project.id, selectedToolsetId: selected.id, family: selected.family }
  }

  async generateTakes(scope: StoryScope, input: GenerateStoryShotTakesInput) {
    validateScope(scope)
    const queue = this.requireQueue()
    const project = await this.requireProject(scope, input.projectId)
    const xpertId = requireAssistantId(scope, project)
    const generators = (await this.platform().listGenerators({ xpertId })).generators
    const generator = generators.find((item) => item.id === input.toolsetId)
    if (!generator) throw new NotFoundException('story_video_generator_not_available')
    const production = await this.requireProduction(scope, input.projectId)
    const { scene, shot } = requireShot(production.scenes, input.sceneId, input.shotId)
    const request = buildStoryVideoGenerationRequest(input, production, scene, shot)
    const sourceFingerprint = shotSourceFingerprint(scene, shot, request)
    await this.recordContinuityBoundary(scope, input.projectId, input.sceneId, input.shotId, request, sourceFingerprint)
    const requestFingerprint = checksumOf({
      projectId: input.projectId,
      operationId: input.operationId,
      sceneId: input.sceneId,
      shotId: input.shotId,
      toolsetId: input.toolsetId,
      takeCount: input.takeCount,
      request,
      sourceFingerprint
    })

    const rows = await this.tasks.manager.transaction(async (manager) => {
      const repository = manager.getRepository(StoryVideoGenerationTask)
      const existing = await repository.find({
        where: taskWhere(scope, { operationId: input.operationId }),
        order: { takeIndex: 'ASC' }
      })
      if (existing.length) {
        if (existing.some((item) => item.requestFingerprint !== requestFingerprint)) {
          throw new ConflictException('story_video_operation_payload_conflict')
        }
        return existing
      }
      const active = await repository.count({
        where: taskWhere(scope, {
          projectId: input.projectId,
          sceneId: input.sceneId,
          shotId: input.shotId,
          status: In(ACTIVE_STATUSES)
        })
      })
      if (active) throw new ConflictException('story_video_generation_already_active')
      return repository.save(
        Array.from({ length: input.takeCount }, (_, index) => repository.create({
          ...scopeCreate(scope),
          projectId: input.projectId,
          sourceProjectRevision: project.revision,
          sourceDocumentRevision: production.documentRevision,
          sceneId: input.sceneId,
          shotId: input.shotId,
          operationId: input.operationId,
          requestGroupId: input.operationId,
          takeIndex: index + 1,
          generatorFamily: generator.family,
          toolsetId: generator.id,
          generatorName: generator.displayName,
          request,
          requestFingerprint,
          sourceFingerprint,
          status: 'queued',
          stage: 'queued',
          progress: 0,
          createdById: scope.userId ?? null,
          assistantId: xpertId,
          conversationId: scope.conversationId ?? null
        }))
      )
    })

    await this.projects.update(projectWhere(scope, { id: project.id }), {
      preferredVideoGeneratorToolsetId: generator.id,
      preferredVideoGeneratorFamily: generator.family
    })
    await Promise.all(rows.filter((task) => !task.queueJobId).map((task) =>
      this.enqueueSubmit(queue, task).catch(async (error) => {
        await this.failTask(task, 'queue_unavailable', errorMessage(error), true)
        throw error
      })
    ))
    return {
      requestGroupId: input.operationId,
      tasks: rows.map(compactTask)
    }
  }

  async listTasks(scope: StoryScope, input: ListStoryVideoTasksInput) {
    await this.requireProject(scope, input.projectId)
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.max(1, Math.min(input.pageSize ?? 20, 50))
    const [items, total] = await this.tasks.findAndCount({
      where: taskWhere(scope, {
        projectId: input.projectId,
        ...(input.sceneId ? { sceneId: input.sceneId } : {}),
        ...(input.shotId ? { shotId: input.shotId } : {}),
        ...(input.statuses?.length ? { status: In(input.statuses) } : {})
      }),
      order: { createdAt: 'DESC', takeIndex: 'ASC', id: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    return { items: items.map(compactTask), total, page, pageSize }
  }

  async getTask(scope: StoryScope, input: GetStoryVideoTaskInput) {
    return compactTask(await this.requireTask(scope, input.projectId, input.taskId))
  }

  async refreshTask(scope: StoryScope, input: ManageStoryVideoTaskInput) {
    const task = await this.requireTask(scope, input.projectId, input.taskId)
    if (!task.providerTaskId || !['generating', 'finalizing'].includes(task.status)) {
      return compactTask(task)
    }
    await this.enqueuePoll(this.requireQueue(), task, 0, true)
    return compactTask(await this.requireTask(scope, input.projectId, input.taskId))
  }

  async cancelTask(scope: StoryScope, input: ManageStoryVideoTaskInput) {
    const task = await this.requireTask(scope, input.projectId, input.taskId)
    if (!STORY_ACTIVE_VIDEO_GENERATION_STATUSES.has(task.status)) return compactTask(task)
    task.cancellationRequested = true
    let upstreamMayContinue = Boolean(task.providerTaskId)
    if (task.providerTaskId && task.assistantId) {
      const result = await this.platform().cancel({
        xpertId: task.assistantId,
        toolsetId: task.toolsetId,
        providerTaskId: task.providerTaskId
      }).catch(() => ({ supported: false, cancelled: false, status: 'tracking_stopped', providerTaskId: task.providerTaskId! }))
      upstreamMayContinue = !result.supported || !result.cancelled
    }
    if (task.queueJobId && this.queue) await this.queue.cancel({ jobId: task.queueJobId }).catch(() => null)
    task.status = 'cancelled'
    task.stage = 'cancelled'
    task.progress = 0
    task.upstreamMayContinue = upstreamMayContinue
    task.failureCode = null
    task.failureMessage = null
    task.recoverable = true
    await this.tasks.save(task)
    return compactTask(task)
  }

  async retryTask(scope: StoryScope, input: ManageStoryVideoTaskInput) {
    const original = await this.requireTask(scope, input.projectId, input.taskId)
    if (!['failed', 'cancelled', 'submission_unknown'].includes(original.status)) {
      throw new ConflictException('story_video_task_not_retryable')
    }
    const production = await this.requireProduction(scope, input.projectId)
    const { scene, shot } = requireShot(production.scenes, original.sceneId, original.shotId)
    if (shotSourceFingerprint(scene, shot, original.request) !== original.sourceFingerprint) {
      throw new ConflictException('story_video_source_changed')
    }
    const duplicate = await this.tasks.findOne({
      where: taskWhere(scope, { operationId: input.operationId, takeIndex: original.takeIndex })
    })
    if (duplicate) return compactTask(duplicate)
    const task = await this.tasks.save(this.tasks.create({
      ...scopeCreate(scope),
      projectId: original.projectId,
      sourceProjectRevision: original.sourceProjectRevision,
      sourceDocumentRevision: production.documentRevision,
      sceneId: original.sceneId,
      shotId: original.shotId,
      operationId: input.operationId,
      requestGroupId: input.operationId,
      takeIndex: original.takeIndex,
      generatorFamily: original.generatorFamily,
      toolsetId: original.toolsetId,
      generatorName: original.generatorName,
      request: original.request,
      requestFingerprint: checksumOf({ retryOfTaskId: original.id, operationId: input.operationId, request: original.request }),
      sourceFingerprint: original.sourceFingerprint,
      retryOfTaskId: original.id,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      createdById: scope.userId ?? null,
      assistantId: original.assistantId,
      conversationId: scope.conversationId ?? original.conversationId ?? null
    }))
    await this.enqueueSubmit(this.requireQueue(), task)
    return compactTask(task)
  }

  async selectShotVideo(scope: StoryScope, input: SelectStoryShotVideoInput) {
    return this.projects.manager.transaction(async (manager) => {
      const logRepository = manager.getRepository(StoryActionLog)
      const previous = await logRepository.findOne({
        where: logWhere(scope, { operationId: input.operationId })
      })
      if (previous) {
        return { projectId: input.projectId, revision: previous.resultingRevision, candidateId: input.candidateId }
      }
      const project = await manager.getRepository(StoryProject).findOne({
        where: projectWhere(scope, { id: input.projectId }),
        lock: { mode: 'pessimistic_write' }
      })
      if (!project) throw new NotFoundException('story_project_not_found')
      const production = await manager.getRepository(StoryProduction).findOne({
        where: productionWhere(scope, { projectId: input.projectId }),
        lock: { mode: 'pessimistic_write' }
      })
      if (!production) throw new NotFoundException('story_production_not_found')
      let found = false
      production.scenes = production.scenes.map((scene) => scene.id !== input.sceneId ? scene : ({
        ...scene,
        shots: scene.shots.map((shot) => shot.id !== input.shotId ? shot : ({
          ...shot,
          candidates: (shot.candidates ?? []).map((candidate) => {
            if (candidate.id === input.candidateId && candidate.kind === 'video') found = true
            return candidate.kind === 'video'
              ? { ...candidate, selected: candidate.id === input.candidateId }
              : candidate
          })
        }))
      }))
      if (!found) throw new NotFoundException('story_video_candidate_not_found')
      const previousRevision = project.revision
      project.revision += 1
      project.lastEditedById = storyActor(scope).actorId
      project.lastEditedAt = new Date()
      production.projectRevision = project.revision
      production.documentRevision += 1
      production.operationId = input.operationId
      production.inputChecksum = checksumOf(production.scenes)
      production.changeSummary = input.changeSummary
      production.lastEditedById = storyActor(scope).actorId
      await manager.getRepository(StoryProject).save(project)
      await manager.getRepository(StoryProduction).save(production)
      await manager.getRepository(StoryShotContinuityBoundary).update(
        {
          tenantId: scope.tenantId,
          scopeKey: buildStoryScopeKey(scope),
          projectId: input.projectId,
          fromShotId: input.shotId
        },
        { status: 'stale' }
      )
      await logRepository.save(logRepository.create({
        ...scopeCreate(scope),
        projectId: project.id,
        operationId: input.operationId,
        operationFingerprint: checksumOf(input),
        action: 'production_saved',
        ...storyActor(scope),
        changeSummary: input.changeSummary,
        previousRevision,
        resultingRevision: project.revision,
        changedFields: [`production.scenes.${input.sceneId}.shots.${input.shotId}.selectedVideo`]
      }))
      return { projectId: project.id, revision: project.revision, candidateId: input.candidateId }
    })
  }

  async processSubmit(taskId: string) {
    const task = await this.requireQueueTask(taskId)
    if (task.status !== 'queued' || task.cancellationRequested) return
    task.status = 'submitting'
    task.stage = task.request.continuity?.status === 'prompt_only'
      ? 'preparing_continuity'
      : 'submitting'
    task.progress = 3
    await this.tasks.save(task)
    try {
      await this.prepareContinuityReference(task)
      const continuityFrame = task.request.continuity?.strength === 'first_frame' && task.request.continuity.sourceFrame
        ? [{
            kind: 'image' as const,
            purpose: 'first_frame' as const,
            file: task.request.continuity.sourceFrame
          }]
        : []
      const references = continuityFrame.length
        ? continuityFrame
        : task.request.references ?? (
            task.request.inputImage
              ? [{
                  kind: 'image' as const,
                  purpose: 'reference' as const,
                  file: task.request.inputImage
                }]
              : []
          )
      const submitRequest = {
        xpertId: requireTaskAssistantId(task),
        toolsetId: task.toolsetId,
        projectId: task.hostProjectId,
        prompt: task.request.prompt,
        references,
        model: task.request.model,
        resolution: task.request.resolution,
        aspectRatio: task.request.aspectRatio,
        durationSeconds: task.request.durationSeconds,
        generateAudio: task.request.generateAudio
      }
      this.logger.log(JSON.stringify({
        event: 'story_video_generation_submit',
        task: {
          id: task.id,
          projectId: task.projectId,
          sceneId: task.sceneId,
          shotId: task.shotId,
          takeIndex: task.takeIndex,
          generatorFamily: task.generatorFamily,
          generatorName: task.generatorName
        },
        compiledRequest: {
          userPrompt: task.request.userPrompt ?? null,
          prompt: task.request.prompt,
          model: task.request.model,
          resolution: task.request.resolution,
          aspectRatio: task.request.aspectRatio,
          fps: task.request.fps,
          durationSeconds: task.request.durationSeconds,
          generateAudio: task.request.generateAudio,
          redoScope: task.request.redoScope ?? null,
          referenceAssetIds: task.request.referenceAssetIds ?? [],
          referenceImageCandidateIds: task.request.referenceImageCandidateIds ?? [],
          referenceImages: task.request.referenceImages ?? [],
          references,
          legacyPrimaryInputImage: task.request.inputImage ?? null
        },
        outgoingRequest: submitRequest,
        visualInputSummary: {
          selectedAssetCount: task.request.referenceAssetIds?.length ?? 0,
          availableReferenceImageCount: task.request.referenceImages?.length ?? 0,
          imagesSentToGenerator: references.filter((item) => item.kind === 'image').length,
          videosSentToGenerator: references.filter((item) => item.kind === 'video').length,
          audiosSentToGenerator: references.filter((item) => item.kind === 'audio').length,
          mode: references.length ? 'reference_to_video' : 'text_to_video'
        }
      }))
      const result = await this.platform().submit(submitRequest)
      task.providerTaskId = result.providerTaskId
      task.providerStatus = result.status
      task.status = 'generating'
      task.stage = 'generating'
      task.progress = 15
      task.submittedAt = new Date()
      task.failureCode = null
      task.failureMessage = null
      await this.tasks.save(task)
      await this.enqueuePoll(this.requireQueue(), task, POLL_DELAYS_MS[0])
    } catch (error) {
      const deterministic = isDeterministicSubmissionError(error)
      await this.failTask(
        task,
        deterministic ? 'submission_rejected' : 'submission_result_unknown',
        errorMessage(error),
        true,
        deterministic ? 'failed' : 'submission_unknown'
      )
    }
  }

  async processPoll(taskId: string) {
    const task = await this.requireQueueTask(taskId)
    if (task.cancellationRequested) return
    if (task.status === 'finalizing' && task.outputFile) {
      await this.processFinalization(task)
      return
    }
    if (task.status !== 'generating' || !task.providerTaskId) return
    if (Date.now() - task.createdAt.getTime() > MAX_TRACKING_MS) {
      await this.failTask(task, 'generation_timeout', 'Video generation did not finish within 24 hours.', true)
      return
    }
    try {
      const result = await this.platform().query({
        xpertId: requireTaskAssistantId(task),
        toolsetId: task.toolsetId,
        projectId: task.hostProjectId,
        providerTaskId: task.providerTaskId
      })
      task.providerStatus = result.status
      task.queryFailureCount = 0
      if (result.failed) {
        await this.failTask(
          task,
          result.errorCode || 'generation_failed',
          result.errorMessage || 'Video generation failed.',
          true
        )
        return
      }
      if (result.completed && result.outputFile) {
        task.status = 'finalizing'
        task.stage = 'finalizing'
        task.progress = 90
        task.outputFile = result.outputFile
        await this.tasks.save(task)
        await this.processFinalization(task)
        return
      }
      task.pollSequence += 1
      task.progress = Math.min(85, 15 + task.pollSequence * 5)
      await this.tasks.save(task)
      await this.enqueuePoll(
        this.requireQueue(),
        task,
        POLL_DELAYS_MS[Math.min(task.pollSequence, POLL_DELAYS_MS.length - 1)]
      )
    } catch (error) {
      task.queryFailureCount += 1
      if (task.queryFailureCount >= 3) {
        await this.failTask(task, 'status_refresh_failed', errorMessage(error), true)
        return
      }
      await this.tasks.save(task)
      await this.enqueuePoll(this.requireQueue(), task, POLL_DELAYS_MS[task.queryFailureCount])
    }
  }

  private async processFinalization(task: StoryVideoGenerationTask) {
    try {
      await this.finalizeTask(task)
    } catch (error) {
      task.queryFailureCount += 1
      if (task.queryFailureCount >= 3) {
        await this.failTask(task, 'preview_preparation_failed', errorMessage(error), true)
        return
      }
      task.status = 'finalizing'
      task.stage = 'finalizing'
      await this.tasks.save(task)
      await this.enqueuePoll(
        this.requireQueue(),
        task,
        POLL_DELAYS_MS[task.queryFailureCount]
      )
    }
  }

  private async recordContinuityBoundary(
    scope: StoryScope,
    projectId: string,
    toSceneId: string,
    toShotId: string,
    request: StoryVideoGenerationRequestSnapshot,
    sourceFingerprint: string
  ) {
    const continuity = request.continuity
    if (!continuity?.fromSceneId || !continuity.fromShotId) return
    const where = {
      tenantId: scope.tenantId,
      scopeKey: buildStoryScopeKey(scope),
      projectId,
      fromShotId: continuity.fromShotId,
      toShotId
    }
    const row = await this.continuityBoundaries.findOne({ where })
      ?? this.continuityBoundaries.create({
        ...scopeCreate(scope),
        projectId,
        fromSceneId: continuity.fromSceneId,
        fromShotId: continuity.fromShotId,
        toSceneId,
        toShotId,
        transition: continuity.transition,
        sourceFingerprint,
        status: continuity.status,
        snapshot: continuity
      })
    row.fromSceneId = continuity.fromSceneId
    row.toSceneId = toSceneId
    row.transition = continuity.transition
    row.sourceCandidateId = continuity.sourceCandidateId ?? null
    row.sourceFingerprint = sourceFingerprint
    row.status = continuity.status
    row.snapshot = continuity
    row.sourceFrameFile = continuity.sourceFrame ?? null
    row.failureCode = null
    row.failureMessage = null
    await this.continuityBoundaries.save(row)
  }

  private async prepareContinuityReference(task: StoryVideoGenerationTask) {
    const continuity = task.request.continuity
    if (!continuity || continuity.status !== 'prompt_only' || !continuity.sourceVideo) return
    if (!continuity.sourceVideoSize || !continuity.sourceVideoSha256) {
      continuity.status = 'failed'
      continuity.strength = 'prompt_only'
      await this.saveContinuityPreparation(task, 'failed', 'source_metadata_missing', 'The adopted previous clip is missing immutable file metadata.')
      return
    }
    const sandbox = this.capabilities?.get(SandboxJobsRuntimeCapability)
    if (!sandbox) {
      continuity.status = 'prompt_only'
      await this.saveContinuityPreparation(task, 'prompt_only', 'sandbox_unavailable', 'Frame preparation is unavailable; using continuity text only.')
      return
    }
    continuity.status = 'preparing'
    task.stage = 'preparing_continuity'
    task.progress = 4
    await this.tasks.save(task)
    await this.saveContinuityPreparation(task, 'preparing')
    try {
      const destination = task.hostProjectId
        ? { tenantId: task.tenantId, userId: task.createdById, catalog: 'projects' as const, scopeId: task.hostProjectId, projectId: task.hostProjectId }
        : { tenantId: task.tenantId, userId: task.createdById, catalog: 'xperts' as const, scopeId: requireTaskAssistantId(task), xpertId: requireTaskAssistantId(task) }
      const result = await sandbox.run({
        action: STORY_VIDEO_FRAME_ACTION,
        actionVersion: STORY_VIDEO_FRAME_ACTION_VERSION,
        idempotencyKey: `story-continuity-frame:${continuity.sourceVideoSha256}:last`,
        scope: {
          tenantId: task.tenantId,
          organizationId: task.organizationId ?? null,
          userId: task.createdById ?? null,
          pluginName: STORY_STUDIO_PLUGIN_NAME,
          businessResourceType: 'story-shot-continuity',
          businessResourceId: `${task.projectId}:${continuity.fromShotId}:${task.shotId}`
        },
        payload: { position: 'last' } as never,
        files: [{
          reference: continuity.sourceVideo,
          targetPath: 'media/source.mp4',
          size: continuity.sourceVideoSize,
          sha256: continuity.sourceVideoSha256
        }],
        outputs: [{
          path: 'continuity-frame.png',
          originalName: `${continuity.fromShotId}-last-frame.png`,
          mimeType: 'image/png',
          destination: { ...destination, folder: `files/story-studio/${task.projectId}/continuity` }
        }],
        timeoutMs: 90_000
      })
      const output = result.outputs.find((item) => item.path === 'continuity-frame.png')
      if (!output) throw new Error('Continuity frame output was not returned.')
      continuity.sourceFrame = output.reference
      continuity.status = 'ready'
      continuity.strength = 'first_frame'
      task.request.references = [
        { kind: 'image', purpose: 'first_frame', file: output.reference },
        ...(task.request.references ?? []).filter((item) => item.purpose !== 'first_frame')
      ]
      task.stage = 'submitting'
      task.progress = 5
      await this.tasks.save(task)
      await this.saveContinuityPreparation(task, 'ready', undefined, undefined, result.id)
    } catch (error) {
      continuity.status = 'prompt_only'
      continuity.strength = 'prompt_only'
      task.stage = 'submitting'
      task.progress = 5
      await this.tasks.save(task)
      await this.saveContinuityPreparation(task, 'prompt_only', 'frame_preparation_failed', errorMessage(error))
      this.logger.warn(`Continuity frame preparation fell back to prompt-only for task ${task.id}: ${errorMessage(error)}`)
    }
  }

  private async saveContinuityPreparation(
    task: StoryVideoGenerationTask,
    status: StoryShotContinuityBoundary['status'],
    failureCode?: string,
    failureMessage?: string,
    sandboxJobId?: string
  ) {
    const continuity = task.request.continuity
    if (!continuity?.fromShotId) return
    const row = await this.continuityBoundaries.findOne({
      where: {
        tenantId: task.tenantId,
        scopeKey: task.scopeKey,
        projectId: task.projectId,
        fromShotId: continuity.fromShotId,
        toShotId: task.shotId
      }
    })
    if (!row) return
    row.status = status
    row.snapshot = continuity
    row.sourceFrameFile = continuity.sourceFrame ?? null
    row.failureCode = failureCode ?? null
    row.failureMessage = failureMessage ?? null
    row.sandboxJobId = sandboxJobId ?? row.sandboxJobId ?? null
    await this.continuityBoundaries.save(row)
  }

  private async finalizeTask(task: StoryVideoGenerationTask) {
    if (!task.outputFile) throw new BadRequestException('story_video_output_missing')
    const files = this.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new ServiceUnavailableException('story_video_workspace_files_unavailable')
    const file = await files.readRuntimeBuffer(task.outputFile)
    validateVideoFile(file, task.tenantId)
    const sha256 = createHash('sha256').update(file.buffer).digest('hex')

    await this.tasks.manager.transaction(async (manager) => {
      const taskRepository = manager.getRepository(StoryVideoGenerationTask)
      const lockedTask = await taskRepository.findOne({
        where: { id: task.id, tenantId: task.tenantId, scopeKey: task.scopeKey },
        lock: { mode: 'pessimistic_write' }
      })
      if (
        !lockedTask ||
        lockedTask.status === 'completed' ||
        lockedTask.status === 'cancelled' ||
        lockedTask.cancellationRequested
      ) return
      const project = await manager.getRepository(StoryProject).findOne({
        where: { id: task.projectId, tenantId: task.tenantId, scopeKey: task.scopeKey },
        lock: { mode: 'pessimistic_write' }
      })
      const production = await manager.getRepository(StoryProduction).findOne({
        where: { projectId: task.projectId, tenantId: task.tenantId, scopeKey: task.scopeKey },
        lock: { mode: 'pessimistic_write' }
      })
      if (!project || !production) throw new NotFoundException('story_video_target_not_found')
      const target = findShot(production.scenes, task.sceneId, task.shotId)
      if (!target) {
        lockedTask.status = 'stale'
        lockedTask.stage = 'source_changed'
        lockedTask.progress = 100
        lockedTask.failureCode = 'shot_removed'
        lockedTask.failureMessage = 'The shot was removed before the generated clip was ready.'
        lockedTask.recoverable = false
        lockedTask.completedAt = new Date()
        await taskRepository.save(lockedTask)
        return
      }
      if (shotSourceFingerprint(target.scene, target.shot, task.request) !== task.sourceFingerprint) {
        lockedTask.status = 'stale'
        lockedTask.stage = 'source_changed'
        lockedTask.progress = 100
        lockedTask.failureCode = 'source_changed'
        lockedTask.failureMessage = 'The shot changed before the generated clip was ready.'
        lockedTask.recoverable = true
        lockedTask.completedAt = new Date()
        await taskRepository.save(lockedTask)
        return
      }
      const candidateId = task.resultCandidateId || task.id
      const duplicate = production.scenes
        .flatMap((scene) => scene.shots)
        .flatMap((shot) => shot.candidates ?? [])
        .some((candidate) => candidate.id === candidateId)
      if (!duplicate) {
        const candidate = buildCandidate(task, file, sha256, candidateId)
        production.scenes = appendCandidate(production.scenes, task.sceneId, task.shotId, candidate)
        const previousRevision = project.revision
        project.revision += 1
        project.candidateCount += 1
        project.lastEditedById = task.createdById ?? task.assistantId ?? null
        project.lastEditedAt = new Date()
        production.projectRevision = project.revision
        production.documentRevision += 1
        production.operationId = `video-task:${task.id}`
        production.inputChecksum = checksumOf(production.scenes)
        production.changeSummary = `Added generated Take ${task.takeIndex}`
        production.lastEditedById = task.createdById ?? task.assistantId ?? null
        await manager.getRepository(StoryProject).save(project)
        await manager.getRepository(StoryProduction).save(production)
        await manager.getRepository(StoryActionLog).save(manager.getRepository(StoryActionLog).create({
          tenantId: task.tenantId,
          organizationId: task.organizationId ?? null,
          workspaceId: task.workspaceId ?? null,
          hostProjectId: task.hostProjectId ?? null,
          scopeKey: task.scopeKey,
          projectId: project.id,
          operationId: `video-task:${task.id}`,
          operationFingerprint: checksumOf({ taskId: task.id, candidateId, sha256 }),
          action: 'generated_video_attached',
          actorType: 'system',
          actorId: task.assistantId ?? null,
          changeSummary: `Added generated Take ${task.takeIndex}`,
          previousRevision,
          resultingRevision: project.revision,
          changedFields: [`production.scenes.${task.sceneId}.shots.${task.shotId}.candidates`]
        }))
      }
      lockedTask.status = 'completed'
      lockedTask.stage = 'completed'
      lockedTask.progress = 100
      lockedTask.resultCandidateId = candidateId
      lockedTask.failureCode = null
      lockedTask.failureMessage = null
      lockedTask.recoverable = false
      lockedTask.completedAt = new Date()
      await taskRepository.save(lockedTask)
    })
  }

  private async enqueueSubmit(queue: ManagedQueueService, task: StoryVideoGenerationTask) {
    const result = await queue.enqueue<StoryVideoGenerationQueuePayload>({
      pluginName: STORY_STUDIO_PLUGIN_NAME,
      queueName: STORY_VIDEO_GENERATION_QUEUE,
      jobName: STORY_VIDEO_GENERATION_SUBMIT_JOB,
      payload: { taskId: task.id },
      tenantId: task.tenantId,
      organizationId: task.organizationId,
      scopeKey: SYSTEM_GLOBAL_SCOPE,
      userId: task.createdById,
      jobId: `story-video-submit-${task.id}`,
      attempts: 1,
      removeOnComplete: { age: 24 * 60 * 60, count: 500 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 }
    })
    task.queueJobId = result.jobId
    await this.tasks.save(task)
  }

  private async enqueuePoll(
    queue: ManagedQueueService,
    task: StoryVideoGenerationTask,
    delayMs: number,
    force = false
  ) {
    const sequence = force ? `refresh-${Date.now()}` : `${task.pollSequence}-${Date.now()}`
    const result = await queue.enqueue<StoryVideoGenerationQueuePayload>({
      pluginName: STORY_STUDIO_PLUGIN_NAME,
      queueName: STORY_VIDEO_GENERATION_QUEUE,
      jobName: STORY_VIDEO_GENERATION_POLL_JOB,
      payload: { taskId: task.id },
      tenantId: task.tenantId,
      organizationId: task.organizationId,
      scopeKey: SYSTEM_GLOBAL_SCOPE,
      userId: task.createdById,
      jobId: `story-video-poll-${task.id}-${sequence}`,
      delayMs,
      attempts: 1,
      removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 1_000 }
    })
    task.queueJobId = result.jobId
    task.nextPollAt = new Date(Date.now() + delayMs)
    await this.tasks.save(task)
  }

  private async failTask(
    task: StoryVideoGenerationTask,
    code: string,
    message: string,
    recoverable: boolean,
    status: StoryVideoGenerationStatus = 'failed'
  ) {
    task.status = status
    task.stage = status
    task.failureCode = code.slice(0, 100)
    task.failureMessage = message.slice(0, 2_000)
    task.recoverable = recoverable
    task.progress = status === 'submission_unknown' ? 5 : 0
    task.completedAt = new Date()
    await this.tasks.save(task)
  }

  private requireQueue() {
    if (!this.queue) throw new ServiceUnavailableException('story_video_queue_unavailable')
    return this.queue
  }

  private platform() {
    this.platformService ??= this.pluginContext.resolve<
      StoryVideoGenerationPlatformService,
      StoryVideoGenerationPlatformService
    >(VIDEO_GENERATION_PERMISSION_SERVICE_TOKEN)
    return this.platformService
  }

  private async requireProject(scope: StoryScope, projectId: string) {
    validateScope(scope)
    const project = await this.projects.findOne({ where: projectWhere(scope, { id: projectId }) })
    if (!project) throw new NotFoundException('story_project_not_found')
    return project
  }

  private async requireProduction(scope: StoryScope, projectId: string) {
    const production = await this.productions.findOne({ where: productionWhere(scope, { projectId }) })
    if (!production) throw new BadRequestException('story_production_required')
    return production
  }

  private async requireTask(scope: StoryScope, projectId: string, taskId: string) {
    const task = await this.tasks.findOne({ where: taskWhere(scope, { id: taskId, projectId }) })
    if (!task) throw new NotFoundException('story_video_task_not_found')
    return task
  }

  private async requireQueueTask(taskId: string) {
    const tenantId = RequestContext.currentTenantId()
    const task = await this.tasks.findOne({ where: { id: taskId, ...(tenantId ? { tenantId } : {}) } })
    if (!task) throw new NotFoundException('story_video_task_not_found')
    return task
  }
}

function shotSourceFingerprint(scene: StoryScene, shot: StoryShot, request: StoryVideoGenerationRequestSnapshot) {
  return checksumOf({
    scene: { id: scene.id, title: scene.title, location: scene.location, timeOfDay: scene.timeOfDay },
    shot: {
      id: shot.id,
      title: shot.title,
      composition: shot.composition,
      action: shot.action,
      camera: shot.camera,
      dialogue: shot.dialogue,
      dialogueSpeakerId: shot.dialogueSpeakerId,
      dialogueType: shot.dialogueType,
      soundEffects: shot.soundEffects,
      generationPrompt: shot.generationPrompt,
      emotion: shot.emotion,
      lens: shot.lens,
      lighting: shot.lighting,
      colorTone: shot.colorTone,
      weather: shot.weather,
      videoSettings: shot.videoSettings,
      durationSeconds: shot.durationSeconds
    },
    request: sourceFingerprintRequest(request)
  })
}

function sourceFingerprintRequest(request: StoryVideoGenerationRequestSnapshot) {
  const { continuity, references, ...rest } = request
  const stableReferences = references?.filter((item) => item.purpose !== 'first_frame')
  return {
    ...rest,
    ...(stableReferences?.length ? { references: stableReferences } : {}),
    ...(continuity ? { continuity: sourceFingerprintContinuity(continuity) } : {})
  }
}

function sourceFingerprintContinuity(
  continuity: NonNullable<StoryVideoGenerationRequestSnapshot['continuity']>
) {
  const { sourceFrame: _sourceFrame, status: _status, strength: _strength, ...stable } = continuity
  return stable
}

function buildCandidate(
  task: StoryVideoGenerationTask,
  file: WorkspaceRuntimeFileBuffer,
  sha256: string,
  candidateId: string
): StoryMediaCandidate {
  const originalName = file.reference.originalName ?? file.reference.name ?? file.name ?? `${candidateId}.mp4`
  return {
    id: candidateId,
    kind: 'video',
    label: `Take ${task.takeIndex}`,
    selected: false,
    ...(file.fileUrl ? { fileUrl: file.fileUrl } : {}),
    workspacePath: file.reference.workspacePath,
    prompt: task.request.prompt,
    providerReceipt: {
      provider: task.generatorFamily,
      taskId: task.providerTaskId ?? task.id,
      model: task.request.model,
      status: task.providerStatus ?? 'completed'
    },
    originalName,
    mimeType: 'video/mp4',
    size: file.buffer.length,
    sha256,
    fileReference: storyPortableReference(file.reference)
  }
}

function appendCandidate(
  scenes: StoryScene[],
  sceneId: string,
  shotId: string,
  candidate: StoryMediaCandidate
) {
  return scenes.map((scene) => scene.id !== sceneId ? scene : ({
    ...scene,
    shots: scene.shots.map((shot) => shot.id !== shotId ? shot : ({
      ...shot,
      candidates: [...(shot.candidates ?? []), candidate]
    }))
  }))
}

function storyPortableReference(reference: WorkspacePortableFileReference): StoryPortableFileReference {
  return {
    source: reference.source,
    filePath: reference.filePath,
    workspacePath: reference.workspacePath,
    ...(reference.catalog ? { catalog: reference.catalog } : {}),
    ...(reference.scopeId ? { scopeId: reference.scopeId } : {}),
    ...(reference.tenantId ? { tenantId: reference.tenantId } : {}),
    ...(reference.userId ? { userId: reference.userId } : {}),
    ...(reference.projectId ? { projectId: reference.projectId } : {}),
    ...(reference.xpertId ? { xpertId: reference.xpertId } : {}),
    ...(reference.isolateByUser != null ? { isolateByUser: reference.isolateByUser } : {}),
    ...(reference.originalName ? { originalName: reference.originalName } : {}),
    ...(reference.name ? { name: reference.name } : {}),
    ...(reference.mimeType ? { mimeType: reference.mimeType } : {}),
    ...(reference.size != null ? { size: reference.size } : {})
  }
}

function requireShot(scenes: StoryScene[], sceneId: string, shotId: string) {
  const result = findShot(scenes, sceneId, shotId)
  if (!result) throw new NotFoundException('story_video_shot_not_found')
  return result
}

function findShot(scenes: StoryScene[], sceneId: string, shotId: string) {
  const scene = scenes.find((item) => item.id === sceneId)
  const shot = scene?.shots.find((item) => item.id === shotId)
  return scene && shot ? { scene, shot } : null
}

function validateVideoFile(file: WorkspaceRuntimeFileBuffer, tenantId: string) {
  if (file.reference.tenantId && file.reference.tenantId !== tenantId) {
    throw new BadRequestException('story_video_file_scope_mismatch')
  }
  const mp4 = file.buffer.length >= 12 && file.buffer.subarray(4, 8).toString('ascii') === 'ftyp'
  if (!file.buffer.length || file.buffer.length > MAX_VIDEO_BYTES || !mp4) {
    throw new BadRequestException('story_video_file_invalid')
  }
}

function selectDefaultGenerator(project: StoryProject, generators: StoryVideoGeneratorSummary[]) {
  return generators.find((item) => item.id === project.preferredVideoGeneratorToolsetId)
    ?? generators.find((item) => item.linkedToXpert)
    ?? [...generators].sort((left, right) => {
      const familyOrder = STORY_VIDEO_GENERATOR_FAMILIES.indexOf(left.family) - STORY_VIDEO_GENERATOR_FAMILIES.indexOf(right.family)
      return familyOrder || left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id)
    })[0]
}

function compactTask(task: StoryVideoGenerationTask): StoryVideoTaskSummary {
  return {
    id: task.id,
    projectId: task.projectId,
    sceneId: task.sceneId,
    shotId: task.shotId,
    requestGroupId: task.requestGroupId,
    takeIndex: task.takeIndex,
    generatorFamily: task.generatorFamily,
    generatorName: task.generatorName,
    status: task.status,
    stage: task.stage,
    progress: task.progress,
    providerStatus: task.providerStatus ?? null,
    resultCandidateId: task.resultCandidateId ?? null,
    failureCode: task.failureCode ?? null,
    failureMessage: publicFailureMessage(task),
    recoverable: task.recoverable,
    upstreamMayContinue: task.upstreamMayContinue,
    createdAt: task.createdAt?.toISOString() ?? null,
    updatedAt: task.updatedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    continuityStatus: task.request.continuity?.status ?? null,
    continuityStrength: task.request.continuity?.strength ?? null,
    continuityFromShotId: task.request.continuity?.fromShotId ?? null,
    continuityRisks: task.request.continuity?.risks ?? []
  }
}

function publicFailureMessage(task: StoryVideoGenerationTask) {
  if (!task.failureCode && !task.failureMessage) return null
  if (task.failureCode === 'source_changed') {
    return 'The shot changed while the clip was being generated. The result was kept but not attached.'
  }
  if (task.failureCode === 'shot_removed') {
    return 'The shot was removed while the clip was being generated. The result was kept but not attached.'
  }
  if (task.failureCode === 'submission_result_unknown') {
    return 'The video service has not confirmed whether it accepted this request.'
  }
  if (task.failureCode === 'submission_rejected') {
    return 'The video request could not be started.'
  }
  return 'The clip could not be generated.'
}

function familyDisplayName(family: StoryVideoGeneratorFamily) {
  if (family === 'veo') return 'Veo'
  if (family === 'kling') return 'Kling'
  return 'Seedance'
}

function requireAssistantId(scope: StoryScope, project: StoryProject) {
  const value = scope.assistantId ?? project.assistantId
  if (!value?.trim()) throw new BadRequestException('story_video_xpert_required')
  return value.trim()
}

function requireTaskAssistantId(task: StoryVideoGenerationTask) {
  if (!task.assistantId?.trim()) throw new BadRequestException('story_video_xpert_required')
  return task.assistantId.trim()
}

function isDeterministicSubmissionError(error: unknown) {
  const message = errorMessage(error).toLowerCase()
  return message.includes('required') || message.includes('not_available')
    || message.includes('not_supported') || message.includes('not_enabled')
    || message.includes('did not match expected schema')
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function validateScope(scope: StoryScope) {
  if (!scope.tenantId?.trim()) throw new BadRequestException('story_tenant_required')
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

function projectWhere(scope: StoryScope, extra: FindOptionsWhere<StoryProject>) {
  return { tenantId: scope.tenantId, scopeKey: buildStoryScopeKey(scope), ...extra }
}

function productionWhere(scope: StoryScope, extra: FindOptionsWhere<StoryProduction>) {
  return { tenantId: scope.tenantId, scopeKey: buildStoryScopeKey(scope), ...extra }
}

function taskWhere(scope: StoryScope, extra: FindOptionsWhere<StoryVideoGenerationTask>) {
  return { tenantId: scope.tenantId, scopeKey: buildStoryScopeKey(scope), ...extra }
}

function logWhere(scope: StoryScope, extra: FindOptionsWhere<StoryActionLog>) {
  return { tenantId: scope.tenantId, scopeKey: buildStoryScopeKey(scope), ...extra }
}

function checksumOf(value: unknown) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export type { StoryVideoGenerationQueuePayload }
