import { randomUUID } from 'node:crypto'
import type { Repository } from 'typeorm'

jest.mock('./cut.service.js', () => ({ CutService: class CutService {} }))
jest.mock('./cut-media-intelligence.service.js', () => ({ CutMediaIntelligenceService: class CutMediaIntelligenceService {} }))
jest.mock('./cut-caption.service.js', () => ({ CutCaptionService: class CutCaptionService {} }))

import { appendCutMediaClip, applyCutEdit, createStarterCutProject } from './cut-project.js'
import { buildCutProposalPreview } from './cut-proposal.js'
import { CutProposalService } from './cut-proposal.service.js'
import {
  detectFillerCandidates,
  detectRepeatedPhraseCandidates,
  detectStutterCandidates,
  detectTranscriptGapCandidates
} from './cut-speech-cleanup.js'
import type { CutMediaIntelligenceService } from './cut-media-intelligence.service.js'
import type { CutCaptionService } from './cut-caption.service.js'
import type { CutService } from './cut.service.js'
import { CutActionLog, CutEditProposal } from './entities/index.js'
import type { CutProjectDocument, CutScope } from './types.js'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const PROPOSAL_EVIDENCE_ID = 'analysis:22222222-2222-4222-8222-222222222222'
const scope: CutScope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a', assistantId: 'assistant-a' }

