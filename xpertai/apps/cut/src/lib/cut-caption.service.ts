import { ConflictException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { AiModelTypeEnum, type TCopilotModel } from '@xpert-ai/contracts'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  SYSTEM_GLOBAL_SCOPE,
  type ManagedQueueService
} from '@xpert-ai/plugin-sdk'
import type { FindOptionsWhere, Repository } from 'typeorm'
import { detectCutSubtitleFormat, parseCutSubtitle, serializeCutSubtitle, type CutSubtitleFormat } from './cut-caption.js'
import { reconcileCutAnalysisJobWithQueue } from './cut-analysis-job-reconciliation.js'
import { isCutExportFormat, isCutExportQuality, normalizeCutExportSettings } from './cut-export-settings.js'
import { cutTimeAfterRippleDelete, normalizeCutTimeRanges, validateCutProjectDocument } from './cut-project.js'
import { estimateCutTranscriptSegments } from './cut-transcription.js'
import { CutService } from './cut.service.js'
import { CUT_ANALYSIS_QUEUE_NAME, CUT_PLUGIN_NAME, CUT_TRANSCRIPTION_JOB_NAME } from './constants.js'
import {
  CutActionLog,
  CutAnalysisJob,
  CutCaptionDraft,
  CutMediaAsset,
  CutTranscript,
  CutTranscriptSegment
} from './entities/index.js'
import type {
  CutActionType,
  CutCaptionDraftEditOperation,
  CutCaptionItem,
  CutCaptionRules,
  CutJsonValue,
  CutProjectDocument,
  CutScope,
  CutTimeRange,
  CutTranscriptSegmentData,
  CutTranscriptionQueueJobData
} from './types.js'

const MAX_SERVER_TRANSCRIPTION_BYTES = 250 * 1024 * 1024
const MAX_LOCAL_TRANSCRIPTION_SEGMENTS = 5_000
const MAX_LOCAL_TRANSCRIPTION_CHARACTERS = 200_000

type CaptionScopedEntity = {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  platformProjectId?: string | null
}

export interface ImportCutSubtitleInput {
  projectId: string
  baseRevision: number
  language: string
  format?: CutSubtitleFormat
  idempotencyKey?: string
  changeSummary: string
}

export interface CreateCutCaptionDraftInput {
  projectId: string
  transcriptId: string
  baseRevision: number
  targetTrackId?: string
  rules?: CutCaptionRules
  timelineCuts?: CutTimeRange[]
  timelineOffsetSeconds?: number
  changeSummary: string
}

export interface CreateTranslatedCutCaptionDraftInput {
  projectId: string
  sourceDraftId: string
  targetLanguage: string
  baseRevision: number
  translations: Array<{ captionId: string; text: string }>
  targetTrackName?: string
  changeSummary: string
}

export interface StartCutTranscriptionInput {
  projectId: string
  mediaAssetId: string
  baseRevision: number
  language: string
  idempotencyKey?: string
  changeSummary: string
}

export interface ImportCutLocalTranscriptionInput {
  projectId: string
  mediaAssetId: string
  baseRevision: number
  language: string
  model: string
  device: 'webgpu' | 'wasm'
  duration: number
  segments: Array<Pick<CutTranscriptSegmentData, 'start' | 'end' | 'text' | 'confidence' | 'speaker'>>
  idempotencyKey?: string
  changeSummary: string
}

@Injectable()
export class CutCaptionService {
  constructor(
    private readonly cut: CutService,
    @InjectRepository(CutMediaAsset) private readonly media: Repository<CutMediaAsset>,
    @InjectRepository(CutAnalysisJob) private readonly jobs: Repository<CutAnalysisJob>,
    @InjectRepository(CutTranscript) private readonly transcripts: Repository<CutTranscript>,
    @InjectRepository(CutTranscriptSegment) private readonly segments: Repository<CutTranscriptSegment>,
    @InjectRepository(CutCaptionDraft) private readonly drafts: Repository<CutCaptionDraft>,
    @InjectRepository(CutActionLog) private readonly logs: Repository<CutActionLog>,
    @Optional() @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue?: ManagedQueueService
  ) {}

  async startTranscription(
    scope: CutScope,
    input: StartCutTranscriptionInput,
    xpertId: string,
    copilotModel: TCopilotModel
  ) {
    if (!this.queue) throw new ServiceUnavailableException('Managed Queue is required for Cut server transcription.')
    const detail = await this.cut.getProject(scope, input.projectId)
    assertRevision(detail.item.revision, input.baseRevision)
    const asset = await this.media.findOne({
      where: captionScopedWhere<CutMediaAsset>(scope, { id: input.mediaAssetId, cutProjectId: input.projectId })
    })
    if (!asset) throw new NotFoundException('Cut media asset was not found in the current tenant and organization.')
    if (!asset.mimeType.startsWith('audio/') && !asset.mimeType.startsWith('video/')) {
      throw new Error('Cut server transcription requires an audio or video media asset.')
    }
    if (asset.size > MAX_SERVER_TRANSCRIPTION_BYTES) {
      throw new Error(`Cut server transcription input exceeds ${MAX_SERVER_TRANSCRIPTION_BYTES} bytes.`)
    }
    const model = normalizeSpeechModel(copilotModel)
    const idempotencyKey = input.idempotencyKey?.trim() || [
      'stt', asset.checksum, input.baseRevision, input.language, model.copilotId, model.model
    ].join(':')
    const existing = await this.jobs.findOne({
      where: captionScopedWhere<CutAnalysisJob>(scope, {
        cutProjectId: input.projectId,
        type: 'transcription',
        executionMode: 'server',
        idempotencyKey
      })
    })
    if (existing && !['failed', 'cancelled'].includes(existing.status)) {
      await this.reconcileQueueJob(existing)
      if (!['failed', 'cancelled'].includes(existing.status)) {
        return startTranscriptionResult(existing, detail.item.revision, true)
      }
    }

    const jobId = randomUUID()
    const job = await this.jobs.save(this.jobs.create({
      id: jobId,
      ...captionScopedCreate(scope),
      cutProjectId: input.projectId,
      type: 'transcription',
      executionMode: 'server',
      status: 'queued',
      progress: 0,
      inputRevision: input.baseRevision,
      mediaAssetId: input.mediaAssetId,
      language: input.language,
      model: `${model.copilotId}:${model.model}`,
      idempotencyKey,
      queueJobId: jobId,
      cancellationRequested: false,
      metadata: {
        fileName: asset.originalName.slice(0, 240),
        mimeType: asset.mimeType,
        size: asset.size,
        checksum: asset.checksum,
        timingSource: 'estimated'
      },
      createdById: scope.userId ?? null,
      assistantId: scope.assistantId ?? null
    }))
    requireId(job.id, 'analysis job')
    const payload: CutTranscriptionQueueJobData = {
      jobId,
      projectId: input.projectId,
      mediaAssetId: input.mediaAssetId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? null,
      workspaceId: scope.workspaceId ?? null,
      platformProjectId: scope.projectId ?? null,
      userId: scope.userId ?? null,
      assistantId: scope.assistantId ?? null,
      xpertId,
      modelKey: `${model.copilotId}:${model.model}`,
      fileReference: asset.fileReference,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      duration: asset.duration ?? null,
      language: input.language,
      inputRevision: input.baseRevision,
      changeSummary: input.changeSummary
    }
    try {
      const queued = await this.queue.enqueue({
        pluginName: CUT_PLUGIN_NAME,
        queueName: CUT_ANALYSIS_QUEUE_NAME,
        jobName: CUT_TRANSCRIPTION_JOB_NAME,
        payload,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? null,
        userId: scope.userId ?? null,
        // Handler routing follows the plugin installation scope. Tenant,
        // organization, and project context travel in dedicated envelope fields.
        scopeKey: SYSTEM_GLOBAL_SCOPE,
        jobId,
        attempts: 3,
        backoffMs: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
        removeOnFail: { age: 30 * 24 * 60 * 60, count: 10_000 }
      })
      if (queued.jobId !== jobId) {
        throw new Error(`Managed Queue returned unexpected job id ${queued.jobId} for Cut analysis job ${jobId}.`)
      }
    } catch (error) {
      job.status = 'failed'
      job.errorMessage = errorMessage(error)
      job.completedAt = new Date()
      await this.jobs.save(job)
      throw error
    }
    await this.writeLog(scope, input.projectId, 'cut_transcription_started', input.changeSummary, {
      jobId,
      mediaAssetId: input.mediaAssetId,
      language: input.language,
      inputRevision: input.baseRevision
    })
    return startTranscriptionResult(job, detail.item.revision, false)
  }

