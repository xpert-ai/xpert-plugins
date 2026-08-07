import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import {
  In,
  IsNull,
  Not,
  type FindOperator,
  type FindOptionsWhere,
  type Repository
} from 'typeorm'
import {
  StoryActionLog,
  StoryCutHandoff,
  StoryProduction,
  StoryProject
} from './entities/index.js'
import type {
  GetStoryCutHandoffInput,
  PrepareStoryCutHandoffInput,
  RecordStoryCutHandoffDeliveryInput,
  StoryCutHandoffContract,
  StoryCutHandoffDetail,
  StoryCutHandoffFile,
  StoryCutHandoffResult,
  StoryCutHandoffShot,
  StoryCutHandoffStatus,
  StoryCutHandoffSummary
} from './story-cut-handoff.types.js'
import { STORY_CUT_HANDOFF_CONTRACT_VERSION } from './story-cut-handoff.types.js'
import { storyActor } from './story-actor.js'
import { buildStoryScopeKey } from './story-studio.service.js'
import type { StoryMediaCandidate } from './production-types.js'
import type { StoryScope } from './types.js'

const MAX_HANDOFF_SHOTS = 24

@Injectable()
export class StoryCutHandoffService {
  constructor(
    @InjectRepository(StoryProject)
    private readonly projects: Repository<StoryProject>,
    @InjectRepository(StoryProduction)
    private readonly productions: Repository<StoryProduction>,
    @InjectRepository(StoryCutHandoff)
    private readonly handoffs: Repository<StoryCutHandoff>,
    @InjectRepository(StoryActionLog)
    private readonly logs: Repository<StoryActionLog>
  ) {}

  async prepare(
    scope: StoryScope,
    input: PrepareStoryCutHandoffInput
  ): Promise<StoryCutHandoffResult> {
    validateScope(scope)
    return this.projects.manager.transaction(async (manager) => {
      const projects = manager.getRepository(StoryProject)
      const productions = manager.getRepository(StoryProduction)
      const handoffs = manager.getRepository(StoryCutHandoff)
      const logs = manager.getRepository(StoryActionLog)
      const project = await requireProject(projects, scope, input.projectId)
      if (project.revision !== input.expectedRevision) {
        throw revisionConflict(project.revision)
      }
      const production = await productions.findOne({
        where: productionWhere(scope, { projectId: project.id })
      })
      if (!production) {
        throw new BadRequestException({
          errorCode: 'story_cut_handoff_production_missing',
          message: 'Save a production document before preparing a Cut handoff.'
        })
      }
      if (production.projectRevision !== project.revision) {
        throw revisionConflict(project.revision)
      }

      const existingByOperation = await handoffs.findOne({
        where: handoffWhere(scope, { operationId: input.operationId })
      })
      if (existingByOperation) {
        if (
          existingByOperation.projectId !== input.projectId ||
          existingByOperation.sourceRevision !== input.expectedRevision
        ) {
          throw operationConflict()
        }
        return {
          success: true,
          duplicate: true,
          handoff: toSummary(existingByOperation)
        }
      }

      const existingByRevision = await handoffs.findOne({
        where: handoffWhere(scope, {
          projectId: input.projectId,
          sourceRevision: input.expectedRevision
        })
      })
      if (existingByRevision) {
        return {
          success: true,
          duplicate: true,
          handoff: toSummary(existingByRevision)
        }
      }

      const previous = await handoffs.findOne({
        where: handoffWhere(scope, {
          projectId: input.projectId,
          status: In(['delivered', 'proposal_ready']),
          cutProjectId: Not(IsNull())
        }),
        order: { sourceRevision: 'DESC', createdAt: 'DESC' }
      })
      const id = randomUUID()
      const mode = previous?.cutProjectId ? 'proposal' : 'create'
      const contract = createContract({
        id,
        project,
        production,
        fps: input.fps ?? 24,
        mode,
        cutProjectId: previous?.cutProjectId ?? null
      })
      const checksum = checksumOf(contract)
      const row = await handoffs.save(
        handoffs.create({
          id,
          ...scopeCreate(scope),
          projectId: project.id,
          operationId: input.operationId,
          contractVersion: STORY_CUT_HANDOFF_CONTRACT_VERSION,
          sourceRevision: project.revision,
          handoffRevision: 1,
          mode,
          status: 'ready',
          checksum,
          contract,
          cutProjectId: previous?.cutProjectId ?? null,
          cutProjectRevision: previous?.cutProjectRevision ?? null,
          cutProposalId: null,
          changeSummary: input.changeSummary,
          createdById: storyActor(scope).actorId
        })
      )
      await logs.save(
        logs.create({
          ...scopeCreate(scope),
          projectId: project.id,
          operationId: input.operationId,
          operationFingerprint: checksumOf(input),
          action: 'cut_handoff_prepared',
          ...storyActor(scope),
          changeSummary: input.changeSummary,
          previousRevision: project.revision,
          resultingRevision: project.revision,
          changedFields: ['cutHandoff']
        })
      )
      return {
        success: true,
        duplicate: false,
        handoff: toSummary(row)
      }
    })
  }

