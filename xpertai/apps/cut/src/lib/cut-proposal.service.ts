import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import type { FindOptionsWhere, Repository } from 'typeorm'
import { CutMediaIntelligenceService } from './cut-media-intelligence.service.js'
import {
  buildCutProposalPreview,
  cutDocumentsEqual,
  cutProposalConstraintsSchema,
  cutProposalItemsInputSchema,
  maxCutProposalRisk,
  minimumCutProposalRisk
} from './cut-proposal.js'
import { CutService } from './cut.service.js'
import { CutActionLog, CutEditProposal } from './entities/index.js'
import type {
  CutEditOperation,
  CutEditProposalItem,
  CutJsonValue,
  CutProposalConstraints,
  CutProposalRisk,
  CutScope
} from './types.js'

type ProposalScopedEntity = {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  platformProjectId?: string | null
}

export interface CreateCutEditProposalInput {
  projectId: string
  sourceRevision: number
  goal: string
  constraints?: CutProposalConstraints
  items: Array<{
    operation: CutEditOperation
    summary: string
    evidenceSegmentIds: string[]
    confidence: number
    risk?: CutProposalRisk
  }>
  idempotencyKey?: string
  changeSummary: string
}

export interface UpdateCutEditProposalInput {
  projectId: string
  proposalId: string
  baseProposalRevision: number
  itemUpdates: Array<{ itemId: string; enabled: boolean }>
  reviewNote?: string
  changeSummary: string
}

@Injectable()
export class CutProposalService {
  constructor(
    private readonly cut: CutService,
    private readonly intelligence: CutMediaIntelligenceService,
    @InjectRepository(CutEditProposal) private readonly proposals: Repository<CutEditProposal>,
    @InjectRepository(CutActionLog) private readonly logs: Repository<CutActionLog>
  ) {}

  async create(scope: CutScope, input: CreateCutEditProposalInput) {
    const detail = await this.cut.getProject(scope, input.projectId)
    if (detail.item.revision !== input.sourceRevision) {
      throw new ConflictException(`Cut proposal source revision ${input.sourceRevision} does not match project revision ${detail.item.revision}.`)
    }
    const goal = boundedString(input.goal, 4_000, 'Cut proposal goal')
    const constraints = input.constraints ? cutProposalConstraintsSchema.parse(input.constraints) : null
    const parsedItems = cutProposalItemsInputSchema.parse(input.items)
    const evidenceCache = new Map<string, Awaited<ReturnType<CutMediaIntelligenceService['getSegment']>>>()
    const items: CutEditProposalItem[] = []
    let workingDocument = detail.document
    for (const item of parsedItems) {
      const evidence = []
      for (const segmentId of [...new Set(item.evidenceSegmentIds)]) {
        let segment = evidenceCache.get(segmentId)
        if (!segment) {
          segment = await this.intelligence.getSegment(scope, input.projectId, segmentId)
          evidenceCache.set(segmentId, segment)
        }
        evidence.push({
          segmentId: segment.id,
          mediaAssetId: segment.mediaAssetId,
          mediaName: segment.mediaName,
          evidenceType: segment.evidenceType,
          start: segment.start,
          end: segment.end,
          label: segment.label,
          text: segment.text,
          confidence: segment.confidence,
          thumbnail: segment.thumbnail,
          rationale: null
        })
      }
      const risk = maxCutProposalRisk(item.risk, minimumCutProposalRisk(workingDocument, item.operation))
      const proposalItem: CutEditProposalItem = {
        id: randomUUID(),
        enabled: true,
        operation: item.operation,
        summary: item.summary,
        evidence,
        confidence: item.confidence,
        risk
      }
      // Validate each operation against the exact preceding proposal state before persistence.
      workingDocument = buildCutProposalPreview(workingDocument, [proposalItem]).document
      items.push(proposalItem)
    }
    const preview = buildCutProposalPreview(detail.document, items)
    const contentHash = createHash('sha256').update(JSON.stringify({
      projectId: input.projectId,
      sourceRevision: input.sourceRevision,
      goal,
      constraints,
      items: items.map(({ id: _id, ...item }) => item)
    })).digest('hex')
    const idempotencyKey = input.idempotencyKey?.trim() || `proposal:${contentHash}`
    const existing = await this.proposals.findOne({ where: proposalWhere<CutEditProposal>(scope, {
      cutProjectId: input.projectId,
      idempotencyKey
    }) })
    if (existing) return { ...proposalResult(existing), idempotentReplay: true }

    const proposal = await this.proposals.save(this.proposals.create({
      ...proposalCreate(scope),
      cutProjectId: input.projectId,
      sourceRevision: input.sourceRevision,
      sourceDocument: detail.document,
      status: 'draft',
      revision: 1,
      goal,
      constraints,
      items,
      estimatedDurationSeconds: preview.estimatedDurationSeconds,
      idempotencyKey,
      reviewNote: null,
      appliedRevision: null,
      revertedRevision: null,
      createdById: scope.userId ?? null,
      assistantId: scope.assistantId ?? null
    }))
    await this.writeLog(scope, input.projectId, 'cut_edit_proposal_created', input.changeSummary, {
      proposalId: requireId(proposal.id),
      sourceRevision: input.sourceRevision,
      itemCount: items.length,
      highRiskCount: items.filter((item) => item.risk === 'high').length,
      evidenceCount: items.reduce((total, item) => total + item.evidence.length, 0)
    })
    return { ...proposalResult(proposal), idempotentReplay: false }
  }