  async cancelAnalysisJob(scope: CutScope, projectId: string, jobId: string, changeSummary: string) {
    const job = await this.requireJob(scope, projectId, jobId)
    if (job.status === 'cancelled') return { success: true, projectId, jobId, status: job.status, idempotentReplay: true }
    if (['succeeded', 'failed'].includes(job.status)) {
      return { success: false, projectId, jobId, status: job.status, reason: 'terminal' }
    }
    if (!this.queue || !job.queueJobId) throw new ServiceUnavailableException('Managed Queue job is unavailable for cancellation.')
    const result = await this.queue.cancel({ jobId: job.queueJobId })
    job.cancellationRequested = true
    if (result.success || result.reason === 'not_found') {
      job.status = 'cancelled'
      job.completedAt = new Date()
      job.progress = 0
    }
    await this.jobs.save(job)
    await this.writeLog(scope, projectId, 'cut_analysis_job_cancelled', changeSummary, {
      jobId,
      queueJobId: job.queueJobId,
      status: job.status,
      queueState: result.state ?? null,
      cooperative: !result.success && result.reason !== 'not_found'
    })
    return {
      success: true,
      projectId,
      jobId,
      status: job.status,
      cancellationRequested: true,
      cooperative: !result.success && result.reason !== 'not_found',
      queueState: result.state ?? null
    }
  }

  async beginTranscriptionJob(scope: CutScope, projectId: string, jobId: string) {
    const job = await this.requireJob(scope, projectId, jobId)
    if (job.status === 'succeeded' || job.status === 'cancelled' || job.cancellationRequested) return null
    job.status = 'running'
    job.progress = 10
    job.startedAt ??= new Date()
    job.completedAt = null
    await this.jobs.save(job)
    return compactJob(job)
  }

  async completeTranscriptionJob(scope: CutScope, input: {
    projectId: string
    jobId: string
    text: string
    duration?: number | null
    model: string
    changeSummary: string
  }) {
    const job = await this.requireJob(scope, input.projectId, input.jobId)
    if (job.status === 'succeeded' && job.resultTranscriptId) {
      return { success: true, idempotentReplay: true, ...compactJob(job) }
    }
    if (job.status === 'cancelled' || job.cancellationRequested) {
      job.status = 'cancelled'
      job.progress = 0
      job.errorMessage = null
      job.completedAt = new Date()
      await this.jobs.save(job)
      return { success: false, cancelled: true, ...compactJob(job) }
    }
    const detail = await this.cut.getProject(scope, input.projectId)
    const duration = Math.min(
      detail.document.settings.durationSeconds,
      typeof input.duration === 'number' && input.duration > 0 ? input.duration : detail.document.settings.durationSeconds
    )
    const estimated = estimateCutTranscriptSegments(input.text, duration)
    let transcript = await this.transcripts.findOne({
      where: captionScopedWhere<CutTranscript>(scope, { cutProjectId: input.projectId, jobId: input.jobId })
    })
    if (!transcript) {
      transcript = await this.transcripts.save(this.transcripts.create({
        ...captionScopedCreate(scope),
        cutProjectId: input.projectId,
        jobId: input.jobId,
        mediaAssetId: job.mediaAssetId ?? null,
        source: 'stt',
        language: job.language ?? 'und',
        model: input.model,
        sourceFormat: null,
        duration,
        segmentCount: estimated.length,
        inputRevision: job.inputRevision,
        createdById: job.createdById ?? null,
        assistantId: job.assistantId ?? null
      }))
    }
    const transcriptId = requireId(transcript.id, 'transcript')
    const existingSegments = await this.segments.find({
      where: captionScopedWhere<CutTranscriptSegment>(scope, { cutProjectId: input.projectId, transcriptId }),
      order: { sequence: 'ASC' }
    })
    if (!existingSegments.length) {
      await this.segments.save(estimated.map((segment) => this.segments.create({
        ...captionScopedCreate(scope),
        cutProjectId: input.projectId,
        transcriptId,
        sequence: segment.sequence,
        start: segment.start,
        end: segment.end,
        text: segment.text,
        confidence: segment.confidence ?? null,
        speaker: segment.speaker ?? null,
        words: segment.words ?? null
      })))
    }
    let draft = await this.drafts.findOne({
      where: captionScopedWhere<CutCaptionDraft>(scope, { cutProjectId: input.projectId, transcriptId })
    })
    if (!draft) {
      draft = await this.drafts.save(this.drafts.create({
        ...captionScopedCreate(scope),
        cutProjectId: input.projectId,
        transcriptId,
        sourceRevision: detail.item.revision,
        status: 'draft',
        revision: 1,
        language: job.language ?? 'und',
        targetTrackId: null,
        captions: estimated.map((segment, index) => ({
          id: `caption-${index + 1}`,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          speaker: segment.speaker ?? null
        })),
        rules: defaultCaptionRules(),
        createdById: job.createdById ?? null,
        assistantId: job.assistantId ?? null
      }))
    }
    job.status = 'succeeded'
    job.progress = 100
    job.resultTranscriptId = transcriptId
    job.errorMessage = null
    job.completedAt = new Date()
    job.metadata = {
      ...jsonObject(job.metadata),
      timingSource: 'estimated',
      outputRevision: detail.item.revision,
      characterCount: input.text.length,
      segmentCount: estimated.length,
      draftId: requireId(draft.id, 'caption draft')
    }
    await this.jobs.save(job)
    await this.writeLog(scope, input.projectId, 'cut_transcription_completed', input.changeSummary, {
      jobId: input.jobId,
      transcriptId,
      draftId: draft.id ?? null,
      segmentCount: estimated.length,
      timingSource: 'estimated'
    })
    return {
      success: true,
      idempotentReplay: false,
      projectId: input.projectId,
      revision: detail.item.revision,
      jobId: input.jobId,
      transcriptId,
      draftId: requireId(draft.id, 'caption draft'),
      draftRevision: draft.revision,
      segmentCount: estimated.length,
      timingSource: 'estimated' as const
    }
  }

