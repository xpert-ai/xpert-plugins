import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import type { FindOptionsWhere, Repository } from 'typeorm'
import {
  CutActionLog,
  CutAnalysisJob,
  CutMediaAsset,
  CutMediaSegment,
  CutTranscript,
  CutTranscriptSegment
} from './entities/index.js'
import { CutService } from './cut.service.js'
import type {
  CutJsonValue,
  CutMediaEvidenceSegmentData,
  CutMediaEvidenceType,
  CutScope
} from './types.js'

const MAX_IMPORTED_MEDIA_SEGMENTS = 5_000
const MAX_SEARCH_LIMIT = 50

type ScopedEntity = {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  platformProjectId?: string | null
}

export interface ImportCutLocalMediaAnalysisInput {
  projectId: string
  mediaAssetId: string
  baseRevision: number
  analyzerVersion: string
  duration: number
  segments: CutMediaEvidenceSegmentData[]
  idempotencyKey?: string
  changeSummary: string
}

export interface SearchCutMediaSegmentsInput {
  projectId: string
  query?: string
  mediaAssetId?: string
  evidenceTypes?: CutMediaEvidenceType[]
  start?: number
  end?: number
  minScore?: number
  limit?: number
}

export interface CutMediaSearchResult {
  id: string
  projectId: string
  mediaAssetId: string
  mediaName: string
  evidenceType: CutMediaEvidenceType
  start: number
  end: number
  label: string
  text: string | null
  confidence: number | null
  relevance: number
  inputRevision: number
  thumbnail: { url: string; time: number } | null
  metadata: CutJsonValue | null
}

@Injectable()
export class CutMediaIntelligenceService {
  constructor(
    private readonly cut: CutService,
    @InjectRepository(CutMediaAsset) private readonly media: Repository<CutMediaAsset>,
    @InjectRepository(CutAnalysisJob) private readonly jobs: Repository<CutAnalysisJob>,
    @InjectRepository(CutMediaSegment) private readonly mediaSegments: Repository<CutMediaSegment>,
    @InjectRepository(CutTranscript) private readonly transcripts: Repository<CutTranscript>,
    @InjectRepository(CutTranscriptSegment) private readonly transcriptSegments: Repository<CutTranscriptSegment>,
    @InjectRepository(CutActionLog) private readonly logs: Repository<CutActionLog>
  ) {}

