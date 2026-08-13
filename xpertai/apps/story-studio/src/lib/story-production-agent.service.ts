import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, Repository } from 'typeorm'
import {
  StoryActionLog,
  StoryProduction,
  StoryProject
} from './entities/index.js'
import type {
  GetStoryProductionContextInput,
  InitializeStoryProductionInput,
  StoryAsset,
  StoryProductionDocument,
  UpdateStoryProductionBriefInput,
  UpsertStoryProductionAssetInput,
  UpsertStoryProductionCharacterInput,
  UpsertStoryProductionEpisodeInput,
  UpsertStoryProductionSceneMetadataInput,
  UpsertStoryProductionShotInput,
  ValidateStoryProductionInput
} from './production-types.js'
import {
  applyProductionShotUpsert,
  productionPatchReceipt
} from './story-production-partial.js'
import { StoryProductionService } from './story-production.service.js'
import { StoryProductionMutationSequencer } from './story-production-mutation-sequencer.js'
import { sanitizeAssets, sanitizeScenes } from './story-production-media.js'
import { storyProductionDocumentSchema } from './story-production.schemas.js'
import { buildStoryScopeKey } from './story-studio.service.js'
import type { StoryScope } from './types.js'

type ProductionMutationTarget = {
  entityType:
    | 'production'
    | 'brief'
    | 'character'
    | 'episode'
    | 'asset'
    | 'scene'
    | 'shot'
  entityId?: string
  nextAction: string
}

@Injectable()
export class StoryProductionAgentService {
  private readonly mutations = new StoryProductionMutationSequencer()

  constructor(
    @InjectRepository(StoryProject)
    private readonly projects: Repository<StoryProject>,
    @InjectRepository(StoryProduction)
    private readonly productions: Repository<StoryProduction>,
    @InjectRepository(StoryActionLog)
    private readonly logs: Repository<StoryActionLog>,
    private readonly productionService: StoryProductionService
  ) {}

  async getContext(scope: StoryScope, input: GetStoryProductionContextInput) {
    const project = await this.requireProject(scope, input.projectId)
    assertExpectedRevision(project.revision, input.expectedRevision)
    const row = await this.findProduction(scope, input.projectId)
    if (!row) {
      return {
        projectId: project.id,
        revision: project.revision,
        exists: false,
        documentRevision: null,
        counts: emptyCounts(),
        indexes: {
          characterIds: [],
          episodeIds: [],
          assetIds: [],
          scenes: []
        },
        availableReads: ['story_get_production'],
        availableMutations: ['story_initialize_production'],
        nextAction: 'Initialize the production brief before adding entities.'
      }
    }

    const document = productionDocumentFromRow(row)
    return {
      projectId: project.id,
      revision: project.revision,
      exists: true,
      documentRevision: row.documentRevision,
      counts: countProduction(document),
      indexes: {
        characterIds: characterAssets(document).map((item) => item.id),
        episodeIds: (document.episodes ?? []).map((item) => item.id),
        assetIds: (document.assets ?? []).map((item) => item.id),
        scenes: document.scenes.map((scene) => ({
          id: scene.id,
          shotIds: scene.shots.map((shot) => shot.id)
        }))
      },
      availableReads: ['story_get_production', 'story_validate_production'],
      availableMutations: [
        'story_update_production_brief',
        'story_upsert_production_character',
        'story_upsert_production_episode',
        'story_upsert_production_asset',
        'story_upsert_production_scene',
        'story_upsert_production_shot'
      ],
      nextAction: 'Apply one bounded production mutation using this revision.'
    }
  }