  async importLocalTranscription(scope: CutScope, input: ImportCutLocalTranscriptionInput) {
    const detail = await this.cut.getProject(scope, input.projectId)
    assertRevision(detail.item.revision, input.baseRevision)
    const asset = await this.media.findOne({
      where: captionScopedWhere<CutMediaAsset>(scope, { id: input.mediaAssetId, cutProjectId: input.projectId })
    })
    if (!asset) throw new NotFoundException('Cut media asset was not found in the current tenant and organization.')
    if (!asset.mimeType.startsWith('audio/') && !asset.mimeType.startsWith('video/')) {
      throw new Error('Cut local transcription requires an audio or video media asset.')
    }
    const model = boundedString(input.model, 160, 'Cut local transcription model')
    const language = boundedString(input.language, 32, 'Cut local transcription language')
    const duration = normalizeLocalDuration(input.duration, asset.duration ?? detail.document.settings.durationSeconds)
    const normalized = normalizeLocalTranscriptSegments(input.segments, duration)
    const contentHash = createHash('sha256').update(JSON.stringify({
      assetChecksum: asset.checksum,
      revision: input.baseRevision,
      language,
      model,
      device: input.device,
      duration,
      segments: normalized
    })).digest('hex')
    const idempotencyKey = input.idempotencyKey?.trim() || `local-stt:${contentHash}`
    const existing = await this.jobs.findOne({
      where: captionScopedWhere<CutAnalysisJob>(scope, {
        cutProjectId: input.projectId,
        type: 'transcription',
        executionMode: 'local',
        status: 'succeeded',
        idempotencyKey
      })
    })
    if (existing?.resultTranscriptId) {
      const draft = await this.drafts.findOne({
        where: captionScopedWhere<CutCaptionDraft>(scope, {
          cutProjectId: input.projectId,
          transcriptId: existing.resultTranscriptId
        })
      })
      if (draft) return { ...importResult(detail.item.revision, existing, existing.resultTranscriptId, draft, normalized.length, true), timingSource: 'model-segment' as const }
    }

    const now = new Date()
    const job = await this.jobs.save(this.jobs.create({
      ...captionScopedCreate(scope),
      cutProjectId: input.projectId,
      type: 'transcription',
      executionMode: 'local',
      status: 'succeeded',
      progress: 100,
      inputRevision: input.baseRevision,
      mediaAssetId: input.mediaAssetId,
      language,
      model,
      idempotencyKey,
      cancellationRequested: false,
      metadata: {
        contentHash,
        device: input.device,
        timingSource: 'model-segment',
        duration,
        sampleRate: 16_000,
        segmentCount: normalized.length
      },
      createdById: scope.userId ?? null,
      assistantId: scope.assistantId ?? null,
      startedAt: now,
      completedAt: now
    }))
    const jobId = requireId(job.id, 'analysis job')
    const transcript = await this.transcripts.save(this.transcripts.create({
      ...captionScopedCreate(scope),
      cutProjectId: input.projectId,
      jobId,
      mediaAssetId: input.mediaAssetId,
      source: 'stt',
      language,
      model,
      sourceFormat: null,
      duration,
      segmentCount: normalized.length,
      inputRevision: input.baseRevision,
      createdById: scope.userId ?? null,
      assistantId: scope.assistantId ?? null
    }))
    const transcriptId = requireId(transcript.id, 'transcript')
    await this.segments.save(normalized.map((segment, sequence) => this.segments.create({
      ...captionScopedCreate(scope),
      cutProjectId: input.projectId,
      transcriptId,
      sequence,
      start: segment.start,
      end: segment.end,
      text: segment.text,
      confidence: segment.confidence,
      speaker: segment.speaker,
      words: null
    })))
    const draft = await this.drafts.save(this.drafts.create({
      ...captionScopedCreate(scope),
      cutProjectId: input.projectId,
      transcriptId,
      sourceRevision: input.baseRevision,
      status: 'draft',
      revision: 1,
      language,
      targetTrackId: null,
      captions: normalized.map((segment) => ({
        id: randomUUID(),
        start: segment.start,
        end: segment.end,
        text: segment.text,
        speaker: segment.speaker
      })),
      rules: defaultCaptionRules(),
      createdById: scope.userId ?? null,
      assistantId: scope.assistantId ?? null
    }))
    job.resultTranscriptId = transcriptId
    job.metadata = { ...jsonObject(job.metadata), draftId: requireId(draft.id, 'caption draft') }
    await this.jobs.save(job)
    await this.writeLog(scope, input.projectId, 'cut_local_transcription_imported', input.changeSummary, {
      jobId,
      transcriptId,
      draftId: draft.id ?? null,
      mediaAssetId: input.mediaAssetId,
      model,
      device: input.device,
      segmentCount: normalized.length,
      timingSource: 'model-segment'
    })
    return {
      ...importResult(detail.item.revision, job, transcriptId, draft, normalized.length, false),
      timingSource: 'model-segment' as const
    }
  }

  async failTranscriptionJob(scope: CutScope, projectId: string, jobId: string, error: unknown, willRetry: boolean, attempt: number) {
    const job = await this.requireJob(scope, projectId, jobId)
    if (job.status === 'cancelled' || job.cancellationRequested) {
      job.status = 'cancelled'
      job.progress = 0
      job.errorMessage = null
      job.completedAt = new Date()
    } else {
      job.status = willRetry ? 'queued' : 'failed'
      job.progress = 0
      job.errorMessage = errorMessage(error)
      job.completedAt = willRetry ? null : new Date()
    }
    job.metadata = { ...jsonObject(job.metadata), attempt, willRetry }
    await this.jobs.save(job)
    if (!willRetry && job.status === 'failed') {
      await this.writeLog(scope, projectId, 'cut_transcription_failed', 'Cut server transcription failed.', {
        jobId,
        attempt,
        errorMessage: job.errorMessage ?? 'Unknown transcription failure.'
      })
    }
    return compactJob(job)
  }

  async importSubtitle(
    scope: CutScope,
    input: ImportCutSubtitleInput,
    file: { buffer: Buffer; name: string }
  ) {
    const detail = await this.cut.getProject(scope, input.projectId)
    assertRevision(detail.item.revision, input.baseRevision)
    const content = file.buffer.toString('utf8')
    const format = input.format ?? formatFromName(file.name) ?? detectCutSubtitleFormat(content)
    const captions = parseCutSubtitle(content, format)
    assertCaptionBounds(captions, detail.document.settings.durationSeconds)
    const checksum = createHash('sha256').update(file.buffer).digest('hex')
    const idempotencyKey = input.idempotencyKey?.trim() || `subtitle:${checksum}:${input.baseRevision}:${input.language}`
    const existing = await this.jobs.findOne({
      where: captionScopedWhere<CutAnalysisJob>(scope, {
        cutProjectId: input.projectId,
        type: 'transcription',
        executionMode: 'import',
        status: 'succeeded',
        idempotencyKey
      })
    })
    if (existing?.resultTranscriptId) {
      const draft = await this.drafts.findOne({
        where: captionScopedWhere<CutCaptionDraft>(scope, {
          cutProjectId: input.projectId,
          transcriptId: existing.resultTranscriptId
        })
      })
      if (draft) return importResult(detail.item.revision, existing, existing.resultTranscriptId, draft, captions.length, true)
    }

    const job = await this.jobs.save(this.jobs.create({
      ...captionScopedCreate(scope),
      cutProjectId: input.projectId,
      type: 'transcription',
      executionMode: 'import',
      status: 'succeeded',
      progress: 100,
      inputRevision: input.baseRevision,
      language: input.language,
      idempotencyKey,
      metadata: { format, fileName: file.name.slice(0, 240), checksum } as CutJsonValue,
      createdById: scope.userId ?? null,
      assistantId: scope.assistantId ?? null
    }))
    const jobId = requireId(job.id, 'analysis job')
    const transcript = await this.transcripts.save(this.transcripts.create({
      ...captionScopedCreate(scope),
      cutProjectId: input.projectId,
      jobId,
      source: 'subtitle_import',
      language: input.language,
      sourceFormat: format,
      duration: captions.at(-1)?.end ?? 0,
      segmentCount: captions.length,
      inputRevision: input.baseRevision,
      createdById: scope.userId ?? null,
      assistantId: scope.assistantId ?? null
    }))
    const transcriptId = requireId(transcript.id, 'transcript')
    const segmentRows = captions.map((caption, sequence) => this.segments.create({
      ...captionScopedCreate(scope),
      cutProjectId: input.projectId,
      transcriptId,
      sequence,
      start: caption.start,
      end: caption.end,
      text: caption.text,
      speaker: caption.speaker ?? null,
      confidence: null,
      words: null
    }))
    await this.segments.save(segmentRows)
    const draft = await this.drafts.save(this.drafts.create({
      ...captionScopedCreate(scope),
      cutProjectId: input.projectId,
      transcriptId,
      sourceRevision: input.baseRevision,
      status: 'draft',
      revision: 1,
      language: input.language,
      targetTrackId: null,
      captions,
      rules: defaultCaptionRules(),
      createdById: scope.userId ?? null,
      assistantId: scope.assistantId ?? null
    }))
    job.resultTranscriptId = transcriptId
    job.metadata = { format, fileName: file.name.slice(0, 240), checksum, draftId: requireId(draft.id, 'caption draft') } as CutJsonValue
    await this.jobs.save(job)
    await this.writeLog(scope, input.projectId, 'cut_subtitle_imported', input.changeSummary, {
      jobId,
      transcriptId,
      draftId: draft.id ?? null,
      format,
      segmentCount: captions.length
    })
    return importResult(detail.item.revision, job, transcriptId, draft, captions.length, false)
  }