  async list(scope: CutScope, projectId: string, limit = 30) {
    await this.cut.getProject(scope, projectId)
    const rows = await this.proposals.find({
      where: proposalWhere<CutEditProposal>(scope, { cutProjectId: projectId }),
      order: { updatedAt: 'DESC' },
      take: Math.min(50, Math.max(1, Math.floor(limit)))
    })
    return rows.map(proposalSummary)
  }

  async get(scope: CutScope, projectId: string, proposalId: string, includePreviewDocument = false) {
    const proposal = await this.requireProposal(scope, projectId, proposalId)
    const preview = buildCutProposalPreview(proposal.sourceDocument, proposal.items)
    return {
      item: proposalDetail(proposal),
      preview: {
        changedClipIds: preview.changedClipIds,
        changedTrackIds: preview.changedTrackIds,
        estimatedDurationSeconds: preview.estimatedDurationSeconds,
        enabledItemCount: proposal.items.filter((item) => item.enabled).length,
        ...(includePreviewDocument ? { document: preview.document } : {})
      }
    }
  }

  async update(scope: CutScope, input: UpdateCutEditProposalInput) {
    if (!input.itemUpdates.length || input.itemUpdates.length > 50) throw new BadRequestException('Cut proposal review must update 1-50 items.')
    const proposal = await this.requireProposal(scope, input.projectId, input.proposalId)
    assertDraftRevision(proposal, input.baseProposalRevision)
    const updateById = new Map<string, boolean>()
    for (const update of input.itemUpdates) {
      if (!proposal.items.some((item) => item.id === update.itemId)) throw new BadRequestException(`Cut proposal item ${update.itemId} was not found.`)
      updateById.set(update.itemId, update.enabled)
    }
    const items = proposal.items.map((item) => updateById.has(item.id) ? { ...item, enabled: updateById.get(item.id)! } : item)
    const preview = buildCutProposalPreview(proposal.sourceDocument, items)
    const nextRevision = proposal.revision + 1
    const result = await this.proposals.update(proposalWhere<CutEditProposal>(scope, {
      id: input.proposalId,
      cutProjectId: input.projectId,
      status: 'draft',
      revision: input.baseProposalRevision
    }), {
      items,
      revision: nextRevision,
      estimatedDurationSeconds: preview.estimatedDurationSeconds,
      reviewNote: input.reviewNote?.trim().slice(0, 4_000) || proposal.reviewNote || null
    })
    if (result.affected !== 1) throw new ConflictException('Cut proposal changed while it was being reviewed; reload before editing.')
    proposal.items = items
    proposal.revision = nextRevision
    proposal.estimatedDurationSeconds = preview.estimatedDurationSeconds
    proposal.reviewNote = input.reviewNote?.trim().slice(0, 4_000) || proposal.reviewNote || null
    await this.writeLog(scope, input.projectId, 'cut_edit_proposal_updated', input.changeSummary, {
      proposalId: input.proposalId,
      proposalRevision: nextRevision,
      enabledItemCount: items.filter((item) => item.enabled).length
    })
    return this.get(scope, input.projectId, input.proposalId, true)
  }

