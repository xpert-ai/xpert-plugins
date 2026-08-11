import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import {
  EntityManager,
  FindOptionsWhere,
  ILike,
  Repository
} from 'typeorm'
import { StoryActionLog, StoryProject } from './entities/index.js'
import { storyActor } from './story-actor.js'
import type {
  CreateStoryProjectInput,
  GetStoryProjectRevisionInput,
  GetStoryProjectSummaryInput,
  ReportStoryFailureInput,
  SearchStoryProjectsInput,
  StoryMutationReceipt,
  StoryProjectAction,
  StoryProjectMutationResult,
  StoryProjectRevision,
  StoryProjectSearchResult,
  StoryProjectStatus,
  StoryProjectSummary,
  StoryScope,
  UpdateStoryProjectInput,
  UpdateStoryProjectStatusInput
} from './types.js'

const STATUS_TRANSITIONS: Record<StoryProjectStatus, readonly StoryProjectStatus[]> = {
  draft: ['planning', 'failed', 'archived'],
  planning: ['draft', 'production', 'failed', 'archived'],
  production: ['planning', 'review', 'failed', 'archived'],
  review: ['production', 'completed', 'failed', 'archived'],
  completed: ['review', 'archived'],
  failed: ['draft', 'planning', 'archived'],
  archived: ['draft']
}

@Injectable()
export class StoryStudioService {
  constructor(
    @InjectRepository(StoryProject)
    private readonly projects: Repository<StoryProject>,
    @InjectRepository(StoryActionLog)
    private readonly actionLogs: Repository<StoryActionLog>
  ) {}

  async createProject(
    scope: StoryScope,
    input: CreateStoryProjectInput
  ): Promise<StoryProjectMutationResult> {
    validateScope(scope)
    return this.projects.manager.transaction(async (manager) => {
      const projects = manager.getRepository(StoryProject)
      const fingerprint = operationFingerprint(
        'project_created',
        input
      )
      const existing = await projects.findOne({
        where: projectWhere(scope, { creationOperationId: input.operationId })
      })
      if (existing) {
        assertOperationFingerprint(
          existing.creationFingerprint,
          fingerprint
        )
        return mutationResult(existing, {
          duplicate: true,
          operationId: input.operationId,
          previousRevision: null,
          changedFields: []
        })
      }

      const now = new Date()
      const project = await projects.save(
        projects.create({
          ...scopeCreate(scope),
          createdById: scope.userId ?? null,
          assistantId: scope.assistantId ?? null,
          conversationId: scope.conversationId ?? null,
          creationOperationId: input.operationId,
          creationFingerprint: fingerprint,
          title: requiredText(input.title, 'Story project title is required.'),
          description: optionalText(input.description),
          premise: optionalText(input.premise),
          productionFormat: input.productionFormat ?? 'vertical_short',
          aspectRatio: input.aspectRatio ?? '9:16',
          targetDurationSeconds: input.targetDurationSeconds ?? null,
          status: 'draft',
          revision: 1,
          tags: normalizeTags(input.tags),
          lastEditedById: storyActor(scope).actorId,
          lastEditedAt: now
        })
      )

      const changedFields = [
        'title',
        'description',
        'premise',
        'productionFormat',
        'aspectRatio',
        'targetDurationSeconds',
        'tags',
        'status'
      ]
      await writeLog(manager, scope, {
        project,
        operationId: input.operationId,
        operationFingerprint: fingerprint,
        action: 'project_created',
        changeSummary: input.changeSummary,
        previousRevision: null,
        changedFields
      })

      return mutationResult(project, {
        duplicate: false,
        operationId: input.operationId,
        previousRevision: null,
        changedFields
      })
    })
  }