  async getAnalysisJob(scope: CutScope, projectId: string, jobId: string) {
    const job = await this.requireJob(scope, projectId, jobId)
    await this.reconcileQueueJob(job)
    return compactJob(job)
  }

  async listAnalysisJobs(scope: CutScope, projectId: string) {
    const rows = await this.jobs.find({
      where: captionScopedWhere<CutAnalysisJob>(scope, { cutProjectId: projectId }),
      order: { createdAt: 'DESC' },
      take: 30
    })
    await Promise.all(rows.map((job) => this.reconcileQueueJob(job)))
    return rows.map(compactJob)
  }

  async listTranscriptSegments(scope: CutScope, projectId: string, transcriptId: string, page = 1, pageSize = 100) {
    await this.requireTranscript(scope, projectId, transcriptId)
    const rows = await this.segments.find({
      where: captionScopedWhere<CutTranscriptSegment>(scope, { cutProjectId: projectId, transcriptId }),
      order: { sequence: 'ASC' }
    })
    const safePage = Math.max(1, Math.floor(page))
    const safePageSize = Math.min(200, Math.max(1, Math.floor(pageSize)))
    const start = (safePage - 1) * safePageSize
    return {
      items: rows.slice(start, start + safePageSize).map(compactSegment),
      total: rows.length,
      page: safePage,
      pageSize: safePageSize
    }
  }

  async createCaptionDraft(scope: CutScope, input: CreateCutCaptionDraftInput) {
    const detail = await this.cut.getProject(scope, input.projectId)
    assertRevision(detail.item.revision, input.baseRevision)
    const transcript = await this.requireTranscript(scope, input.projectId, input.transcriptId)
    if (input.targetTrackId) requireVisualTrack(detail.document, input.targetTrackId)
    const rows = await this.segments.find({
      where: captionScopedWhere<CutTranscriptSegment>(scope, { cutProjectId: input.projectId, transcriptId: input.transcriptId }),
      order: { sequence: 'ASC' }
    })
    if (!rows.length) throw new Error('Transcript has no segments for a caption draft.')
    let captions: CutCaptionItem[] = normalizeTranscriptCaptionItems(rows.map((segment, index) => ({
      id: `caption-${index + 1}`,
      start: segment.start,
      end: segment.end,
      text: segment.text,
      speaker: segment.speaker ?? null
    })))
    captions = retimeCaptionItems(captions, input.timelineCuts ?? [], input.timelineOffsetSeconds ?? 0, detail.document.settings.durationSeconds)
    captions = resolveCaptionTimelineOverlaps(captions)
    if (!captions.length) throw new Error('Timeline cleanup removed every transcript cue from the caption draft.')
    assertCaptionBounds(captions, detail.document.settings.durationSeconds)
    const draft = await this.drafts.save(this.drafts.create({
      ...captionScopedCreate(scope),
      cutProjectId: input.projectId,
      transcriptId: input.transcriptId,
      sourceRevision: input.baseRevision,
      status: 'draft',
      revision: 1,
      language: transcript.language,
      targetTrackId: input.targetTrackId ?? null,
      captions,
      rules: { ...defaultCaptionRules(), ...input.rules },
      createdById: scope.userId ?? null,
      assistantId: scope.assistantId ?? null
    }))
    await this.writeLog(scope, input.projectId, 'cut_caption_draft_created', input.changeSummary, {
      transcriptId: input.transcriptId,
      draftId: draft.id ?? null,
      captionCount: captions.length,
      sourceRevision: input.baseRevision,
      timelineCutCount: input.timelineCuts?.length ?? 0,
      timelineOffsetSeconds: input.timelineOffsetSeconds ?? 0
    })
    return compactDraftSummary(draft)
  }

  async createTranslatedCaptionDraft(scope: CutScope, input: CreateTranslatedCutCaptionDraftInput) {
    const detail = await this.cut.getProject(scope, input.projectId)
    assertRevision(detail.item.revision, input.baseRevision)
    const source = await this.requireDraft(scope, input.projectId, input.sourceDraftId)
    const targetLanguage = boundedString(input.targetLanguage, 35, 'Cut caption target language')
    if (targetLanguage.toLocaleLowerCase() === source.language.toLocaleLowerCase()) {
      throw new Error('Translated caption target language must differ from the source draft language.')
    }
    if (input.translations.length !== source.captions.length) {
      throw new Error(`Translated caption draft requires exactly ${source.captions.length} translated cues.`)
    }
    const translations = new Map<string, string>()
    for (const [index, translation] of input.translations.entries()) {
      if (translations.has(translation.captionId)) throw new Error(`Translated caption cue ${translation.captionId} is duplicated.`)
      translations.set(translation.captionId, boundedString(translation.text, 10_000, `Translated caption cue ${index + 1}`))
    }
    const sourceIds = new Set(source.captions.map((caption) => caption.id))
    for (const captionId of translations.keys()) {
      if (!sourceIds.has(captionId)) throw new Error(`Translated caption cue ${captionId} does not exist in the source draft.`)
    }
    const captions = source.captions.map((caption) => ({ ...caption, text: translations.get(caption.id)! }))
    assertCaptionBounds(captions, detail.document.settings.durationSeconds)
    const draft = await this.drafts.save(this.drafts.create({
      ...captionScopedCreate(scope),
      cutProjectId: input.projectId,
      transcriptId: source.transcriptId,
      sourceRevision: input.baseRevision,
      status: 'draft',
      revision: 1,
      language: targetLanguage,
      targetTrackId: null,
      captions,
      rules: {
        ...defaultCaptionRules(),
        ...source.rules,
        targetTrackName: input.targetTrackName?.trim() || `${targetLanguage} Captions`
      },
      createdById: scope.userId ?? null,
      assistantId: scope.assistantId ?? null
    }))
    await this.writeLog(scope, input.projectId, 'cut_caption_draft_created', input.changeSummary, {
      sourceDraftId: input.sourceDraftId,
      draftId: draft.id ?? null,
      sourceLanguage: source.language,
      targetLanguage,
      captionCount: captions.length,
      sourceRevision: input.baseRevision,
      translated: true
    })
    return { ...compactDraftSummary(draft), sourceDraftId: input.sourceDraftId, translated: true }
  }

