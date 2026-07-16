import { randomUUID } from 'node:crypto'
import type { ManagedQueueService, SandboxJobsApi } from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'

jest.mock('./cut.service.js', () => ({ CutService: class CutService {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
  MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE',
  SYSTEM_GLOBAL_SCOPE: 'system:global',
  SandboxJobsRuntimeCapability: { id: 'platform.sandbox.jobs' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES',
  isSandboxJobRuntimeError: (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && 'retryable' in error)
}))

import { applyCutEdit, createStarterCutProject } from './cut-project.js'
import { CutRenderService } from './cut-render.service.js'
import type { CutService } from './cut.service.js'
import { CutActionLog, CutAnalysisJob, CutExport, CutMediaAsset } from './entities/index.js'
import type { CutProjectDocument, CutScope } from './types.js'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const ASSET_ID = '22222222-2222-4222-8222-222222222222'
const REPLACEMENT_ASSET_ID = '33333333-3333-4333-8333-333333333333'
const scope: CutScope = {
  tenantId: 'tenant-a', organizationId: 'org-a', projectId: 'platform-project-a', userId: 'user-a', assistantId: 'assistant-a'
}

describe('CutRenderService', () => {
  it('validates every variant, freezes the source revision, applies templates, and replays idempotently', async () => {
    const harness = createHarness()
    const input = {
      projectId: PROJECT_ID,
      baseRevision: 7,
      variants: [
        { name: 'landscape', variables: { customer: 'Acme' } },
        { name: 'vertical', width: 1080, height: 1920, variables: { customer: '上海团队' }, mediaAssetMap: { [ASSET_ID]: REPLACEMENT_ASSET_ID } }
      ],
      changeSummary: 'Queued two campaign variants.'
    }
    const started = await harness.service.start(scope, input)
    const replay = await harness.service.start(scope, input)

    expect(started).toMatchObject({ success: true, sourceRevision: 7, jobs: [{ status: 'queued' }, { status: 'queued' }] })
    expect(replay.jobs).toEqual(started.jobs.map((job) => expect.objectContaining({ jobId: job.jobId, idempotentReplay: true })))
    expect(harness.queue.enqueue).toHaveBeenCalledTimes(2)
    expect(harness.queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      executionPool: 'sandbox-browser',
      attempts: 3,
      scopeKey: 'system:global',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId
    }))
    const vertical = harness.jobs.rows.find((row) => (row.metadata as Record<string, unknown>)?.variantName === 'vertical')!
    const metadata = vertical.metadata as unknown as { renderDocument: CutProjectDocument; outputName: string }
    expect(metadata.renderDocument.settings).toMatchObject({ width: 1080, height: 1920, fps: 12, durationSeconds: 2 })
    const text = metadata.renderDocument.tracks.flatMap((track) => track.clips).find((clip) => clip.type === 'text')!
    const audio = metadata.renderDocument.tracks.flatMap((track) => track.clips).find((clip) => clip.type === 'audio')!
    expect(text.text).toBe('Hello 上海团队')
    expect(text.transform).toMatchObject({ width: 1080, height: 1920 })
    expect(audio.source).toBeUndefined()
    expect(audio.mediaAssetId).toBe(REPLACEMENT_ASSET_ID)
    expect(audio.previewUrl).toBe(`/media/${REPLACEMENT_ASSET_ID}/voice-fr.wav`)
    expect(metadata.outputName).toMatch(/vertical-r7-[a-f0-9]{8}\.mp4$/)
  })

  it('rejects the whole variant request before enqueue when any variant exceeds bounds', async () => {
    const harness = createHarness()
    await expect(harness.service.start(scope, {
      projectId: PROJECT_ID,
      baseRevision: 7,
      variants: [{ name: 'valid' }, { name: 'invalid', width: 3840, height: 2161 }],
      changeSummary: 'Attempted invalid variants.'
    })).rejects.toThrow('dimensions')
    expect(harness.jobs.rows).toHaveLength(0)
    expect(harness.queue.enqueue).not.toHaveBeenCalled()
  })

  it('compensates already queued variants when a later batch enqueue fails', async () => {
    const harness = createHarness()
    harness.queue.enqueue.mockResolvedValueOnce({ jobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }).mockRejectedValueOnce(new Error('queue stopped'))
    await expect(harness.service.start(scope, {
      projectId: PROJECT_ID,
      baseRevision: 7,
      variants: [{ name: 'first' }, { name: 'second' }],
      changeSummary: 'Queued an atomic render batch.'
    })).rejects.toThrow('queue stopped')
    expect(harness.jobs.rows.map((row) => row.status)).toEqual(['cancelled', 'failed'])
    expect(harness.jobs.rows[0]!.metadata).toMatchObject({ stage: 'batch-aborted' })
    expect(harness.queue.cancel).toHaveBeenCalledWith({ jobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', executionPool: 'sandbox-browser' })
  })

  it('runs the registered Sandbox Action with portable files and persists a traced export', async () => {
    const harness = createHarness()
    const started = await harness.service.start(scope, {
      projectId: PROJECT_ID,
      baseRevision: 7,
      variants: [{ name: 'master' }],
      changeSummary: 'Rendered the approved master.'
    })
    const jobId = started.jobs[0]!.jobId!
    await harness.service.process({ name: 'render-mp4', data: queuePayload(jobId), attemptsMade: 0, opts: { attempts: 3 } })

    expect(harness.sandbox.run).toHaveBeenCalledWith(expect.objectContaining({
      jobId,
      action: 'cut.render-mp4',
      actionVersion: '1.0.0',
      files: [expect.objectContaining({
        targetPath: `media/${ASSET_ID}/voice.wav`,
        size: 4_096,
        sha256: 'a'.repeat(64),
        reference: expect.objectContaining({ filePath: 'files/voice.wav', tenantId: scope.tenantId })
      })],
      outputs: expect.arrayContaining([expect.objectContaining({ path: 'cut.mp4' }), expect.objectContaining({ path: 'report.json' })])
    }))
    expect((harness.sandbox.run.mock.calls[0]![0] as { files: unknown[] }).files[0]).not.toHaveProperty('buffer')
    expect(harness.exports.rows).toHaveLength(1)
    expect(harness.exports.rows[0]).toMatchObject({
      analysisJobId: jobId,
      sourceRevision: 7,
      checksum: 'b'.repeat(64),
      renderer: 'sandbox-job:cut.render-mp4@1.0.0'
    })
    expect(harness.jobs.rows[0]).toMatchObject({ status: 'succeeded', progress: 100, resultExportId: harness.exports.rows[0]!.id, sandboxJobId: jobId })
    expect(harness.logs.rows.map((row) => row.action)).toEqual(['cut_render_started', 'cut_render_completed'])
  })

  it('records retryable Sandbox failure and cooperatively cancels queued or active work', async () => {
    const retryHarness = createHarness()
    const started = await retryHarness.service.start(scope, {
      projectId: PROJECT_ID, baseRevision: 7, changeSummary: 'Rendered with retry.'
    })
    const jobId = started.jobs[0]!.jobId!
    const error = Object.assign(new Error('Browser capacity unavailable.'), { code: 'SANDBOX_CAPACITY_UNAVAILABLE', retryable: true, jobId })
    retryHarness.sandbox.run.mockRejectedValueOnce(error)
    await expect(retryHarness.service.process({ name: 'render-mp4', data: queuePayload(jobId), attemptsMade: 0, opts: { attempts: 3 } }))
      .rejects.toThrow('capacity unavailable')
    expect(retryHarness.jobs.rows[0]).toMatchObject({ status: 'queued', progress: 0, errorMessage: 'Browser capacity unavailable.' })
    expect(retryHarness.jobs.rows[0]!.metadata).toMatchObject({ stage: 'retrying', errorCode: 'SANDBOX_CAPACITY_UNAVAILABLE', attempt: 1, willRetry: true })

    const cancelled = await retryHarness.service.cancel(scope, PROJECT_ID, jobId, 'Cancelled the render.')
    expect(cancelled).toMatchObject({ success: true, status: 'cancelled', cancellationRequested: true })
    expect(retryHarness.sandbox.cancel).toHaveBeenCalledWith({ jobId })
    expect(retryHarness.queue.cancel).toHaveBeenCalledWith({ jobId, executionPool: 'sandbox-browser' })
  })
})

function createHarness() {
  const document = renderDocument()
  const mediaReference = {
    source: 'platform.workspace.files' as const,
    catalog: 'projects' as const,
    scopeId: scope.projectId,
    projectId: scope.projectId,
    filePath: 'files/voice.wav',
    workspacePath: '/workspace/files/voice.wav',
    originalName: 'voice.wav',
    name: 'voice.wav',
    mimeType: 'audio/wav',
    size: 4_096
  }
  const media = memoryRepository<CutMediaAsset>()
  media.rows.push({
    id: ASSET_ID,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: null,
    platformProjectId: scope.projectId,
    cutProjectId: PROJECT_ID,
    originalName: 'voice.wav',
    mimeType: 'audio/wav',
    size: 4_096,
    checksum: 'a'.repeat(64),
    fileReference: mediaReference,
    previewUrl: 'https://files.example.test/voice.wav',
    duration: 2
  })
  media.rows.push({
    id: REPLACEMENT_ASSET_ID,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: null,
    platformProjectId: scope.projectId,
    cutProjectId: PROJECT_ID,
    originalName: 'voice-fr.wav',
    mimeType: 'audio/wav',
    size: 4_096,
    checksum: 'd'.repeat(64),
    fileReference: { ...mediaReference, filePath: 'files/voice-fr.wav', workspacePath: '/workspace/files/voice-fr.wav', originalName: 'voice-fr.wav', name: 'voice-fr.wav' },
    previewUrl: 'https://files.example.test/voice-fr.wav',
    duration: 2
  })
  const detail = {
    item: { id: PROJECT_ID, title: 'Campaign Cut', revision: 7 },
    document,
    media: [{
      id: ASSET_ID, originalName: 'voice.wav', mimeType: 'audio/wav', size: 4_096, checksum: 'a'.repeat(64),
      fileReference: mediaReference, previewUrl: 'https://files.example.test/voice.wav', duration: 2
    }, {
      id: REPLACEMENT_ASSET_ID, originalName: 'voice-fr.wav', mimeType: 'audio/wav', size: 4_096, checksum: 'd'.repeat(64),
      fileReference: { ...mediaReference, filePath: 'files/voice-fr.wav', workspacePath: '/workspace/files/voice-fr.wav', originalName: 'voice-fr.wav', name: 'voice-fr.wav' },
      previewUrl: 'https://files.example.test/voice-fr.wav', duration: 2
    }],
    versions: [], exports: [], logs: []
  }
  const cut = { getProject: jest.fn(async () => structuredClone(detail)) } as unknown as CutService
  const jobs = memoryRepository<CutAnalysisJob>()
  const exports = memoryRepository<CutExport>()
  const logs = memoryRepository<CutActionLog>()
  const queue = {
    getExecutionPoolHealth: jest.fn(async () => ({ executionPool: 'sandbox-browser', available: true, workerCount: 1 })),
    enqueue: jest.fn(async (input: { jobId?: string }) => ({ jobId: input.jobId! })),
    cancel: jest.fn(async (input: { jobId: string }) => ({ success: true, jobId: input.jobId, state: 'waiting' }))
  } as unknown as jest.Mocked<ManagedQueueService>
  const sandbox = {
    getActionHealth: jest.fn(async () => ({ pluginName: '@xpert-ai/plugin-cut', action: 'cut.render-mp4', actionVersion: '1.0.0', available: true, runtimeProfile: 'browser/playwright-1.61/v1', sandboxRuntimeVersion: '1.0.0' })),
    run: jest.fn(async (input: { jobId?: string }) => ({
      id: input.jobId!, runtimeProfile: 'browser/playwright-1.61/v1', sandboxRuntimeVersion: '1.0.0', action: 'cut.render-mp4', actionVersion: '1.0.0', status: 'succeeded' as const, attempt: 1,
      outputs: [
        output('cut.mp4', 'video/mp4', 'master.mp4', 12_345, 'b'.repeat(64)),
        output('report.json', 'application/json', 'master.report.json', 512, 'c'.repeat(64))
      ]
    })),
    cancel: jest.fn(async (input: { jobId: string }) => ({ id: input.jobId, status: 'cancelled' as const, outputs: [] })),
    getJob: jest.fn()
  } as unknown as jest.Mocked<SandboxJobsApi>
  const workspaceFiles = {
    resolveRuntimeReference: jest.fn(async (input: Record<string, unknown>) => ({
      ...input,
      source: 'platform.workspace.files' as const,
      workspacePath: input.workspacePath ?? input.filePath,
      tenantId: input.tenantId ?? scope.tenantId
    }))
  }
  const capabilities = {
    get: jest.fn((capability: { id?: string }) =>
      capability?.id === 'platform.workspace.files' ? workspaceFiles : sandbox)
  }
  const service = new CutRenderService(cut, jobs.repository, media.repository, exports.repository, logs.repository, queue, capabilities as never)
  return { service, jobs, media, exports, logs, queue, sandbox, workspaceFiles }
}

function renderDocument() {
  let document = createStarterCutProject({ width: 1920, height: 1080, fps: 12, durationSeconds: 2 })
  document = applyCutEdit(document, {
    kind: 'add_clip', trackId: document.tracks[0]!.id,
    clip: { id: 'text-1', type: 'text', name: 'Greeting', start: 0, duration: 2, text: 'Hello {{customer}}', fontSize: 80, transform: { x: 0, y: 0, width: 1920, height: 1080, rotation: 0, opacity: 1 } }
  })
  document = applyCutEdit(document, {
    kind: 'add_clip', trackId: document.tracks[1]!.id,
    clip: {
      id: 'audio-1', type: 'audio', name: 'Voice', start: 0, duration: 2, mediaAssetId: ASSET_ID,
      source: { source: 'platform.workspace.files', catalog: 'projects', filePath: 'files/voice.wav', workspacePath: '/workspace/files/voice.wav' },
      previewUrl: 'https://files.example.test/voice.wav'
    }
  })
  return document
}

function queuePayload(jobId: string) {
  return { jobId, projectId: PROJECT_ID, tenantId: scope.tenantId, organizationId: scope.organizationId, platformProjectId: scope.projectId, userId: scope.userId, assistantId: scope.assistantId }
}

function output(path: string, mimeType: string, originalName: string, size: number, sha256: string) {
  return {
    path, mimeType, originalName, size, sha256,
    reference: {
      source: 'platform.workspace.files' as const, tenantId: scope.tenantId, catalog: 'projects' as const, projectId: scope.projectId,
      filePath: `files/exports/${originalName}`, workspacePath: `/workspace/files/exports/${originalName}`
    },
    fileUrl: `https://files.example.test/${originalName}`,
    workspacePath: `/workspace/files/exports/${originalName}`
  }
}

function memoryRepository<T extends { id?: string; createdAt?: Date; updatedAt?: Date }>() {
  const rows: T[] = []
  const repository = {
    create: (value: T) => ({ ...value }),
    save: async (value: T | T[]) => {
      const values = Array.isArray(value) ? value : [value]
      for (const item of values) {
        item.id ??= randomUUID()
        item.createdAt ??= new Date()
        item.updatedAt = new Date()
        const index = rows.findIndex((row) => row.id === item.id)
        if (index >= 0) rows[index] = item
        else rows.push(item)
      }
      return value
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) => rows.find((row) => matches(row, where)) ?? null,
    find: async ({ where }: { where: Record<string, unknown> }) => rows.filter((row) => matches(row, where))
  }
  return { rows, repository: repository as unknown as Repository<T> }
}
function matches(value: object, where: Record<string, unknown>) { return Object.entries(where).every(([key, expected]) => (value as Record<string, unknown>)[key] === expected) }
