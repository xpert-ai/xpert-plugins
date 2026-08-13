import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { FindOptionsWhere, Repository } from 'typeorm'
import {
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry,
  type WorkspacePortableFileReference,
  type WorkspaceFilesApi,
  type WorkspaceRuntimeFileBuffer
} from '@xpert-ai/plugin-sdk'
import {
  StoryActionLog,
  StoryProduction,
  StoryProject
} from './entities/index.js'
import type {
  AttachAssetImageInput,
  AttachShotReferenceImageInput,
  GetStoryProductionInput,
  SaveStoryProductionInput,
  StartStoryProductionInput,
  StoryMediaCandidate,
  StoryAssetReference,
  StoryProductionDocument,
  StoryProductionSummary,
  UploadStoryVoiceReferenceInput,
  UpsertStoryProductionSceneInput,
  UpsertStoryProductionShotInput
} from './production-types.js'
import { uploadStoryDemoAssets } from './story-demo-assets.js'
import { storyActor } from './story-actor.js'
import { createStoryDemoProduction } from './story-demo-case.js'
import {
  applyProductionSceneUpsert,
  applyProductionShotUpsert,
  buildStartedProduction,
  productionPatchReceipt
} from './story-production-partial.js'
import {
  mergeWorkbenchProductionMedia,
  sanitizeAssets,
  sanitizeScenes
} from './story-production-media.js'
import { buildStoryScopeKey } from './story-studio.service.js'
import type { StoryScope } from './types.js'

const MAX_ASSET_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_VOICE_REFERENCE_BYTES = 20 * 1024 * 1024
const COMPLETED_IMAGE_STATUSES = new Set([
  'completed',
  'done',
  'succeeded',
  'success'
])

@Injectable()
export class StoryProductionService {
  constructor(
    @InjectRepository(StoryProject)
    private readonly projects: Repository<StoryProject>,
    @InjectRepository(StoryProduction)
    private readonly productions: Repository<StoryProduction>,
    @InjectRepository(StoryActionLog)
    private readonly logs: Repository<StoryActionLog>,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly capabilities?: RuntimeCapabilityRegistry
  ) {}

  async saveProduction(scope: StoryScope, input: SaveStoryProductionInput) {
    validateScope(scope)
    const checksum = checksumOf(input.production)
    const operationFingerprint = input.operationFingerprint ?? checksumOf(input)
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
        const current = await productionRepository.findOne({
          where: scopedWhere<StoryProduction>(scope, {
            projectId: input.projectId
          })
        })
        if (!current) {
          throw new ConflictException(
            'The idempotent production record is missing.'
          )
        }
        return {
          success: true,
          duplicate: true,
          projectId: input.projectId,
          revision: current.projectRevision,
          originalRevision: previousLog.resultingRevision,
          production: compactProduction(current)
        }
      }