  async getCaptionDraft(scope: CutScope, projectId: string, draftId: string, page = 1, pageSize = 100) {
    const draft = await this.requireDraft(scope, projectId, draftId)
    const safePage = Math.max(1, Math.floor(page))
    const safePageSize = Math.min(200, Math.max(1, Math.floor(pageSize)))
    const start = (safePage - 1) * safePageSize
    return {
      item: compactDraftSummary(draft),
      captions: draft.captions.slice(start, start + safePageSize),
      total: draft.captions.length,
      page: safePage,
      pageSize: safePageSize
    }
  }

  async listCaptionDrafts(scope: CutScope, projectId: string) {
    const rows = await this.drafts.find({
      where: captionScopedWhere<CutCaptionDraft>(scope, { cutProjectId: projectId }),
      order: { updatedAt: 'DESC' },
      take: 30
    })
    return rows.map(compactDraftSummary)
  }

  async updateCaptionDraft(
    scope: CutScope,
    input: {
      projectId: string
      draftId: string
      baseRevision: number
      baseDraftRevision: number
      operation: CutCaptionDraftEditOperation
      changeSummary: string
    }
  ) {
    const draft = await this.requireDraft(scope, input.projectId, input.draftId)
    if (draft.status !== 'draft') throw new ConflictException(`Caption draft ${input.draftId} is ${draft.status}.`)
    if (draft.sourceRevision !== input.baseRevision) {
      throw new ConflictException(`Caption draft is based on project revision ${draft.sourceRevision}, not ${input.baseRevision}.`)
    }
    if (draft.revision !== input.baseDraftRevision) {
      throw new ConflictException(`Caption draft revision changed from ${input.baseDraftRevision} to ${draft.revision}; reload before editing.`)
    }
    const detail = await this.cut.getProject(scope, input.projectId)
    assertRevision(detail.item.revision, input.baseRevision)
    const captions = applyCaptionDraftEdit(draft.captions, input.operation)
    if (!captions.length) throw new Error('A caption draft must retain at least one cue.')
    assertCaptionBounds(captions, detail.document.settings.durationSeconds)
    const nextDraftRevision = input.baseDraftRevision + 1
    const updated = await this.drafts.update(
      captionScopedWhere<CutCaptionDraft>(scope, {
        id: input.draftId,
        cutProjectId: input.projectId,
        revision: input.baseDraftRevision,
        status: 'draft'
      }),
      { captions, revision: nextDraftRevision }
    )
    if (updated.affected !== 1) throw new ConflictException('Caption draft changed concurrently; reload before editing.')
    draft.captions = captions
    draft.revision = nextDraftRevision
    await this.writeLog(scope, input.projectId, 'cut_caption_draft_updated', input.changeSummary, {
      draftId: input.draftId,
      draftRevision: nextDraftRevision,
      operation: input.operation.action,
      captionCount: captions.length
    })
    return compactDraftSummary(draft)
  }

  async commitCaptionDraft(
    scope: CutScope,
    input: {
      projectId: string
      draftId: string
      baseRevision: number
      baseDraftRevision: number
      targetTrackId?: string
      changeSummary: string
    }
  ) {
    const draft = await this.requireDraft(scope, input.projectId, input.draftId)
    if (draft.status === 'committed') {
      return {
        success: true,
        alreadyCommitted: true,
        projectId: input.projectId,
        revision: draft.committedRevision,
        draftRevision: draft.revision,
        draftId: requireId(draft.id, 'caption draft'),
        trackId: draft.targetTrackId,
        changedClipIds: []
      }
    }
    if (draft.status !== 'draft') throw new ConflictException(`Caption draft ${input.draftId} is ${draft.status}.`)
    if (draft.revision !== input.baseDraftRevision) {
      throw new ConflictException(`Caption draft revision changed from ${input.baseDraftRevision} to ${draft.revision}; reload before committing.`)
    }
    if (draft.sourceRevision !== input.baseRevision) {
      throw new ConflictException(`Caption draft is based on revision ${draft.sourceRevision}, not ${input.baseRevision}; create a rebased draft.`)
    }
    const detail = await this.cut.getProject(scope, input.projectId)
    assertRevision(detail.item.revision, input.baseRevision)
    const document = structuredClone(detail.document)
    const trackId = input.targetTrackId ?? draft.targetTrackId ?? randomUUID()
    let track = document.tracks.find((item) => item.id === trackId)
    if (track && track.kind !== 'visual') throw new Error(`Caption track ${trackId} is not visual.`)
    if (!track) {
      track = { id: trackId, name: draft.rules?.targetTrackName ?? 'Captions', kind: 'visual', muted: false, hidden: false, clips: [] }
      document.tracks.push(track)
    }
    const changedClipIds: string[] = []
    for (const [index, caption] of draft.captions.entries()) {
      const id = randomUUID()
      changedClipIds.push(id)
      track.clips.push(captionClip(document, caption, id, index))
    }
    track.clips.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
    const saved = await this.cut.saveProject(scope, {
      projectId: input.projectId,
      document: validateCutProjectDocument(document),
      baseRevision: input.baseRevision,
      changeSummary: input.changeSummary
    })
    draft.status = 'committed'
    draft.revision += 1
    draft.targetTrackId = trackId
    draft.committedRevision = saved.project.revision
    await this.drafts.save(draft)
    await this.writeLog(scope, input.projectId, 'cut_caption_draft_committed', input.changeSummary, {
      draftId: input.draftId,
      transcriptId: draft.transcriptId,
      trackId,
      captionCount: draft.captions.length,
      revision: saved.project.revision
    })
    return {
      success: true,
      alreadyCommitted: false,
      projectId: input.projectId,
      revision: saved.project.revision,
      draftRevision: draft.revision,
      draftId: input.draftId,
      trackId,
      changedClipIds
    }
  }

  async commitCaptionDrafts(scope: CutScope, input: {
    projectId: string
    baseRevision: number
    drafts: Array<{ draftId: string; baseDraftRevision: number; targetTrackId?: string }>
    changeSummary: string
  }) {
    const draftIds = input.drafts.map((item) => item.draftId)
    if (!draftIds.length || draftIds.length > 4) throw new Error('Commit 1-4 caption drafts in one multilingual operation.')
    if (new Set(draftIds).size !== draftIds.length) throw new Error('Multilingual caption commit contains duplicate draft ids.')
    const detail = await this.cut.getProject(scope, input.projectId)
    assertRevision(detail.item.revision, input.baseRevision)
    const drafts = await Promise.all(input.drafts.map(async (item) => {
      const draft = await this.requireDraft(scope, input.projectId, item.draftId)
      if (draft.status !== 'draft') throw new ConflictException(`Caption draft ${item.draftId} is ${draft.status}.`)
      if (draft.sourceRevision !== input.baseRevision) {
        throw new ConflictException(`Caption draft ${item.draftId} is based on revision ${draft.sourceRevision}, not ${input.baseRevision}.`)
      }
      if (draft.revision !== item.baseDraftRevision) {
        throw new ConflictException(`Caption draft ${item.draftId} revision changed from ${item.baseDraftRevision} to ${draft.revision}.`)
      }
      return { draft, targetTrackId: item.targetTrackId }
    }))
    const document = structuredClone(detail.document)
    const changedClipIds: string[] = []
    const committed: Array<{ draftId: string; language: string; trackId: string; captionCount: number }> = []
    for (const { draft, targetTrackId } of drafts) {
      const trackId = targetTrackId ?? draft.targetTrackId ?? randomUUID()
      let track = document.tracks.find((item) => item.id === trackId)
      if (track && track.kind !== 'visual') throw new Error(`Caption track ${trackId} is not visual.`)
      if (!track) {
        track = { id: trackId, name: draft.rules?.targetTrackName ?? `${draft.language} Captions`, kind: 'visual', muted: false, hidden: false, clips: [] }
        document.tracks.push(track)
      }
      const laneIndex = committed.length
      for (const [index, caption] of draft.captions.entries()) {
        const id = randomUUID()
        changedClipIds.push(id)
        track.clips.push(captionClip(document, caption, id, index, {
          laneIndex,
          laneCount: drafts.length
        }))
      }
      track.clips.sort((left, right) => left.start - right.start || left.id.localeCompare(right.id))
      committed.push({ draftId: requireId(draft.id, 'caption draft'), language: draft.language, trackId, captionCount: draft.captions.length })
    }
    const saved = await this.cut.saveProject(scope, {
      projectId: input.projectId,
      document: validateCutProjectDocument(document),
      baseRevision: input.baseRevision,
      changeSummary: input.changeSummary
    })
    for (const [index, { draft }] of drafts.entries()) {
      draft.status = 'committed'
      draft.revision += 1
      draft.targetTrackId = committed[index]!.trackId
      draft.committedRevision = saved.project.revision
    }
    await this.drafts.save(drafts.map(({ draft }) => draft))
    await this.writeLog(scope, input.projectId, 'cut_caption_draft_committed', input.changeSummary, {
      multilingual: true,
      revision: saved.project.revision,
      drafts: committed
    })
    return {
      success: true,
      projectId: input.projectId,
      revision: saved.project.revision,
      committed,
      changedClipIds
    }
  }