  async importLocalAnalysis(scope: CutScope, input: ImportCutLocalMediaAnalysisInput) {
    const detail = await this.cut.getProject(scope, input.projectId)
    if (detail.item.revision !== input.baseRevision) {
      throw new ConflictException(`Cut project revision changed from ${input.baseRevision} to ${detail.item.revision}; reload before saving media analysis.`)
    }
    const asset = await this.requireMedia(scope, input.projectId, input.mediaAssetId)
    const duration = normalizeDuration(input.duration, detail.document.settings.durationSeconds, asset.duration)
    const analyzerVersion = boundedString(input.analyzerVersion, 120, 'Cut media analyzer version')
    const segments = normalizeMediaSegments(input.segments, input.mediaAssetId, duration)
    const contentHash = createHash('sha256').update(JSON.stringify({
      assetChecksum: asset.checksum,
      revision: input.baseRevision,
      analyzerVersion,
      duration,
      segments
    })).digest('hex')
    const idempotencyKey = input.idempotencyKey?.trim() || `local-analysis:${contentHash}`
    const existing = await this.jobs.findOne({
      where: scopedWhere<CutAnalysisJob>(scope, {
        cutProjectId: input.projectId,
        type: 'media_analysis',
        executionMode: 'local',
        status: 'succeeded',
        idempotencyKey
      })
    })
    if (existing?.id) {
      const rows = await this.mediaSegments.find({
        where: scopedWhere<CutMediaSegment>(scope, { cutProjectId: input.projectId, analysisJobId: existing.id }),
        order: { start: 'ASC' }
      })
      if (rows.length) return importResult(existing, detail.item.revision, rows, true)
    }

    const now = new Date()
    const job = await this.jobs.save(this.jobs.create({
      ...scopedCreate(scope),
      cutProjectId: input.projectId,
      type: 'media_analysis',
      executionMode: 'local',
      status: 'succeeded',
      progress: 100,
      inputRevision: input.baseRevision,
      mediaAssetId: input.mediaAssetId,
      model: analyzerVersion,
      idempotencyKey,
      cancellationRequested: false,
      metadata: {
        contentHash,
        analyzerVersion,
        duration,
        evidenceCounts: evidenceCounts(segments)
      },
      createdById: scope.userId ?? null,
      assistantId: scope.assistantId ?? null,
      startedAt: now,
      completedAt: now
    }))
    const jobId = requireId(job.id, 'media analysis job')
    const rows = await this.mediaSegments.save(segments.map((segment) => this.mediaSegments.create({
      ...scopedCreate(scope),
      cutProjectId: input.projectId,
      analysisJobId: jobId,
      mediaAssetId: input.mediaAssetId,
      evidenceType: segment.evidenceType,
      start: segment.start,
      end: segment.end,
      label: segment.label,
      text: segment.text,
      confidence: segment.confidence,
      thumbnailTime: segment.thumbnailTime,
      metadata: segment.metadata,
      inputRevision: input.baseRevision,
      createdById: scope.userId ?? null,
      assistantId: scope.assistantId ?? null
    })))
    await this.logs.save(this.logs.create({
      ...scopedCreate(scope),
      cutProjectId: input.projectId,
      action: 'cut_media_analysis_imported',
      actorType: scope.assistantId ? 'agent' : scope.userId ? 'user' : 'system',
      message: boundedString(input.changeSummary, 500, 'Cut media analysis change summary'),
      errorMessage: null,
      snapshot: {
        jobId,
        mediaAssetId: input.mediaAssetId,
        analyzerVersion,
        segmentCount: rows.length,
        evidenceCounts: evidenceCounts(segments),
        inputRevision: input.baseRevision
      }
    }))
    return importResult(job, detail.item.revision, rows, false)
  }