describe('CutProposalService', () => {
  it('detects transcript gaps and conservatively estimates boundary filler timing', () => {
    expect(detectTranscriptGapCandidates([
      { id: 'a', start: 0, end: 1, text: '第一句' },
      { id: 'b', start: 2, end: 3, text: '第二句' }
    ], 0.65, 0.1)).toEqual([expect.objectContaining({ start: 1.1, end: 1.9, kind: 'silence' })])
    expect(detectFillerCandidates([
      { id: 'c', start: 3, end: 4, text: '嗯 好 我可以' },
      { id: 'd', start: 4, end: 7, text: '然后我们开始' }
    ])).toEqual([
      expect.objectContaining({ start: 3, end: 3.23, kind: 'filler', label: '嗯' }),
      expect.objectContaining({ start: 4, end: 4.48, kind: 'filler', label: '然后' })
    ])
  })

  it('detects word-level stutters and repeated phrases without guessing from untimed text', () => {
    const segments = [{
      id: '66666666-6666-4666-8666-666666666666',
      start: 0,
      end: 4,
      text: '我 我 今天 分享 今天 分享',
      words: [
        { start: 0, end: 0.2, text: '我' },
        { start: 0.25, end: 0.45, text: '我' },
        { start: 0.6, end: 0.9, text: '今天' },
        { start: 0.95, end: 1.25, text: '分享' },
        { start: 1.4, end: 1.7, text: '今天' },
        { start: 1.75, end: 2.05, text: '分享' }
      ]
    }]

    expect(detectStutterCandidates(segments)).toEqual([
      expect.objectContaining({ start: 0, end: 0.2, kind: 'stutter', label: '我' })
    ])
    expect(detectRepeatedPhraseCandidates(segments)).toEqual([
      expect.objectContaining({ start: 0.6, end: 1.25, kind: 'repetition', label: '今天 分享' })
    ])
  })

  it('creates an evidence-bound idempotent proposal and elevates destructive risk', async () => {
    const harness = createHarness()
    const input = proposalInput(harness.document)
    const created = await harness.service.create(scope, input)
    const replay = await harness.service.create(scope, input)

    expect(created.proposal).toMatchObject({ sourceRevision: 7, itemCount: 1, highRiskCount: 1, status: 'draft' })
    expect(replay).toMatchObject({ idempotentReplay: true, proposal: { id: created.proposal.id } })
    expect(harness.intelligence.getSegment).toHaveBeenCalledWith(scope, PROJECT_ID, PROPOSAL_EVIDENCE_ID)
    expect(harness.proposals.rows[0]?.items[0]).toMatchObject({ risk: 'high', enabled: true })
    expect(harness.logs.rows[0]?.action).toBe('cut_edit_proposal_created')
  })

  it('creates an end-to-start speech cleanup proposal from filler and silence evidence', async () => {
    const harness = createHarness()
    harness.project.document = appendCutMediaClip(createStarterCutProject({ durationSeconds: 30 }), {
      id: 'interview', name: 'Interview', type: 'video',
      mediaAssetId: '33333333-3333-4333-8333-333333333333', duration: 30
    })
    const created = await harness.service.createSpeechCleanup(scope, {
      projectId: PROJECT_ID,
      transcriptId: '44444444-4444-4444-8444-444444444444',
      sourceRevision: 7,
      changeSummary: 'Proposed filler and pause cleanup.'
    })
    expect(created.proposal).toMatchObject({ itemCount: 2, sourceRevision: 7, status: 'draft' })
    expect(created.cleanup).toMatchObject({
      mode: 'balanced',
      categoryCounts: { silence: 1, filler: 1, repetition: 0, stutter: 0, manual: 0 },
      removedDurationSeconds: 1.6,
      remainingDurationSeconds: 28.4
    })
    const operations = harness.proposals.rows[0]!.items.map((item) => item.operation)
    expect(operations).toEqual([
      { kind: 'ripple_delete_ranges', ranges: [{ start: 4.1, end: 5.2 }] },
      { kind: 'ripple_delete_ranges', ranges: [{ start: 1, end: 1.5 }] }
    ])
  })

  it('reviews enabled items with proposal CAS and rejects stale revisions', async () => {
    const harness = createHarness()
    const created = await harness.service.create(scope, proposalInput(harness.document))
    const itemId = harness.proposals.rows[0]!.items[0]!.id
    const reviewed = await harness.service.update(scope, {
      projectId: PROJECT_ID,
      proposalId: created.proposal.id!,
      baseProposalRevision: 1,
      itemUpdates: [{ itemId, enabled: false }],
      reviewNote: 'Keep these clips.',
      changeSummary: 'Disabled the destructive proposal item.'
    })

    expect(reviewed.item).toMatchObject({ revision: 2, enabledItemCount: 0, reviewNote: 'Keep these clips.' })
    expect(reviewed.preview).toMatchObject({ changedClipIds: [], changedTrackIds: [], enabledItemCount: 0 })
    await expect(harness.service.update(scope, {
      projectId: PROJECT_ID,
      proposalId: created.proposal.id!,
      baseProposalRevision: 1,
      itemUpdates: [{ itemId, enabled: true }],
      changeSummary: 'Stale review.'
    })).rejects.toThrow('revision changed')
  })

  it('atomically applies once and returns an idempotent replay', async () => {
    const harness = createHarness()
    const created = await harness.service.create(scope, proposalInput(harness.document))
    const applied = await harness.service.apply(scope, {
      projectId: PROJECT_ID,
      proposalId: created.proposal.id!,
      baseRevision: 7,
      baseProposalRevision: 1,
      changeSummary: 'Applied the reviewed rough cut.'
    })
    const replay = await harness.service.apply(scope, {
      projectId: PROJECT_ID,
      proposalId: created.proposal.id!,
      baseRevision: 7,
      baseProposalRevision: 1,
      changeSummary: 'Retried the reviewed rough cut.'
    })

    expect(applied).toMatchObject({ applied: true, revision: 8, idempotentReplay: false })
    expect(replay).toMatchObject({ applied: true, revision: 8, idempotentReplay: true })
    expect(harness.cut.applyEditBatch).toHaveBeenCalledTimes(1)
    expect(harness.proposals.rows[0]).toMatchObject({ status: 'applied', appliedRevision: 8 })
  })

  it('reverts an applied proposal once and returns an idempotent replay', async () => {
    const harness = createHarness()
    const sourceDocument = structuredClone(harness.document)
    const created = await harness.service.create(scope, proposalInput(harness.document))
    await harness.service.apply(scope, {
      projectId: PROJECT_ID,
      proposalId: created.proposal.id!,
      baseRevision: 7,
      baseProposalRevision: 1,
      changeSummary: 'Applied the reviewed rough cut.'
    })
    const reverted = await harness.service.revert(scope, {
      projectId: PROJECT_ID,
      proposalId: created.proposal.id!,
      baseRevision: 8,
      changeSummary: 'Reverted the applied rough cut.'
    })
    const replay = await harness.service.revert(scope, {
      projectId: PROJECT_ID,
      proposalId: created.proposal.id!,
      baseRevision: 8,
      changeSummary: 'Retried the rough-cut revert.'
    })

    expect(reverted).toMatchObject({ reverted: true, revision: 9, idempotentReplay: false })
    expect(replay).toMatchObject({ reverted: true, revision: 9, idempotentReplay: true })
    expect(harness.cut.saveProject).toHaveBeenCalledTimes(1)
    expect(harness.project.document).toEqual(sourceDocument)
    expect(harness.proposals.rows[0]).toMatchObject({ status: 'reverted', revertedRevision: 9 })
  })

  it('reconciles an interrupted applying state without applying twice', async () => {
    const harness = createHarness()
    const created = await harness.service.create(scope, proposalInput(harness.document))
    const proposal = harness.proposals.rows[0]!
    proposal.status = 'applying'
    harness.project.document = buildCutProposalPreview(proposal.sourceDocument, proposal.items).document
    harness.project.revision = 8

    const result = await harness.service.apply(scope, {
      projectId: PROJECT_ID,
      proposalId: created.proposal.id!,
      baseRevision: 7,
      baseProposalRevision: 1,
      changeSummary: 'Recovered proposal application.'
    })

    expect(result).toMatchObject({ applied: true, revision: 8, idempotentReplay: true })
    expect(harness.cut.applyEditBatch).not.toHaveBeenCalled()
    expect(proposal.status).toBe('applied')
  })

  it('does not apply a proposal when the project revision changed', async () => {
    const harness = createHarness()
    const created = await harness.service.create(scope, proposalInput(harness.document))
    harness.project.revision = 9

    await expect(harness.service.apply(scope, {
      projectId: PROJECT_ID,
      proposalId: created.proposal.id!,
      baseRevision: 7,
      baseProposalRevision: 1,
      changeSummary: 'Attempted a stale proposal.'
    })).rejects.toThrow('project changed')
    expect(harness.cut.applyEditBatch).not.toHaveBeenCalled()
    expect(harness.proposals.rows[0]?.status).toBe('draft')
  })
})