  async reject(scope: CutScope, input: {
    projectId: string
    proposalId: string
    baseProposalRevision: number
    reviewNote?: string
    changeSummary: string
  }) {
    const proposal = await this.requireProposal(scope, input.projectId, input.proposalId)
    if (proposal.status === 'rejected') return { ...proposalResult(proposal), idempotentReplay: true }
    assertDraftRevision(proposal, input.baseProposalRevision)
    const result = await this.proposals.update(proposalWhere<CutEditProposal>(scope, {
      id: input.proposalId,
      cutProjectId: input.projectId,
      status: 'draft',
      revision: input.baseProposalRevision
    }), { status: 'rejected', reviewNote: input.reviewNote?.trim().slice(0, 4_000) || null })
    if (result.affected !== 1) throw new ConflictException('Cut proposal changed before it could be rejected.')
    proposal.status = 'rejected'
    proposal.reviewNote = input.reviewNote?.trim().slice(0, 4_000) || null
    await this.writeLog(scope, input.projectId, 'cut_edit_proposal_rejected', input.changeSummary, {
      proposalId: input.proposalId,
      sourceRevision: proposal.sourceRevision
    })
    return { ...proposalResult(proposal), idempotentReplay: false }
  }

  async apply(scope: CutScope, input: {
    projectId: string
    proposalId: string
    baseRevision: number
    baseProposalRevision: number
    changeSummary: string
  }) {
    let proposal = await this.requireProposal(scope, input.projectId, input.proposalId)
    const preview = buildCutProposalPreview(proposal.sourceDocument, proposal.items)
    if (proposal.status === 'applied') return appliedResult(proposal, preview, true)
    if (proposal.status === 'rejected') throw new ConflictException('Rejected Cut proposals cannot be applied.')
    if (proposal.status === 'applying') {
      const reconciled = await this.reconcileApplying(scope, proposal, preview)
      if (reconciled) return appliedResult(reconciled, preview, true)
    } else {
      assertDraftRevision(proposal, input.baseProposalRevision)
      if (!proposal.items.some((item) => item.enabled)) throw new BadRequestException('Enable at least one Cut proposal item before applying.')
      const claim = await this.proposals.update(proposalWhere<CutEditProposal>(scope, {
        id: input.proposalId,
        cutProjectId: input.projectId,
        status: 'draft',
        revision: input.baseProposalRevision
      }), { status: 'applying' })
      if (claim.affected !== 1) throw new ConflictException('Cut proposal changed before it could be applied.')
      proposal.status = 'applying'
    }

    if (input.baseRevision !== proposal.sourceRevision) {
      await this.releaseApplying(scope, proposal)
      throw new ConflictException(`Cut proposal is based on project revision ${proposal.sourceRevision}, not ${input.baseRevision}.`)
    }
    try {
      const current = await this.cut.getProject(scope, input.projectId)
      if (current.item.revision !== proposal.sourceRevision || !cutDocumentsEqual(current.document, proposal.sourceDocument)) {
        throw new ConflictException(`Cut project changed from proposal revision ${proposal.sourceRevision}; create a rebased proposal.`)
      }
      const result = await this.cut.applyEditBatch(scope, {
        projectId: input.projectId,
        operations: proposal.items.filter((item) => item.enabled).map((item) => item.operation),
        baseRevision: proposal.sourceRevision,
        mode: 'apply',
        changeSummary: input.changeSummary
      })
      proposal = await this.finishApplied(scope, proposal, result.project.revision)
      await this.writeLog(scope, input.projectId, 'cut_edit_proposal_applied', input.changeSummary, {
        proposalId: input.proposalId,
        sourceRevision: proposal.sourceRevision,
        appliedRevision: proposal.appliedRevision,
        enabledItemCount: proposal.items.filter((item) => item.enabled).length
      })
      return appliedResult(proposal, preview, false)
    } catch (error) {
      const reconciled = await this.reconcileApplying(scope, proposal, preview).catch(() => null)
      if (reconciled) return appliedResult(reconciled, preview, true)
      await this.releaseApplying(scope, proposal).catch(() => undefined)
      throw error
    }
  }