  async get(
    scope: StoryScope,
    input: GetStoryCutHandoffInput
  ): Promise<StoryCutHandoffDetail> {
    validateScope(scope)
    await requireProject(this.projects, scope, input.projectId)
    const row = input.handoffId
      ? await this.handoffs.findOne({
          where: handoffWhere(scope, {
            id: input.handoffId,
            projectId: input.projectId
          })
        })
      : await this.handoffs.findOne({
          where: handoffWhere(scope, { projectId: input.projectId }),
          order: { sourceRevision: 'DESC', createdAt: 'DESC' }
        })
    if (!row) {
      throw new NotFoundException({
        errorCode: 'story_cut_handoff_not_found',
        message: 'No StoryCutHandoff exists for this project.'
      })
    }
    return {
      success: true,
      duplicate: false,
      handoff: toSummary(row),
      contract: row.contract
    }
  }

  async getLatestSummary(scope: StoryScope, projectId: string) {
    validateScope(scope)
    const row = await this.handoffs.findOne({
      where: handoffWhere(scope, { projectId }),
      order: { sourceRevision: 'DESC', createdAt: 'DESC' }
    })
    return row ? toSummary(row) : null
  }

  async recordDelivery(
    scope: StoryScope,
    input: RecordStoryCutHandoffDeliveryInput
  ): Promise<StoryCutHandoffResult> {
    validateScope(scope)
    return this.projects.manager.transaction(async (manager) => {
      const projects = manager.getRepository(StoryProject)
      const handoffs = manager.getRepository(StoryCutHandoff)
      const logs = manager.getRepository(StoryActionLog)
      const project = await requireProject(projects, scope, input.projectId)
      const fingerprint = checksumOf(input)
      const previousLog = await logs.findOne({
        where: logWhere(scope, { operationId: input.operationId })
      })
      if (previousLog) {
        if (
          previousLog.projectId !== input.projectId ||
          previousLog.operationFingerprint !== fingerprint
        ) {
          throw operationConflict()
        }
        const duplicate = await requireHandoff(
          handoffs,
          scope,
          input.projectId,
          input.handoffId
        )
        return {
          success: true,
          duplicate: true,
          handoff: toSummary(duplicate)
        }
      }

      const row = await requireHandoff(
        handoffs,
        scope,
        input.projectId,
        input.handoffId
      )
      if (row.handoffRevision !== input.baseHandoffRevision) {
        throw new ConflictException({
          errorCode: 'story_cut_handoff_revision_conflict',
          message: 'StoryCutHandoff changed. Refresh it and retry.',
          currentHandoffRevision: row.handoffRevision
        })
      }
      validateDelivery(row, input)
      const nextRevision = row.handoffRevision + 1
      const now = new Date()
      const result = await handoffs.update(
        handoffWhere(scope, {
          id: row.id,
          projectId: row.projectId,
          handoffRevision: input.baseHandoffRevision
        }),
        {
          handoffRevision: nextRevision,
          status: input.status,
          cutProjectId: input.cutProjectId ?? row.cutProjectId ?? null,
          cutProjectRevision: input.cutProjectRevision ?? null,
          cutProposalId: input.cutProposalId ?? null,
          failureCode:
            input.status === 'failed' ? input.failureCode ?? null : null,
          failureMessage:
            input.status === 'failed' ? input.failureMessage ?? null : null,
          changeSummary: input.changeSummary,
          deliveredAt: input.status === 'failed' ? null : now
        }
      )
      if (result.affected !== 1) {
        throw new ConflictException({
          errorCode: 'story_cut_handoff_revision_conflict',
          message: 'StoryCutHandoff changed. Refresh it and retry.'
        })
      }
      const updated = await requireHandoff(
        handoffs,
        scope,
        input.projectId,
        input.handoffId
      )
      await logs.save(
        logs.create({
          ...scopeCreate(scope),
          projectId: project.id,
          operationId: input.operationId,
          operationFingerprint: fingerprint,
          action:
            input.status === 'failed'
              ? 'cut_handoff_failed'
              : 'cut_handoff_delivered',
          ...storyActor(scope),
          changeSummary: input.changeSummary,
          previousRevision: project.revision,
          resultingRevision: project.revision,
          changedFields: ['cutHandoff.status'],
          failureCode:
            input.status === 'failed' ? input.failureCode ?? null : null,
          recoverable: input.status === 'failed' ? true : null
        })
      )
      return {
        success: true,
        duplicate: false,
        handoff: toSummary(updated)
      }
    })
  }
}

