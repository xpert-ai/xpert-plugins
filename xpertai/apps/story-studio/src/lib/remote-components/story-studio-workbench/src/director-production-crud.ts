import type {
  Asset,
  AssetCategoryDetails,
  Episode,
  ProductionView,
  Scene,
  Shot
} from './production-data'
import { compactVoiceReference, type VoiceReferenceLike } from '../../../voice-reference.js'

export type EpisodeDraft = Omit<Episode, 'id' | 'order'>
export type SceneDraft = Omit<Scene, 'id' | 'order' | 'shots'>
export type ShotDraft = Omit<Shot, 'id' | 'candidates'>
export type AssetDraft = Omit<Asset, 'id' | 'candidates' | 'voiceReference'> & {
  voiceReference?: VoiceReferenceLike | null
}

export function addEpisode(
  production: ProductionView,
  id: string,
  draft: EpisodeDraft
) {
  production.episodes.push({
    id,
    order: production.episodes.length + 1,
    ...draft
  })
}

export function updateEpisode(
  production: ProductionView,
  id: string,
  draft: EpisodeDraft
) {
  const episode = production.episodes.find((item) => item.id === id)
  if (!episode) return false
  Object.assign(episode, draft)
  return true
}

export function deleteEpisode(production: ProductionView, id: string) {
  const nextEpisodes = production.episodes.filter((item) => item.id !== id)
  if (nextEpisodes.length === production.episodes.length) return false
  production.episodes = nextEpisodes.map((item, index) => ({
    ...item,
    order: index + 1
  }))
  const fallbackEpisodeId = production.episodes[0]?.id ?? null
  production.scenes.forEach((scene) => {
    if (scene.episodeId === id) scene.episodeId = fallbackEpisodeId
  })
  removeSuggestions(production, (item) => item.episodeId === id)
  return true
}

export function addScene(
  production: ProductionView,
  sceneId: string,
  shotId: string,
  draft: SceneDraft,
  starterShot: ShotDraft
) {
  production.scenes.push({
    id: sceneId,
    order: production.scenes.length + 1,
    ...draft,
    shots: [{ id: shotId, ...starterShot, candidates: [] }]
  })
}

export function updateScene(
  production: ProductionView,
  id: string,
  draft: SceneDraft
) {
  const scene = production.scenes.find((item) => item.id === id)
  if (!scene) return false
  Object.assign(scene, draft)
  return true
}

export function deleteScene(production: ProductionView, id: string) {
  if (production.scenes.length <= 1) return false
  const scene = production.scenes.find((item) => item.id === id)
  if (!scene) return false
  const shotIds = new Set(scene.shots.map((item) => item.id))
  production.scenes = production.scenes
    .filter((item) => item.id !== id)
    .map((item, index) => ({ ...item, order: index + 1 }))
  removeSuggestions(
    production,
    (item) => item.sceneId === id || Boolean(item.shotId && shotIds.has(item.shotId))
  )
  return true
}

export function addShot(
  production: ProductionView,
  sceneId: string,
  shotId: string,
  draft: ShotDraft
) {
  const scene = production.scenes.find((item) => item.id === sceneId)
  if (!scene) return false
  scene.shots.push({ id: shotId, ...draft, candidates: [] })
  return true
}

export function updateShot(
  production: ProductionView,
  sceneId: string,
  shotId: string,
  draft: ShotDraft
) {
  const shot = production.scenes
    .find((item) => item.id === sceneId)
    ?.shots.find((item) => item.id === shotId)
  if (!shot) return false
  Object.assign(shot, draft)
  return true
}

export function deleteShot(
  production: ProductionView,
  sceneId: string,
  shotId: string
) {
  const scene = production.scenes.find((item) => item.id === sceneId)
  if (!scene || scene.shots.length <= 1) return false
  if (!scene.shots.some((item) => item.id === shotId)) return false
  scene.shots = scene.shots.filter((item) => item.id !== shotId)
  removeSuggestions(production, (item) => item.shotId === shotId)
  return true
}