  async revert(scope: CutScope, input: {
    projectId: string
    proposalId: string
    baseRevision: number
    changeSummary: string
  }) {
    let proposal = await this.requireProposal(scope, input.projectId, input.proposalId)
    const preview = buildCutProposalPreview(proposal.sourceDocument, proposal.items)
    if (proposal.status === 'reverted') return revertedResult(proposal, preview, true)
    if (proposal.status === 'reverting') {
      const reconciled = await this.reconcileReverting(scope, proposal)
      if (reconciled) return revertedResult(reconciled, preview, true)
    } else {
      if (proposal.status !== 'applied' || proposal.appliedRevision == null) {
        throw new ConflictException(`Cut proposal is ${proposal.status}, not applied.`)
      }
      const claim = await this.proposals.update(proposalWhere<CutEditProposal>(scope, {
        id: input.proposalId,
        cutProjectId: input.projectId,
        status: 'applied',
        appliedRevision: proposal.appliedRevision
      }), { status: 'reverting' })
      if (claim.affected !== 1) throw new ConflictException('Cut proposal changed before it could be reverted.')
      proposal.status = 'reverting'
    }
    if (input.baseRevision !== proposal.appliedRevision) {
      await this.releaseReverting(scope, proposal)
      throw new ConflictException(`Cut proposal was applied at project revision ${proposal.appliedRevision}, not ${input.baseRevision}.`)
    }
    try {
      const current = await this.cut.getProject(scope, input.projectId)
      if (current.item.revision !== proposal.appliedRevision || !cutDocumentsEqual(current.document, preview.document)) {
        throw new ConflictException('Cut project changed after this proposal was applied; reverting would overwrite later edits.')
      }
      const result = await this.cut.saveProject(scope, {
        projectId: input.projectId,
        document: proposal.sourceDocument,
        baseRevision: proposal.appliedRevision,
        changeSummary: input.changeSummary
      })
      proposal = await this.finishReverted(scope, proposal, result.project.revision)
      await this.writeLog(scope, input.projectId, 'cut_edit_proposal_reverted', input.changeSummary, {
        proposalId: input.proposalId,
        appliedRevision: proposal.appliedRevision,
        revertedRevision: proposal.revertedRevision
      })
      return revertedResult(proposal, preview, false)
    } catch (error) {
      const reconciled = await this.reconcileReverting(scope, proposal).catch(() => null)
      if (reconciled) return revertedResult(reconciled, preview, true)
      await this.releaseReverting(scope, proposal).catch(() => undefined)
      throw error
    }
  }

  private async reconcileApplying(
    scope: CutScope,
    proposal: CutEditProposal,
    preview: ReturnType<typeof buildCutProposalPreview>
  ) {
    const current = await this.cut.getProject(scope, proposal.cutProjectId)
    if (current.item.revision === proposal.sourceRevision + 1 && cutDocumentsEqual(current.document, preview.document)) {
      return this.finishApplied(scope, proposal, current.item.revision)
    }
    if (current.item.revision === proposal.sourceRevision && cutDocumentsEqual(current.document, proposal.sourceDocument)) return null
    throw new ConflictException('Cut proposal application cannot be reconciled because the project changed independently.')
  }

  private async finishApplied(scope: CutScope, proposal: CutEditProposal, appliedRevision: number) {
    const result = await this.proposals.update(proposalWhere<CutEditProposal>(scope, {
      id: requireId(proposal.id),
      cutProjectId: proposal.cutProjectId,
      status: 'applying'
    }), { status: 'applied', appliedRevision })
    if (result.affected !== 1) {
      const current = await this.requireProposal(scope, proposal.cutProjectId, requireId(proposal.id))
      if (current.status === 'applied' && current.appliedRevision === appliedRevision) return current
      throw new ConflictException('Cut proposal was applied but its review state could not be finalized.')
    }
    proposal.status = 'applied'
    proposal.appliedRevision = appliedRevision
    return proposal
  }

  private async reconcileReverting(scope: CutScope, proposal: CutEditProposal) {
    if (proposal.appliedRevision == null) throw new ConflictException('Cut proposal has no applied revision to reconcile.')
    const current = await this.cut.getProject(scope, proposal.cutProjectId)
    if (current.item.revision === proposal.appliedRevision + 1 && cutDocumentsEqual(current.document, proposal.sourceDocument)) {
      return this.finishReverted(scope, proposal, current.item.revision)
    }
    const preview = buildCutProposalPreview(proposal.sourceDocument, proposal.items)
    if (current.item.revision === proposal.appliedRevision && cutDocumentsEqual(current.document, preview.document)) return null
    throw new ConflictException('Cut proposal revert cannot be reconciled because the project changed independently.')
  }

  private async finishReverted(scope: CutScope, proposal: CutEditProposal, revertedRevision: number) {
    const result = await this.proposals.update(proposalWhere<CutEditProposal>(scope, {
      id: requireId(proposal.id),
      cutProjectId: proposal.cutProjectId,
      status: 'reverting'
    }), { status: 'reverted', revertedRevision })
    if (result.affected !== 1) {
      const current = await this.requireProposal(scope, proposal.cutProjectId, requireId(proposal.id))
      if (current.status === 'reverted' && current.revertedRevision === revertedRevision) return current
      throw new ConflictException('Cut proposal was reverted but its review state could not be finalized.')
    }
    proposal.status = 'reverted'
    proposal.revertedRevision = revertedRevision
    return proposal
  }

  private async releaseApplying(scope: CutScope, proposal: CutEditProposal) {
    await this.proposals.update(proposalWhere<CutEditProposal>(scope, {
      id: requireId(proposal.id),
      cutProjectId: proposal.cutProjectId,
      status: 'applying'
    }), { status: 'draft' })
    proposal.status = 'draft'
  }