  async searchProjects(
    scope: StoryScope,
    query: SearchStoryProjectsInput = {}
  ): Promise<StoryProjectSearchResult> {
    validateScope(scope)
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 20, 50))
    const search = query.search?.trim() ?? ''
    const baseWhere = projectWhere(scope, {
      ...(query.status ? { status: query.status } : {}),
      ...(query.productionFormat
        ? { productionFormat: query.productionFormat }
        : {})
    })
    const where: FindOptionsWhere<StoryProject>[] | FindOptionsWhere<StoryProject> =
      search
        ? [
            { ...baseWhere, title: ILike(`%${search}%`) },
            { ...baseWhere, description: ILike(`%${search}%`) },
            { ...baseWhere, premise: ILike(`%${search}%`) }
          ]
        : baseWhere
    const [items, total] = await this.projects.findAndCount({
      where,
      order: {
        updatedAt: 'DESC',
        id: 'ASC'
      },
      skip: (page - 1) * pageSize,
      take: pageSize
    })

    return {
      items: items.map(toProjectSummary),
      total,
      page,
      pageSize,
      search
    }
  }

  async getProjectSummary(
    scope: StoryScope,
    input: GetStoryProjectSummaryInput
  ): Promise<StoryProjectSummary> {
    const project = await this.requireProject(scope, input.projectId)
    if (
      input.expectedRevision !== undefined &&
      project.revision !== input.expectedRevision
    ) {
      throw revisionConflict(project.revision)
    }
    return toProjectSummary(project)
  }

  async getProjectRevision(
    scope: StoryScope,
    input: GetStoryProjectRevisionInput
  ): Promise<StoryProjectRevision> {
    const project = await this.requireProject(scope, input.projectId)
    return {
      projectId: project.id,
      revision: project.revision
    }
  }

  async updateProject(
    scope: StoryScope,
    input: UpdateStoryProjectInput
  ): Promise<StoryProjectMutationResult> {
    validateScope(scope)
    return this.projects.manager.transaction(async (manager) => {
      const fingerprint = operationFingerprint(
        'project_updated',
        input
      )
      const duplicate = await duplicateMutation(
        manager,
        scope,
        input.projectId,
        input.operationId,
        fingerprint
      )
      if (duplicate) {
        return duplicate
      }

      const project = await requireProject(
        manager.getRepository(StoryProject),
        scope,
        input.projectId
      )
      assertRevision(project, input.baseRevision)
      const patch = buildProjectPatch(input)
      const changedFields = Object.keys(patch)
      if (!changedFields.length) {
        throw new BadRequestException({
          errorCode: 'story_project_no_changes',
          message: 'At least one project field must change.'
        })
      }

      const previousRevision = project.revision
      const revision = previousRevision + 1
      const result = await manager.getRepository(StoryProject).update(
        projectWhere(scope, { id: project.id, revision: input.baseRevision }),
        {
          ...patch,
          revision,
          lastEditedById: storyActor(scope).actorId,
          lastEditedAt: new Date()
        }
      )
      if (result.affected !== 1) {
        throw revisionConflict(
          await currentRevision(manager, scope, project.id)
        )
      }

      const updated = await requireProject(
        manager.getRepository(StoryProject),
        scope,
        project.id
      )
      await writeLog(manager, scope, {
        project: updated,
        operationId: input.operationId,
        operationFingerprint: fingerprint,
        action: 'project_updated',
        changeSummary: input.changeSummary,
        previousRevision,
        changedFields
      })
      return mutationResult(updated, {
        duplicate: false,
        operationId: input.operationId,
        previousRevision,
        changedFields
      })
    })
  }

  async updateProjectStatus(
    scope: StoryScope,
    input: UpdateStoryProjectStatusInput
  ): Promise<StoryProjectMutationResult> {
    validateScope(scope)
    return this.projects.manager.transaction(async (manager) => {
      const fingerprint = operationFingerprint(
        'status_updated',
        input
      )
      const duplicate = await duplicateMutation(
        manager,
        scope,
        input.projectId,
        input.operationId,
        fingerprint
      )
      if (duplicate) {
        return duplicate
      }

      const repository = manager.getRepository(StoryProject)
      const project = await requireProject(repository, scope, input.projectId)
      assertRevision(project, input.baseRevision)
      assertStatusTransition(project.status, input.status)
      const previousRevision = project.revision
      const revision = previousRevision + 1
      const leavingFailure = project.status === 'failed' && input.status !== 'failed'
      const result = await repository.update(
        projectWhere(scope, { id: project.id, revision: input.baseRevision }),
        {
          status: input.status,
          revision,
          ...(leavingFailure
            ? {
                failureCode: null,
                failureMessage: null,
                failureRecoverable: null
              }
            : {}),
          lastEditedById: storyActor(scope).actorId,
          lastEditedAt: new Date()
        }
      )
      if (result.affected !== 1) {
        throw revisionConflict(
          await currentRevision(manager, scope, project.id)
        )
      }

      const updated = await requireProject(repository, scope, project.id)
      const changedFields = leavingFailure
        ? ['status', 'failureCode', 'failureMessage', 'failureRecoverable']
        : ['status']
      await writeLog(manager, scope, {
        project: updated,
        operationId: input.operationId,
        operationFingerprint: fingerprint,
        action: 'status_updated',
        changeSummary: input.changeSummary,
        previousRevision,
        changedFields
      })
      return mutationResult(updated, {
        duplicate: false,
        operationId: input.operationId,
        previousRevision,
        changedFields
      })
    })
  }

  async reportFailure(
    scope: StoryScope,
    input: ReportStoryFailureInput
  ): Promise<StoryProjectMutationResult> {
    validateScope(scope)
    return this.projects.manager.transaction(async (manager) => {
      const fingerprint = operationFingerprint(
        'failure_reported',
        input
      )
      const duplicate = await duplicateMutation(
        manager,
        scope,
        input.projectId,
        input.operationId,
        fingerprint
      )
      if (duplicate) {
        return duplicate
      }

      const repository = manager.getRepository(StoryProject)
      const project = await requireProject(repository, scope, input.projectId)
      assertRevision(project, input.baseRevision)
      const previousRevision = project.revision
      const revision = previousRevision + 1
      const result = await repository.update(
        projectWhere(scope, { id: project.id, revision: input.baseRevision }),
        {
          status: 'failed',
          revision,
          failureCode: requiredText(
            input.failureCode,
            'Failure code is required.'
          ),
          failureMessage: requiredText(
            input.errorMessage,
            'Failure message is required.'
          ),
          failureRecoverable: input.recoverable,
          lastEditedById: storyActor(scope).actorId,
          lastEditedAt: new Date()
        }
      )
      if (result.affected !== 1) {
        throw revisionConflict(
          await currentRevision(manager, scope, project.id)
        )
      }

      const updated = await requireProject(repository, scope, project.id)
      const changedFields = [
        'status',
        'failureCode',
        'failureMessage',
        'failureRecoverable'
      ]
      await writeLog(manager, scope, {
        project: updated,
        operationId: input.operationId,
        operationFingerprint: fingerprint,
        action: 'failure_reported',
        changeSummary: input.changeSummary,
        previousRevision,
        changedFields,
        failureCode: input.failureCode,
        recoverable: input.recoverable
      })
      return mutationResult(updated, {
        duplicate: false,
        operationId: input.operationId,
        previousRevision,
        changedFields
      })
    })
  }

  private async requireProject(scope: StoryScope, projectId: string) {
    validateScope(scope)
    return requireProject(this.projects, scope, projectId)
  }
}