      const project = await requireProject(
        projectRepository,
        scope,
        input.projectId
      )
      assertRevision(project, input.baseRevision)
      const existing = await productionRepository.findOne({
        where: scopedWhere<StoryProduction>(scope, {
          projectId: input.projectId
        })
      })
      const nextRevision = project.revision + 1
      const productionCounts = countProduction(input.production)
      const updated = await projectRepository.update(
        scopedWhere<StoryProject>(scope, {
          id: project.id,
          revision: input.baseRevision
        }),
        {
          revision: nextRevision,
          sourceCount: productionCounts.sources,
          eventCount: productionCounts.beats,
          episodeCount: productionCounts.episodes,
          assetCount: productionCounts.assets,
          shotCount: productionCounts.shots,
          candidateCount: productionCounts.candidates,
          lastEditedById: storyActor(scope).actorId,
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

      const row = await productionRepository.save(
        productionRepository.create({
          ...(existing ?? {}),
          ...scopeCreate(scope),
          projectId: project.id,
          projectRevision: nextRevision,
          documentRevision: (existing?.documentRevision ?? 0) + 1,
          sourceSynopsis: input.production.sourceSynopsis,
          adaptationGoal: input.production.adaptationGoal,
          visualStyle: input.production.visualStyle,
          audience: input.production.audience ?? null,
          sourceMaterials: input.production.sourceMaterials ?? [],
          storyPlan: input.production.storyPlan ?? null,
          episodes: input.production.episodes ?? [],
          assets: input.production.assets ?? [],
          scenes: [...input.production.scenes].sort(
            (left, right) => left.order - right.order
          ),
          operationId: input.operationId,
          inputChecksum: checksum,
          changeSummary: input.changeSummary,
          lastEditedById: storyActor(scope).actorId
        })
      )
      await logRepository.save(
        logRepository.create({
          ...scopeCreate(scope),
          projectId: project.id,
          operationId: input.operationId,
          operationFingerprint,
          action: 'production_saved',
          ...storyActor(scope),
          changeSummary: input.changeSummary,
          previousRevision: project.revision,
          resultingRevision: nextRevision,
          changedFields: ['production']
        })
      )
      return {
        success: true,
        duplicate: false,
        projectId: project.id,
        revision: nextRevision,
        production: compactProduction(row)
      }
    })
  }

  async saveProductionFromWorkbench(
    scope: StoryScope,
    input: SaveStoryProductionInput
  ) {
    validateScope(scope)
    const existing = await this.productions.findOne({
      where: scopedWhere<StoryProduction>(scope, {
        projectId: input.projectId
      })
    })
    return this.saveProduction(scope, {
      ...input,
      production: existing
        ? mergeWorkbenchProductionMedia(
            input.production,
            productionDocumentFromRow(existing)
          )
        : input.production
    })
  }

  async getProduction(scope: StoryScope, input: GetStoryProductionInput) {
    await requireProject(this.projects, scope, input.projectId)
    const row = await this.productions.findOne({
      where: scopedWhere<StoryProduction>(scope, {
        projectId: input.projectId
      })
    })
    if (!row) {
      throw new NotFoundException({
        errorCode: 'story_production_not_found',
        message: 'No production plan has been saved for this project.'
      })
    }
    return compactProduction(row)
  }

  async startProduction(scope: StoryScope, input: StartStoryProductionInput) {
    validateScope(scope)
    const existing = await this.productions.findOne({
      where: scopedWhere<StoryProduction>(scope, {
        projectId: input.projectId
      })
    })
    if (existing) {
      const previousLog = await this.logs.findOne({
        where: scopedWhere<StoryActionLog>(scope, {
          operationId: input.operationId
        })
      })
      if (!previousLog) {
        throw new ConflictException({
          errorCode: 'story_production_already_exists',
          message:
            'A production plan already exists. Continue with one bounded production mutation.',
          currentRevision: existing.projectRevision,
          nextAction: 'story_get_production_context',
          availableMutations: [
            'story_update_production_brief',
            'story_upsert_production_character',
            'story_upsert_production_episode',
            'story_upsert_production_asset',
            'story_upsert_production_scene',
            'story_upsert_production_shot'
          ]
        })
      }
    }
    const saved = await this.saveProduction(scope, {
      projectId: input.projectId,
      operationId: input.operationId,
      baseRevision: input.baseRevision,
      production: buildStartedProduction(input),
      changeSummary: input.changeSummary
    })
    return productionPatchReceipt(
      saved,
      {
        sceneId: input.firstScene.id,
        shotIds: input.firstScene.shots.map((shot) => shot.id)
      },
      input.operationId
    )
  }

  async upsertScene(scope: StoryScope, input: UpsertStoryProductionSceneInput) {
    validateScope(scope)
    const row = await requireProduction(
      this.productions,
      scope,
      input.projectId,
      'Save a Story Studio production plan before upserting scenes.'
    )
    const current = productionDocumentFromRow(row)
    const { production, target } = applyProductionSceneUpsert(current, input)
    const saved = await this.saveProduction(scope, {
      projectId: input.projectId,
      operationId: input.operationId,
      baseRevision: input.baseRevision,
      production,
      changeSummary: input.changeSummary
    })
    return productionPatchReceipt(saved, target, input.operationId)
  }

  async upsertShot(
    scope: StoryScope,
    input: UpsertStoryProductionShotInput & { baseRevision: number }
  ) {
    validateScope(scope)
    const row = await requireProduction(
      this.productions,
      scope,
      input.projectId,
      'Save a Story Studio production plan before upserting shots.'
    )
    const current = productionDocumentFromRow(row)
    const { production, target } = applyProductionShotUpsert(current, input)
    const saved = await this.saveProduction(scope, {
      projectId: input.projectId,
      operationId: input.operationId,
      baseRevision: input.baseRevision,
      production,
      changeSummary: input.changeSummary
    })
    return productionPatchReceipt(saved, target, input.operationId)
  }

  async resolveMediaCandidateFile(
    scope: StoryScope,
    projectId: string,
    candidateId: string
  ) {
    await requireProject(this.projects, scope, projectId)
    const row = await this.productions.findOne({
      where: scopedWhere<StoryProduction>(scope, { projectId })
    })
    const candidate = row
      ? [
          ...(row.assets ?? []).flatMap((asset) => asset.candidates ?? []),
          ...row.scenes.flatMap((scene) =>
            scene.shots.flatMap((shot) => shot.candidates ?? [])
          )
        ].find((item) => item.id === candidateId)
      : null
    if (!candidate?.fileReference) {
      throw new NotFoundException(
        'Story Studio media was not found in the current project.'
      )
    }
    const mimeType =
      candidate.mimeType ?? defaultCandidateMimeType(candidate.kind)
    return {
      reference:
        candidate.fileReference as unknown as WorkspacePortableFileReference,
      fileName:
        candidate.originalName ??
        candidate.fileReference.originalName ??
        candidate.fileReference.name ??
        `${candidate.id}.${defaultCandidateExtension(candidate.kind)}`,
      mimeType,
      ...(candidate.size ? { size: candidate.size } : {})
    }
  }

  async uploadAssetImage(
    scope: StoryScope,
    input: AttachAssetImageInput,
    file: {
      buffer: Buffer
      originalName: string
      mimeType: string
    }
  ) {
    const project = await requireProject(this.projects, scope, input.projectId)
    assertRevision(project, input.baseRevision)
    const mimeType = normalizeAssetImageMimeType(
      file.mimeType,
      file.originalName,
      file.buffer
    )
    validateAssetImageBuffer(file.buffer)
    const extension = extensionForImageMimeType(mimeType)
    const fileName = `${input.candidateId}.${extension}`
    const written = await this.workspaceFiles().writeRuntimeBuffer({
      ...assetImageDestination(project, scope),
      folder: `story-studio/${project.id}/asset-bible`,
      fileName,
      originalName: file.originalName || fileName,
      mimeType,
      buffer: file.buffer,
      size: file.buffer.length,
      metadata: {
        pluginName: '@xpert-ai/plugin-story-studio',
        storyProjectId: project.id,
        storyAssetId: input.assetId,
        candidateId: input.candidateId,
        source: 'manual_upload'
      }
    })
    return this.attachAssetImage(scope, input, {
      ...written,
      buffer: file.buffer,
      name: written.name,
      mimeType: written.mimeType ?? mimeType,
      size: written.size ?? file.buffer.length,
      reference: written.reference
    })
  }

  async uploadShotReferenceImage(
    scope: StoryScope,
    input: AttachShotReferenceImageInput,
    file: {
      buffer: Buffer
      originalName: string
      mimeType: string
    }
  ) {
    const project = await requireProject(this.projects, scope, input.projectId)
    assertRevision(project, input.baseRevision)
    const mimeType = normalizeAssetImageMimeType(
      file.mimeType,
      file.originalName,
      file.buffer
    )
    validateAssetImageBuffer(file.buffer)
    const extension = extensionForImageMimeType(mimeType)
    const fileName = `${input.candidateId}.${extension}`
    const written = await this.workspaceFiles().writeRuntimeBuffer({
      ...assetImageDestination(project, scope),
      folder: `story-studio/${project.id}/shot-references`,
      fileName,
      originalName: file.originalName || fileName,
      mimeType,
      buffer: file.buffer,
      size: file.buffer.length,
      metadata: {
        pluginName: '@xpert-ai/plugin-story-studio',
        storyProjectId: project.id,
        storySceneId: input.sceneId,
        storyShotId: input.shotId,
        candidateId: input.candidateId,
        source: 'manual_upload'
      }
    })
    return this.attachShotReferenceImage(scope, input, {
      ...written,
      buffer: file.buffer,
      name: written.name,
      mimeType: written.mimeType ?? mimeType,
      size: written.size ?? file.buffer.length,
      reference: written.reference
    })
  }

  async uploadVoiceReferenceAudio(
    scope: StoryScope,
    input: UploadStoryVoiceReferenceInput,
    file: {
      buffer: Buffer
      originalName: string
      mimeType: string
    }
  ) {
    const project = await requireProject(this.projects, scope, input.projectId)
    const production = await this.productions.findOne({
      where: scopedWhere<StoryProduction>(scope, { projectId: input.projectId })
    })
    if (!production) {
      throw new NotFoundException('Story production was not found.')
    }
    const asset = production.assets?.find((item) => item.id === input.assetId)
    if (!asset || asset.kind !== 'character') {
      throw new NotFoundException('Story character asset was not found.')
    }
    const mimeType = normalizeVoiceReferenceMimeType(
      file.mimeType,
      file.originalName,
      file.buffer
    )
    validateVoiceReferenceBuffer(file.buffer)
    const extension = extensionForVoiceReferenceMimeType(mimeType)
    const fileName = `${input.referenceId}.${extension}`
    const written = await this.workspaceFiles().writeRuntimeBuffer({
      ...assetImageDestination(project, scope),
      folder: `story-studio/${project.id}/voice-references`,
      fileName,
      originalName: file.originalName || fileName,
      mimeType,
      buffer: file.buffer,
      size: file.buffer.length,
      metadata: {
        pluginName: '@xpert-ai/plugin-story-studio',
        storyProjectId: project.id,
        storyAssetId: input.assetId,
        storyCharacterId: asset.id,
        referenceId: input.referenceId,
        source: 'manual_upload'
      }
    })
    const url = written.fileUrl ?? written.url
    if (!url) {
      throw new ServiceUnavailableException(
        'Uploaded voice reference did not receive a playable workspace URL.'
      )
    }
    return {
      projectId: project.id,
      voiceReference: {
        url,
        label: input.label,
        workspacePath: written.reference.workspacePath,
        originalName:
          written.reference.originalName ?? file.originalName ?? fileName,
        mimeType: written.mimeType ?? mimeType,
        size: written.size ?? file.buffer.length
      }
    }
  }

  async attachShotReferenceImage(
    scope: StoryScope,
    input: AttachShotReferenceImageInput,
    file: WorkspaceRuntimeFileBuffer
  ) {
    validateScope(scope)
    validateReferenceImageInput(scope, input, file)
    const project = await requireProject(this.projects, scope, input.projectId)
    const row = await this.productions.findOne({
      where: scopedWhere<StoryProduction>(scope, { projectId: input.projectId })
    })
    if (!row) {
      throw new BadRequestException(
        'Save a Story Studio production plan before attaching a shot reference image.'
      )
    }
    const targetShot = row.scenes
      .find((scene) => scene.id === input.sceneId)
      ?.shots.find((shot) => shot.id === input.shotId)
    const duplicate = targetShot?.candidates?.find(
      (candidate) =>
        candidate.id === input.candidateId &&
        candidate.kind === 'image' &&
        candidate.providerReceipt?.taskId === input.providerReceipt.taskId
    )
    if (duplicate) {
      return {
        success: true,
        duplicate: true,
        projectId: project.id,
        revision: project.revision,
        production: compactProduction(row)
      }
    }
    assertRevision(project, input.baseRevision)
    if (!targetShot) {
      throw new NotFoundException('Story production shot was not found.')
    }
    const allCandidateIds = [
      ...(row.assets ?? []).flatMap((asset) => asset.candidates ?? []),
      ...row.scenes.flatMap((scene) =>
        scene.shots.flatMap((shot) => shot.candidates ?? [])
      )
    ].map((candidate) => candidate.id)
    if (allCandidateIds.includes(input.candidateId)) {
      throw new ConflictException({
        errorCode: 'story_media_candidate_conflict',
        message: 'candidateId already exists. Use a new candidateId.'
      })
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex')
    const mimeType = normalizeAssetImageMimeType(
      file.mimeType ?? file.reference.mimeType ?? '',
      file.reference.originalName ?? file.reference.name ?? file.name,
      file.buffer
    )
    const candidate: StoryMediaCandidate = {
      id: input.candidateId,
      kind: 'image',
      label: input.label,
      selected: true,
      ...(file.fileUrl ? { fileUrl: file.fileUrl } : {}),
      workspacePath: file.reference.workspacePath,
      ...(input.prompt ? { prompt: input.prompt } : {}),
      providerReceipt: input.providerReceipt,
      originalName:
        file.reference.originalName ??
        file.reference.name ??
        file.name ??
        `${input.candidateId}.${extensionForImageMimeType(mimeType)}`,
      mimeType,
      size: file.buffer.length,
      sha256,
      fileReference:
        file.reference as unknown as StoryMediaCandidate['fileReference']
    }
    const scenes = row.scenes.map((scene) => ({
      ...scene,
      shots: scene.shots.map((shot) => {
        if (scene.id !== input.sceneId || shot.id !== input.shotId) return shot
        const candidates = (shot.candidates ?? []).map((item) =>
          item.kind === 'image' ? { ...item, selected: false } : item
        )
        return { ...shot, candidates: [...candidates, candidate] }
      })
    }))
    return this.saveProduction(scope, {
      projectId: input.projectId,
      operationId: input.operationId,
      baseRevision: input.baseRevision,
      production: { ...productionDocumentFromRow(row), scenes },
      changeSummary: input.changeSummary
    })
  }

  async attachAssetImage(
    scope: StoryScope,
    input: AttachAssetImageInput,
    file: WorkspaceRuntimeFileBuffer
  ) {
    validateScope(scope)
    validateReferenceImageInput(scope, input, file)
    const project = await requireProject(this.projects, scope, input.projectId)
    const row = await this.productions.findOne({
      where: scopedWhere<StoryProduction>(scope, {
        projectId: input.projectId
      })
    })
    if (!row) {
      throw new BadRequestException(
        'Save a Story Studio production plan before attaching an asset image.'
      )
    }
    const targetAsset = (row.assets ?? []).find(
      (asset) => asset.id === input.assetId
    )
    if (
      input.assetReference?.type === 'expression' &&
      targetAsset?.kind !== 'character'
    ) {
      throw new BadRequestException(
        'Expression references can only be attached to character assets.'
      )
    }
    const existingTargetCandidate = targetAsset?.candidates?.find(
      (candidate) => candidate.id === input.candidateId
    )
    if (
      existingTargetCandidate?.kind === 'image' &&
      existingTargetCandidate.providerReceipt?.taskId ===
        input.providerReceipt.taskId
    ) {
      return {
        success: true,
        duplicate: true,
        projectId: project.id,
        revision: project.revision,
        production: compactProduction(row)
      }
    }
    assertRevision(project, input.baseRevision)
    const allCandidateIds = [
      ...(row.assets ?? []).flatMap((asset) => asset.candidates ?? []),
      ...row.scenes.flatMap((scene) =>
        scene.shots.flatMap((shot) => shot.candidates ?? [])
      )
    ].map((candidate) => candidate.id)
    if (allCandidateIds.includes(input.candidateId)) {
      throw new ConflictException({
        errorCode: 'story_media_candidate_conflict',
        message:
          'candidateId already exists. Use a new candidateId or retry with the original operationId.'
      })
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex')
    const mimeType = normalizeAssetImageMimeType(
      file.mimeType ?? file.reference.mimeType ?? '',
      file.reference.originalName ?? file.reference.name ?? file.name,
      file.buffer
    )
    const candidate: StoryMediaCandidate = {
      id: input.candidateId,
      kind: 'image',
      label: input.label,
      selected: input.select ?? true,
      ...(input.assetReference ? { assetReference: input.assetReference } : {}),
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
        `${input.candidateId}.${extensionForImageMimeType(mimeType)}`,
      mimeType,
      size: file.buffer.length,
      sha256,
      fileReference:
        file.reference as unknown as StoryMediaCandidate['fileReference']
    }
    let found = false
    const replacementReference = input.replaceReference
      ? input.assetReference
      : undefined
    const assets = (row.assets ?? []).map((asset) => {
      if (asset.id !== input.assetId) return asset
      found = true
      const sourceCandidates = replacementReference
        ? (asset.candidates ?? []).filter(
            (item) =>
              item.kind !== 'image' ||
              !sameAssetReference(item.assetReference, replacementReference)
          )
        : asset.candidates ?? []
      const existing = sourceCandidates.map((item) =>
        input.select !== false && item.kind === 'image'
          ? { ...item, selected: false }
          : item
      )
      return { ...asset, candidates: [...existing, candidate] }
    })
    if (!found) {
      throw new NotFoundException('Story production asset was not found.')
    }
    return this.saveProduction(scope, {
      projectId: input.projectId,
      operationId: input.operationId,
      baseRevision: input.baseRevision,
      production: {
        ...productionDocumentFromRow(row),
        assets
      },
      changeSummary: input.changeSummary
    })
  }

  async createDemoProduction(
    scope: StoryScope,
    input: {
      projectId: string
      baseRevision: number
      operationId: string
      changeSummary: string
    }
  ) {
    const project = await requireProject(this.projects, scope, input.projectId)
    assertRevision(project, input.baseRevision)
    const workspaceFiles = this.workspaceFiles()
    const media = await uploadStoryDemoAssets(workspaceFiles, project, scope)
    return this.saveProduction(scope, {
      projectId: input.projectId,
      operationId: input.operationId,
      baseRevision: input.baseRevision,
      production: createStoryDemoProduction(media),
      changeSummary: input.changeSummary
    })
  }

  private workspaceFiles(): WorkspaceFilesApi {
    const workspaceFiles = this.capabilities?.get(
      WorkspaceFilesRuntimeCapability
    )
    if (!workspaceFiles) {
      throw new ServiceUnavailableException(
        'Platform Workspace Files capability is unavailable.'
      )
    }
    return workspaceFiles
  }
}

async function requireProduction(
  repository: Repository<StoryProduction>,
  scope: StoryScope,
  projectId: string,
  message: string
) {
  const row = await repository.findOne({
    where: scopedWhere<StoryProduction>(scope, { projectId })
  })
  if (!row) {
    throw new BadRequestException({
      errorCode: 'story_production_required',
      message
    })
  }
  return row
}

function validateReferenceImageInput(
  scope: StoryScope,
  input:
    | Pick<AttachAssetImageInput, 'providerReceipt'>
    | Pick<AttachShotReferenceImageInput, 'providerReceipt'>,
  file: WorkspaceRuntimeFileBuffer
) {
  if (
    !COMPLETED_IMAGE_STATUSES.has(
      input.providerReceipt.status.trim().toLowerCase()
    )
  ) {
    throw new BadRequestException(
      'Only a completed image task or upload can be attached.'
    )
  }
  if (
    file.reference.source !== 'platform.workspace.files' ||
    (file.reference.tenantId && file.reference.tenantId !== scope.tenantId)
  ) {
    throw new BadRequestException(
      'Asset image is outside the current Story Studio workspace scope.'
    )
  }
  validateAssetImageBuffer(file.buffer)
  normalizeAssetImageMimeType(
    file.mimeType ?? file.reference.mimeType ?? '',
    file.reference.originalName ?? file.reference.name ?? file.name,
    file.buffer
  )
}

function validateAssetImageBuffer(buffer: Buffer) {
  if (!buffer.length || buffer.length > MAX_ASSET_IMAGE_BYTES) {
    throw new BadRequestException(
      'Asset image must be between 1 byte and 20 MiB.'
    )
  }
}

function validateVoiceReferenceBuffer(buffer: Buffer) {
  if (!buffer.length || buffer.length > MAX_VOICE_REFERENCE_BYTES) {
    throw new BadRequestException(
      'Voice reference audio must be between 1 byte and 20 MiB.'
    )
  }
}

function normalizeVoiceReferenceMimeType(
  declared: string,
  fileName: string,
  buffer: Buffer
) {
  const aliases: Record<string, string> = {
    'audio/mp3': 'audio/mpeg',
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/x-m4a': 'audio/mp4',
    'application/ogg': 'audio/ogg'
  }
  const rawValue = declared.toLowerCase().split(';')[0].trim()
  const value = aliases[rawValue] ?? rawValue
  const lowerName = fileName.toLowerCase()
  const wav =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WAVE'
  const flac =
    buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'fLaC'
  const ogg =
    buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'OggS'
  const mp4 =
    buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp'
  const id3 =
    buffer.length >= 3 && buffer.subarray(0, 3).toString('ascii') === 'ID3'
  const framedAudio =
    buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0
  const detected = wav
    ? 'audio/wav'
    : flac
    ? 'audio/flac'
    : ogg
    ? 'audio/ogg'
    : mp4
    ? 'audio/mp4'
    : id3
    ? 'audio/mpeg'
    : framedAudio && lowerName.endsWith('.aac')
    ? 'audio/aac'
    : framedAudio
    ? 'audio/mpeg'
    : null
  if (!detected) {
    throw new BadRequestException(
      'Voice reference must be a valid MP3, WAV, M4A, AAC, OGG, or FLAC file.'
    )
  }
  if (value && value !== 'application/octet-stream' && value !== detected) {
    throw new BadRequestException(
      'Voice reference content does not match its MIME type.'
    )
  }
  const supportedExtension = [
    '.mp3',
    '.wav',
    '.m4a',
    '.mp4',
    '.aac',
    '.ogg',
    '.flac'
  ].some((extension) => lowerName.endsWith(extension))
  if (!supportedExtension) {
    throw new BadRequestException(
      'Voice reference file name must use .mp3, .wav, .m4a, .mp4, .aac, .ogg, or .flac.'
    )
  }
  return detected
}

function extensionForVoiceReferenceMimeType(mimeType: string) {
  if (mimeType === 'audio/wav') return 'wav'
  if (mimeType === 'audio/mp4') return 'm4a'
  if (mimeType === 'audio/aac') return 'aac'
  if (mimeType === 'audio/ogg') return 'ogg'
  if (mimeType === 'audio/flac') return 'flac'
  return 'mp3'
}

function normalizeAssetImageMimeType(
  declared: string,
  fileName: string,
  buffer: Buffer
) {
  const value = declared.toLowerCase().split(';')[0].trim()
  const lowerName = fileName.toLowerCase()
  const png =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  const webp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  const detected = png
    ? 'image/png'
    : jpeg
    ? 'image/jpeg'
    : webp
    ? 'image/webp'
    : null
  if (!detected) {
    throw new BadRequestException(
      'Asset image must be a valid PNG, JPEG, or WebP file.'
    )
  }
  if (value && value !== 'application/octet-stream' && value !== detected) {
    throw new BadRequestException(
      'Asset image content does not match its MIME type.'
    )
  }
  if (
    !lowerName.endsWith('.png') &&
    !lowerName.endsWith('.jpg') &&
    !lowerName.endsWith('.jpeg') &&
    !lowerName.endsWith('.webp')
  ) {
    throw new BadRequestException(
      'Asset image file name must use .png, .jpg, .jpeg, or .webp.'
    )
  }
  return detected
}

function extensionForImageMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  return 'png'
}

