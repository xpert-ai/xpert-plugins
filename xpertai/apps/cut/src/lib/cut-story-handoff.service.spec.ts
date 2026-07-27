import { createHash } from 'node:crypto'
import type { CutScope } from './types.js'

jest.mock('./cut.service.js', () => ({ CutService: class CutService {} }))
jest.mock('./cut-media-intelligence.service.js', () => ({
  CutMediaIntelligenceService: class CutMediaIntelligenceService {}
}))
jest.mock('./cut-proposal.service.js', () => ({
  CutProposalService: class CutProposalService {}
}))

import { CutStoryHandoffService } from './cut-story-handoff.service.js'
import type { StoryCutHandoffContract } from './cut-story-handoff.js'

const scope: CutScope = {
  tenantId: 'tenant-a',
  organizationId: 'org-a',
  workspaceId: 'workspace-a',
  projectId: 'platform-project-a',
  userId: 'user-a',
  assistantId: 'assistant-a'
}
const CUT_PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const MEDIA_ID = '33333333-3333-4333-8333-333333333333'
const PROPOSAL_ID = '44444444-4444-4444-8444-444444444444'

describe('CutStoryHandoffService', () => {
  it('creates the initial Story-managed timeline once and returns an idempotent receipt', async () => {
    const harness = createHarness()
    const handoff = contract('create')
    const first = await harness.service.accept(
      scope,
      { handoff, changeSummary: 'Accepted initial Story handoff.' },
      harness.readFile
    )
    const replay = await harness.service.accept(
      scope,
      { handoff, changeSummary: 'Retried initial Story handoff.' },
      harness.readFile
    )

    expect(first).toMatchObject({
      success: true,
      idempotentReplay: false,
      status: 'delivered',
      cutProjectId: CUT_PROJECT_ID,
      cutProjectRevision: 3,
      cutProposalId: null
    })
    expect(replay).toMatchObject({
      success: true,
      idempotentReplay: true,
      status: 'delivered'
    })
    expect(harness.cut.createProject).toHaveBeenCalledTimes(1)
    expect(harness.cut.registerRuntimeMedia).toHaveBeenCalledTimes(1)
    expect(harness.cut.registerRuntimeMedia).toHaveBeenCalledWith(
      scope,
      CUT_PROJECT_ID,
      expect.objectContaining({
        name: 'shot.mp4',
        mimeType: 'video/mp4',
        size: Buffer.byteLength('story-video')
      }),
      5,
      1,
      expect.stringContaining('Imported "Arrival"')
    )
    expect(harness.cut.applyEditBatch).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        projectId: CUT_PROJECT_ID,
        mode: 'apply',
        operations: [
          expect.objectContaining({
            kind: 'add_clip',
            clip: expect.objectContaining({
              type: 'video',
              mediaAssetId: MEDIA_ID,
              start: 0,
              duration: 5
            })
          })
        ]
      })
    )
    expect(harness.cut.finalizeVersion).toHaveBeenCalledTimes(1)
    expect(harness.proposals.create).not.toHaveBeenCalled()
  })

  it('turns later Story revisions into a proposal without applying timeline edits', async () => {
    const harness = createHarness(8)
    const handoff = contract('proposal')
    const result = await harness.service.accept(
      scope,
      { handoff, changeSummary: 'Accepted revised Story handoff.' },
      harness.readFile
    )

    expect(result).toMatchObject({
      success: true,
      status: 'proposal_ready',
      cutProjectId: CUT_PROJECT_ID,
      cutProjectRevision: 9,
      cutProposalId: PROPOSAL_ID
    })
    expect(harness.cut.createProject).not.toHaveBeenCalled()
    expect(harness.cut.applyEditBatch).not.toHaveBeenCalled()
    expect(harness.intelligence.importLocalAnalysis).toHaveBeenCalledTimes(1)
    expect(harness.proposals.create).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        projectId: CUT_PROJECT_ID,
        sourceRevision: 9,
        goal: expect.stringContaining('without silently overwriting'),
        items: expect.arrayContaining([
          expect.objectContaining({
            operation: expect.objectContaining({ kind: 'delete_clips' })
          }),
          expect.objectContaining({
            operation: expect.objectContaining({ kind: 'add_clip' })
          })
        ])
      })
    )
  })

  it('rejects changed Workspace bytes before importing media', async () => {
    const harness = createHarness()
    await expect(
      harness.service.accept(
        scope,
        {
          handoff: contract('create'),
          changeSummary: 'Attempted changed media handoff.'
        },
        async () => runtimeFile(Buffer.from('changed'))
      )
    ).rejects.toThrow('evidence changed')
    expect(harness.cut.registerRuntimeMedia).not.toHaveBeenCalled()
    expect(harness.receipts.rows[0]).toMatchObject({ status: 'failed' })
  })
})