function buildProjectPatch(
  input: UpdateStoryProjectInput
): Partial<StoryProject> {
  const patch: Partial<StoryProject> = {}
  if (input.title !== undefined) {
    patch.title = requiredText(input.title, 'Story project title is required.')
  }
  if (input.description !== undefined) {
    patch.description = optionalText(input.description)
  }
  if (input.premise !== undefined) {
    patch.premise = optionalText(input.premise)
  }
  if (input.productionFormat !== undefined) {
    patch.productionFormat = input.productionFormat
  }
  if (input.aspectRatio !== undefined) {
    patch.aspectRatio = input.aspectRatio
  }
  if (input.targetDurationSeconds !== undefined) {
    patch.targetDurationSeconds =
      input.targetDurationSeconds === null
        ? null
        : input.targetDurationSeconds
  }
  if (input.tags !== undefined) {
    patch.tags = normalizeTags(input.tags)
  }
  return patch
}

async function duplicateMutation(
  manager: EntityManager,
  scope: StoryScope,
  projectId: string,
  operationId: string,
  operationFingerprint: string
): Promise<StoryProjectMutationResult | null> {
  const log = await manager.getRepository(StoryActionLog).findOne({
    where: actionLogWhere(scope, { operationId })
  })
  if (!log) {
    return null
  }
  if (log.projectId !== projectId) {
    throw new ConflictException({
      errorCode: 'story_operation_id_conflict',
      message: 'operationId is already associated with another project.'
    })
  }
  assertOperationFingerprint(
    log.operationFingerprint,
    operationFingerprint
  )
  const project = await requireProject(
    manager.getRepository(StoryProject),
    scope,
    projectId
  )
  return mutationResult(project, {
    duplicate: true,
    operationId,
    previousRevision: log.previousRevision ?? null,
    changedFields: log.changedFields ?? []
  })
}

