import type { Repository } from 'typeorm'
import type { ManagedQueueService } from '@xpert-ai/plugin-sdk'
import { AiModelTypeEnum } from '@xpert-ai/contracts'

jest.mock('./cut.service.js', () => ({ CutService: class CutService {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
  MANAGED_QUEUE_SERVICE_TOKEN: 'XPERT_MANAGED_QUEUE_SERVICE',
  SYSTEM_GLOBAL_SCOPE: 'system:global'
}))

import { CutCaptionService } from './cut-caption.service.js'
import { createStarterCutProject, validateCutProjectDocument } from './cut-project.js'
import type { CutService } from './cut.service.js'
import { CutActionLog, CutAnalysisJob, CutCaptionDraft, CutMediaAsset, CutTranscript, CutTranscriptSegment } from './entities/index.js'
import type { CutProjectDocument, CutScope } from './types.js'

describe('CutCaptionService reviewable subtitle workflow', () => {
  it('imports, pages, exports, and idempotently commits a scoped caption draft', async () => {
    const jobs = memoryRepository<CutAnalysisJob>()
    const media = memoryRepository<CutMediaAsset>()
    const transcripts = memoryRepository<CutTranscript>()
    const segments = memoryRepository<CutTranscriptSegment>()
    const drafts = memoryRepository<CutCaptionDraft>()
    const logs = memoryRepository<CutActionLog>()
    const projectId = '11111111-1111-4111-8111-111111111111'
    let revision = 1
    let document: CutProjectDocument = createStarterCutProject()
    const cut = {
      async getProject(_scope: CutScope, requestedProjectId: string) {
        if (requestedProjectId !== projectId) throw new Error('missing project')
        return { item: { id: projectId, revision }, document, media: [], versions: [], exports: [], logs: [] }
      },
      async saveProject(_scope: CutScope, input: { projectId: string; document: CutProjectDocument; baseRevision: number }) {
        if (input.baseRevision !== revision) throw new Error('revision conflict')
        document = validateCutProjectDocument(input.document)
        revision += 1
        return {
          success: true,
          project: { id: projectId, revision },
          document,
          changedClipIds: document.tracks.flatMap((track) => track.clips).map((clip) => clip.id),
          changedTrackIds: document.tracks.map((track) => track.id)
        }
      }
    } as unknown as CutService
    const service = new CutCaptionService(
      cut,
      media.repository,
      jobs.repository,
      transcripts.repository,
      segments.repository,
      drafts.repository,
      logs.repository
    )
    const scope: CutScope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a', assistantId: 'assistant-a' }
    const file = Buffer.from('1\n00:00:01,000 --> 00:00:03,000\nWelcome to Cut\n\n2\n00:00:04,000 --> 00:00:06,500\nReview before commit\n')
    const imported = await service.importSubtitle(scope, {
      projectId,
      baseRevision: revision,
      language: 'en',
      changeSummary: 'Imported review captions.'
    }, { buffer: file, name: 'captions.srt' })

    expect(imported).toMatchObject({ success: true, revision: 1, segmentCount: 2, idempotentReplay: false })
    expect(document.tracks.flatMap((track) => track.clips)).toHaveLength(0)
    const replay = await service.importSubtitle(scope, {
      projectId,
      baseRevision: revision,
      language: 'en',
      changeSummary: 'Retried caption import.'
    }, { buffer: file, name: 'captions.srt' })
    expect(replay).toMatchObject({ jobId: imported.jobId, draftId: imported.draftId, idempotentReplay: true })

    const page = await service.listTranscriptSegments(scope, projectId, imported.transcriptId, 1, 1)
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 1 })
    expect(page.items[0]).toMatchObject({ start: 1, end: 3, text: 'Welcome to Cut' })
    const draft = await service.getCaptionDraft(scope, projectId, imported.draftId, 1, 1)
    expect(draft).toMatchObject({ item: { status: 'draft', sourceRevision: 1, revision: 1, captionCount: 2 }, total: 2 })
    expect(draft.captions).toHaveLength(1)
    const updatedDraft = await service.updateCaptionDraft(scope, {
      projectId,
      draftId: imported.draftId,
      baseRevision: revision,
      baseDraftRevision: 1,
      operation: { action: 'update', captionId: draft.captions[0]!.id, text: 'Welcome to reviewable Cut' },
      changeSummary: 'Corrected the first caption.'
    })
    expect(updatedDraft).toMatchObject({ revision: 2, captionCount: 2 })
    await expect(service.updateCaptionDraft(scope, {
      projectId,
      draftId: imported.draftId,
      baseRevision: revision,
      baseDraftRevision: 1,
      operation: { action: 'offset', seconds: 0.1 },
      changeSummary: 'Lose a simulated draft race.'
    })).rejects.toThrow('draft revision changed')
    const exported = await service.exportCaptionDraft(scope, projectId, imported.draftId, 'vtt')
    expect(exported.content).toContain('WEBVTT')
    expect(exported.content).toContain('Welcome to reviewable Cut')
    expect(exported.captionCount).toBe(2)

    const committed = await service.commitCaptionDraft(scope, {
      projectId,
      draftId: imported.draftId,
      baseRevision: revision,
      baseDraftRevision: 2,
      changeSummary: 'Committed reviewed captions.'
    })
    expect(committed).toMatchObject({ success: true, alreadyCommitted: false, revision: 2 })
    expect(committed.changedClipIds).toHaveLength(2)
    expect(document.tracks.find((track) => track.id === committed.trackId)).toMatchObject({ kind: 'visual', name: 'Captions' })
    expect(document.tracks.flatMap((track) => track.clips).filter((clip) => clip.type === 'text')).toHaveLength(2)

    const committedReplay = await service.commitCaptionDraft(scope, {
      projectId,
      draftId: imported.draftId,
      baseRevision: 1,
      baseDraftRevision: 2,
      changeSummary: 'Retried committed captions.'
    })
    expect(committedReplay).toMatchObject({ alreadyCommitted: true, revision: 2 })
    expect(revision).toBe(2)

    await expect(service.getCaptionDraft({ ...scope, organizationId: 'org-b' }, projectId, imported.draftId)).rejects.toThrow(
      'current tenant and organization'
    )
  })

  it('queues, completes, replays, and cancels server transcription jobs', async () => {
    const media = memoryRepository<CutMediaAsset>()
    const jobs = memoryRepository<CutAnalysisJob>()
    const transcripts = memoryRepository<CutTranscript>()
    const segments = memoryRepository<CutTranscriptSegment>()
    const drafts = memoryRepository<CutCaptionDraft>()
    const logs = memoryRepository<CutActionLog>()
    const projectId = '11111111-1111-4111-8111-111111111111'
    const scope: CutScope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a', assistantId: 'assistant-a' }
    const document = createStarterCutProject({ durationSeconds: 30 })
    const cut = {
      async getProject() {
        return { item: { id: projectId, revision: 3 }, document, media: [], versions: [], exports: [], logs: [] }
      }
    } as unknown as CutService
    const enqueue = jest.fn(async (input: { jobId?: string }) => ({ jobId: input.jobId ?? 'queue-job' }))
    const cancel = jest.fn(async (input: { jobId: string }) => ({ success: true, jobId: input.jobId, state: 'waiting' }))
    const queue = { enqueue, cancel } as unknown as ManagedQueueService
    const service = new CutCaptionService(
      cut,
      media.repository,
      jobs.repository,
      transcripts.repository,
      segments.repository,
      drafts.repository,
      logs.repository,
      queue
    )
    const asset = await media.repository.save(media.repository.create({
      id: '22222222-2222-4222-8222-222222222222',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      cutProjectId: projectId,
      originalName: 'voice.mp4',
      mimeType: 'video/mp4',
      size: 1024,
      checksum: 'a'.repeat(64),
      duration: 10,
      fileReference: {
        source: 'platform.workspace.files', tenantId: scope.tenantId, catalog: 'projects',
        projectId: 'platform-project', filePath: 'files/voice.mp4', workspacePath: '/workspace/files/voice.mp4'
      }
    }))
    const model = { copilotId: 'copilot-stt', model: 'whisper-large-v3', modelType: AiModelTypeEnum.SPEECH2TEXT }
    const started = await service.startTranscription(scope, {
      projectId,
      mediaAssetId: asset.id!,
      baseRevision: 3,
      language: 'en',
      changeSummary: 'Transcribe the interview.'
    }, 'xpert-cut', model)
    expect(started).toMatchObject({ success: true, revision: 3, status: 'queued', idempotentReplay: false })
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      jobId: started.jobId,
      attempts: 3,
      scopeKey: 'system:global',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId
    }))

    const replay = await service.startTranscription(scope, {
      projectId,
      mediaAssetId: asset.id!,
      baseRevision: 3,
      language: 'en',
      changeSummary: 'Retry the same transcription.'
    }, 'xpert-cut', model)
    expect(replay).toMatchObject({ jobId: started.jobId, idempotentReplay: true })
    expect(enqueue).toHaveBeenCalledTimes(1)

    expect(await service.beginTranscriptionJob(scope, projectId, started.jobId)).toMatchObject({ status: 'running', progress: 10 })
    const completed = await service.completeTranscriptionJob(scope, {
      projectId,
      jobId: started.jobId,
      text: 'Welcome to Cut. Review this transcript.',
      duration: 10,
      model: 'copilot-stt:whisper-large-v3',
      changeSummary: 'Transcribed the interview.'
    })
    expect(completed).toMatchObject({ success: true, revision: 3, segmentCount: 2, timingSource: 'estimated' })
    expect(await service.getAnalysisJob(scope, projectId, started.jobId)).toMatchObject({ status: 'succeeded', progress: 100 })
    expect(await service.getCaptionDraft(scope, projectId, completed.draftId)).toMatchObject({ total: 2, item: { sourceRevision: 3 } })

    const second = await service.startTranscription(scope, {
      projectId,
      mediaAssetId: asset.id!,
      baseRevision: 3,
      language: 'zh',
      changeSummary: 'Start a cancellable transcription.'
    }, 'xpert-cut', model)
    const cancelled = await service.cancelAnalysisJob(scope, projectId, second.jobId, 'Cancel the queued transcription.')
    expect(cancelled).toMatchObject({ success: true, status: 'cancelled', cancellationRequested: true })
    expect(cancel).toHaveBeenCalledWith({ jobId: second.jobId })
  })

  it('persists timestamped browser Whisper output as an idempotent review draft', async () => {
    const media = memoryRepository<CutMediaAsset>()
    const jobs = memoryRepository<CutAnalysisJob>()
    const transcripts = memoryRepository<CutTranscript>()
    const segments = memoryRepository<CutTranscriptSegment>()
    const drafts = memoryRepository<CutCaptionDraft>()
    const logs = memoryRepository<CutActionLog>()
    const projectId = '11111111-1111-4111-8111-111111111111'
    const scope: CutScope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a', assistantId: 'assistant-a' }
    const document = createStarterCutProject({ durationSeconds: 30 })
    const cut = {
      async getProject() {
        return { item: { id: projectId, revision: 4 }, document, media: [], versions: [], exports: [], logs: [] }
      }
    } as unknown as CutService
    const service = new CutCaptionService(
      cut,
      media.repository,
      jobs.repository,
      transcripts.repository,
      segments.repository,
      drafts.repository,
      logs.repository
    )
    const asset = await media.repository.save(media.repository.create({
      id: '22222222-2222-4222-8222-222222222222',
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      cutProjectId: projectId,
      originalName: 'local.wav',
      mimeType: 'audio/wav',
      size: 2_048,
      checksum: 'b'.repeat(64),
      duration: 12,
      fileReference: {
        source: 'platform.workspace.files', tenantId: scope.tenantId, catalog: 'projects',
        projectId: 'platform-project', filePath: 'files/local.wav', workspacePath: '/workspace/files/local.wav'
      }
    }))
    const input = {
      projectId,
      mediaAssetId: asset.id!,
      baseRevision: 4,
      language: 'zh',
      model: 'Xenova/whisper-tiny',
      device: 'wasm' as const,
      duration: 12,
      segments: [
        { start: 0.2, end: 2.4, text: ' 本地转录 ' },
        { start: 2.5, end: 5.75, text: '先审阅再提交' }
      ],
      changeSummary: 'Persisted browser Whisper output.'
    }
    const imported = await service.importLocalTranscription(scope, input)
    expect(imported).toMatchObject({
      success: true,
      revision: 4,
      segmentCount: 2,
      idempotentReplay: false,
      timingSource: 'model-segment'
    })
    expect(await service.getAnalysisJob(scope, projectId, imported.jobId)).toMatchObject({
      executionMode: 'local',
      status: 'succeeded',
      progress: 100,
      model: 'Xenova/whisper-tiny'
    })
    expect((await service.listTranscriptSegments(scope, projectId, imported.transcriptId)).items).toEqual([
      expect.objectContaining({ sequence: 0, start: 0.2, end: 2.4, text: '本地转录' }),
      expect.objectContaining({ sequence: 1, start: 2.5, end: 5.75, text: '先审阅再提交' })
    ])
    expect(await service.getCaptionDraft(scope, projectId, imported.draftId)).toMatchObject({
      total: 2,
      item: { sourceRevision: 4, language: 'zh', status: 'draft' }
    })
    const replay = await service.importLocalTranscription(scope, input)
    expect(replay).toMatchObject({ jobId: imported.jobId, draftId: imported.draftId, idempotentReplay: true })
    expect(jobs.rows.filter((job) => job.executionMode === 'local')).toHaveLength(1)

    await expect(service.importLocalTranscription(scope, {
      ...input,
      segments: [{ start: 0, end: 31, text: 'outside project' }]
    })).rejects.toThrow('source range')
  })
})