  async exportCaptionDraft(scope: CutScope, projectId: string, draftId: string, format: CutSubtitleFormat) {
    const draft = await this.requireDraft(scope, projectId, draftId)
    const content = serializeCutSubtitle(draft.captions, format)
    return { content, format, captionCount: draft.captions.length, language: draft.language }
  }

  async recordSubtitleExport(
    scope: CutScope,
    projectId: string,
    draftId: string,
    format: CutSubtitleFormat,
    captionCount: number,
    changeSummary: string
  ) {
    await this.requireDraft(scope, projectId, draftId)
    await this.writeLog(scope, projectId, 'cut_subtitle_exported', changeSummary, { draftId, format, captionCount })
    return { success: true }
  }

  private async requireTranscript(scope: CutScope, projectId: string, transcriptId: string) {
    const transcript = await this.transcripts.findOne({
      where: captionScopedWhere<CutTranscript>(scope, { id: transcriptId, cutProjectId: projectId })
    })
    if (!transcript) throw new NotFoundException('Cut transcript was not found in the current tenant and organization.')
    return transcript
  }

  private async requireJob(scope: CutScope, projectId: string, jobId: string) {
    const job = await this.jobs.findOne({
      where: captionScopedWhere<CutAnalysisJob>(scope, { id: jobId, cutProjectId: projectId })
    })
    if (!job) throw new NotFoundException('Cut analysis job was not found in the current tenant and organization.')
    return job
  }

  private async reconcileQueueJob(job: CutAnalysisJob) {
    const result = await reconcileCutAnalysisJobWithQueue(this.queue, job)
    if (result.changed) await this.jobs.save(job)
    return result
  }

  private async requireDraft(scope: CutScope, projectId: string, draftId: string) {
    const draft = await this.drafts.findOne({
      where: captionScopedWhere<CutCaptionDraft>(scope, { id: draftId, cutProjectId: projectId })
    })
    if (!draft) throw new NotFoundException('Cut caption draft was not found in the current tenant and organization.')
    return draft
  }

  private async writeLog(scope: CutScope, projectId: string, action: CutActionType, message: string, snapshot: CutJsonValue) {
    await this.logs.save(this.logs.create({
      ...captionScopedCreate(scope),
      cutProjectId: projectId,
      action,
      actorType: scope.assistantId ? 'agent' : scope.userId ? 'user' : 'system',
      actorId: scope.userId ?? scope.assistantId ?? null,
      message,
      errorMessage: null,
      snapshot
    }))
  }
}

function captionScopedCreate(scope: CutScope): CaptionScopedEntity {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    platformProjectId: scope.projectId ?? null
  }
}

function captionScopedWhere<T extends CaptionScopedEntity>(scope: CutScope, where: Partial<T>): FindOptionsWhere<T> {
  return {
    ...where,
    tenantId: scope.tenantId,
    organizationId: (scope.organizationId ?? null) as T['organizationId']
  } as FindOptionsWhere<T>
}

function assertRevision(currentRevision: number, baseRevision: number) {
  if (currentRevision !== baseRevision) {
    throw new ConflictException(`Cut project revision changed from ${baseRevision} to ${currentRevision}; reload before editing captions.`)
  }
}

function assertCaptionBounds(captions: CutCaptionItem[], duration: number) {
  const invalid = captions.find((caption) => !caption.text.trim() || caption.start < 0 || caption.end <= caption.start || caption.end > duration + 0.0001)
  if (invalid) throw new Error(`Caption ${invalid.id} exceeds the ${duration}-second project timeline.`)
  if (new Set(captions.map((caption) => caption.id)).size !== captions.length) throw new Error('Caption draft contains duplicate cue ids.')
}

function normalizeLocalDuration(value: number, sourceDuration: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Cut local transcription duration must be positive.')
  if (value > sourceDuration + 0.0001) {
    throw new Error(`Cut local transcription duration exceeds the ${sourceDuration}-second source media.`)
  }
  return Math.round(value * 1_000) / 1_000
}

function normalizeLocalTranscriptSegments(
  input: ImportCutLocalTranscriptionInput['segments'],
  duration: number
): Array<{ start: number; end: number; text: string; confidence: number | null; speaker: string | null }> {
  if (!Array.isArray(input) || !input.length) throw new Error('Cut local transcription returned no segments.')
  if (input.length > MAX_LOCAL_TRANSCRIPTION_SEGMENTS) {
    throw new Error(`Cut local transcription exceeds ${MAX_LOCAL_TRANSCRIPTION_SEGMENTS} segments.`)
  }
  const segments = input.map((segment, index) => {
    const start = Math.round(segment.start * 1_000) / 1_000
    const end = Math.round(segment.end * 1_000) / 1_000
    const text = segment.text.trim()
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + 0.0001) {
      throw new Error(`Cut local transcription segment ${index + 1} exceeds the ${duration}-second source range.`)
    }
    if (!text) throw new Error(`Cut local transcription segment ${index + 1} has no text.`)
    const confidence = segment.confidence == null ? null : Number(segment.confidence)
    if (confidence != null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
      throw new Error(`Cut local transcription segment ${index + 1} has invalid confidence.`)
    }
    return {
      start,
      end,
      text: boundedString(text, 4_000, `Cut local transcription segment ${index + 1} text`),
      confidence,
      speaker: segment.speaker == null ? null : boundedString(segment.speaker, 160, `Cut local transcription segment ${index + 1} speaker`)
    }
  }).sort((left, right) => left.start - right.start || left.end - right.end)
  if (segments.reduce((total, segment) => total + segment.text.length, 0) > MAX_LOCAL_TRANSCRIPTION_CHARACTERS) {
    throw new Error(`Cut local transcription exceeds ${MAX_LOCAL_TRANSCRIPTION_CHARACTERS} text characters.`)
  }
  return segments
}

function boundedString(value: string, maxLength: number, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  if (normalized.length > maxLength) throw new Error(`${label} exceeds ${maxLength} characters.`)
  return normalized
}

