import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import type { WorkspaceRuntimeFileBuffer } from '@xpert-ai/plugin-sdk'
import type { FindOptionsWhere, Repository } from 'typeorm'
import {
  StoryActionLog,
  StoryProduction,
  StoryProject
} from './entities/index.js'
import type {
  AttachGeneratedVideoInput,
  StoryJsonObject,
  StoryMediaCandidate,
  StoryScene
} from './production-types.js'
import { buildStoryScopeKey } from './story-studio.service.js'
import type { StoryScope } from './types.js'

const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024
const COMPLETED_PROVIDER_STATUSES = new Set([
  'completed',
  'done',
  'succeeded',
  'success'
])

@Injectable()
export class StoryGeneratedMediaService {
  constructor(
    @InjectRepository(StoryProject)
    private readonly projects: Repository<StoryProject>,
    @InjectRepository(StoryProduction)
    private readonly productions: Repository<StoryProduction>,
    @InjectRepository(StoryActionLog)
    private readonly logs: Repository<StoryActionLog>
  ) {}

  async attachGeneratedVideo(
    scope: StoryScope,
    input: AttachGeneratedVideoInput,
    file: WorkspaceRuntimeFileBuffer
  ) {
    validateScope(scope)
    validateGeneratedVideo(scope, input, file)
    const sha256 = createHash('sha256').update(file.buffer).digest('hex')
    const operationFingerprint = checksumOf({
      projectId: input.projectId,
      operationId: input.operationId,
      baseRevision: input.baseRevision,
      sceneId: input.sceneId,
      shotId: input.shotId,
      candidateId: input.candidateId,
      label: input.label,
      prompt: input.prompt ?? null,
      providerReceipt: input.providerReceipt,
      select: input.select ?? true,
      fileReference: file.reference,
      sha256,
      changeSummary: input.changeSummary
    })

    return this.projects.manager.transaction(async (manager) => {
      const projectRepository = manager.getRepository(StoryProject)
      const productionRepository = manager.getRepository(StoryProduction)
      const logRepository = manager.getRepository(StoryActionLog)
      const previousLog = await logRepository.findOne({
        where: scopedWhere<StoryActionLog>(scope, {
          operationId: input.operationId
        })
      })
      if (previousLog) {
        if (
          previousLog.projectId !== input.projectId ||
          previousLog.operationFingerprint !== operationFingerprint
        ) {
          throw operationConflict()
        }
        return {
          success: true,
          duplicate: true,
          projectId: input.projectId,
          revision: previousLog.resultingRevision,
          sceneId: input.sceneId,
          shotId: input.shotId,
          candidate: compactCandidate(
            buildCandidate(input, file, sha256)
          )
        }
      }

      const project = await requireProject(
        projectRepository,
        scope,
        input.projectId
      )
      assertRevision(project, input.baseRevision)
      const production = await productionRepository.findOne({
        where: scopedWhere<StoryProduction>(scope, {
          projectId: input.projectId
        })
      })
      if (!production) {
        throw new BadRequestException(
          'Save a Story Studio production plan before attaching generated media.'
        )
      }
      if (production.projectRevision > project.revision) {
        throw new ConflictException(
          'The production plan revision is ahead of the project. Refresh it before attaching generated media.'
        )
      }

      const duplicateCandidate = findCandidate(
        production.scenes,
        input.candidateId
      )
      if (duplicateCandidate) {
        throw new ConflictException({
          errorCode: 'story_media_candidate_conflict',
          message:
            'candidateId already exists. Use a new candidateId or retry with the original operationId.'
        })
      }

      const candidate = buildCandidate(input, file, sha256)
      const nextScenes = attachToShot(
        production.scenes,
        input.sceneId,
        input.shotId,
        candidate,
        input.select ?? true
      )
      const nextRevision = project.revision + 1
      const updated = await projectRepository.update(
        scopedWhere<StoryProject>(scope, {
          id: project.id,
          revision: input.baseRevision
        }),
        {
          revision: nextRevision,
          candidateCount: project.candidateCount + 1,
          lastEditedById: scope.userId ?? scope.assistantId ?? null,
          lastEditedAt: new Date()
        }
      )
      if (updated.affected !== 1) {
        const latest = await requireProject(
          projectRepository,
          scope,
          input.projectId
        )
        throw revisionConflict(latest.revision)
      }

      production.projectRevision = nextRevision
      production.documentRevision += 1
      production.scenes = nextScenes
      production.operationId = input.operationId
      production.inputChecksum = checksumOf(nextScenes)
      production.changeSummary = input.changeSummary
      production.lastEditedById =
        scope.userId ?? scope.assistantId ?? null
      await productionRepository.save(production)
      await logRepository.save(
        logRepository.create({
          ...scopeCreate(scope),
          projectId: project.id,
          operationId: input.operationId,
          operationFingerprint,
          action: 'generated_video_attached',
          actorType: scope.assistantId
            ? 'agent'
            : scope.userId
              ? 'user'
              : 'system',
          actorId: scope.userId ?? scope.assistantId ?? null,
          changeSummary: input.changeSummary,
          previousRevision: project.revision,
          resultingRevision: nextRevision,
          changedFields: [
            `production.scenes.${input.sceneId}.shots.${input.shotId}.candidates`
          ]
        })
      )

      return {
        success: true,
        duplicate: false,
        projectId: project.id,
        revision: nextRevision,
        sceneId: input.sceneId,
        shotId: input.shotId,
        candidate: compactCandidate(candidate)
      }
    })
  }
}