function createContract(input: {
  id: string
  project: StoryProject
  production: StoryProduction
  fps: 24 | 30
  mode: 'create' | 'proposal'
  cutProjectId: string | null
}): StoryCutHandoffContract {
  const dimensions = dimensionsFor(input.project.aspectRatio)
  const scenes = [...input.production.scenes].sort(
    (left, right) => left.order - right.order
  )
  let cursor = 0
  const shots: StoryCutHandoffShot[] = []
  for (const scene of scenes) {
    for (const shot of scene.shots) {
      const videos = (shot.candidates ?? []).filter(
        (candidate) => candidate.kind === 'video'
      )
      const explicitlySelected = videos.filter(
        (candidate) => candidate.selected === true
      )
      const selected = explicitlySelected.length === 1
        ? explicitlySelected
        : explicitlySelected.length === 0 && videos.length === 1
          ? videos
          : []
      if (selected.length !== 1) {
        throw new BadRequestException({
          errorCode: 'story_cut_handoff_video_selection_invalid',
          message: `Shot "${shot.title}" must have one unambiguous video before Cut handoff.`,
          sceneId: scene.id,
          shotId: shot.id
        })
      }
      const file = handoffFile(selected[0], input.project.tenantId)
      shots.push({
        sceneId: scene.id,
        shotId: shot.id,
        title: shot.title,
        startSeconds: round(cursor),
        durationSeconds: shot.durationSeconds,
        camera: shot.camera,
        action: shot.action,
        dialogue: shot.dialogue ?? null,
        file
      })
      cursor += shot.durationSeconds
    }
  }
  if (!shots.length || shots.length > MAX_HANDOFF_SHOTS) {
    throw new BadRequestException({
      errorCode: 'story_cut_handoff_shot_count_invalid',
      message: `StoryCutHandoff requires 1-${MAX_HANDOFF_SHOTS} selected shots.`
    })
  }
  return {
    contractVersion: STORY_CUT_HANDOFF_CONTRACT_VERSION,
    handoffId: input.id,
    source: {
      projectId: input.project.id,
      revision: input.project.revision,
      title: input.project.title,
      brief:
        input.project.premise ??
        input.project.description ??
        input.production.adaptationGoal,
      visualStyle: input.production.visualStyle
    },
    sequence: {
      aspectRatio: input.project.aspectRatio,
      ...dimensions,
      fps: input.fps,
      durationSeconds: round(cursor)
    },
    target: {
      mode: input.mode,
      cutProjectId: input.cutProjectId
    },
    shots
  }
}

function handoffFile(
  candidate: StoryMediaCandidate,
  tenantId: string
): StoryCutHandoffFile {
  const reference = candidate.fileReference
  if (
    !reference ||
    reference.source !== 'platform.workspace.files' ||
    !reference.workspacePath ||
    (reference.tenantId && reference.tenantId !== tenantId) ||
    candidate.mimeType !== 'video/mp4' ||
    !candidate.size ||
    !candidate.sha256
  ) {
    throw new BadRequestException({
      errorCode: 'story_cut_handoff_media_invalid',
      message:
        'Every selected video must be a scoped Workspace MP4 with size and checksum evidence.'
    })
  }
  return {
    workspacePath: reference.workspacePath,
    originalName:
      candidate.originalName ??
      reference.originalName ??
      reference.name ??
      `${candidate.id}.mp4`,
    mimeType: 'video/mp4',
    size: candidate.size,
    sha256: candidate.sha256
  }
}

function validateDelivery(
  row: StoryCutHandoff,
  input: RecordStoryCutHandoffDeliveryInput
) {
  if (input.status === 'failed') return
  if (row.mode === 'create' && input.status !== 'delivered') {
    throw new BadRequestException(
      'An initial StoryCutHandoff must finish as delivered.'
    )
  }
  if (row.mode === 'proposal' && input.status !== 'proposal_ready') {
    throw new BadRequestException(
      'A later StoryCutHandoff must finish as proposal_ready.'
    )
  }
  if (
    row.mode === 'proposal' &&
    row.cutProjectId &&
    row.cutProjectId !== input.cutProjectId
  ) {
    throw new ConflictException(
      'The Cut proposal targets a different project than the prior handoff.'
    )
  }
}

