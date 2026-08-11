import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import type {
  CreateStoryAdaptationSuggestionInput,
  DeleteStoryAdaptationSuggestionInput,
  ListStoryAdaptationSuggestionsInput,
  StoryAdaptationSuggestion,
  StoryProductionDocument,
  StoryProductionSummary,
  UpdateStoryAdaptationSuggestionInput
} from './production-types.js'
import { StoryProductionService } from './story-production.service.js'
import type { StoryScope } from './types.js'

@Injectable()
export class StoryAdaptationSuggestionService {
  constructor(private readonly productions: StoryProductionService) {}

  async list(
    scope: StoryScope,
    input: ListStoryAdaptationSuggestionsInput
  ) {
    const production = await this.productions.getProduction(scope, {
      projectId: input.projectId
    })
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== production.projectRevision
    ) {
      throw revisionConflict(production.projectRevision)
    }
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    const suggestions = [
      ...(production.storyPlan?.adaptationSuggestions ?? [])
    ]
      .filter((item) => !input.status || item.status === input.status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    const items = suggestions.slice((page - 1) * pageSize, page * pageSize)
    return {
      projectId: input.projectId,
      revision: production.projectRevision,
      items: items.map(compactSuggestion),
      total: suggestions.length,
      page,
      pageSize,
      hasMore: page * pageSize < suggestions.length
    }
  }

  async create(
    scope: StoryScope,
    input: CreateStoryAdaptationSuggestionInput
  ) {
    const production = await this.readAtRevision(
      scope,
      input.projectId,
      input.baseRevision
    )
    const plan = requireStoryPlan(production)
    validateTarget(production, input)
    const existing = plan.adaptationSuggestions?.find(
      (item) => item.id === input.suggestionId
    )
    if (existing) {
      if (
        existing.episodeId === input.episodeId &&
        existing.sceneId === input.sceneId &&
        existing.shotId === input.shotId &&
        existing.originalText === input.originalText &&
        existing.suggestedText === input.suggestedText &&
        existing.reason === input.reason
      ) {
        return mutationReceipt(production, existing, true)
      }
      throw new ConflictException({
        errorCode: 'story_adaptation_suggestion_conflict',
        message: 'suggestionId already exists with different content.'
      })
    }
    const suggestion: StoryAdaptationSuggestion = {
      id: input.suggestionId,
      episodeId: input.episodeId,
      ...(input.sceneId ? { sceneId: input.sceneId } : {}),
      ...(input.shotId ? { shotId: input.shotId } : {}),
      originalText: input.originalText,
      suggestedText: input.suggestedText,
      reason: input.reason,
      status: 'pending',
      createdBy: 'assistant',
      createdAt: new Date().toISOString()
    }
    plan.adaptationSuggestions = [
      ...(plan.adaptationSuggestions ?? []),
      suggestion
    ]
    const saved = await this.save(scope, production, input)
    return mutationReceipt(saved.production, suggestion, saved.duplicate)
  }

  async update(
    scope: StoryScope,
    input: UpdateStoryAdaptationSuggestionInput
  ) {
    const production = await this.readAtRevision(
      scope,
      input.projectId,
      input.baseRevision
    )
    const plan = requireStoryPlan(production)
    const suggestion = plan.adaptationSuggestions?.find(
      (item) => item.id === input.suggestionId
    )
    if (!suggestion) throw suggestionNotFound()
    if (input.suggestedText !== undefined) {
      suggestion.suggestedText = input.suggestedText
    }
    if (input.reason !== undefined) suggestion.reason = input.reason
    if (input.status !== undefined) suggestion.status = input.status
    const saved = await this.save(scope, production, input)
    return mutationReceipt(saved.production, suggestion, saved.duplicate)
  }