function buildCandidate(
  input: AttachGeneratedVideoInput,
  file: WorkspaceRuntimeFileBuffer,
  sha256: string
): StoryMediaCandidate {
  return {
    id: input.candidateId,
    kind: 'video',
    label: input.label,
    selected: input.select ?? true,
    ...(file.fileUrl ? { fileUrl: file.fileUrl } : {}),
    workspacePath: file.reference.workspacePath,
    ...(input.prompt ? { prompt: input.prompt } : {}),
    providerReceipt: {
      provider: input.providerReceipt.provider,
      taskId: input.providerReceipt.taskId,
      ...(input.providerReceipt.model
        ? { model: input.providerReceipt.model }
        : {}),
      status: input.providerReceipt.status
    },
    originalName:
      file.reference.originalName ??
      file.reference.name ??
      file.name ??
      `${input.candidateId}.mp4`,
    mimeType: 'video/mp4',
    size: file.buffer.length,
    sha256,
    fileReference:
      file.reference as unknown as StoryMediaCandidate['fileReference']
  }
}

function attachToShot(
  scenes: StoryScene[],
  sceneId: string,
  shotId: string,
  candidate: StoryMediaCandidate,
  select: boolean
) {
  let foundScene = false
  let foundShot = false
  const updated = scenes.map((scene) => {
    if (scene.id !== sceneId) return scene
    foundScene = true
    return {
      ...scene,
      shots: scene.shots.map((shot) => {
        if (shot.id !== shotId) return shot
        foundShot = true
        const candidates = (shot.candidates ?? []).map((existing) =>
          select &&
          (existing.kind === 'image' || existing.kind === 'video')
            ? { ...existing, selected: false }
            : existing
        )
        return {
          ...shot,
          candidates: [...candidates, candidate]
        }
      })
    }
  })
  if (!foundScene) {
    throw new NotFoundException('Story production scene was not found.')
  }
  if (!foundShot) {
    throw new NotFoundException(
      'Story production shot was not found in the requested scene.'
    )
  }
  return updated
}

function findCandidate(scenes: StoryScene[], candidateId: string) {
  return scenes
    .flatMap((scene) => scene.shots)
    .flatMap((shot) => shot.candidates ?? [])
    .find((candidate) => candidate.id === candidateId)
}

function compactCandidate(candidate: StoryMediaCandidate) {
  return {
    id: candidate.id,
    kind: candidate.kind,
    label: candidate.label,
    selected: candidate.selected === true,
    workspacePath: candidate.workspacePath,
    fileUrl: candidate.fileUrl,
    mimeType: candidate.mimeType,
    size: candidate.size,
    sha256: candidate.sha256,
    providerReceipt: candidate.providerReceipt
  }
}

function validateGeneratedVideo(
  scope: StoryScope,
  input: AttachGeneratedVideoInput,
  file: WorkspaceRuntimeFileBuffer
) {
  const status = input.providerReceipt.status.trim().toLowerCase()
  if (!COMPLETED_PROVIDER_STATUSES.has(status)) {
    throw new BadRequestException(
      'Only a completed Seedance task can be attached as generated video.'
    )
  }
  if (
    file.reference.source !== 'platform.workspace.files' ||
    (file.reference.tenantId &&
      file.reference.tenantId !== scope.tenantId)
  ) {
    throw new BadRequestException(
      'Generated video is outside the current Story Studio workspace scope.'
    )
  }
  if (!file.buffer.length || file.buffer.length > MAX_VIDEO_BYTES) {
    throw new BadRequestException(
      'Generated video must be between 1 byte and 2 GiB.'
    )
  }
  const declaredMimeType =
    file.mimeType ?? file.reference.mimeType ?? ''
  const fileName = (
    file.reference.originalName ??
    file.reference.name ??
    file.name
  ).toLowerCase()
  const mp4Header =
    file.buffer.length >= 12 &&
    file.buffer.subarray(4, 8).toString('ascii') === 'ftyp'
  if (
    (declaredMimeType &&
      declaredMimeType !== 'video/mp4' &&
      declaredMimeType !== 'application/octet-stream') ||
    (!fileName.endsWith('.mp4') && !mp4Header)
  ) {
    throw new BadRequestException(
      'Seedance output must be an MP4 Workspace file.'
    )
  }
}

async function requireProject(
  repository: Repository<StoryProject>,
  scope: StoryScope,
  projectId: string
) {
  const project = await repository.findOne({
    where: scopedWhere<StoryProject>(scope, { id: projectId })
  })
  if (!project) {
    throw new NotFoundException('Story project was not found.')
  }
  return project
}

function scopedWhere<T>(
  scope: StoryScope,
  extra: FindOptionsWhere<T>
): FindOptionsWhere<T> {
  return {
    tenantId: scope.tenantId,
    scopeKey: buildStoryScopeKey(scope),
    ...extra
  } as FindOptionsWhere<T>
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

function assertRevision(project: StoryProject, expected: number) {
  if (project.revision !== expected) {
    throw revisionConflict(project.revision)
  }
}

function revisionConflict(currentRevision: number) {
  return new ConflictException({
    errorCode: 'story_revision_conflict',
    message: 'Story project changed. Refresh the project and retry.',
    currentRevision
  })
}

function operationConflict() {
  return new ConflictException({
    errorCode: 'story_operation_payload_conflict',
    message: 'operationId was already used with a different payload.'
  })
}

function validateScope(scope: StoryScope) {
  if (!scope.tenantId?.trim()) {
    throw new BadRequestException('Tenant scope is required.')
  }
}

function checksumOf(value: unknown) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
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