function assetImageDestination(project: StoryProject, scope: StoryScope) {
  if (project.hostProjectId) {
    return {
      tenantId: project.tenantId,
      userId: scope.userId ?? null,
      catalog: 'projects' as const,
      scopeId: project.hostProjectId,
      projectId: project.hostProjectId
    }
  }
  if (!project.assistantId) {
    throw new ServiceUnavailableException(
      'Asset images require a host project or Assistant workspace scope.'
    )
  }
  return {
    tenantId: project.tenantId,
    userId: scope.userId ?? null,
    catalog: 'xperts' as const,
    scopeId: project.assistantId,
    xpertId: project.assistantId,
    isolateByUser: false
  }
}

function compactProduction(row: StoryProduction): StoryProductionSummary {
  const shots = row.scenes.flatMap((scene) => scene.shots)
  const candidates = [
    ...(row.assets ?? []).flatMap((asset) => asset.candidates ?? []),
    ...shots.flatMap((shot) => shot.candidates ?? [])
  ]
  return {
    id: row.id,
    projectId: row.projectId,
    projectRevision: row.projectRevision,
    documentRevision: row.documentRevision,
    sourceSynopsis: row.sourceSynopsis,
    adaptationGoal: row.adaptationGoal,
    visualStyle: row.visualStyle,
    audience: row.audience ?? null,
    sourceMaterials: row.sourceMaterials ?? [],
    storyPlan: row.storyPlan ?? null,
    episodes: row.episodes ?? [],
    assets: sanitizeAssets(row.assets ?? []),
    scenes: sanitizeScenes(row.scenes),
    counts: {
      sources: row.sourceMaterials?.length ?? 0,
      beats: row.storyPlan?.beats.length ?? 0,
      episodes: row.episodes?.length ?? 0,
      assets: row.assets?.length ?? 0,
      characters: (row.assets ?? []).filter(
        (asset) => asset.kind === 'character'
      ).length,
      scenes: row.scenes.length,
      shots: shots.length,
      candidates: candidates.length,
      selectedCandidates: candidates.filter((candidate) => candidate.selected)
        .length
    },
    totalDurationSeconds: totalProductionDuration(
      productionDocumentFromRow(row)
    ),
    updatedAt: row.updatedAt?.toISOString() ?? null
  }
}