  async search(scope: CutScope, input: SearchCutMediaSegmentsInput) {
    await this.cut.getProject(scope, input.projectId)
    const query = input.query?.trim().slice(0, 200) ?? ''
    const evidenceTypes = input.evidenceTypes?.length ? new Set(input.evidenceTypes) : null
    const start = finiteBound(input.start, 0)
    const end = input.end == null ? Number.POSITIVE_INFINITY : finiteBound(input.end, Number.POSITIVE_INFINITY)
    if (end <= start) throw new Error('Cut media search end must be greater than start.')
    const minScore = clamp(input.minScore ?? 0, 0, 1)
    const limit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.floor(input.limit ?? 20)))
    const assets = await this.media.find({ where: scopedWhere<CutMediaAsset>(scope, { cutProjectId: input.projectId }) })
    const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
    const candidates: CutMediaSearchResult[] = []

    if (!evidenceTypes || evidenceTypes.has('transcript')) {
      const transcripts = await this.transcripts.find({
        where: scopedWhere<CutTranscript>(scope, { cutProjectId: input.projectId }),
        order: { createdAt: 'DESC' },
        take: 50
      })
      for (const transcript of transcripts) {
        if (!transcript.id || !transcript.mediaAssetId || (input.mediaAssetId && transcript.mediaAssetId !== input.mediaAssetId)) continue
        const asset = assetMap.get(transcript.mediaAssetId)
        if (!asset) continue
        const rows = await this.transcriptSegments.find({
          where: scopedWhere<CutTranscriptSegment>(scope, { cutProjectId: input.projectId, transcriptId: transcript.id }),
          order: { sequence: 'ASC' }
        })
        for (const row of rows) {
          if (!intersects(row.start, row.end, start, end)) continue
          const relevance = lexicalRelevance(query, `${row.text} ${row.speaker ?? ''}`)
          if (relevance < minScore || (query && relevance === 0)) continue
          candidates.push({
            id: `transcript:${requireId(row.id, 'transcript segment')}`,
            projectId: input.projectId,
            mediaAssetId: transcript.mediaAssetId,
            mediaName: asset.originalName,
            evidenceType: 'transcript',
            start: row.start,
            end: row.end,
            label: row.speaker ? `Transcript · ${row.speaker}` : 'Transcript',
            text: row.text,
            confidence: row.confidence ?? null,
            relevance,
            inputRevision: transcript.inputRevision,
            thumbnail: thumbnail(asset, row.start),
            metadata: transcriptWordMetadata(row.words)
          })
        }
      }
    }

    const analysisRows = await this.mediaSegments.find({
      where: scopedWhere<CutMediaSegment>(scope, { cutProjectId: input.projectId }),
      order: { start: 'ASC' }
    })
    for (const row of analysisRows) {
      if ((input.mediaAssetId && row.mediaAssetId !== input.mediaAssetId) || (evidenceTypes && !evidenceTypes.has(row.evidenceType))) continue
      if (!intersects(row.start, row.end, start, end)) continue
      const asset = assetMap.get(row.mediaAssetId)
      if (!asset) continue
      const relevance = lexicalRelevance(query, `${row.label} ${row.text ?? ''} ${localizedEvidenceName(row.evidenceType)}`)
      if (relevance < minScore || (query && relevance === 0)) continue
      candidates.push({
        id: `analysis:${requireId(row.id, 'media segment')}`,
        projectId: input.projectId,
        mediaAssetId: row.mediaAssetId,
        mediaName: asset.originalName,
        evidenceType: row.evidenceType,
        start: row.start,
        end: row.end,
        label: row.label,
        text: row.text ?? null,
        confidence: row.confidence ?? null,
        relevance,
        inputRevision: row.inputRevision,
        thumbnail: thumbnail(asset, row.thumbnailTime ?? row.start),
        metadata: row.metadata ?? null
      })
    }
    candidates.sort((left, right) => right.relevance - left.relevance || left.start - right.start || left.id.localeCompare(right.id))
    return { items: candidates.slice(0, limit), total: candidates.length, query, limit }
  }

  async getSegment(scope: CutScope, projectId: string, segmentId: string) {
    await this.cut.getProject(scope, projectId)
    const [source, id] = segmentId.split(':', 2)
    if (!id || (source !== 'transcript' && source !== 'analysis')) throw new Error('Cut media segment id must use transcript:<id> or analysis:<id>.')
    const assets = await this.media.find({ where: scopedWhere<CutMediaAsset>(scope, { cutProjectId: projectId }) })
    const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
    if (source === 'transcript') {
      const row = await this.transcriptSegments.findOne({ where: scopedWhere<CutTranscriptSegment>(scope, { id, cutProjectId: projectId }) })
      if (!row) throw new NotFoundException('Cut transcript segment was not found in the current tenant and organization.')
      const transcript = await this.transcripts.findOne({ where: scopedWhere<CutTranscript>(scope, { id: row.transcriptId, cutProjectId: projectId }) })
      const asset = transcript?.mediaAssetId ? assetMap.get(transcript.mediaAssetId) : null
      if (!transcript?.mediaAssetId || !asset) throw new NotFoundException('Cut transcript media was not found.')
      return {
        id: segmentId,
        projectId,
        mediaAssetId: transcript.mediaAssetId,
        mediaName: asset.originalName,
        evidenceType: 'transcript' as const,
        start: row.start,
        end: row.end,
        label: row.speaker ? `Transcript · ${row.speaker}` : 'Transcript',
        text: row.text,
        confidence: row.confidence ?? null,
        inputRevision: transcript.inputRevision,
        thumbnail: thumbnail(asset, row.start),
        metadata: transcriptWordMetadata(row.words)
      }
    }
    const row = await this.mediaSegments.findOne({ where: scopedWhere<CutMediaSegment>(scope, { id, cutProjectId: projectId }) })
    if (!row) throw new NotFoundException('Cut media analysis segment was not found in the current tenant and organization.')
    const asset = assetMap.get(row.mediaAssetId)
    if (!asset) throw new NotFoundException('Cut analysis media was not found.')
    return {
      id: segmentId,
      projectId,
      mediaAssetId: row.mediaAssetId,
      mediaName: asset.originalName,
      evidenceType: row.evidenceType,
      start: row.start,
      end: row.end,
      label: row.label,
      text: row.text ?? null,
      confidence: row.confidence ?? null,
      inputRevision: row.inputRevision,
      thumbnail: thumbnail(asset, row.thumbnailTime ?? row.start),
      metadata: row.metadata ?? null
    }
  }

  async listSegments(scope: CutScope, projectId: string, limit = 100) {
    const result = await this.search(scope, { projectId, limit: Math.min(MAX_SEARCH_LIMIT, limit) })
    return result.items
  }

  private async requireMedia(scope: CutScope, projectId: string, mediaAssetId: string) {
    const asset = await this.media.findOne({ where: scopedWhere<CutMediaAsset>(scope, { id: mediaAssetId, cutProjectId: projectId }) })
    if (!asset) throw new NotFoundException('Cut media asset was not found in the current tenant and organization.')
    return asset
  }
}

