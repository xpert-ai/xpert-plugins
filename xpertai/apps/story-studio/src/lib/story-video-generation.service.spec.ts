jest.mock('@xpert-ai/plugin-sdk', () => ({
  MANAGED_QUEUE_SERVICE_TOKEN: Symbol('managed-queue'),
  RequestContext: { currentTenantId: () => null },
  SandboxJobsRuntimeCapability: { id: 'platform.sandbox.jobs' },
  SYSTEM_GLOBAL_SCOPE: 'system',
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol('runtime-capabilities'),
  pluginArtifactTableName: (namespace: string, key: string) =>
    `plugin_${namespace}_${key}`
}))

import {
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  type WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import {
  StoryActionLog,
  StoryProduction,
  StoryProject,
  StoryShotContinuityBoundary,
  StoryVideoGenerationTask
} from './entities/index.js'
import { StoryVideoGenerationService } from './story-video-generation.service.js'
import type { StoryScope } from './types.js'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const TOOLSET_ID = '22222222-2222-4222-8222-222222222222'
const XPERT_ID = '33333333-3333-4333-8333-333333333333'

describe('StoryVideoGenerationService', () => {
  it('selects the project generator and exposes unconfigured families as unavailable', async () => {
    const harness = createHarness()

    const catalog = await harness.service.listGenerators(harness.scope, PROJECT_ID)
    await harness.service.setProjectGenerator(harness.scope, {
      projectId: PROJECT_ID,
      toolsetId: TOOLSET_ID
    })

    expect(catalog.selectedToolsetId).toBe(TOOLSET_ID)
    expect(catalog.generators).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: 'seedance', available: true }),
      expect.objectContaining({ family: 'veo', available: false }),
      expect.objectContaining({ family: 'kling', available: false })
    ]))
    expect(harness.project.preferredVideoGeneratorToolsetId).toBe(TOOLSET_ID)
    expect(harness.project.preferredVideoGeneratorFamily).toBe('seedance')
  })

  it('creates one durable task per Take and reuses an identical operation', async () => {
    const harness = createHarness()
    const input = generationInput('operation-idempotent-0001', 2)

    const first = await harness.service.generateTakes(harness.scope, input)
    const second = await harness.service.generateTakes(harness.scope, input)

    expect(first.tasks).toHaveLength(2)
    expect(second.tasks.map((item) => item.id)).toEqual(first.tasks.map((item) => item.id))
    expect(harness.queue.enqueue).toHaveBeenCalledTimes(2)
    expect(harness.tasks.map((item) => item.takeIndex)).toEqual([1, 2])
  })

  it('submits a prompt compiled from the current shot script and saved references', async () => {
    const harness = createHarness()
    const image: WorkspacePortableFileReference = {
      source: 'platform.workspace.files',
      filePath: 'characters/pony.jpg',
      workspacePath: 'characters/pony.jpg',
      catalog: 'projects',
      scopeId: harness.scope.hostProjectId,
      mimeType: 'image/jpeg'
    }
    harness.production.characters = [{ id: 'character-pony', name: '小马' }]
    harness.production.assets = [{
      id: 'asset-pony',
      kind: 'character',
      name: '小马',
      description: '棕色幼年小马，背着麦袋',
      prompt: '儿童绘本角色',
      candidates: [{
        id: 'asset-pony-selected',
        kind: 'image',
        label: '锁定造型',
        selected: true,
        fileReference: image
      }]
    }]
    const shot = harness.production.scenes[0].shots[0]
    shot.action = '小马背着麦袋向小河跑去'
    shot.dialogue = '妈妈，我出发了！'
    shot.dialogueSpeakerId = 'character-pony'
    shot.dialogueType = 'dialogue'
    shot.videoSettings = { referenceAssetIds: ['asset-pony'] }
    harness.platform.submit.mockResolvedValue({
      providerTaskId: 'provider-script-request',
      status: 'queued'
    })

    await harness.service.generateTakes(
      harness.scope,
      { ...generationInput('operation-script-request-0001', 1), prompt: '保持温暖绘本质感' }
    )
    await harness.service.processSubmit(harness.tasks[0].id)

    expect(harness.tasks[0].request).toMatchObject({
      userPrompt: '保持温暖绘本质感',
      referenceAssetIds: ['asset-pony'],
      referenceImageCandidateIds: ['asset-pony-selected'],
      references: [{ kind: 'image', purpose: 'reference', file: image }]
    })
    expect(harness.platform.submit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('动作表演：小马背着麦袋向小河跑去'),
      references: [{ kind: 'image', purpose: 'reference', file: image }]
    }))
    expect(harness.platform.submit.mock.calls[0][0]).not.toHaveProperty('inputImage')
    expect(harness.platform.submit.mock.calls[0][0].prompt).toContain(
      '对白：小马：“妈妈，我出发了！”'
    )
  })

  it('does not start another batch while the shot already has active work', async () => {
    const harness = createHarness()
    await harness.service.generateTakes(harness.scope, generationInput('operation-active-0001', 1))

    await expect(harness.service.generateTakes(
      harness.scope,
      generationInput('operation-active-0002', 1)
    )).rejects.toThrow('story_video_generation_already_active')
  })

  it('marks an ambiguous submission without automatically retrying paid work', async () => {
    const harness = createHarness()
    await harness.service.generateTakes(harness.scope, generationInput('operation-unknown-0001', 1))
    const task = harness.tasks[0]
    harness.platform.submit.mockRejectedValue(new Error('socket timeout'))

    await harness.service.processSubmit(task.id)

    expect(task.status).toBe('submission_unknown')
    expect(task.failureCode).toBe('submission_result_unknown')
    expect(task.recoverable).toBe(true)
    expect(harness.platform.submit).toHaveBeenCalledTimes(1)
    expect(harness.queue.enqueue).toHaveBeenCalledTimes(1)
  })

  it('marks local tool input validation as rejected instead of submission unknown', async () => {
    const harness = createHarness()
    await harness.service.generateTakes(harness.scope, generationInput('operation-rejected-0001', 1))
    const task = harness.tasks[0]
    harness.platform.submit.mockRejectedValue(
      new Error('Received tool input did not match expected schema')
    )

    await harness.service.processSubmit(task.id)

    expect(task.status).toBe('failed')
    expect(task.failureCode).toBe('submission_rejected')
    expect(harness.platform.submit).toHaveBeenCalledTimes(1)
    expect(harness.queue.enqueue).toHaveBeenCalledTimes(1)
    const listed = await harness.service.listTasks(harness.scope, {
      projectId: PROJECT_ID,
      page: 1,
      pageSize: 20
    })
    expect(listed.items[0].failureMessage).toBe(
      'Received tool input did not match expected schema'
    )
    expect(listed.items[0].failureMessage).not.toMatch(/unknown/i)
  })

  it('surfaces provider quota rejections instead of collapsing them into submission unknown', async () => {
    const harness = createHarness()
    await harness.service.generateTakes(harness.scope, generationInput('operation-quota-0001', 1))
    const task = harness.tasks[0]
    harness.platform.submit.mockRejectedValue(
      new Error('Ark API error 402: {"error":{"code":"insufficient_quota","message":"No remaining quota"}}')
    )

    await harness.service.processSubmit(task.id)

    expect(task.status).toBe('failed')
    expect(task.failureCode).toBe('submission_rejected')
    expect(task.failureMessage).toContain('insufficient_quota')
    const listed = await harness.service.listTasks(harness.scope, {
      projectId: PROJECT_ID,
      page: 1,
      pageSize: 20
    })
    expect(listed.items[0].failureMessage).toContain('insufficient_quota')
    expect(listed.items[0].failureMessage).toContain('No remaining quota')
  })

  it('stops local tracking when the generator cannot cancel upstream work', async () => {
    const harness = createHarness()
    await harness.service.generateTakes(harness.scope, generationInput('operation-cancel-0001', 1))
    const task = harness.tasks[0]
    task.status = 'generating'
    task.providerTaskId = 'provider-task-1'
    harness.platform.cancel.mockResolvedValue({
      providerTaskId: task.providerTaskId,
      supported: false,
      cancelled: false,
      status: 'tracking_stopped'
    })

    const result = await harness.service.cancelTask(harness.scope, {
      projectId: PROJECT_ID,
      taskId: task.id,
      operationId: 'operation-cancel-action-0001',
      changeSummary: 'Stop tracking this Take'
    })

    expect(result.status).toBe('cancelled')
    expect(result.upstreamMayContinue).toBe(true)
    expect(harness.queue.cancel).toHaveBeenCalledWith({ jobId: task.queueJobId })
  })

  it('creates a linked retry only after the failed task remains source-compatible', async () => {
    const harness = createHarness()
    await harness.service.generateTakes(harness.scope, generationInput('operation-original-0001', 1))
    const original = harness.tasks[0]
    original.status = 'failed'
    original.recoverable = true

    const result = await harness.service.retryTask(harness.scope, {
      projectId: PROJECT_ID,
      taskId: original.id,
      operationId: 'operation-retry-action-0001',
      changeSummary: 'Retry this Take'
    })

    expect(result.status).toBe('queued')
    expect(harness.tasks).toHaveLength(2)
    expect(harness.tasks[1].retryOfTaskId).toBe(original.id)
    expect(harness.queue.enqueue).toHaveBeenCalledTimes(2)
  })

  it('retries an ambiguous continuity task after first-frame preparation updates the request', async () => {
    const harness = createHarness()
    const currentShot = harness.production.scenes[0].shots[0]
    currentShot.continuity = { transition: 'continuous_action' }
    harness.production.scenes[0].shots = [{
      id: 'shot-0',
      title: 'Previous shot',
      composition: 'Wide shot',
      action: 'The pony starts crossing the river.',
      camera: 'Static',
      durationSeconds: 8,
      candidates: [{
        id: 'previous-video',
        kind: 'video',
        label: 'Previous take',
        selected: true,
        size: 1_024,
        sha256: 'previous-video-sha256',
        fileReference: {
          source: 'platform.workspace.files',
          filePath: 'files/story-studio/previous.mp4',
          workspacePath: 'files/story-studio/previous.mp4',
          catalog: 'projects',
          scopeId: harness.scope.hostProjectId,
          mimeType: 'video/mp4'
        }
      }]
    }, currentShot]
    harness.platform.submit.mockRejectedValue(new Error('socket timeout'))

    await harness.service.generateTakes(
      harness.scope,
      generationInput('operation-continuity-unknown-0001', 1)
    )
    const original = harness.tasks[0]
    await harness.service.processSubmit(original.id)

    expect(original.status).toBe('submission_unknown')
    expect(original.request.references).toEqual([
      expect.objectContaining({ purpose: 'first_frame', file: harness.continuityFrameFile })
    ])
    expect(harness.platform.submit).toHaveBeenCalledWith(expect.objectContaining({
      references: [
        expect.objectContaining({ purpose: 'first_frame', file: harness.continuityFrameFile })
      ]
    }))

    const result = await harness.service.retryTask(harness.scope, {
      projectId: PROJECT_ID,
      taskId: original.id,
      operationId: 'operation-continuity-retry-0001',
      changeSummary: 'Retry this continuity Take'
    })

    expect(result.status).toBe('queued')
    expect(harness.tasks).toHaveLength(2)
    expect(harness.tasks[1].retryOfTaskId).toBe(original.id)
    expect(harness.queue.enqueue).toHaveBeenCalledTimes(2)
  })

  it('attaches a completed MP4 once and leaves the candidate unselected', async () => {
    const harness = createHarness()
    await harness.service.generateTakes(harness.scope, generationInput('operation-complete-0001', 1))
    const task = harness.tasks[0]
    task.status = 'generating'
    task.providerTaskId = 'provider-task-completed'
    harness.platform.query.mockResolvedValue(completedQuery(task.providerTaskId))

    await harness.service.processPoll(task.id)
    await harness.service.processPoll(task.id)

    const candidates = harness.production.scenes[0].shots[0].candidates
    expect(task.status).toBe('completed')
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      id: task.resultCandidateId,
      kind: 'video',
      selected: false,
      mimeType: 'video/mp4'
    })
    expect(harness.project.revision).toBe(4)
  })

  it('keeps the result file but does not attach it after the shot changes', async () => {
    const harness = createHarness()
    await harness.service.generateTakes(harness.scope, generationInput('operation-stale-0001', 1))
    const task = harness.tasks[0]
    task.status = 'generating'
    task.providerTaskId = 'provider-task-stale'
    harness.production.scenes[0].shots[0].action = 'The action changed after submission.'
    harness.platform.query.mockResolvedValue(completedQuery(task.providerTaskId))

    await harness.service.processPoll(task.id)

    expect(task.status).toBe('stale')
    expect(task.failureCode).toBe('source_changed')
    expect(task.outputFile).toBeDefined()
    expect(harness.production.scenes[0].shots[0].candidates).toHaveLength(0)
  })
})