function createHarness(initialRevision = 1) {
  let revision = initialRevision
  const receipts = repository()
  const logs = repository()
  const cut = {
    createProject: jest.fn(async () => ({
      item: { id: CUT_PROJECT_ID, revision: 1 }
    })),
    getProjectSummary: jest.fn(async () => ({
      project: { id: CUT_PROJECT_ID, revision },
      settings: { durationSeconds: 15 }
    })),
    registerRuntimeMedia: jest.fn(async () => {
      revision += 1
      return {
        media: { id: MEDIA_ID },
        project: { id: CUT_PROJECT_ID, revision }
      }
    }),
    listTracks: jest.fn(async () => ({
      items: [{ id: 'video-1', kind: 'visual' }]
    })),
    listClips: jest.fn(async () => ({
      items:
        initialRevision > 1
          ? [
              {
                id: `story_${createHash('sha256')
                  .update('11111111-1111-4111-8111-111111111111')
                  .digest('hex')
                  .slice(0, 12)}_prior_r1`,
                name: 'Story · Prior shot'
              }
            ]
          : []
    })),
    applyEditBatch: jest.fn(async () => {
      revision += 1
      return { project: { id: CUT_PROJECT_ID, revision } }
    }),
    finalizeVersion: jest.fn(async () => ({ revision }))
  }
  const intelligence = {
    importLocalAnalysis: jest.fn(async () => ({ success: true })),
    search: jest.fn(async () => ({
      items: [
        {
          id: 'analysis:55555555-5555-4555-8555-555555555555',
          label: 'StoryCutHandoff · Arrival'
        }
      ]
    }))
  }
  const proposals = {
    create: jest.fn(async () => ({
      proposal: { id: PROPOSAL_ID }
    }))
  }
  const service = new CutStoryHandoffService(
    cut as never,
    intelligence as never,
    proposals as never,
    receipts as never,
    logs as never
  )
  const buffer = Buffer.from('story-video')
  return {
    service,
    cut,
    intelligence,
    proposals,
    receipts,
    readFile: jest.fn(async () =>
      runtimeFile(buffer, 'application/octet-stream')
    )
  }
}

function contract(mode: 'create' | 'proposal'): StoryCutHandoffContract {
  const buffer = Buffer.from('story-video')
  return {
    contractVersion: '1.0',
    handoffId: '66666666-6666-4666-8666-666666666666',
    source: {
      projectId: '11111111-1111-4111-8111-111111111111',
      revision: mode === 'create' ? 1 : 2,
      title: 'Arrival',
      brief: 'A traveler returns with a secret.',
      visualStyle: 'Noir rain'
    },
    sequence: {
      aspectRatio: '9:16',
      width: 720,
      height: 1280,
      fps: 24,
      durationSeconds: 5
    },
    target: {
      mode,
      cutProjectId: mode === 'proposal' ? CUT_PROJECT_ID : null
    },
    shots: [
      {
        sceneId: 'arrival',
        shotId: 'door',
        title: 'Arrival',
        startSeconds: 0,
        durationSeconds: 5,
        camera: 'Slow push',
        action: 'The door opens.',
        dialogue: null,
        file: {
          workspacePath: 'story-studio/arrival/shot.mp4',
          originalName: 'shot.mp4',
          mimeType: 'video/mp4',
          size: buffer.byteLength,
          sha256: createHash('sha256').update(buffer).digest('hex')
        }
      }
    ]
  }
}

function repository() {
  const rows: Record<string, unknown>[] = []
  return {
    rows,
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value)
      ) ?? null
    ),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => {
      if (!rows.includes(value)) rows.push(value)
      return value
    })
  }
}

function runtimeFile(buffer: Buffer, mimeType = 'video/mp4') {
  return {
    buffer,
    name: 'shot.mp4',
    filePath: 'story-studio/arrival/shot.mp4',
    workspacePath: 'story-studio/arrival/shot.mp4',
    mimeType,
    size: buffer.byteLength,
    catalog: 'projects' as const,
    reference: {
      source: 'platform.workspace.files' as const,
      filePath: 'story-studio/arrival/shot.mp4',
      workspacePath: 'story-studio/arrival/shot.mp4',
      catalog: 'projects' as const,
      scopeId: 'workspace-a',
      tenantId: 'tenant-a'
    }
  }
}