function normalizeDuration(value: number, projectDuration: number, mediaDuration?: number | null) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Cut media analysis duration must be positive.')
  const upperBound = Math.min(projectDuration, typeof mediaDuration === 'number' && mediaDuration > 0 ? mediaDuration : projectDuration)
  if (value > upperBound + 0.0001) throw new Error(`Cut media analysis duration exceeds the ${upperBound}-second source range.`)
  return roundMilliseconds(value)
}

function normalizeMediaSegments(input: CutMediaEvidenceSegmentData[], mediaAssetId: string, duration: number) {
  if (!Array.isArray(input) || !input.length) throw new Error('Cut media analysis returned no evidence segments.')
  if (input.length > MAX_IMPORTED_MEDIA_SEGMENTS) throw new Error(`Cut media analysis exceeds ${MAX_IMPORTED_MEDIA_SEGMENTS} segments.`)
  return input.map((segment, index) => {
    if (segment.mediaAssetId !== mediaAssetId) throw new Error(`Cut media analysis segment ${index + 1} targets another media asset.`)
    const start = roundMilliseconds(segment.start)
    const end = roundMilliseconds(segment.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + 0.0001) {
      throw new Error(`Cut media analysis segment ${index + 1} exceeds the ${duration}-second source range.`)
    }
    const confidence = segment.confidence == null ? null : Number(segment.confidence)
    if (confidence != null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
      throw new Error(`Cut media analysis segment ${index + 1} has invalid confidence.`)
    }
    const thumbnailTime = segment.thumbnailTime == null ? null : Number(segment.thumbnailTime)
    if (thumbnailTime != null && (!Number.isFinite(thumbnailTime) || thumbnailTime < start || thumbnailTime > end)) {
      throw new Error(`Cut media analysis segment ${index + 1} has an invalid thumbnail time.`)
    }
    return {
      mediaAssetId,
      evidenceType: segment.evidenceType,
      start,
      end,
      label: boundedString(segment.label, 240, `Cut media analysis segment ${index + 1} label`),
      text: segment.text == null ? null : boundedString(segment.text, 4_000, `Cut media analysis segment ${index + 1} text`),
      confidence,
      thumbnailTime: thumbnailTime == null ? null : roundMilliseconds(thumbnailTime),
      metadata: segment.metadata ?? null
    }
  }).sort((left, right) => left.start - right.start || left.end - right.end)
}

