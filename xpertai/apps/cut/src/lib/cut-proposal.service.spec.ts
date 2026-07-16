import { randomUUID } from 'node:crypto'
import type { Repository } from 'typeorm'

jest.mock('./cut.service.js', () => ({ CutService: class CutService {} }))
jest.mock('./cut-media-intelligence.service.js', () => ({ CutMediaIntelligenceService: class CutMediaIntelligenceService {} }))

import { applyCutEdit, createStarterCutProject } from './cut-project.js'
import { buildCutProposalPreview } from './cut-proposal.js'
import { CutProposalService } from './cut-proposal.service.js'
import type { CutMediaIntelligenceService } from './cut-media-intelligence.service.js'
import type { CutService } from './cut.service.js'
import { CutActionLog, CutEditProposal } from './entities/index.js'
import type { CutProjectDocument, CutScope } from './types.js'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const PROPOSAL_EVIDENCE_ID = 'analysis:22222222-2222-4222-8222-222222222222'
const scope: CutScope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user-a', assistantId: 'assistant-a' }

describe('CutProposalService', () => {
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
    }))
  }
  const proposals = memoryRepository<CutEditProposal>()
  const logs = memoryRepository<CutActionLog>()
  const service = new CutProposalService(
    cut as unknown as CutService,
    intelligence as unknown as CutMediaIntelligenceService,
    proposals.repository,
    logs.repository
  )
  return { service, document, project, cut, intelligence, proposals, logs }
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