export function addAsset(
  production: ProductionView,
  assetId: string,
  draft: AssetDraft
) {
  const { voiceReference, ...asset } = draft
  production.assets.push({
    id: assetId,
    ...asset,
    role: asset.kind === 'character' ? asset.role?.trim() || null : null,
    visualDescription:
      asset.kind === 'character'
        ? asset.visualDescription?.trim() ||
          asset.categoryDetails.appearance ||
          asset.description
        : null,
    voiceReference:
      asset.kind === 'character'
        ? compactVoiceReference(voiceReference)
        : null,
    candidates: []
  })
}

export function updateAsset(
  production: ProductionView,
  assetId: string,
  draft: AssetDraft
) {
  const asset = production.assets.find((item) => item.id === assetId)
  if (!asset) return false
  const { voiceReference, ...nextAsset } = draft
  Object.assign(asset, nextAsset)
  if (asset.kind === 'character') {
    asset.role = draft.role?.trim() || asset.role
    asset.visualDescription =
      draft.visualDescription?.trim() ||
      asset.categoryDetails.appearance ||
      asset.description
    if (voiceReference !== undefined) {
      asset.voiceReference = compactVoiceReference(voiceReference)
    }
  } else {
    asset.role = null
    asset.visualDescription = null
    asset.voiceReference = null
  }
  return true
}

export function deleteAsset(production: ProductionView, assetId: string) {
  const asset = production.assets.find((item) => item.id === assetId)
  if (!asset) return false
  production.assets = production.assets.filter((item) => item.id !== assetId)
  return true
}

export function selectPrimaryAssetImageCandidate(
  production: ProductionView,
  assetId: string,
  candidateId: string
) {
  const asset = production.assets.find((item) => item.id === assetId)
  const target = asset?.candidates.find(
    (candidate) =>
      candidate.id === candidateId &&
      candidate.kind === 'image' &&
      candidate.assetReference?.type !== 'expression'
  )
  if (!asset || !target) return false
  if (isPrimaryAssetImageCandidateSelected(asset, candidateId)) return false

  asset.candidates.forEach((candidate) => {
    if (candidate.kind !== 'image') return
    candidate.selected = candidate.id === target.id
  })
  return true
}

export function isPrimaryAssetImageCandidateSelected(
  asset: Asset,
  candidateId: string
) {
  const target = asset.candidates.find(
    (candidate) =>
      candidate.id === candidateId &&
      candidate.kind === 'image' &&
      candidate.assetReference?.type !== 'expression'
  )
  if (!target) return false
  return asset.candidates.every(
    (candidate) =>
      candidate.kind !== 'image' ||
      candidate.selected === (candidate.id === target.id)
  )
}

export function acceptAdaptationSuggestion(
  production: ProductionView,
  suggestionId: string
) {
  const suggestion = production.storyPlan?.adaptationSuggestions.find(
    (item) => item.id === suggestionId
  )
  if (!suggestion) return false
  const episode = production.episodes.find(
    (item) => item.id === suggestion.episodeId
  )
  if (!episode) return false
  episode.script = episode.script.includes(suggestion.originalText)
    ? episode.script.replace(suggestion.originalText, suggestion.suggestedText)
    : `${episode.script.trim()}\n\n${suggestion.suggestedText}`
  suggestion.status = 'accepted'
  return true
}

export function createEmptyAssetDetails(): AssetCategoryDetails {
  return {
    identity: null,
    appearance: null,
    wardrobe: null,
    voice: null,
    environment: null,
    lighting: null,
    material: null,
    condition: null,
    storyFunction: null,
    palette: null,
    lens: null,
    continuity: null
  }
}

function removeSuggestions(
  production: ProductionView,
  predicate: (
    item: NonNullable<ProductionView['storyPlan']>['adaptationSuggestions'][number]
  ) => boolean
) {
  if (!production.storyPlan) return
  production.storyPlan.adaptationSuggestions =
    production.storyPlan.adaptationSuggestions.filter(
      (item) => !predicate(item)
    )
}
