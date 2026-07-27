import {
  BadRequestException,
  ConflictException,
  Injectable
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import type { WorkspaceRuntimeFileBuffer } from '@xpert-ai/plugin-sdk'
import type { FindOptionsWhere, Repository } from 'typeorm'
import { CutMediaIntelligenceService } from './cut-media-intelligence.service.js'
import { CutProposalService } from './cut-proposal.service.js'
import type {
  AcceptStoryCutHandoffInput,
  StoryCutHandoffContract
} from './cut-story-handoff.js'
import { CutService } from './cut.service.js'
import {
  CutActionLog,
  CutStoryHandoffReceipt
} from './entities/index.js'
import type {
  CutEditOperation,
  CutJsonObject,
  CutScope
} from './types.js'

type ReadWorkspaceFile = (
  workspacePath: string
) => Promise<WorkspaceRuntimeFileBuffer>

@Injectable()
export class CutStoryHandoffService {
  constructor(
    private readonly cut: CutService,
    private readonly intelligence: CutMediaIntelligenceService,
    private readonly proposals: CutProposalService,
    @InjectRepository(CutStoryHandoffReceipt)
    private readonly receipts: Repository<CutStoryHandoffReceipt>,
    @InjectRepository(CutActionLog)
    private readonly logs: Repository<CutActionLog>
  ) {}

  async accept(
    scope: CutScope,
    input: AcceptStoryCutHandoffInput,
    readWorkspaceFile: ReadWorkspaceFile
  ) {
    const checksum = checksumOf(input.handoff)
    let receipt = await this.receipts.findOne({
      where: receiptWhere(scope, { handoffId: input.handoff.handoffId })
    })
    if (receipt && receipt.contractChecksum !== checksum) {
      throw new ConflictException(
        'StoryCutHandoff id was already used with a different contract.'
      )
    }
    if (receipt?.status === 'succeeded') {
      return acceptanceResult(receipt, true)
    }
    if (!receipt) {
      receipt = await this.receipts.save(
        this.receipts.create({
          ...scopedCreate(scope),
          handoffId: input.handoff.handoffId,
          sourceProjectId: input.handoff.source.projectId,
          sourceRevision: input.handoff.source.revision,
          contractVersion: '1.0',
          mode: input.handoff.target.mode,
          status: 'processing',
          contractChecksum: checksum,
          cutProjectId: input.handoff.target.cutProjectId,
          cutProjectRevision: null,
          cutProposalId: null,
          mediaAssetIds: {},
          evidenceSegmentIds: {},
          errorMessage: null,
          changeSummary: input.changeSummary
        })
      )
    } else {
      receipt.status = 'processing'
      receipt.errorMessage = null
      receipt.changeSummary = input.changeSummary
      receipt = await this.receipts.save(receipt)
    }

    try {
      const projectId = await this.ensureTargetProject(
        scope,
        input.handoff,
        receipt
      )
      receipt = await this.importShotMedia(
        scope,
        input.handoff,
        receipt,
        projectId,
        readWorkspaceFile
      )
      const result =
        input.handoff.target.mode === 'create'
          ? await this.createInitialTimeline(
              scope,
              input.handoff,
              receipt,
              projectId
            )
          : await this.createUpdateProposal(
              scope,
              input.handoff,
              receipt,
              projectId
            )
      receipt.status = 'succeeded'
      receipt.cutProjectRevision = result.revision
      receipt.cutProposalId = result.proposalId
      receipt.errorMessage = null
      receipt = await this.receipts.save(receipt)
      await this.logs.save(
        this.logs.create({
          ...scopedCreate(scope),
          cutProjectId: projectId,
          action: 'cut_story_handoff_accepted',
          actorType: scope.assistantId
            ? 'agent'
            : scope.userId
              ? 'user'
              : 'system',
          actorId: scope.userId ?? scope.assistantId ?? null,
          message: input.changeSummary,
          errorMessage: null,
          snapshot: {
            handoffId: receipt.handoffId,
            sourceProjectId: receipt.sourceProjectId,
            sourceRevision: receipt.sourceRevision,
            mode: receipt.mode,
            cutProjectRevision: receipt.cutProjectRevision,
            cutProposalId: receipt.cutProposalId ?? null
          }
        })
      )
      return acceptanceResult(receipt, false)
    } catch (error) {
      receipt.status = 'failed'
      receipt.errorMessage =
        error instanceof Error ? error.message.slice(0, 2_000) : String(error)
      await this.receipts.save(receipt)
      throw error
    }
  }

  private async ensureTargetProject(
    scope: CutScope,
    handoff: StoryCutHandoffContract,
    receipt: CutStoryHandoffReceipt
  ) {
    if (handoff.target.mode === 'proposal') {
      const targetId = handoff.target.cutProjectId
      if (!targetId) {
        throw new BadRequestException(
          'A proposal handoff requires an existing Cut project.'
        )
      }
      if (receipt.cutProjectId && receipt.cutProjectId !== targetId) {
        throw new ConflictException(
          'StoryCutHandoff targets a different Cut project than its saved receipt.'
        )
      }
      await this.cut.getProjectSummary(scope, targetId)
      if (!receipt.cutProjectId) {
        receipt.cutProjectId = targetId
        await this.receipts.save(receipt)
      }
      return targetId
    }
    if (receipt.cutProjectId) {
      await this.cut.getProjectSummary(scope, receipt.cutProjectId)
      return receipt.cutProjectId
    }
    const created = await this.cut.createProject(scope, {
      title: `${handoff.source.title} · Cut`,
      brief: `${handoff.source.brief}\n\nStoryCutHandoff ${handoff.handoffId}`,
      width: handoff.sequence.width,
      height: handoff.sequence.height,
      fps: handoff.sequence.fps,
      durationSeconds: handoff.sequence.durationSeconds,
      changeSummary: `Created Cut project from StoryCutHandoff ${handoff.handoffId}`
    })
    const projectId = created.item.id
    if (!projectId) {
      throw new Error('Cut project creation did not return a project id.')
    }
    receipt.cutProjectId = projectId
    receipt.cutProjectRevision = created.item.revision
    await this.receipts.save(receipt)
    return projectId
  }

  private async importShotMedia(
    scope: CutScope,
    handoff: StoryCutHandoffContract,
    receipt: CutStoryHandoffReceipt,
    projectId: string,
    readWorkspaceFile: ReadWorkspaceFile
  ) {
    const mediaAssetIds = stringMap(receipt.mediaAssetIds)
    for (const shot of handoff.shots) {
      if (mediaAssetIds[shot.shotId]) continue
      const file = await readWorkspaceFile(shot.file.workspacePath)
      const verifiedFile = verifyWorkspaceFile(shot, file)
      const current = await this.cut.getProjectSummary(scope, projectId)
      const imported = await this.cut.registerRuntimeMedia(
        scope,
        projectId,
        verifiedFile,
        shot.durationSeconds,
        current.project.revision,
        `Imported "${shot.title}" from StoryCutHandoff`
      )
      const mediaAssetId = imported.media.id
      if (!mediaAssetId) {
        throw new Error('Cut media import did not return a media asset id.')
      }
      mediaAssetIds[shot.shotId] = mediaAssetId
      receipt.mediaAssetIds = mediaAssetIds
      receipt.cutProjectRevision = imported.project.revision
      receipt = await this.receipts.save(receipt)
    }
    return receipt
  }

  private async createInitialTimeline(
    scope: CutScope,
    handoff: StoryCutHandoffContract,
    receipt: CutStoryHandoffReceipt,
    projectId: string
  ) {
    const overview = await this.cut.getProjectSummary(scope, projectId)
    const tracks = await this.cut.listTracks(scope, {
      projectId,
      expectedRevision: overview.project.revision,
      page: 1,
      pageSize: 20
    })
    const visualTrack = tracks.items.find((track) => track.kind === 'visual')
    if (!visualTrack) {
      throw new Error('Cut project has no visual track for Story handoff.')
    }
    const existing = await this.cut.listClips(scope, {
      projectId,
      expectedRevision: overview.project.revision,
      page: 1,
      pageSize: 100
    })
    const existingIds = new Set(existing.items.map((clip) => clip.id))
    const mediaAssetIds = stringMap(receipt.mediaAssetIds)
    const operations = handoff.shots.flatMap((shot) => {
      const clipId = storyClipId(
        handoff.source.projectId,
        shot.shotId,
        handoff.source.revision
      )
      if (existingIds.has(clipId)) return []
      const mediaAssetId = mediaAssetIds[shot.shotId]
      if (!mediaAssetId) {
        throw new Error(`Missing imported media for Story shot ${shot.shotId}.`)
      }
      const operation: CutEditOperation = {
        kind: 'add_clip',
        trackId: visualTrack.id,
        clip: {
          id: clipId,
          type: 'video',
          name: `Story · ${shot.title}`,
          start: shot.startSeconds,
          duration: shot.durationSeconds,
          mediaAssetId,
          mediaFit: 'cover'
        }
      }
      return [operation]
    })
    let revision = overview.project.revision
    if (operations.length) {
      const applied = await this.cut.applyEditBatch(scope, {
        projectId,
        operations,
        baseRevision: revision,
        mode: 'apply',
        changeSummary: `Created initial timeline from StoryCutHandoff ${handoff.handoffId}`
      })
      revision = applied.project.revision
    }
    await this.cut.finalizeVersion(
      scope,
      projectId,
      revision,
      `Finalized StoryCutHandoff ${handoff.source.revision}`
    )
    return { revision, proposalId: null }
  }

  private async createUpdateProposal(
    scope: CutScope,
    handoff: StoryCutHandoffContract,
    receipt: CutStoryHandoffReceipt,
    projectId: string
  ) {
    receipt = await this.ensureEvidence(
      scope,
      handoff,
      receipt,
      projectId
    )
    const overview = await this.cut.getProjectSummary(scope, projectId)
    if (
      handoff.sequence.durationSeconds >
      overview.settings.durationSeconds + 0.001
    ) {
      throw new BadRequestException(
        'The new Story sequence is longer than the existing Cut project. Extend the Cut project duration before creating the handoff proposal.'
      )
    }
    const tracks = await this.cut.listTracks(scope, {
      projectId,
      expectedRevision: overview.project.revision,
      page: 1,
      pageSize: 20
    })
    const visualTrack = tracks.items.find((track) => track.kind === 'visual')
    if (!visualTrack) {
      throw new Error('Cut project has no visual track for Story handoff.')
    }
    const clips = await this.cut.listClips(scope, {
      projectId,
      expectedRevision: overview.project.revision,
      page: 1,
      pageSize: 100
    })
    const prefix = storyClipPrefix(handoff.source.projectId)
    const prior = clips.items.filter((clip) => clip.id.startsWith(prefix))
    const mediaAssetIds = stringMap(receipt.mediaAssetIds)
    const evidenceIds = stringMap(receipt.evidenceSegmentIds)
    const fallbackEvidence = evidenceIds[handoff.shots[0]!.shotId]
    if (!fallbackEvidence) {
      throw new Error('Story handoff proposal evidence is incomplete.')
    }
    const items = [
      ...prior.map((clip, index) => ({
        operation: {
          kind: 'delete_clips' as const,
          clipIds: [clip.id]
        },
        summary: `Replace prior Story-managed clip ${clip.name}`,
        evidenceSegmentIds: [
          evidenceIds[handoff.shots[index % handoff.shots.length]!.shotId] ??
            fallbackEvidence
        ],
        confidence: 1,
        risk: 'medium' as const
      })),
      ...handoff.shots.map((shot) => {
        const mediaAssetId = mediaAssetIds[shot.shotId]
        const evidenceSegmentId = evidenceIds[shot.shotId]
        if (!mediaAssetId || !evidenceSegmentId) {
          throw new Error(
            `Story handoff data is incomplete for shot ${shot.shotId}.`
          )
        }
        return {
          operation: {
            kind: 'add_clip' as const,
            trackId: visualTrack.id,
            clip: {
              id: storyClipId(
                handoff.source.projectId,
                shot.shotId,
                handoff.source.revision
              ),
              type: 'video' as const,
              name: `Story · ${shot.title}`,
              start: shot.startSeconds,
              duration: shot.durationSeconds,
              mediaAssetId,
              mediaFit: 'cover' as const
            }
          },
          summary: `Add Story revision ${handoff.source.revision} shot "${shot.title}"`,
          evidenceSegmentIds: [evidenceSegmentId],
          confidence: 1,
          risk: 'medium' as const
        }
      })
    ]
    if (!items.length || items.length > 50) {
      throw new BadRequestException(
        'Story handoff proposal must contain 1-50 reviewable operations.'
      )
    }
    const created = await this.proposals.create(scope, {
      projectId,
      sourceRevision: overview.project.revision,
      goal: `Review Story Studio revision ${handoff.source.revision} without silently overwriting the Cut timeline.`,
      constraints: {
        proposalType: 'rough_cut',
        targetDurationSeconds: handoff.sequence.durationSeconds,
        notes: `StoryCutHandoff ${handoff.handoffId}`
      },
      items,
      idempotencyKey: `story-handoff:${handoff.handoffId}`,
      changeSummary: `Created reviewable proposal from StoryCutHandoff ${handoff.handoffId}`
    })
    const proposalId = created.proposal.id
    if (!proposalId) {
      throw new Error('Cut proposal creation did not return a proposal id.')
    }
    return {
      revision: overview.project.revision,
      proposalId
    }
  }

  private async ensureEvidence(
    scope: CutScope,
    handoff: StoryCutHandoffContract,
    receipt: CutStoryHandoffReceipt,
    projectId: string
  ) {
    const mediaAssetIds = stringMap(receipt.mediaAssetIds)
    const evidenceSegmentIds = stringMap(receipt.evidenceSegmentIds)
    for (const shot of handoff.shots) {
      if (evidenceSegmentIds[shot.shotId]) continue
      const mediaAssetId = mediaAssetIds[shot.shotId]
      if (!mediaAssetId) {
        throw new Error(`Missing imported media for Story shot ${shot.shotId}.`)
      }
      const current = await this.cut.getProjectSummary(scope, projectId)
      const label = `StoryCutHandoff · ${shot.title}`
      await this.intelligence.importLocalAnalysis(scope, {
        projectId,
        mediaAssetId,
        baseRevision: current.project.revision,
        analyzerVersion: 'story-cut-handoff-v1',
        duration: shot.durationSeconds,
        segments: [
          {
            mediaAssetId,
            evidenceType: 'visual_description',
            start: 0,
            end: shot.durationSeconds,
            label,
            text: `${shot.action}\n${shot.camera}`,
            confidence: 1,
            thumbnailTime: 0,
            metadata: {
              handoffId: handoff.handoffId,
              sceneId: shot.sceneId,
              shotId: shot.shotId,
              sourceRevision: handoff.source.revision
            }
          }
        ],
        idempotencyKey: `story-handoff:${handoff.handoffId}:${shot.shotId}`,
        changeSummary: `Registered Story handoff evidence for "${shot.title}"`
      })
      const evidence = await this.intelligence.search(scope, {
        projectId,
        mediaAssetId,
        evidenceTypes: ['visual_description'],
        query: label,
        limit: 20
      })
      const segment = evidence.items.find((item) => item.label === label)
      if (!segment) {
        throw new Error(
          `Cut did not persist evidence for Story shot ${shot.shotId}.`
        )
      }
      evidenceSegmentIds[shot.shotId] = segment.id
      receipt.evidenceSegmentIds = evidenceSegmentIds
      receipt = await this.receipts.save(receipt)
    }
    return receipt
  }
}

function verifyWorkspaceFile(
  shot: StoryCutHandoffContract['shots'][number],
  file: WorkspaceRuntimeFileBuffer
): WorkspaceRuntimeFileBuffer {
  const checksum = createHash('sha256').update(file.buffer).digest('hex')
  const size = file.size ?? file.buffer.byteLength
  const runtimeMimeType = file.mimeType?.toLowerCase()
  if (
    checksum !== shot.file.sha256 ||
    size !== shot.file.size ||
    (runtimeMimeType &&
      runtimeMimeType !== 'video/mp4' &&
      runtimeMimeType !== 'application/octet-stream')
  ) {
    throw new BadRequestException(
      `Workspace MP4 evidence changed for Story shot ${shot.shotId}.`
    )
  }
  return {
    ...file,
    name: shot.file.originalName,
    mimeType: shot.file.mimeType,
    size
  }
}

function acceptanceResult(
  receipt: CutStoryHandoffReceipt,
  idempotentReplay: boolean
) {
  return {
    success: true,
    idempotentReplay,
    handoffId: receipt.handoffId,
    sourceProjectId: receipt.sourceProjectId,
    sourceRevision: receipt.sourceRevision,
    mode: receipt.mode,
    status:
      receipt.mode === 'create' ? ('delivered' as const) : ('proposal_ready' as const),
    cutProjectId: receipt.cutProjectId ?? null,
    cutProjectRevision: receipt.cutProjectRevision ?? null,
    cutProposalId: receipt.cutProposalId ?? null,
    nextAction:
      receipt.mode === 'create'
        ? 'Open the Cut project and continue editing.'
        : 'Review the Cut proposal before applying it.'
  }
}

function receiptWhere(
  scope: CutScope,
  where: { handoffId?: string }
): FindOptionsWhere<CutStoryHandoffReceipt> {
  return {
    ...where,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null
  }
}

function scopedCreate(scope: CutScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    platformProjectId: scope.projectId ?? null
  }
}

function checksumOf(value: object) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function stringMap(value: CutJsonObject | null | undefined) {
  const result: Record<string, string> = {}
  for (const [key, field] of Object.entries(value ?? {})) {
    if (typeof field === 'string' && field) result[key] = field
  }
  return result
}

function storyClipPrefix(sourceProjectId: string) {
  return `story_${createHash('sha256')
    .update(sourceProjectId)
    .digest('hex')
    .slice(0, 12)}_`
}

function storyClipId(
  sourceProjectId: string,
  shotId: string,
  revision: number
) {
  const shotKey = createHash('sha256')
    .update(shotId)
    .digest('hex')
    .slice(0, 12)
  return `${storyClipPrefix(sourceProjectId)}${shotKey}_r${revision}`
}