function dimensionsFor(aspectRatio: StoryProject['aspectRatio']) {
  switch (aspectRatio) {
    case '9:16':
      return { width: 720, height: 1280 }
    case '16:9':
      return { width: 1280, height: 720 }
    case '1:1':
      return { width: 1080, height: 1080 }
    case '4:3':
      return { width: 960, height: 720 }
    case '3:4':
      return { width: 720, height: 960 }
    default:
      throw new BadRequestException(
        'Custom aspect ratios require explicit sequence dimensions before Cut handoff.'
      )
  }
}

function toSummary(row: StoryCutHandoff): StoryCutHandoffSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    contractVersion: STORY_CUT_HANDOFF_CONTRACT_VERSION,
    sourceRevision: row.sourceRevision,
    handoffRevision: row.handoffRevision,
    mode: row.mode,
    status: row.status,
    checksum: row.checksum,
    cutProjectId: row.cutProjectId ?? null,
    cutProjectRevision: row.cutProjectRevision ?? null,
    cutProposalId: row.cutProposalId ?? null,
    shotCount: row.contract.shots.length,
    durationSeconds: row.contract.sequence.durationSeconds,
    width: row.contract.sequence.width,
    height: row.contract.sequence.height,
    fps: row.contract.sequence.fps,
    changeSummary: row.changeSummary,
    failureCode: row.failureCode ?? null,
    failureMessage: row.failureMessage ?? null,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null
  }
}

async function requireProject(
  repository: Repository<StoryProject>,
  scope: StoryScope,
  projectId: string
) {
  const row = await repository.findOne({
    where: projectWhere(scope, { id: projectId })
  })
  if (!row) {
    throw new NotFoundException({
      errorCode: 'story_project_not_found',
      message: 'Story project was not found.'
    })
  }
  return row
}

async function requireHandoff(
  repository: Repository<StoryCutHandoff>,
  scope: StoryScope,
  projectId: string,
  handoffId: string
) {
  const row = await repository.findOne({
    where: handoffWhere(scope, { id: handoffId, projectId })
  })
  if (!row) {
    throw new NotFoundException({
      errorCode: 'story_cut_handoff_not_found',
      message: 'StoryCutHandoff was not found.'
    })
  }
  return row
}

function projectWhere(
  scope: StoryScope,
  where: {
    id?: string
    revision?: number
  }
): FindOptionsWhere<StoryProject> {
  return {
    ...where,
    tenantId: scope.tenantId,
    scopeKey: buildStoryScopeKey(scope)
  }
}

function productionWhere(
  scope: StoryScope,
  where: {
    projectId?: string
  }
): FindOptionsWhere<StoryProduction> {
  return {
    ...where,
    tenantId: scope.tenantId,
    scopeKey: buildStoryScopeKey(scope)
  }
}

function handoffWhere(
  scope: StoryScope,
  where: {
    id?: string
    projectId?: string
    operationId?: string
    sourceRevision?: number
    handoffRevision?: number
    status?:
      | StoryCutHandoffStatus
      | FindOperator<StoryCutHandoffStatus>
    cutProjectId?: string | FindOperator<string>
  }
): FindOptionsWhere<StoryCutHandoff> {
  return {
    ...where,
    tenantId: scope.tenantId,
    scopeKey: buildStoryScopeKey(scope)
  }
}

function logWhere(
  scope: StoryScope,
  where: {
    operationId?: string
  }
): FindOptionsWhere<StoryActionLog> {
  return {
    ...where,
    tenantId: scope.tenantId,
    scopeKey: buildStoryScopeKey(scope)
  }
}

function scopeCreate(scope: StoryScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    hostProjectId: scope.hostProjectId ?? null,
    scopeKey: buildStoryScopeKey(scope)
  }
}

function validateScope(scope: StoryScope) {
  if (!scope.tenantId?.trim()) {
    throw new BadRequestException('Tenant scope is required.')
  }
}

function checksumOf(value: object) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function operationConflict() {
  return new ConflictException({
    errorCode: 'story_operation_payload_conflict',
    message: 'operationId was already used for a different handoff mutation.'
  })
}

function revisionConflict(currentRevision: number) {
  return new ConflictException({
    errorCode: 'story_revision_conflict',
    message: 'Story project changed. Refresh the project and retry.',
    currentRevision
  })
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000
}