function productionDocumentFromRow(
  row: StoryProduction
): StoryProductionDocument {
  return {
    sourceSynopsis: row.sourceSynopsis,
    adaptationGoal: row.adaptationGoal,
    visualStyle: row.visualStyle,
    ...(row.audience ? { audience: row.audience } : {}),
    sourceMaterials: row.sourceMaterials ?? [],
    ...(row.storyPlan ? { storyPlan: row.storyPlan } : {}),
    episodes: row.episodes ?? [],
    assets: row.assets ?? [],
    scenes: row.scenes
  }
}

function defaultCandidateMimeType(kind: 'image' | 'video' | 'audio') {
  if (kind === 'video') return 'video/mp4'
  if (kind === 'audio') return 'audio/mpeg'
  return 'image/png'
}

function defaultCandidateExtension(kind: 'image' | 'video' | 'audio') {
  if (kind === 'video') return 'mp4'
  if (kind === 'audio') return 'mp3'
  return 'png'
}

async function requireProject(
  repository: Repository<StoryProject>,
  scope: StoryScope,
  projectId: string
) {
  validateScope(scope)
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

function sameAssetReference(
  left: StoryAssetReference | undefined,
  right: StoryAssetReference
) {
  if (!left) return false
  if (left.type === 'general' || right.type === 'general') {
    return left.type === 'general' && right.type === 'general'
  }
  if (left.type === 'continuity_view' && right.type === 'continuity_view') {
    return left.key === right.key
  }
  return (
    left.type === 'expression' &&
    right.type === 'expression' &&
    left.key === right.key
  )
}

function countProduction(production: StoryProductionDocument) {
  const shots = production.scenes.flatMap((scene) => scene.shots)
  const assetCandidates = (production.assets ?? []).flatMap(
    (asset) => asset.candidates ?? []
  )
  return {
    sources: production.sourceMaterials?.length ?? 0,
    beats: production.storyPlan?.beats.length ?? 0,
    episodes: production.episodes?.length ?? 0,
    assets: production.assets?.length ?? 0,
    characters: (production.assets ?? []).filter(
      (asset) => asset.kind === 'character'
    ).length,
    scenes: production.scenes.length,
    shots: shots.length,
    candidates:
      assetCandidates.length +
      shots.reduce((total, shot) => total + (shot.candidates?.length ?? 0), 0)
  }
}

function totalProductionDuration(production: StoryProductionDocument) {
  return production.scenes.reduce(
    (total, scene) =>
      total +
      scene.shots.reduce(
        (sceneTotal, shot) => sceneTotal + shot.durationSeconds,
        0
      ),
    0
  )
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
      .map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function assertRevision(project: StoryProject, expected: number) {
  if (project.revision !== expected) {
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