async function writeLog(
  manager: EntityManager,
  scope: StoryScope,
  input: {
    project: StoryProject
    operationId: string
    operationFingerprint: string
    action: StoryProjectAction
    changeSummary: string
    previousRevision: number | null
    changedFields: string[]
    failureCode?: string
    recoverable?: boolean
  }
) {
  const repository = manager.getRepository(StoryActionLog)
  await repository.save(
    repository.create({
      ...scopeCreate(scope),
      projectId: input.project.id,
      operationId: input.operationId,
      operationFingerprint: input.operationFingerprint,
      action: input.action,
      ...storyActor(scope),
      changeSummary: requiredText(
        input.changeSummary,
        'Change summary is required.'
      ),
      previousRevision: input.previousRevision ?? null,
      resultingRevision: input.project.revision,
      changedFields: input.changedFields,
      failureCode: optionalText(input.failureCode),
      recoverable: input.recoverable ?? null
    })
  )
}

async function requireProject(
  repository: Repository<StoryProject>,
  scope: StoryScope,
  projectId: string
) {
  const id = requiredText(projectId, 'Story project id is required.')
  const project = await repository.findOne({
    where: projectWhere(scope, { id })
  })
  if (!project) {
    throw new NotFoundException({
      errorCode: 'story_project_not_found',
      message: 'Story project was not found.'
    })
  }
  return project
}

async function currentRevision(
  manager: EntityManager,
  scope: StoryScope,
  projectId: string
) {
  const project = await manager.getRepository(StoryProject).findOne({
    where: projectWhere(scope, { id: projectId })
  })
  return project?.revision ?? 0
}

function assertRevision(project: StoryProject, baseRevision: number) {
  if (project.revision !== baseRevision) {
    throw revisionConflict(project.revision)
  }
}

function revisionConflict(currentRevision: number) {
  return new ConflictException({
    errorCode: 'story_revision_conflict',
    message: `Story project changed. Current revision is ${currentRevision}. Re-read only affected content when needed, then retry with that revision.`,
    currentRevision
  })
}

function assertOperationFingerprint(
  stored: string,
  requested: string
) {
  if (stored !== requested) {
    throw new ConflictException({
      errorCode: 'story_operation_payload_conflict',
      message:
        'operationId was already used with a different mutation payload.'
    })
  }
}

function assertStatusTransition(
  current: StoryProjectStatus,
  next: StoryProjectStatus
) {
  if (current === next) {
    throw new BadRequestException({
      errorCode: 'story_status_unchanged',
      message: `Story project is already ${next}.`
    })
  }
  if (!STATUS_TRANSITIONS[current].includes(next)) {
    throw new BadRequestException({
      errorCode: 'story_status_transition_invalid',
      message: `Cannot move a Story project from ${current} to ${next}.`,
      currentStatus: current,
      requestedStatus: next
    })
  }
}

function mutationResult(
  project: StoryProject,
  input: {
    duplicate: boolean
    operationId: string
    previousRevision: number | null
    changedFields: string[]
  }
): StoryProjectMutationResult {
  const receipt: StoryMutationReceipt = {
    success: true,
    duplicate: input.duplicate,
    operationId: input.operationId,
    projectId: project.id,
    previousRevision: input.previousRevision,
    revision: project.revision,
    status: project.status,
    changedFields: input.changedFields,
    nextAction:
      project.status === 'draft'
        ? 'Review the project brief, then explicitly move it to planning.'
        : nextActionForStatus(project.status)
  }
  return {
    project: toProjectSummary(project),
    receipt
  }
}