function createHarness() {
  const document = proposalDocument()
  const project = { revision: 7, document: structuredClone(document) }
  const cut = {
    getProject: jest.fn(async () => ({ item: { id: PROJECT_ID, revision: project.revision }, document: structuredClone(project.document) })),
    applyEditBatch: jest.fn(async (_scope: CutScope, input: { operations: Parameters<typeof applyCutEdit>[1][]; baseRevision: number }) => {
      if (project.revision !== input.baseRevision) throw new Error('revision conflict')
      project.document = input.operations.reduce(applyCutEdit, project.document)
      project.revision += 1
      return { success: true, applied: true, project: { id: PROJECT_ID, revision: project.revision }, document: project.document }
    }),
    saveProject: jest.fn(async (_scope: CutScope, input: { document: CutProjectDocument; baseRevision: number }) => {
      if (project.revision !== input.baseRevision) throw new Error('revision conflict')
      project.document = structuredClone(input.document)
      project.revision += 1
      return { success: true, project: { id: PROJECT_ID, revision: project.revision }, document: project.document }
    })
  }
  const intelligence = {
    getSegment: jest.fn(async (_scope: CutScope, projectId: string, segmentId: string) => ({
      id: segmentId,
      projectId,
      mediaAssetId: '33333333-3333-4333-8333-333333333333',
      mediaName: 'interview.wav',
      evidenceType: 'silence' as const,
      start: 1,
      end: 2,
      label: 'Silence',
      text: null,
      confidence: 0.9,
      thumbnail: { url: '/media/interview.wav', time: 1 },
      inputRevision: 7,
      metadata: null
    })),
    search: jest.fn(async () => ({
      items: [{
        id: PROPOSAL_EVIDENCE_ID,
        projectId: PROJECT_ID,
        mediaAssetId: '33333333-3333-4333-8333-333333333333',
        mediaName: 'interview.wav',
        evidenceType: 'silence' as const,
        start: 4,
        end: 5.3,
        label: 'Silence',
        text: null,
        confidence: 0.99,
        relevance: 1,
        inputRevision: 7,
        thumbnail: null,
        metadata: null
      }],
      total: 1,
      query: '',
      limit: 50
    }))
  }
  const captions = {
    listTranscriptSegments: jest.fn(async () => ({
      items: [{
        id: '55555555-5555-4555-8555-555555555555',
        sequence: 0,
        start: 1,
        end: 1.5,
        text: '嗯',
        confidence: 0.9,
        speaker: null,
        words: null
      }],
      total: 1,
      page: 1,
      pageSize: 200
    }))
  }
  const proposals = memoryRepository<CutEditProposal>()
  const logs = memoryRepository<CutActionLog>()
  const service = new CutProposalService(
    cut as unknown as CutService,
    captions as unknown as CutCaptionService,
    intelligence as unknown as CutMediaIntelligenceService,
    proposals.repository,
    logs.repository
  )
  return { service, document, project, cut, captions, intelligence, proposals, logs }
}

function proposalDocument() {
  let document = createStarterCutProject({ durationSeconds: 30 })
  const trackId = document.tracks[0]!.id
  for (let index = 0; index < 3; index += 1) {
    document = applyCutEdit(document, {
      kind: 'add_clip',
      trackId,
      clip: {
        id: `clip-${index + 1}`,
        type: 'color',
        name: `Clip ${index + 1}`,
        color: '#111827',
        start: index * 5,
        duration: 5
      }
    })
  }
  return document
}

function proposalInput(document: CutProjectDocument) {
  return {
    projectId: PROJECT_ID,
    sourceRevision: 7,
    goal: 'Remove pauses and create a concise opening.',
    constraints: { targetDurationSeconds: 15, removeSilence: true },
    items: [{
      operation: { kind: 'delete_clips' as const, clipIds: document.tracks[0]!.clips.map((clip) => clip.id) },
      summary: 'Remove the three low-value opening clips.',
      evidenceSegmentIds: [PROPOSAL_EVIDENCE_ID],
      confidence: 0.92,
      risk: 'low' as const
    }],
    changeSummary: 'Created an evidence-backed rough-cut proposal.'
  }
}

function memoryRepository<T extends { id?: string; createdAt?: Date; updatedAt?: Date }>() {
  const rows: T[] = []
  const repository = {
    create: (value: T) => value,
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
    find: async ({ where, take }: { where: Record<string, unknown>; take?: number }) => rows.filter((row) => matches(row, where)).slice(0, take),
    update: async (where: Record<string, unknown>, patch: Partial<T>) => {
      const matching = rows.filter((row) => matches(row, where))
      matching.forEach((row) => Object.assign(row, patch, { updatedAt: new Date() }))
      return { affected: matching.length }
    }
  }
  return { repository: repository as unknown as Repository<T>, rows }
}

function matches(value: object, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, expected]) => (value as Record<string, unknown>)[key] === expected)
}
