import type { Asset, ProductionView, Scene, Shot } from './production-data'
import type {
  VideoGeneratorCatalog,
  VideoGeneratorOption
} from './video-generation-data'

export type ShotGenerationSettingsState = {
  generatorId: string
  model: string
  resolution: string
  aspectRatio: string
  fps: number
  takeCount: number
  referenceAssetIds: string[]
  referenceImageCandidateIds: string[]
}

export function resolveShotGenerationSettings(
  production: ProductionView,
  scene: Scene | undefined,
  shot: Shot | undefined,
  catalog: VideoGeneratorCatalog | null
): ShotGenerationSettingsState {
  const saved = shot?.videoSettings
  const generator = resolveGenerator(saved?.generatorId, catalog)
  return {
    generatorId: generator?.id ?? '',
    model: optionOrFallback(
      saved?.model,
      generator?.models.map((item) => item.id) ?? [],
      generator?.defaultModel ?? ''
    ),
    resolution: optionOrFallback(
      saved?.resolution,
      generator?.resolutions ?? [],
      generator?.resolutions[0] ?? ''
    ),
    aspectRatio: optionOrFallback(
      saved?.aspectRatio,
      generator?.aspectRatios ?? [],
      generator?.aspectRatios[0] ?? ''
    ),
    fps: [24, 25, 30].includes(saved?.fps ?? 0) ? saved!.fps! : 24,
    takeCount: [1, 2, 4].includes(saved?.takeCount ?? 0)
      ? saved!.takeCount!
      : 1,
    referenceAssetIds: saved
      ? validReferenceAssetIds(saved.referenceAssetIds, production.assets)
      : inferReferenceAssetIds(production, scene, shot),
    referenceImageCandidateIds: saved
      ? validReferenceImageCandidateIds(
          saved.referenceImageCandidateIds ?? [],
          saved.referenceAssetIds,
          production.assets
        )
      : []
  }
}

export function inferReferenceAssetIds(
  production: ProductionView,
  scene: Scene | undefined,
  shot: Shot | undefined
) {
  if (!scene || !shot) return []
  const searchable = [
    shot.title,
    shot.composition,
    shot.action,
    shot.dialogue,
    shot.generationPrompt,
    scene.title,
    scene.location
  ].filter(Boolean).join('\n').toLocaleLowerCase()
  const speakerName = production.assets.find(
    (asset) =>
      asset.kind === 'character' && asset.id === shot.dialogueSpeakerId
  )?.name
  const characterAssets = production.assets.filter(
    (asset) =>
      asset.kind === 'character' &&
      (asset.name === speakerName || searchable.includes(asset.name.toLocaleLowerCase()))
  )
  const locationAssets = production.assets.filter(
    (asset) =>
      asset.kind === 'location' &&
      (asset.name === scene.location || searchable.includes(asset.name.toLocaleLowerCase()))
  )
  return [...characterAssets.slice(0, 4), ...locationAssets.slice(0, 2)]
    .map((asset) => asset.id)
}

function resolveGenerator(
  savedId: string | null | undefined,
  catalog: VideoGeneratorCatalog | null
): VideoGeneratorOption | null {
  const available = catalog?.generators.filter((item) => item.available) ?? []
  return available.find((item) => item.id === savedId)
    ?? available.find((item) => item.id === catalog?.selectedToolsetId)
    ?? available[0]
    ?? null
}

function optionOrFallback(
  value: string | null | undefined,
  options: string[],
  fallback: string
) {
  return value && options.includes(value) ? value : fallback
}

function validReferenceAssetIds(ids: string[], assets: Asset[]) {
  const valid = new Set(
    assets
      .filter((asset) => asset.kind === 'character' || asset.kind === 'location')
      .map((asset) => asset.id)
  )
  return ids.filter((id, index) => valid.has(id) && ids.indexOf(id) === index)
}

function validReferenceImageCandidateIds(
  ids: string[],
  assetIds: string[],
  assets: Asset[]
) {
  const selectedAssets = new Set(assetIds)
  const valid = new Set(
    assets
      .filter((asset) => selectedAssets.has(asset.id))
      .flatMap((asset) => asset.candidates)
      .filter((candidate) => candidate.kind === 'image')
      .map((candidate) => candidate.id)
  )
  return ids.filter((id, index) => valid.has(id) && ids.indexOf(id) === index)
}