export function toProjectSummary(project: StoryProject): StoryProjectSummary {
  return {
    id: project.id,
    title: project.title,
    description: project.description ?? null,
    premise: project.premise ?? null,
    productionFormat: project.productionFormat,
    aspectRatio: project.aspectRatio,
    targetDurationSeconds: project.targetDurationSeconds ?? null,
    status: project.status,
    revision: project.revision,
    preferredVideoGeneratorToolsetId:
      project.preferredVideoGeneratorToolsetId ?? null,
    preferredVideoGeneratorFamily:
      project.preferredVideoGeneratorFamily ?? null,
    tags: project.tags ?? [],
    failureCode: project.failureCode ?? null,
    failureMessage: project.failureMessage ?? null,
    failureRecoverable: project.failureRecoverable ?? null,
    createdAt: project.createdAt?.toISOString() ?? null,
    updatedAt: project.updatedAt?.toISOString() ?? null,
    counts: {
      sources: project.sourceCount ?? 0,
      events: project.eventCount ?? 0,
      episodes: project.episodeCount ?? 0,
      assets: project.assetCount ?? 0,
      shots: project.shotCount ?? 0,
      candidates: project.candidateCount ?? 0
    },
    availableReads: [
      'story_get_project_summary',
      'story_get_project_revision',
      'story_search_projects'
    ],
    nextAction: nextActionForStatus(project.status)
  }
}

function nextActionForStatus(status: StoryProjectStatus) {
  switch (status) {
    case 'draft':
      return 'Review the brief and move the project to planning.'
    case 'planning':
      return 'Import source material and build a reviewed adaptation plan.'
    case 'production':
      return 'Build assets, shots, storyboards, and media candidates.'
    case 'review':
      return 'Review selected media and prepare the editing handoff.'
    case 'completed':
      return 'Keep the completed project available for review or archive it.'
    case 'failed':
      return 'Inspect the failure, correct the input, and resume from draft or planning.'
    case 'archived':
      return 'Restore the project to draft only when work must resume.'
  }
}

function projectWhere(
  scope: StoryScope,
  extra: FindOptionsWhere<StoryProject> = {}
): FindOptionsWhere<StoryProject> {
  const where: FindOptionsWhere<StoryProject> = {
    tenantId: requiredText(scope.tenantId, 'Tenant scope is required.'),
    scopeKey: buildStoryScopeKey(scope)
  }
  return {
    ...where,
    ...extra
  }
}

function actionLogWhere(
  scope: StoryScope,
  extra: FindOptionsWhere<StoryActionLog> = {}
): FindOptionsWhere<StoryActionLog> {
  const where: FindOptionsWhere<StoryActionLog> = {
    tenantId: requiredText(scope.tenantId, 'Tenant scope is required.'),
    scopeKey: buildStoryScopeKey(scope)
  }
  return {
    ...where,
    ...extra
  }
}

function scopeCreate(scope: StoryScope) {
  return {
    tenantId: requiredText(scope.tenantId, 'Tenant scope is required.'),
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    hostProjectId: scope.hostProjectId ?? null,
    scopeKey: buildStoryScopeKey(scope)
  }
}

function validateScope(scope: StoryScope) {
  requiredText(scope.tenantId, 'Tenant scope is required.')
}

export function buildStoryScopeKey(scope: StoryScope) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        normalizedScopeValue(scope.organizationId),
        normalizedScopeValue(scope.hostProjectId),
        normalizedScopeValue(scope.workspaceId)
      ])
    )
    .digest('hex')
}

function operationFingerprint(
  action: StoryProjectAction,
  input: object
) {
  return createHash('sha256')
    .update(canonicalJson({ action, input }))
    .digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, field]) =>
          `${JSON.stringify(key)}:${canonicalJson(field)}`
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizedScopeValue(value?: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function requiredText(value: string, message: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new BadRequestException({
      errorCode: 'story_required_text_missing',
      message
    })
  }
  return normalized
}

function optionalText(value?: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeTags(tags?: string[]) {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))]
}