function createHarness() {
  const scope: StoryScope = {
    tenantId: 'tenant-1',
    organizationId: 'organization-1',
    workspaceId: 'workspace-1',
    hostProjectId: 'workspace-project-1',
    userId: 'user-1',
    assistantId: XPERT_ID,
    conversationId: 'conversation-1',
    actorType: 'user'
  }
  const project = {
    id: PROJECT_ID,
    tenantId: scope.tenantId,
    scopeKey: 'scope-key',
    revision: 3,
    candidateCount: 0,
    assistantId: XPERT_ID,
    preferredVideoGeneratorToolsetId: null,
    preferredVideoGeneratorFamily: null
  } as StoryProject
  const production = {
    projectId: PROJECT_ID,
    tenantId: scope.tenantId,
    scopeKey: 'scope-key',
    projectRevision: 3,
    documentRevision: 2,
    operationId: 'production-operation',
    inputChecksum: 'checksum',
    changeSummary: 'Initial production',
    scenes: [{
      id: 'scene-1',
      order: 1,
      title: 'First scene',
      location: 'Courtyard',
      timeOfDay: 'Morning',
      shots: [{
        id: 'shot-1',
        order: 1,
        title: 'First shot',
        composition: 'Medium shot',
        action: 'A parent loads a bag onto a pony.',
        camera: 'Slow push in',
        durationSeconds: 8,
        candidates: []
      }]
    }]
  } as unknown as StoryProduction
  const tasks: StoryVideoGenerationTask[] = []
  const logs: StoryActionLog[] = []
  const boundaries: StoryShotContinuityBoundary[] = []
  let idSequence = 0

  const taskRepository = {
    manager: null as unknown,
    find: jest.fn(async ({ where }: any) => tasks.filter((item) =>
      (!where.operationId || item.operationId === where.operationId)
    )),
    findOne: jest.fn(async ({ where }: any) => tasks.find((item) =>
      (!where.id || item.id === where.id) &&
      (!where.projectId || item.projectId === where.projectId) &&
      (!where.operationId || item.operationId === where.operationId) &&
      (!where.takeIndex || item.takeIndex === where.takeIndex)
    ) ?? null),
    findAndCount: jest.fn(async () => [tasks, tasks.length]),
    count: jest.fn(async () => tasks.filter((item) =>
      ['queued', 'submitting', 'generating', 'finalizing'].includes(item.status)
    ).length),
    create: jest.fn((value: Partial<StoryVideoGenerationTask>) => ({
      id: `44444444-4444-4444-8444-${String(++idSequence).padStart(12, '0')}`,
      pollSequence: 0,
      queryFailureCount: 0,
      cancellationRequested: false,
      upstreamMayContinue: false,
      recoverable: false,
      createdAt: new Date(Date.now() - 60_000),
      updatedAt: new Date(Date.now() - 60_000),
      ...value
    }) as StoryVideoGenerationTask),
    save: jest.fn(async (value: StoryVideoGenerationTask | StoryVideoGenerationTask[]) => {
      const values = Array.isArray(value) ? value : [value]
      for (const item of values) {
        if (!tasks.some((task) => task.id === item.id)) tasks.push(item)
        item.updatedAt = new Date('2026-08-06T08:01:00.000Z')
      }
      return value
    })
  }
  const projectRepository = {
    findOne: jest.fn(async () => project),
    update: jest.fn(async (_where: unknown, values: Partial<StoryProject>) => Object.assign(project, values)),
    save: jest.fn(async (value: StoryProject) => value)
  }
  const productionRepository = {
    findOne: jest.fn(async () => production),
    save: jest.fn(async (value: StoryProduction) => value)
  }
  const logRepository = {
    findOne: jest.fn(async () => null),
    create: jest.fn((value: Partial<StoryActionLog>) => value as StoryActionLog),
    save: jest.fn(async (value: StoryActionLog) => {
      logs.push(value)
      return value
    })
  }
  const continuityRepository = {
    findOne: jest.fn(async ({ where }: any) => boundaries.find((item) =>
      item.projectId === where.projectId && item.fromShotId === where.fromShotId && item.toShotId === where.toShotId
    ) ?? null),
    create: jest.fn((value: Partial<StoryShotContinuityBoundary>) => ({ id: `boundary-${boundaries.length + 1}`, ...value }) as StoryShotContinuityBoundary),
    save: jest.fn(async (value: StoryShotContinuityBoundary) => {
      if (!boundaries.some((item) => item.id === value.id)) boundaries.push(value)
      return value
    }),
    update: jest.fn(async () => ({ affected: 0 }))
  }
  const transactionManager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === StoryVideoGenerationTask) return taskRepository
      if (entity === StoryProject) return projectRepository
      if (entity === StoryProduction) return productionRepository
      if (entity === StoryActionLog) return logRepository
      if (entity === StoryShotContinuityBoundary) return continuityRepository
      throw new Error('Unexpected repository')
    }),
    transaction: jest.fn(async (callback: (manager: any) => unknown) => callback(transactionManager))
  }
  taskRepository.manager = transactionManager
  ;(projectRepository as any).manager = transactionManager

  const queue = {
    enqueue: jest.fn(async ({ jobId }: { jobId: string }) => ({ jobId })),
    cancel: jest.fn(async () => ({ cancelled: true }))
  }
  const platform = {
    listGenerators: jest.fn(async () => ({ generators: [{
      id: TOOLSET_ID,
      family: 'seedance',
      name: 'Seedance',
      displayName: 'Seedance',
      linkedToXpert: true,
      modes: ['text_to_video', 'image_to_video'],
      models: [{ id: 'seedance-model', label: 'Seedance Model' }],
      defaultModel: 'seedance-model',
      resolutions: ['720p'],
      aspectRatios: ['9:16'],
      durationSeconds: { min: 4, max: 15, default: 5 },
      supportsAudio: true,
      supportsCancel: false
    }] })),
    submit: jest.fn(),
    query: jest.fn(),
    cancel: jest.fn()
  }
  const outputFile: WorkspacePortableFileReference = {
    source: 'platform.workspace.files',
    filePath: 'files/story-studio/generated.mp4',
    workspacePath: 'files/story-studio/generated.mp4',
    catalog: 'projects',
    scopeId: scope.hostProjectId,
    mimeType: 'video/mp4',
    originalName: 'generated.mp4'
  }
  const continuityFrameFile: WorkspacePortableFileReference = {
    source: 'platform.workspace.files',
    filePath: 'files/story-studio/continuity/shot-0-last-frame.png',
    workspacePath: 'files/story-studio/continuity/shot-0-last-frame.png',
    catalog: 'projects',
    scopeId: scope.hostProjectId,
    mimeType: 'image/png',
    originalName: 'shot-0-last-frame.png',
    size: 128
  }
  const files = {
    readRuntimeBuffer: jest.fn(async () => ({
      buffer: Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
      name: 'generated.mp4',
      fileUrl: '/api/workspace/files/generated.mp4',
      reference: { ...outputFile, tenantId: scope.tenantId }
    }))
  }
  const sandbox = {
    run: jest.fn(async () => ({
      id: 'sandbox-job-1',
      outputs: [{
        path: 'continuity-frame.png',
        reference: continuityFrameFile
      }]
    }))
  }
  const pluginContext = { resolve: jest.fn(() => platform) }
  const capabilities = {
    get: jest.fn((key: unknown) => {
      if (key === WorkspaceFilesRuntimeCapability) return files
      if (key === SandboxJobsRuntimeCapability) return sandbox
      return undefined
    })
  }
  const service = new StoryVideoGenerationService(
    projectRepository as never,
    productionRepository as never,
    taskRepository as never,
    continuityRepository as never,
    logRepository as never,
    pluginContext as never,
    queue as never,
    capabilities as never
  )
  return { service, scope, project, production, tasks, boundaries, logs, queue, platform, outputFile, continuityFrameFile, sandbox }
}

function generationInput(operationId: string, takeCount: number) {
  return {
    projectId: PROJECT_ID,
    operationId,
    sceneId: 'scene-1',
    shotId: 'shot-1',
    toolsetId: TOOLSET_ID,
    takeCount,
    prompt: 'A warm family moment in a courtyard.',
    model: 'seedance-model',
    resolution: '720p',
    aspectRatio: '9:16',
    fps: 24,
    durationSeconds: 8,
    generateAudio: true
  }
}

function completedQuery(providerTaskId: string) {
  return {
    providerTaskId,
    status: 'completed',
    completed: true,
    failed: false,
    outputFile: {
      source: 'platform.workspace.files' as const,
      filePath: 'files/story-studio/generated.mp4',
      workspacePath: 'files/story-studio/generated.mp4',
      catalog: 'projects' as const,
      scopeId: 'workspace-project-1',
      mimeType: 'video/mp4'
    }
  }
}
