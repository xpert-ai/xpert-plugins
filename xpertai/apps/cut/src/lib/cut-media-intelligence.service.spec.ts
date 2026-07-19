import type { Repository } from 'typeorm'

jest.mock('./cut.service.js', () => ({ CutService: class CutService {} }))

import { CutMediaIntelligenceService } from './cut-media-intelligence.service.js'
import { createStarterCutProject } from './cut-project.js'
import type { CutService } from './cut.service.js'
import {
  CutActionLog,
  CutAnalysisJob,
  CutMediaAsset,
  CutMediaSegment,
  CutTranscript,
  CutTranscriptSegment
} from './entities/index.js'
import type { CutScope } from './types.js'

describe('CutMediaIntelligenceService evidence index', () => {
  it('imports local evidence idempotently and searches scoped transcript, silence, and shot ranges', async () => {
    const media = memoryRepository<CutMediaAsset>()
    const jobs = memoryRepository<CutAnalysisJob>()
    const mediaSegments = memoryRepository<CutMediaSegment>()
    const transcripts = memoryRepository<CutTranscript>()
    const transcriptSegments = memoryRepository<CutTranscriptSegment>()
    const logs = memoryRepository<CutActionLog>()
    const projectId = '11111111-1111-4111-8111-111111111111'
    const mediaAssetId = '22222222-2222-4222-8222-222222222222'
    const scope: CutScope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a', assistantId: 'assistant-a' }
    const cut = {
      async getProject(_scope: CutScope, requestedProjectId: string) {
        if (requestedProjectId !== projectId) throw new Error('missing project')
        return { item: { id: projectId, revision: 7 }, document: createStarterCutProject({ durationSeconds: 30 }), media: [], versions: [], exports: [], logs: [] }
      }
    } as unknown as CutService
    await media.repository.save(media.repository.create({
      id: mediaAssetId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      cutProjectId: projectId,
      originalName: 'interview.mp4',
      mimeType: 'video/mp4',
      size: 4096,
      checksum: 'c'.repeat(64),
      duration: 20,
      previewUrl: '/files/interview.mp4',
      fileReference: {
        source: 'platform.workspace.files', tenantId: scope.tenantId, catalog: 'projects',
        projectId: 'platform-project', filePath: 'files/interview.mp4', workspacePath: '/workspace/files/interview.mp4'
      }
    }))
    const transcript = await transcripts.repository.save(transcripts.repository.create({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      cutProjectId: projectId,
      mediaAssetId,
      source: 'stt',
      language: 'zh',
      model: 'whisper-tiny',
      duration: 20,
      segmentCount: 1,
      inputRevision: 7
    }))
    await transcriptSegments.repository.save(transcriptSegments.repository.create({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      cutProjectId: projectId,
      transcriptId: transcript.id!,
      sequence: 0,
      start: 2,
      end: 5,
      text: '这里介绍产品定价信息',
      confidence: 0.92,
      speaker: 'Alice'
    }))
    const service = new CutMediaIntelligenceService(
      cut,
      media.repository,
      jobs.repository,
      mediaSegments.repository,
      transcripts.repository,
      transcriptSegments.repository,
      logs.repository
    )
    const input = {
      projectId,
      mediaAssetId,
      baseRevision: 7,
      analyzerVersion: 'cut-browser-media-analysis/1',
      duration: 20,
      segments: [
        { mediaAssetId, evidenceType: 'audio_activity' as const, start: 0, end: 6, label: 'Audio activity', confidence: 0.8, metadata: { meanDb: -18 } },
        { mediaAssetId, evidenceType: 'silence' as const, start: 6, end: 8.5, label: 'Silence', confidence: 0.96, metadata: { meanDb: -52 } },
        { mediaAssetId, evidenceType: 'shot' as const, start: 0, end: 9, label: 'Shot 1', confidence: 0.75, thumbnailTime: 4.5 },
        { mediaAssetId, evidenceType: 'shot' as const, start: 9, end: 20, label: 'Shot 2', confidence: 0.88, thumbnailTime: 14.5 }
      ],
      changeSummary: 'Indexed browser media evidence.'
    }
    const imported = await service.importLocalAnalysis(scope, input)
    expect(imported).toMatchObject({
      success: true,
      revision: 7,
      segmentCount: 4,
      evidenceCounts: { audio_activity: 1, silence: 1, shot: 2 },
      idempotentReplay: false
    })
    const replay = await service.importLocalAnalysis(scope, input)
    expect(replay).toMatchObject({ jobId: imported.jobId, idempotentReplay: true })
    expect(jobs.rows.filter((job) => job.type === 'media_analysis')).toHaveLength(1)

    const pricing = await service.search(scope, { projectId, query: '定价', evidenceTypes: ['transcript'] })
    expect(pricing.items).toEqual([
      expect.objectContaining({ evidenceType: 'transcript', mediaAssetId, start: 2, end: 5, relevance: 1 })
    ])
    const silence = await service.search(scope, { projectId, query: '静音', evidenceTypes: ['silence'] })
    expect(silence.items).toEqual([
      expect.objectContaining({ evidenceType: 'silence', start: 6, end: 8.5, thumbnail: { url: '/files/interview.mp4', time: 6 } })
    ])
    const shots = await service.search(scope, { projectId, evidenceTypes: ['shot'], start: 8, end: 10 })
    expect(shots.items).toHaveLength(2)
    const detail = await service.getSegment(scope, projectId, shots.items[1]!.id)
    expect(detail).toMatchObject({ evidenceType: 'shot', mediaName: 'interview.mp4' })

    await expect(service.getSegment({ ...scope, organizationId: 'org-b' }, projectId, shots.items[0]!.id)).rejects.toThrow()
    await expect(service.importLocalAnalysis(scope, {
      ...input,
      segments: [{ mediaAssetId, evidenceType: 'silence', start: 19, end: 21, label: 'invalid' }]
    })).rejects.toThrow('source range')
  })
})

function memoryRepository<T extends { id?: string; createdAt?: Date; updatedAt?: Date }>() {
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
    async find(options: { where: Partial<T>; order?: Record<string, 'ASC' | 'DESC'>; take?: number }) {
      const found = rows.filter((row) => matches(row, options.where))
      const [order] = Object.entries(options.order ?? {})
      if (order) {
        const [key, direction] = order
        found.sort((left, right) => compare((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]) * (direction === 'ASC' ? 1 : -1))
      }
      return options.take ? found.slice(0, options.take) : found
    }
  }
  return { repository: repository as Repository<T>, rows }
}

function matches<T extends object>(row: T, where: Partial<T>) {
  return Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value)
}

function compare(left: unknown, right: unknown) {
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime()
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left ?? '').localeCompare(String(right ?? ''))
}