  private async releaseReverting(scope: CutScope, proposal: CutEditProposal) {
    await this.proposals.update(proposalWhere<CutEditProposal>(scope, {
      id: requireId(proposal.id),
      cutProjectId: proposal.cutProjectId,
      status: 'reverting'
    }), { status: 'applied' })
    proposal.status = 'applied'
  }

  private async requireProposal(scope: CutScope, projectId: string, proposalId: string) {
    const proposal = await this.proposals.findOne({ where: proposalWhere<CutEditProposal>(scope, {
      id: proposalId,
      cutProjectId: projectId
    }) })
    if (!proposal) throw new NotFoundException('Cut edit proposal was not found in the current tenant and organization.')
    return proposal
  }

  private async writeLog(scope: CutScope, projectId: string, action: CutActionLog['action'], message: string, snapshot: CutJsonValue) {
    await this.logs.save(this.logs.create({
      ...proposalCreate(scope),
      cutProjectId: projectId,
      action,
      actorType: scope.assistantId ? 'agent' : scope.userId ? 'user' : 'system',
      actorId: scope.userId ?? scope.assistantId ?? null,
      message: boundedString(message, 500, 'Cut proposal change summary'),
      errorMessage: null,
      snapshot
    }))
  }
}

function proposalSummary(proposal: CutEditProposal) {
  return {
    id: proposal.id,
    projectId: proposal.cutProjectId,
    sourceRevision: proposal.sourceRevision,
    status: proposal.status,
    revision: proposal.revision,
    goal: proposal.goal,
    itemCount: proposal.items.length,
    enabledItemCount: proposal.items.filter((item) => item.enabled).length,
    highRiskCount: proposal.items.filter((item) => item.enabled && item.risk === 'high').length,
    estimatedDurationSeconds: proposal.estimatedDurationSeconds,
    appliedRevision: proposal.appliedRevision ?? null,
    revertedRevision: proposal.revertedRevision ?? null,
    updatedAt: proposal.updatedAt?.toISOString?.() ?? null
  }
}

function proposalDetail(proposal: CutEditProposal) {
  return { ...proposalSummary(proposal), constraints: proposal.constraints ?? null, items: proposal.items, reviewNote: proposal.reviewNote ?? null }
}

function proposalResult(proposal: CutEditProposal) {
  return { success: true, proposal: proposalSummary(proposal) }
}

function appliedResult(
  proposal: CutEditProposal,
  preview: ReturnType<typeof buildCutProposalPreview>,
  idempotentReplay: boolean
) {
  return {
    success: true,
    applied: true,
    projectId: proposal.cutProjectId,
    proposalId: proposal.id,
    proposalRevision: proposal.revision,
    revision: proposal.appliedRevision,
    changedClipIds: preview.changedClipIds,
    changedTrackIds: preview.changedTrackIds,
    idempotentReplay
  }
}

function revertedResult(
  proposal: CutEditProposal,
  preview: ReturnType<typeof buildCutProposalPreview>,
  idempotentReplay: boolean
) {
  return {
    success: true,
    reverted: true,
    projectId: proposal.cutProjectId,
    proposalId: proposal.id,
    revision: proposal.revertedRevision,
    restoredSourceRevision: proposal.sourceRevision,
    changedClipIds: preview.changedClipIds,
    changedTrackIds: preview.changedTrackIds,
    idempotentReplay
  }
}

function assertDraftRevision(proposal: CutEditProposal, revision: number) {
  if (proposal.status !== 'draft') throw new ConflictException(`Cut proposal is ${proposal.status}, not draft.`)
  if (proposal.revision !== revision) {
    throw new ConflictException(`Cut proposal revision changed from ${revision} to ${proposal.revision}; reload before reviewing.`)
  }
}

function proposalCreate(scope: CutScope): ProposalScopedEntity {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    platformProjectId: scope.projectId ?? null
  }
}

function proposalWhere<T extends ProposalScopedEntity>(scope: CutScope, where: Partial<T>): FindOptionsWhere<T> {
  return {
    ...where,
    tenantId: scope.tenantId,
    organizationId: (scope.organizationId ?? null) as T['organizationId']
  } as FindOptionsWhere<T>
}

function boundedString(value: string, maxLength: number, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new BadRequestException(`${label} is required.`)
  if (normalized.length > maxLength) throw new BadRequestException(`${label} exceeds ${maxLength} characters.`)
  return normalized
}

function requireId(id: string | undefined) {
  if (!id) throw new Error('Cut persistence did not return an edit proposal id.')
  return id
}