function evidenceCounts(segments: Array<{ evidenceType: string }>) {
  return segments.reduce<Record<string, number>>((counts, segment) => {
    counts[segment.evidenceType] = (counts[segment.evidenceType] ?? 0) + 1
    return counts
  }, {})
}

function lexicalRelevance(query: string, value: string) {
  if (!query) return 1
  const normalizedQuery = normalizeSearchText(query)
  const normalizedValue = normalizeSearchText(value)
  if (!normalizedQuery || !normalizedValue) return 0
  if (normalizedValue.includes(normalizedQuery)) return 1
  const queryTokens = searchTokens(normalizedQuery)
  const valueTokens = searchTokens(normalizedValue)
  if (!queryTokens.size || !valueTokens.size) return 0
  let matches = 0
  for (const token of queryTokens) if (valueTokens.has(token)) matches += 1
  return Math.round(matches / queryTokens.size * 1_000) / 1_000
}

function searchTokens(value: string) {
  const tokens = new Set(value.split(/\s+/u).filter(Boolean))
  const cjk = [...value.replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, '')]
  for (let index = 0; index < cjk.length; index += 1) {
    tokens.add(cjk[index]!)
    if (index + 1 < cjk.length) tokens.add(`${cjk[index]}${cjk[index + 1]}`)
  }
  return tokens
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase().normalize('NFKC').replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/gu, ' ').trim()
}

function localizedEvidenceName(type: Exclude<CutMediaEvidenceType, 'transcript'>) {
  if (type === 'silence') return 'silence quiet pause 静音 安静 停顿'
  if (type === 'audio_activity') return 'audio activity speech sound 音频 语音 有声'
  if (type === 'shot') return 'shot scene cut 镜头 场景 转场'
  if (type === 'keyframe') return 'keyframe thumbnail 关键帧 缩略图'
  if (type === 'ocr') return 'ocr text 画面文字 文本'
  return 'visual description 画面描述'
}

function thumbnail(asset: CutMediaAsset, time: number) {
  return asset.previewUrl ? { url: asset.previewUrl, time: roundMilliseconds(time) } : null
}

function transcriptWordMetadata(words: CutTranscriptSegment['words']): CutJsonValue | null {
  return words ? {
    words: words.map((word) => ({
      start: word.start,
      end: word.end,
      text: word.text,
      confidence: word.confidence ?? null
    }))
  } : null
}

function intersects(segmentStart: number, segmentEnd: number, start: number, end: number) {
  return segmentEnd > start && segmentStart < end
}

function finiteBound(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundMilliseconds(value: number) {
  return Math.round(value * 1_000) / 1_000
}

function boundedString(value: string, maxLength: number, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  if (normalized.length > maxLength) throw new Error(`${label} exceeds ${maxLength} characters.`)
  return normalized
}

function requireId(id: string | undefined, label: string) {
  if (!id) throw new Error(`Cut persistence did not return a ${label} id.`)
  return id
}

function scopedCreate(scope: CutScope): ScopedEntity {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    platformProjectId: scope.projectId ?? null
  }
}

function scopedWhere<T extends ScopedEntity>(scope: CutScope, where: Partial<T>): FindOptionsWhere<T> {
  return {
    ...where,
    tenantId: scope.tenantId,
    organizationId: (scope.organizationId ?? null) as T['organizationId']
  } as FindOptionsWhere<T>
}

function importResult(job: CutAnalysisJob, revision: number, rows: CutMediaSegment[], idempotentReplay: boolean) {
  return {
    success: true,
    projectId: job.cutProjectId,
    revision,
    jobId: requireId(job.id, 'media analysis job'),
    mediaAssetId: job.mediaAssetId ?? null,
    segmentCount: rows.length,
    evidenceCounts: evidenceCounts(rows),
    idempotentReplay
  }
}
