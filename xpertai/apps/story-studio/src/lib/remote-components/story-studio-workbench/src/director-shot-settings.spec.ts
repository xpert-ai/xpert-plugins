import { resolveShotGenerationSettings } from './director-shot-settings'
import type { ProductionView } from './production-data'
import type { VideoGeneratorCatalog } from './video-generation-data'

const catalog: VideoGeneratorCatalog = {
  selectedToolsetId: 'generator-a',
  generators: [{
    id: 'generator-a',
    family: 'seedance',
    displayName: 'Seedance',
    available: true,
    unavailableReason: null,
    models: [{ id: 'model-a', label: 'Model A' }],
    defaultModel: 'model-a',
    resolutions: ['720p', '1080p'],
    aspectRatios: ['9:16', '16:9'],
    durationSeconds: { min: 2, max: 12, default: 5 },
    supportsAudio: true,
    supportsCancel: false
  }]
}

describe('director shot settings', () => {
  it('restores every saved setting for the active shot', () => {
    const production = productionWithSettings()
    const scene = production.scenes[0]
    const settings = resolveShotGenerationSettings(
      production,
      scene,
      scene.shots[0],
      catalog
    )

    expect(settings).toEqual({
      generatorId: 'generator-a',
      model: 'model-a',
      resolution: '1080p',
      aspectRatio: '16:9',
      fps: 30,
      takeCount: 2,
      referenceAssetIds: ['character-asset', 'location-asset'],
      referenceImageCandidateIds: ['character-asset-primary']
    })
  })

  it('uses safe defaults instead of carrying values from another shot', () => {
    const production = productionWithSettings()
    const scene = production.scenes[0]
    const settings = resolveShotGenerationSettings(
      production,
      scene,
      scene.shots[1],
      catalog
    )

    expect(settings).toMatchObject({
      generatorId: 'generator-a',
      model: 'model-a',
      resolution: '720p',
      aspectRatio: '9:16',
      fps: 24,
      takeCount: 1
    })
  })
})

function productionWithSettings(): ProductionView {
  const base = {
    sourceSynopsis: 'Story',
    visualStyle: 'Illustrated',
    adaptationGoal: 'Short film',
    totalDurationSeconds: 10,
    sourceMaterials: [],
    storyPlan: null,
    episodes: [],
    assets: [
      asset('character-asset', 'character', 'Horse'),
      asset('location-asset', 'location', 'River')
    ],
    scenes: [{
      id: 'scene-1',
      episodeId: null,
      order: 1,
      title: 'River',
      summary: 'Crossing',
      location: 'River',
      timeOfDay: null,
      shots: [
        shot('shot-1', {
          generatorId: 'generator-a',
          model: 'model-a',
          resolution: '1080p',
          aspectRatio: '16:9',
          fps: 30,
          takeCount: 2,
          referenceAssetIds: ['character-asset', 'location-asset'],
          referenceImageCandidateIds: ['character-asset-primary']
        }),
        shot('shot-2')
      ]
    }],
    counts: {
      sources: 0,
      beats: 0,
      episodes: 0,
      assets: 2,
      characters: 0,
      scenes: 1,
      shots: 2,
      candidates: 0,
      selectedCandidates: 0
    }
  }
  return base
}

function asset(id: string, kind: 'character' | 'location', name: string) {
  return {
    id,
    kind,
    name,
    description: name,
    prompt: name,
    negativePrompt: null,
    continuityNotes: null,
    categoryDetails: {
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
    },
    candidates: [{
      id: `${id}-primary`,
      kind: 'image' as const,
      label: 'Primary',
      selected: true,
      fileUrl: '/primary.png',
      workspacePath: null,
      originalName: 'primary.png',
      size: 1,
      sha256: null,
      prompt: null,
      providerReceipt: null,
      assetReference: { type: 'general' as const }
    }]
  }
}

function shot(id: string, videoSettings?: ProductionView['scenes'][number]['shots'][number]['videoSettings']) {
  return {
    id,
    title: id,
    composition: 'Wide',
    action: 'Runs',
    camera: 'Follow',
    dialogue: null,
    dialogueSpeakerId: null,
    dialogueType: null,
    soundEffects: [],
    generationPrompt: null,
    emotion: null,
    lens: null,
    lighting: null,
    colorTone: null,
    weather: null,
    durationSeconds: 5,
    candidates: [],
    ...(videoSettings ? { videoSettings } : {})
  }
}