function requireVisualTrack(document: CutProjectDocument, trackId: string) {
  const track = document.tracks.find((item) => item.id === trackId)
  if (!track) throw new Error(`Track ${trackId} was not found.`)
  if (track.kind !== 'visual') throw new Error(`Track ${trackId} is not visual.`)
  return track
}

function captionClip(
  document: CutProjectDocument,
  caption: CutCaptionItem,
  id: string,
  index: number,
  layout?: { laneIndex: number; laneCount: number }
) {
  const duration = caption.end - caption.start
  const laneCount = Math.max(1, layout?.laneCount ?? 1)
  const laneIndex = Math.min(laneCount - 1, Math.max(0, layout?.laneIndex ?? 0))
  const captionAreaY = laneCount === 1 ? 0.72 : 0.66
  const captionAreaHeight = laneCount === 1 ? 0.18 : 0.26
  const laneHeight = captionAreaHeight / laneCount
  return {
    id,
    type: 'text' as const,
    name: `Caption ${index + 1}`,
    start: caption.start,
    duration,
    trimIn: 0,
    trimOut: duration,
    text: caption.text,
    color: '#ffffff',
    fontSize: Math.max(24, Math.round(document.settings.height * (laneCount === 1 ? 0.052 : 0.038))),
    fontWeight: 600,
    textAlign: 'center' as const,
    transform: {
      x: document.settings.width * 0.1,
      y: document.settings.height * (captionAreaY + laneIndex * laneHeight),
      width: document.settings.width * 0.8,
      height: document.settings.height * laneHeight,
      rotation: 0,
      opacity: 1
    }
  }
}

function applyCaptionDraftEdit(captionsInput: CutCaptionItem[], operation: CutCaptionDraftEditOperation) {
  const captions = structuredClone(captionsInput)
  if (operation.action === 'update') {
    const caption = requireCaption(captions, operation.captionId)
    if ([operation.start, operation.end, operation.text, operation.speaker].every((value) => value === undefined)) {
      throw new Error('Caption update requires a non-empty patch.')
    }
    if (operation.start !== undefined) caption.start = operation.start
    if (operation.end !== undefined) caption.end = operation.end
    if (operation.text !== undefined) caption.text = operation.text
    if (operation.speaker !== undefined) caption.speaker = operation.speaker
  } else if (operation.action === 'split') {
    const caption = requireCaption(captions, operation.captionId)
    if (operation.at <= caption.start || operation.at >= caption.end) throw new Error('Caption split point must be inside the cue.')
    if (!operation.leftText.trim() || !operation.rightText.trim()) throw new Error('Caption split requires text on both sides.')
    const index = captions.indexOf(caption)
    captions.splice(index, 1,
      { ...caption, id: randomUUID(), end: operation.at, text: operation.leftText.trim() },
      { ...caption, id: randomUUID(), start: operation.at, text: operation.rightText.trim() }
    )
  } else if (operation.action === 'merge') {
    const ids = uniqueCaptionIds(operation.captionIds, 'merge')
    if (ids.length < 2) throw new Error('Caption merge requires at least two cues.')
    const selected = ids.map((id) => requireCaption(captions, id)).sort((a, b) => a.start - b.start)
    const merged: CutCaptionItem = {
      id: selected[0]!.id,
      start: Math.min(...selected.map((caption) => caption.start)),
      end: Math.max(...selected.map((caption) => caption.end)),
      text: operation.text?.trim() || selected.map((caption) => caption.text).join(' '),
      speaker: selected.every((caption) => caption.speaker === selected[0]!.speaker) ? selected[0]!.speaker : null
    }
    const firstIndex = Math.min(...selected.map((caption) => captions.indexOf(caption)))
    const selectedIds = new Set(ids)
    const remaining = captions.filter((caption) => !selectedIds.has(caption.id))
    remaining.splice(Math.min(firstIndex, remaining.length), 0, merged)
    return remaining.sort((a, b) => a.start - b.start || a.end - b.end)
  } else if (operation.action === 'delete') {
    const ids = uniqueCaptionIds(operation.captionIds, 'delete')
    ids.forEach((id) => requireCaption(captions, id))
    const selectedIds = new Set(ids)
    return captions.filter((caption) => !selectedIds.has(caption.id))
  } else {
    const ids = operation.captionIds ? uniqueCaptionIds(operation.captionIds, 'offset') : captions.map((caption) => caption.id)
    if (!ids.length) throw new Error('Caption offset requires at least one cue.')
    const selectedIds = new Set(ids)
    ids.forEach((id) => requireCaption(captions, id))
    for (const caption of captions) {
      if (!selectedIds.has(caption.id)) continue
      caption.start += operation.seconds
      caption.end += operation.seconds
    }
  }
  return captions.sort((a, b) => a.start - b.start || a.end - b.end)
}

function retimeCaptionItems(
  captions: readonly CutCaptionItem[],
  timelineCutsInput: readonly CutTimeRange[],
  timelineOffsetSeconds: number,
  projectDuration: number
) {
  if (!Number.isFinite(timelineOffsetSeconds) || timelineOffsetSeconds < 0 || timelineOffsetSeconds > 60) {
    throw new Error('Caption timeline offset must be between 0 and 60 seconds.')
  }
  const sourceDuration = Math.max(projectDuration, ...captions.map((caption) => caption.end))
  const cuts = timelineCutsInput.length ? normalizeCutTimeRanges(timelineCutsInput, sourceDuration) : []
  return captions.flatMap((caption) => {
    const portions = subtractCaptionCuts(caption.start, caption.end, cuts)
    if (!portions.length) return []
    const start = cutTimeAfterRippleDelete(portions[0]!.start, cuts) + timelineOffsetSeconds
    const end = cutTimeAfterRippleDelete(portions.at(-1)!.end, cuts) + timelineOffsetSeconds
    if (end <= start + 0.001 || start >= projectDuration) return []
    return [{
      ...caption,
      start: Math.round(start * 1_000) / 1_000,
      end: Math.round(Math.min(projectDuration, end) * 1_000) / 1_000
    }]
  })
}

/**
 * Browser Whisper runs overlapping audio windows so speech on a window edge can
 * legitimately arrive twice. Keep the stronger cue when two candidates cover
 * essentially the same speech, while leaving short adjacent exchanges intact.
 */
export function normalizeTranscriptCaptionItems(captionsInput: readonly CutCaptionItem[]) {
  const captions = captionsInput
    .filter((caption) => caption.text.trim() && caption.end > caption.start)
    .map((caption) => ({ ...caption, text: caption.text.trim() }))
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const normalized: CutCaptionItem[] = []
  for (const candidate of captions) {
    let keepCandidate = true
    for (let index = normalized.length - 1; index >= 0; index -= 1) {
      const existing = normalized[index]!
      if (existing.end <= candidate.start) break
      const overlap = Math.min(existing.end, candidate.end) - Math.max(existing.start, candidate.start)
      if (overlap <= 0) continue
      const existingDuration = existing.end - existing.start
      const candidateDuration = candidate.end - candidate.start
      const overlapOfShorter = overlap / Math.min(existingDuration, candidateDuration)
      const existingText = comparableCaptionText(existing.text)
      const candidateText = comparableCaptionText(candidate.text)
      const textRelated = Boolean(existingText && candidateText) &&
        (existingText === candidateText || existingText.includes(candidateText) || candidateText.includes(existingText))
      const candidateDominates = candidateDuration >= existingDuration * 1.35 && candidateText.length >= existingText.length * 1.35
      const existingDominates = existingDuration >= candidateDuration * 1.35 && existingText.length >= candidateText.length * 1.35
      const duplicateWindow =
        (textRelated && overlapOfShorter >= 0.3) ||
        (overlapOfShorter >= 0.82 && (candidateDominates || existingDominates || Math.min(existingText.length, candidateText.length) <= 1)) ||
        (overlapOfShorter >= 0.65 && (candidateDominates || existingDominates))
      if (!duplicateWindow) continue
      if (captionCandidateScore(candidate, candidateText) > captionCandidateScore(existing, existingText)) {
        normalized.splice(index, 1)
        continue
      }
      keepCandidate = false
      break
    }
    if (keepCandidate) normalized.push(candidate)
  }
  return normalized.sort((left, right) => left.start - right.start || left.end - right.end)
}