  async delete(
    scope: StoryScope,
    input: DeleteStoryAdaptationSuggestionInput
  ) {
    const production = await this.readAtRevision(
      scope,
      input.projectId,
      input.baseRevision
    )
    const plan = requireStoryPlan(production)
    const suggestion = plan.adaptationSuggestions?.find(
      (item) => item.id === input.suggestionId
    )
    if (!suggestion) throw suggestionNotFound()
    plan.adaptationSuggestions = (plan.adaptationSuggestions ?? []).filter(
      (item) => item.id !== input.suggestionId
    )
    const saved = await this.save(scope, production, input)
    return {
      success: true,
      duplicate: saved.duplicate,
      projectId: input.projectId,
      revision: saved.revision,
      deletedSuggestionId: input.suggestionId,
      status: 'deleted' as const
    }
  }

  private async readAtRevision(
    scope: StoryScope,
    projectId: string,
    revision: number
  ) {
    const production = await this.productions.getProduction(scope, {
      projectId
    })
    if (production.projectRevision !== revision) {
      throw revisionConflict(production.projectRevision)
    }
    return production
  }

  private save(
    scope: StoryScope,
    production: StoryProductionSummary,
    input: {
      projectId: string
      operationId: string
      baseRevision: number
      changeSummary: string
    }
  ) {
    return this.productions.saveProductionFromWorkbench(scope, {
      projectId: input.projectId,
      operationId: input.operationId,
      baseRevision: input.baseRevision,
      production: productionDocument(production),
      changeSummary: input.changeSummary
    })
  }
}

function requireStoryPlan(production: StoryProductionSummary) {
  if (!production.storyPlan) {
    throw new BadRequestException({
      errorCode: 'story_plan_required',
      message: 'Save a story plan before adding adaptation suggestions.'
    })
  }
  return production.storyPlan
}

function validateTarget(
  production: StoryProductionSummary,
  input: {
    episodeId: string
    sceneId?: string
    shotId?: string
  }
) {
  if (!production.episodes.some((item) => item.id === input.episodeId)) {
    throw new NotFoundException('Suggestion episode was not found.')
  }
  const scene = input.sceneId
    ? production.scenes.find((item) => item.id === input.sceneId)
    : null
  if (input.sceneId && !scene) {
    throw new NotFoundException('Suggestion scene was not found.')
  }
  if (input.shotId && !scene?.shots.some((item) => item.id === input.shotId)) {
    throw new NotFoundException('Suggestion shot was not found in the scene.')
  }
}

function productionDocument(
  production: StoryProductionSummary
): StoryProductionDocument {
  return {
    sourceSynopsis: production.sourceSynopsis,
    adaptationGoal: production.adaptationGoal,
    visualStyle: production.visualStyle,
    ...(production.audience ? { audience: production.audience } : {}),
    sourceMaterials: production.sourceMaterials,
    ...(production.storyPlan ? { storyPlan: production.storyPlan } : {}),
    episodes: production.episodes,
    assets: production.assets,
    characters: production.characters,
    scenes: production.scenes
  }
}

function mutationReceipt(
  production: Pick<StoryProductionSummary, 'projectId' | 'projectRevision'>,
  suggestion: StoryAdaptationSuggestion,
  duplicate: boolean
) {
  return {
    success: true,
    duplicate,
    projectId: production.projectId,
    revision: production.projectRevision,
    suggestion: compactSuggestion(suggestion),
    changedSuggestionIds: [suggestion.id]
  }
}

function compactSuggestion(suggestion: StoryAdaptationSuggestion) {
  return {
    id: suggestion.id,
    episodeId: suggestion.episodeId,
    ...(suggestion.sceneId ? { sceneId: suggestion.sceneId } : {}),
    ...(suggestion.shotId ? { shotId: suggestion.shotId } : {}),
    originalText: suggestion.originalText,
    suggestedText: suggestion.suggestedText,
    reason: suggestion.reason,
    status: suggestion.status,
    createdBy: suggestion.createdBy,
    createdAt: suggestion.createdAt
  }
}

function revisionConflict(currentRevision: number) {
  return new ConflictException({
    errorCode: 'story_revision_conflict',
    message: `Story project changed. Current revision is ${currentRevision}. Re-read only affected content when needed, then retry with that revision.`,
    currentRevision
  })
}

function suggestionNotFound() {
  return new NotFoundException({
    errorCode: 'story_adaptation_suggestion_not_found',
    message: 'Adaptation suggestion was not found.'
  })
}