  async initialize(scope: StoryScope, input: InitializeStoryProductionInput) {
    const project = await this.requireProject(scope, input.projectId)
    const existing = await this.findProduction(scope, input.projectId)
    if (existing && existing.operationId !== input.operationId) {
      throw new ConflictException({
        errorCode: 'story_production_already_exists',
        message:
          'A production draft already exists. Continue with one bounded production mutation.',
        currentRevision: project.revision,
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

    const result = await this.productionService.saveProduction(scope, {
      projectId: input.projectId,
      operationId: input.operationId,
      baseRevision: input.baseRevision,
      production: {
        sourceSynopsis: input.sourceSynopsis,
        adaptationGoal: input.adaptationGoal,
        visualStyle: input.visualStyle,
        ...(input.audience ? { audience: input.audience } : {}),
        sourceMaterials: [],
        episodes: [
          {
            id: 'episode-1',
            order: 1,
            title: project.title,
            summary: input.sourceSynopsis,
            script: input.sourceSynopsis,
            ...(project.targetDurationSeconds &&
            project.targetDurationSeconds >= 5 &&
            project.targetDurationSeconds <= 1_800
              ? { targetDurationSeconds: project.targetDurationSeconds }
              : {})
          }
        ],
        assets: [],
        scenes: []
      },
      changeSummary: input.changeSummary
    })
    return mutationReceipt(result, input.operationId, {
      entityType: 'production',
      entityId: 'episode-1',
      nextAction:
        'Update the seeded episode-1 script, or add one character, asset, scene, or shot.'
    })
  }

  async updateBrief(scope: StoryScope, input: UpdateStoryProductionBriefInput) {
    const mutation = await this.mutateDocument(
      scope,
      input,
      () => true,
      (document) => {
        const next: StoryProductionDocument = {
          ...document,
          sourceSynopsis: input.sourceSynopsis ?? document.sourceSynopsis,
          adaptationGoal: input.adaptationGoal ?? document.adaptationGoal,
          visualStyle: input.visualStyle ?? document.visualStyle
        }
        if (input.audience === null) {
          delete next.audience
        } else if (input.audience !== undefined) {
          next.audience = input.audience
        }
        return next
      }
    )
    return mutationReceipt(mutation.result, input.operationId, {
      entityType: 'brief',
      nextAction: 'Continue with one production entity mutation.'
    }, mutation.revision)
  }

  async upsertCharacter(
    scope: StoryScope,
    input: UpsertStoryProductionCharacterInput
  ) {
    const mutation = await this.mutateDocument(
      scope,
      input,
      (document) =>
        (document.assets ?? []).some(
          (asset) => asset.id === input.character.id
        ),
      (document) => {
        const previousAsset = (document.assets ?? []).find(
          (asset) => asset.id === input.character.id
        )
        if (previousAsset && previousAsset.kind !== 'character') {
          throw new ConflictException({
            errorCode: 'story_asset_kind_conflict',
            message: `Asset ${input.character.id} already exists with kind ${previousAsset.kind}.`
          })
        }
        const previous =
          previousAsset?.kind === 'character' ? previousAsset : undefined
        const character: StoryAsset = {
          kind: 'character',
          ...input.character,
          ...(previous?.candidates ? { candidates: previous.candidates } : {}),
          ...(previous?.voiceReference
            ? { voiceReference: previous.voiceReference }
            : {})
        }
        const assets = upsertById(
          document.assets ?? [],
          character,
          160,
          'assets'
        )
        assertCharacterLimit(assets)
        return { ...document, assets }
      }
    )
    return mutationReceipt(mutation.result, input.operationId, {
      entityType: 'character',
      entityId: input.character.id,
      nextAction: 'Add another entity or validate the production.'
    }, mutation.revision)
  }

  async upsertEpisode(
    scope: StoryScope,
    input: UpsertStoryProductionEpisodeInput
  ) {
    const mutation = await this.mutateDocument(
      scope,
      input,
      (document) =>
        (document.episodes ?? []).some(
          (episode) => episode.id === input.episode.id
        ),
      (document) => {
        const episodes = upsertById(
          document.episodes ?? [],
          input.episode,
          100,
          'episodes'
        ).sort((left, right) => left.order - right.order)
        assertUniqueOrder(episodes, 'episode')
        return { ...document, episodes }
      }
    )
    return mutationReceipt(mutation.result, input.operationId, {
      entityType: 'episode',
      entityId: input.episode.id,
      nextAction:
        'Add a scene for this episode or continue with another entity.'
    }, mutation.revision)
  }

  async upsertAsset(scope: StoryScope, input: UpsertStoryProductionAssetInput) {
    const mutation = await this.mutateDocument(
      scope,
      input,
      (document) =>
        (document.assets ?? []).some((asset) => asset.id === input.asset.id),
      (document) => {
        const previous = (document.assets ?? []).find(
          (item) => item.id === input.asset.id
        )
        if (previous?.kind === 'character') {
          throw new ConflictException({
            errorCode: 'story_asset_kind_conflict',
            message:
              'Character assets must be updated with story_upsert_production_character.'
          })
        }
        const asset: StoryAsset = {
          ...input.asset,
          ...(previous?.candidates ? { candidates: previous.candidates } : {})
        }
        const assets = upsertById(
          document.assets ?? [],
          asset,
          160,
          'assets'
        )
        return { ...document, assets }
      }
    )
    return mutationReceipt(mutation.result, input.operationId, {
      entityType: 'asset',
      entityId: input.asset.id,
      nextAction: 'Add another entity or validate the production.'
    }, mutation.revision)
  }

  async upsertSceneMetadata(
    scope: StoryScope,
    input: UpsertStoryProductionSceneMetadataInput
  ) {
    const mutation = await this.mutateDocument(
      scope,
      input,
      (document) =>
        document.scenes.some((scene) => scene.id === input.scene.id),
      (document) => {
        const previous = document.scenes.find(
          (item) => item.id === input.scene.id
        )
        const episodeId =
          input.scene.episodeId === undefined
            ? previous?.episodeId
            : input.scene.episodeId
        const location =
          input.scene.location === undefined
            ? previous?.location
            : input.scene.location
        const timeOfDay =
          input.scene.timeOfDay === undefined
            ? previous?.timeOfDay
            : input.scene.timeOfDay
        const scene = {
          id: input.scene.id,
          order: input.scene.order,
          title: input.scene.title,
          summary: input.scene.summary,
          ...(episodeId ? { episodeId } : {}),
          ...(location ? { location } : {}),
          ...(timeOfDay ? { timeOfDay } : {}),
          shots: previous?.shots ?? []
        }
        const scenes = upsertById(
          document.scenes,
          scene,
          40,
          'scenes'
        ).sort((left, right) => left.order - right.order)
        assertUniqueOrder(scenes, 'scene')
        return { ...document, scenes }
      }
    )
    return mutationReceipt(mutation.result, input.operationId, {
      entityType: 'scene',
      entityId: input.scene.id,
      nextAction:
        'Add one shot to this scene with story_upsert_production_shot.'
    }, mutation.revision)
  }

  async upsertShot(scope: StoryScope, input: UpsertStoryProductionShotInput) {
    const mutation = await this.mutateDocument(
      scope,
      input,
      (document) =>
        Boolean(
          document.scenes
            .find((scene) => scene.id === input.sceneId)
            ?.shots.some((shot) => shot.id === input.shot.id)
        ),
      (document) => applyProductionShotUpsert(document, input).production
    )
    const scene = mutation.result.production.scenes.find(
      (item) => item.id === input.sceneId
    )
    const receipt = productionPatchReceipt(
      mutation.result,
      {
        sceneId: input.sceneId,
        shotId: input.shot.id,
        shotIds: scene?.shots.map((shot) => shot.id) ?? []
      },
      input.operationId
    )
    return { ...receipt, ...mutation.revision }
  }

  async validate(scope: StoryScope, input: ValidateStoryProductionInput) {
    const project = await this.requireProject(scope, input.projectId)
    assertExpectedRevision(project.revision, input.expectedRevision)
    const row = await this.findProduction(scope, input.projectId)
    if (!row) {
      return {
        projectId: project.id,
        revision: project.revision,
        documentRevision: null,
        ready: false,
        issueCount: 1,
        issues: [
          { path: [], message: 'Production draft has not been initialized.' }
        ],
        nextAction: 'story_initialize_production'
      }
    }
    const document = productionDocumentFromRow(row)
    const result = storyProductionDocumentSchema.safeParse({
      ...document,
      assets: sanitizeAssets(document.assets ?? []),
      scenes: sanitizeScenes(document.scenes)
    })
    const issues = result.success
      ? []
      : result.error.issues.slice(0, 40).map((issue) => ({
          path: issue.path,
          message: issue.message
        }))
    return {
      projectId: project.id,
      revision: project.revision,
      documentRevision: row.documentRevision,
      ready: result.success,
      issueCount: result.success ? 0 : result.error.issues.length,
      issues,
      nextAction: result.success
        ? 'The production is structurally ready for storyboard review.'
        : 'Fix the listed entity fields with bounded production mutation tools.'
    }
  }

  private async mutateDocument(
    scope: StoryScope,
    input: {
      projectId: string
      operationId: string
      baseRevision?: number
      changeSummary: string
    },
    targetExists: (production: StoryProductionDocument) => boolean,
    apply: (production: StoryProductionDocument) => StoryProductionDocument
  ) {
    const operationFingerprint = mutationFingerprint(input)
    const mutationKey = [
      scope.tenantId,
      buildStoryScopeKey(scope),
      input.projectId
    ].join(':')
    return this.mutations.run(mutationKey, async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const previousLog = await this.logs.findOne({
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
          const production = await this.productionService.getProduction(scope, {
            projectId: input.projectId
          })
          const appliedOnRevision =
            previousLog.previousRevision ??
            Math.max(0, previousLog.resultingRevision - 1)
          return {
            result: {
              success: true,
              duplicate: true,
              projectId: input.projectId,
              revision: production.projectRevision,
              production
            },
            revision: {
              baseRevision: input.baseRevision ?? null,
              appliedOnRevision,
              revision: production.projectRevision,
              ...(input.baseRevision !== undefined &&
              input.baseRevision !== appliedOnRevision
                ? { rebasedFromRevision: input.baseRevision }
                : {})
            }
          }
        }

        const current = await this.requireProduction(scope, input.projectId)
        const exists = targetExists(current.document)
        assertMutationRevision(
          current.project.revision,
          input.baseRevision,
          exists
        )
        const production = apply(current.document)
        if (totalDuration(production) > 300) {
          throw new BadRequestException({
            errorCode: 'story_production_duration_exceeded',
            message:
              'Total shot duration must not exceed 300 seconds while drafting.'
          })
        }
        try {
          const result = await this.productionService.saveProduction(scope, {
            ...input,
            baseRevision: current.project.revision,
            operationFingerprint,
            production
          })
          return {
            result,
            revision: {
              baseRevision: input.baseRevision ?? null,
              appliedOnRevision: current.project.revision,
              revision: result.revision,
              ...(input.baseRevision !== undefined &&
              input.baseRevision !== current.project.revision
                ? { rebasedFromRevision: input.baseRevision }
                : {})
            }
          }
        } catch (error) {
          if (attempt === 0 && !exists && isRevisionConflict(error)) continue
          throw error
        }
      }
      throw new ConflictException({
        errorCode: 'story_revision_conflict',
        message:
          'Story project changed again during the single safe rebase attempt.',
        nextAction: 'Retry this one bounded mutation.'
      })
    })
  }

  private async requireProject(scope: StoryScope, projectId: string) {
    validateScope(scope)
    const project = await this.projects.findOne({
      where: scopedWhere<StoryProject>(scope, { id: projectId })
    })
    if (!project) throw new NotFoundException('Story project was not found.')
    return project
  }

  private findProduction(scope: StoryScope, projectId: string) {
    validateScope(scope)
    return this.productions.findOne({
      where: scopedWhere<StoryProduction>(scope, { projectId })
    })
  }

  private async requireProduction(scope: StoryScope, projectId: string) {
    const project = await this.requireProject(scope, projectId)
    const row = await this.findProduction(scope, projectId)
    if (!row) {
      throw new NotFoundException({
        errorCode: 'story_production_not_found',
        message: 'Initialize the production draft before adding entities.',
        currentRevision: project.revision,
        nextAction: 'story_initialize_production'
      })
    }
    return { project, row, document: productionDocumentFromRow(row) }
  }
}

function mutationReceipt(
  result: Awaited<ReturnType<StoryProductionService['saveProduction']>>,
  operationId: string,
  target: ProductionMutationTarget,
  revision?: {
    baseRevision: number | null
    appliedOnRevision: number
    revision: number
    rebasedFromRevision?: number
  }
) {
  return {
    success: result.success,
    duplicate: result.duplicate,
    operationId,
    projectId: result.projectId,
    revision: result.revision,
    documentRevision: result.production.documentRevision,
    changedEntityType: target.entityType,
    ...(target.entityId ? { changedEntityId: target.entityId } : {}),
    counts: result.production.counts,
    totalDurationSeconds: result.production.totalDurationSeconds,
    ...(revision ?? {}),
    nextAction: target.nextAction
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
    scenes: row.scenes ?? []
  }
}

function upsertById<T extends { id: string }>(
  items: T[],
  item: T,
  maximum: number,
  label: string
) {
  const exists = items.some((candidate) => candidate.id === item.id)
  if (!exists && items.length >= maximum) {
    throw new BadRequestException(
      `${label} cannot contain more than ${maximum} items.`
    )
  }
  return exists
    ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
    : [...items, item]
}

function assertUniqueOrder(items: Array<{ order: number }>, label: string) {
  const orders = items.map((item) => item.order)
  if (new Set(orders).size !== orders.length) {
    throw new BadRequestException(`${label} order values must be unique.`)
  }
}

function assertExpectedRevision(current: number, expected?: number) {
  if (expected !== undefined && expected !== current) {
    throw new ConflictException({
      errorCode: 'story_revision_conflict',
      message: `Story project changed. Current revision is ${current}.`,
      currentRevision: current,
      nextAction: 'story_get_production_context'
    })
  }
}

function assertMutationRevision(
  current: number,
  requested: number | undefined,
  targetExists: boolean
) {
  if (requested !== undefined && requested > current) {
    throw new ConflictException({
      errorCode: 'story_future_revision',
      message: `baseRevision ${requested} is ahead of the authoritative revision ${current}. Never predict future revisions.`,
      currentRevision: current,
      nextAction:
        'Omit baseRevision for a new entity or use the exact current revision for an update.'
    })
  }
  if (targetExists && requested !== current) {
    throw new ConflictException({
      errorCode: 'story_revision_conflict',
      message:
        requested === undefined
          ? `Updating an existing entity requires the exact current revision ${current}.`
          : `Story project changed. Current revision is ${current}; the existing entity was planned on revision ${requested}.`,
      currentRevision: current,
      nextAction: 'Read only the affected entity, then retry with this revision.'
    })
  }
}

function isRevisionConflict(error: unknown) {
  if (!(error instanceof ConflictException)) return false
  const response = error.getResponse()
  return (
    typeof response === 'object' &&
    response !== null &&
    'errorCode' in response &&
    response.errorCode === 'story_revision_conflict'
  )
}

function operationConflict() {
  return new ConflictException({
    errorCode: 'story_operation_conflict',
    message:
      'operationId was already used for a different mutation. Use a new operationId.'
  })
}

function mutationFingerprint(value: unknown) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
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

function validateScope(scope: StoryScope) {
  if (!scope.tenantId?.trim()) {
    throw new BadRequestException('Tenant scope is required.')
  }
}

function totalDuration(production: StoryProductionDocument) {
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

function countProduction(production: StoryProductionDocument) {
  const shots = production.scenes.flatMap((scene) => scene.shots)
  const candidates = [
    ...(production.assets ?? []).flatMap((asset) => asset.candidates ?? []),
    ...shots.flatMap((shot) => shot.candidates ?? [])
  ]
  return {
    sources: production.sourceMaterials?.length ?? 0,
    beats: production.storyPlan?.beats.length ?? 0,
    episodes: production.episodes?.length ?? 0,
    assets: production.assets?.length ?? 0,
    characters: characterAssets(production).length,
    scenes: production.scenes.length,
    shots: shots.length,
    candidates: candidates.length,
    selectedCandidates: candidates.filter((candidate) => candidate.selected)
      .length
  }
}

function characterAssets(production: StoryProductionDocument) {
  return (production.assets ?? []).filter(
    (asset) => asset.kind === 'character'
  )
}

function assertCharacterLimit(assets: StoryAsset[]) {
  if (assets.filter((asset) => asset.kind === 'character').length > 40) {
    throw new BadRequestException('character assets cannot contain more than 40 items.')
  }
}

function emptyCounts() {
  return {
    sources: 0,
    beats: 0,
    episodes: 0,
    assets: 0,
    characters: 0,
    scenes: 0,
    shots: 0,
    candidates: 0,
    selectedCandidates: 0
  }
}