export function resolveCaptionTimelineOverlaps(captionsInput: readonly CutCaptionItem[]) {
  const captions = captionsInput
    .map((caption) => ({ ...caption }))
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const resolved: CutCaptionItem[] = []
  for (const caption of captions) {
    const previous = resolved.at(-1)
    if (!previous || caption.start >= previous.end) {
      resolved.push(caption)
      continue
    }
    const boundary = Math.round(((caption.start + previous.end) / 2) * 1_000) / 1_000
    previous.end = boundary
    caption.start = boundary
    if (previous.end <= previous.start + 0.05) resolved.pop()
    if (caption.end > caption.start + 0.05) resolved.push(caption)
  }
  return resolved
}

function comparableCaptionText(text: string) {
  return text.toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

function captionCandidateScore(caption: CutCaptionItem, comparableText: string) {
  const duration = caption.end - caption.start
  return comparableText.length * 3 + Math.min(duration, 8)
}

function subtractCaptionCuts(start: number, end: number, cuts: readonly CutTimeRange[]) {
  const portions: CutTimeRange[] = []
  let cursor = start
  for (const cut of cuts) {
    if (cut.end <= cursor) continue
    if (cut.start >= end) break
    if (cut.start > cursor) portions.push({ start: cursor, end: Math.min(cut.start, end) })
    cursor = Math.max(cursor, cut.end)
    if (cursor >= end) break
  }
  if (cursor < end) portions.push({ start: cursor, end })
  return portions.filter((portion) => portion.end - portion.start > 0.001)
}

function requireCaption(captions: CutCaptionItem[], captionId: string) {
  const caption = captions.find((item) => item.id === captionId)
  if (!caption) throw new Error(`Caption ${captionId} was not found in the draft.`)
  return caption
}

function uniqueCaptionIds(ids: string[], operation: string) {
  const unique = [...new Set(ids)]
  if (unique.length !== ids.length) throw new Error(`Caption ${operation} contains duplicate cue ids.`)
  return unique
}

function defaultCaptionRules(): CutCaptionRules {
  return { maxCharsPerLine: 42, maxLines: 2, minDuration: 0.8, maxDuration: 7, targetTrackName: 'Captions' }
}

function formatFromName(name: string): CutSubtitleFormat | undefined {
  const extension = name.toLowerCase().split('.').pop()
  return extension === 'srt' || extension === 'vtt' || extension === 'ass' ? extension : undefined
}

function requireId(id: string | undefined, label: string) {
  if (!id) throw new Error(`Cut persistence did not return a ${label} id.`)
  return id
}

function compactJob(job: CutAnalysisJob) {
  const metadata = jsonObject(job.metadata)
  const rawExportSettings = jsonObject(metadata.exportSettings)
  const exportSettings = job.type === 'render' ? normalizeCutExportSettings({
    format: isCutExportFormat(rawExportSettings.format) ? rawExportSettings.format : undefined,
    quality: isCutExportQuality(rawExportSettings.quality) ? rawExportSettings.quality : undefined,
    includeAudio: typeof rawExportSettings.includeAudio === 'boolean' ? rawExportSettings.includeAudio : undefined
  }) : null
  return {
    id: job.id,
    projectId: job.cutProjectId,
    type: job.type,
    executionMode: job.executionMode,
    status: job.status,
    progress: job.progress,
    inputRevision: job.inputRevision,
    mediaAssetId: job.mediaAssetId ?? null,
    language: job.language ?? null,
    model: job.model ?? null,
    queueJobId: job.queueJobId ?? null,
    cancellationRequested: job.cancellationRequested ?? false,
    resultTranscriptId: job.resultTranscriptId ?? null,
    resultExportId: job.resultExportId ?? null,
    sandboxJobId: job.sandboxJobId ?? null,
    stage: typeof metadata.stage === 'string' ? metadata.stage : null,
    variantName: typeof metadata.variantName === 'string' ? metadata.variantName : null,
    exportSettings,
    failureCode: typeof metadata.errorCode === 'string' ? metadata.errorCode : null,
    errorMessage: job.errorMessage ?? null,
    createdAt: job.createdAt?.toISOString?.() ?? null,
    updatedAt: job.updatedAt?.toISOString?.() ?? null,
    startedAt: job.startedAt?.toISOString?.() ?? null,
    completedAt: job.completedAt?.toISOString?.() ?? null
  }
}

function compactSegment(segment: CutTranscriptSegment) {
  return {
    id: segment.id,
    sequence: segment.sequence,
    start: segment.start,
    end: segment.end,
    text: segment.text,
    confidence: segment.confidence ?? null,
    speaker: segment.speaker ?? null,
    words: segment.words ?? null
  }
}

function compactDraftSummary(draft: CutCaptionDraft) {
  return {
    id: draft.id,
    projectId: draft.cutProjectId,
    transcriptId: draft.transcriptId,
    sourceRevision: draft.sourceRevision,
    status: draft.status,
    revision: draft.revision,
    language: draft.language,
    targetTrackId: draft.targetTrackId ?? null,
    captionCount: draft.captions.length,
    rules: draft.rules ?? null,
    committedRevision: draft.committedRevision ?? null,
    createdAt: draft.createdAt?.toISOString?.() ?? null,
    updatedAt: draft.updatedAt?.toISOString?.() ?? null
  }
}

function importResult(
  revision: number,
  job: CutAnalysisJob,
  transcriptId: string,
  draft: CutCaptionDraft,
  segmentCount: number,
  idempotentReplay: boolean
) {
  return {
    success: true,
    projectId: job.cutProjectId,
    revision,
    jobId: requireId(job.id, 'analysis job'),
    transcriptId,
    draftId: requireId(draft.id, 'caption draft'),
    draftRevision: draft.revision,
    segmentCount,
    idempotentReplay
  }
}

function startTranscriptionResult(job: CutAnalysisJob, revision: number, idempotentReplay: boolean) {
  return {
    success: true,
    projectId: job.cutProjectId,
    revision,
    jobId: requireId(job.id, 'analysis job'),
    status: job.status,
    progress: job.progress,
    mediaAssetId: job.mediaAssetId ?? null,
    idempotentReplay
  }
}

function normalizeSpeechModel(value: TCopilotModel): TCopilotModel & { copilotId: string; model: string } {
  const copilotId = value.copilotId?.trim()
  const model = value.model?.trim()
  if (!copilotId || !model) throw new Error('The current Xpert has no complete speech-to-text model configuration.')
  if (value.modelType && value.modelType !== AiModelTypeEnum.SPEECH2TEXT) {
    throw new Error(`The configured model type is ${value.modelType}, not speech2text.`)
  }
  return {
    copilotId,
    model,
    modelType: AiModelTypeEnum.SPEECH2TEXT,
    ...(value.options ? { options: structuredClone(value.options) } : {})
  }
}

function jsonObject(value: CutJsonValue | null | undefined): Record<string, CutJsonValue | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function errorMessage(error: unknown) {
  const value = error instanceof Error ? error.message : String(error)
  return value.slice(0, 4_000) || 'Cut transcription failed.'
}