function memoryRepository<T extends { id?: string; createdAt?: Date; updatedAt?: Date; sequence?: number }>() {
  const rows: T[] = []
  let sequence = 0
  const saveOne = (input: T) => {
    const now = new Date()
    if (!input.id) input.id = `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
    input.createdAt ??= now
    input.updatedAt = now
    const index = rows.findIndex((row) => row.id === input.id)
    if (index >= 0) rows[index] = input
    else rows.push(input)
    return input
  }
  const repository = {
    create(input: T | T[]) {
      return Array.isArray(input) ? input.map((item) => ({ ...item })) : { ...input }
    },
    async save(input: T | T[]) {
      return Array.isArray(input) ? input.map(saveOne) : saveOne(input)
    },
    async findOne(options: { where: Partial<T> }) {
      return rows.find((row) => matches(row, options.where)) ?? null
    },
    async find(options: { where: Partial<T>; order?: { sequence?: 'ASC' | 'DESC' } }) {
      const found = rows.filter((row) => matches(row, options.where))
      if (options.order?.sequence) {
        found.sort((a, b) => ((a.sequence ?? 0) - (b.sequence ?? 0)) * (options.order?.sequence === 'ASC' ? 1 : -1))
      }
      return found
    },
    async update(criteria: Partial<T>, patch: Partial<T>) {
      const row = rows.find((item) => matches(item, criteria))
      if (!row) return { affected: 0 }
      Object.assign(row, patch, { updatedAt: new Date() })
      return { affected: 1 }
    }
  }
  return { repository: repository as Repository<T>, rows }
}

function matches<T extends object>(row: T, where: Partial<T>) {
  return Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value)
}
