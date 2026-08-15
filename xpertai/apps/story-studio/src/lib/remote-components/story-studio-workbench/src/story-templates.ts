import type { MessageKey } from './i18n'
import type { CreateProjectDraft } from './create-project-dialog'
import type { ProductionFormat, ProjectSummary } from './project-data'
import type {
  Asset,
  AssetCategoryDetails,
  ProductionView
} from './production-data'

export type StoryTemplateCategory = 'vertical' | 'horizontal' | 'series'
export type StoryTemplatePhase =
  | 'setup'
  | 'investigation'
  | 'reveal'
  | 'memory'
  | 'unresolved'
  | 'tension'
  | 'decision'
  | 'release'

export type StoryTemplateAssetSlot = Asset['kind']
export type StoryTemplateShotFunction =
  | 'establish'
  | 'arrival'
  | 'exchange'
  | 'search'
  | 'clue'
  | 'reaction'
  | 'memory'
  | 'voiceover'
  | 'deadline'
  | 'choice'
  | 'aftermath'

export type StoryTemplateEpisodeBlueprint = {
  title?: MessageKey
  summary?: MessageKey
}

export type StoryTemplateAssetBlueprint = {
  kind: StoryTemplateAssetSlot
  name: MessageKey
  description: MessageKey
  role?: MessageKey
}

export type StoryTemplateSceneBlueprint = {
  episodeIndex: number
  phase: StoryTemplatePhase
  title: MessageKey
  summary: MessageKey
  location: MessageKey
  timeOfDay: MessageKey
  weather?: MessageKey
  shotFunctions: StoryTemplateShotFunction[]
  dialogue?: MessageKey
  dialogueType?: 'dialogue' | 'voice_over' | 'off_screen'
  dialogueSpeakerAssetIndex?: number
  soundEffects: MessageKey[]
  referenceAssetIndexes: number[]
}

export type StoryTemplateBlueprint = {
  audience: MessageKey
  visualStyle: MessageKey
  adaptationGoal: MessageKey
  theme: MessageKey
  tone: MessageKey
  lens: MessageKey
  lighting: MessageKey
  colorTone: MessageKey
  episodes: StoryTemplateEpisodeBlueprint[]
  scenes: StoryTemplateSceneBlueprint[]
  assets: StoryTemplateAssetBlueprint[]
}

type TemplateTranslator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

export const TEMPLATE_PHASE_COPY: Record<StoryTemplatePhase, {
  title: MessageKey
  description: MessageKey
  action: MessageKey
  camera: MessageKey
  emotion: MessageKey
}> = {
  setup: phaseCopy('setup'),
  investigation: phaseCopy('investigation'),
  reveal: phaseCopy('reveal'),
  memory: phaseCopy('memory'),
  unresolved: phaseCopy('unresolved'),
  tension: phaseCopy('tension'),
  decision: phaseCopy('decision'),
  release: phaseCopy('release')
}

export const TEMPLATE_SHOT_COPY: Record<StoryTemplateShotFunction, {
  title: MessageKey
  action: MessageKey
  composition: MessageKey
  camera: MessageKey
  emotion: MessageKey
}> = {
  establish: shotCopy('establish'),
  arrival: shotCopy('arrival'),
  exchange: shotCopy('exchange'),
  search: shotCopy('search'),
  clue: shotCopy('clue'),
  reaction: shotCopy('reaction'),
  memory: shotCopy('memory'),
  voiceover: shotCopy('voiceover'),
  deadline: shotCopy('deadline'),
  choice: shotCopy('choice'),
  aftermath: shotCopy('aftermath')
}

export type StoryTemplate = {
  id: string
  category: StoryTemplateCategory
  title: MessageKey
  description: MessageKey
  premise: MessageKey
  format: ProductionFormat
  aspectRatio: string
  duration: number
  tags: MessageKey[]
  accent: 'blue' | 'amber' | 'green' | 'plum'
  blueprint: StoryTemplateBlueprint
}

export const STORY_TEMPLATES: StoryTemplate[] = [
  {
    id: 'rainy-night-reunion',
    category: 'vertical',
    title: 'templates.rainyNightReunion.title',
    description: 'templates.rainyNightReunion.description',
    premise: 'templates.rainyNightReunion.premise',
    format: 'vertical_short',
    aspectRatio: '9:16',
    duration: 60,
    tags: ['templates.tags.emotion', 'templates.tags.reunion'],
    accent: 'blue',
    blueprint: {
      audience: 'templates.rainyNightReunion.audience',
      visualStyle: 'templates.blueprint.styles.rainyNight',
      adaptationGoal: 'templates.blueprint.goals.rainyNight',
      theme: 'templates.blueprint.themes.rainyNight',
      tone: 'templates.blueprint.tones.rainyNight',
      lens: 'templates.blueprint.lenses.intimate',
      lighting: 'templates.blueprint.lighting.rainyNight',
      colorTone: 'templates.blueprint.colorTone.rainyNight',
      episodes: [{}],
      scenes: [
        {
          episodeIndex: 0,
          phase: 'setup',
          title: 'templates.rainyNightReunion.scene1.title',
          summary: 'templates.rainyNightReunion.scene1.summary',
          location: 'templates.rainyNightReunion.scene1.location',
          timeOfDay: 'templates.rainyNightReunion.scene1.time',
          weather: 'templates.blueprint.weather.heavyRain',
          shotFunctions: ['establish', 'arrival', 'exchange', 'clue'],
          dialogue: 'templates.rainyNightReunion.scene1.dialogue',
          dialogueType: 'dialogue',
          dialogueSpeakerAssetIndex: 1,
          soundEffects: ['templates.blueprint.sound.rain', 'templates.blueprint.sound.shutter'],
          referenceAssetIndexes: [0, 1, 2, 3, 4]
        },
        {
          episodeIndex: 0,
          phase: 'reveal',
          title: 'templates.rainyNightReunion.scene2.title',
          summary: 'templates.rainyNightReunion.scene2.summary',
          location: 'templates.rainyNightReunion.scene2.location',
          timeOfDay: 'templates.rainyNightReunion.scene2.time',
          weather: 'templates.blueprint.weather.rainOutside',
          shotFunctions: ['establish', 'search', 'clue', 'reaction'],
          dialogue: 'templates.rainyNightReunion.scene2.dialogue',
          dialogueType: 'dialogue',
          dialogueSpeakerAssetIndex: 0,
          soundEffects: ['templates.blueprint.sound.rain', 'templates.blueprint.sound.paper'],
          referenceAssetIndexes: [0, 1, 2, 3, 4]
        },
        {
          episodeIndex: 0,
          phase: 'release',
          title: 'templates.rainyNightReunion.scene3.title',
          summary: 'templates.rainyNightReunion.scene3.summary',
          location: 'templates.rainyNightReunion.scene3.location',
          timeOfDay: 'templates.rainyNightReunion.scene3.time',
          weather: 'templates.blueprint.weather.lightRain',
          shotFunctions: ['deadline', 'exchange', 'choice', 'aftermath'],
          dialogue: 'templates.rainyNightReunion.scene3.dialogue',
          dialogueType: 'dialogue',
          dialogueSpeakerAssetIndex: 1,
          soundEffects: ['templates.blueprint.sound.lightRain', 'templates.blueprint.sound.firstBus'],
          referenceAssetIndexes: [0, 1, 2, 3, 4]
        }
      ],
      assets: [
        asset('character', 'templates.rainyNightReunion.asset.photographer.name', 'templates.rainyNightReunion.asset.photographer.description', 'templates.rainyNightReunion.asset.photographer.role'),
        asset('character', 'templates.rainyNightReunion.asset.partner.name', 'templates.rainyNightReunion.asset.partner.description', 'templates.rainyNightReunion.asset.partner.role'),
        asset('location', 'templates.rainyNightReunion.asset.studio.name', 'templates.rainyNightReunion.asset.studio.description'),
        asset('prop', 'templates.rainyNightReunion.asset.camera.name', 'templates.rainyNightReunion.asset.camera.description'),
        asset('style', 'templates.rainyNightReunion.asset.style.name', 'templates.rainyNightReunion.asset.style.description')
      ]
    }
  },
  {
    id: 'missing-recording',
    category: 'vertical',
    title: 'templates.missingRecording.title',
    description: 'templates.missingRecording.description',
    premise: 'templates.missingRecording.premise',
    format: 'vertical_short',
    aspectRatio: '9:16',
    duration: 90,
    tags: ['templates.tags.mystery', 'templates.tags.investigation'],
    accent: 'amber',
    blueprint: {
      audience: 'templates.missingRecording.audience',
      visualStyle: 'templates.blueprint.styles.missingRecording',
      adaptationGoal: 'templates.blueprint.goals.missingRecording',
      theme: 'templates.blueprint.themes.missingRecording',
      tone: 'templates.blueprint.tones.missingRecording',
      lens: 'templates.blueprint.lenses.investigative',
      lighting: 'templates.blueprint.lighting.missingRecording',
      colorTone: 'templates.blueprint.colorTone.missingRecording',
      episodes: [{}],
      scenes: [
        {
          episodeIndex: 0,
          phase: 'setup',
          title: 'templates.missingRecording.scene1.title',
          summary: 'templates.missingRecording.scene1.summary',
          location: 'templates.missingRecording.scene1.location',
          timeOfDay: 'templates.missingRecording.scene1.time',
          shotFunctions: ['establish', 'voiceover', 'search', 'clue'],
          dialogue: 'templates.missingRecording.scene1.dialogue',
          dialogueType: 'voice_over',
          dialogueSpeakerAssetIndex: 0,
          soundEffects: ['templates.blueprint.sound.keyboard', 'templates.blueprint.sound.recorderHiss'],
          referenceAssetIndexes: [0, 2, 3, 4]
        },
        {
          episodeIndex: 0,
          phase: 'investigation',
          title: 'templates.missingRecording.scene2.title',
          summary: 'templates.missingRecording.scene2.summary',
          location: 'templates.missingRecording.scene2.location',
          timeOfDay: 'templates.missingRecording.scene2.time',
          shotFunctions: ['arrival', 'search', 'exchange', 'reaction'],
          dialogue: 'templates.missingRecording.scene2.dialogue',
          dialogueType: 'dialogue',
          dialogueSpeakerAssetIndex: 1,
          soundEffects: ['templates.blueprint.sound.roomTone', 'templates.blueprint.sound.neon'],
          referenceAssetIndexes: [0, 1, 2, 3, 4]
        },
        {
          episodeIndex: 0,
          phase: 'reveal',
          title: 'templates.missingRecording.scene3.title',
          summary: 'templates.missingRecording.scene3.summary',
          location: 'templates.missingRecording.scene3.location',
          timeOfDay: 'templates.missingRecording.scene3.time',
          shotFunctions: ['establish', 'clue', 'exchange', 'aftermath'],
          dialogue: 'templates.missingRecording.scene3.dialogue',
          dialogueType: 'off_screen',
          dialogueSpeakerAssetIndex: 1,
          soundEffects: ['templates.blueprint.sound.cardClick', 'templates.blueprint.sound.recorderHiss'],
          referenceAssetIndexes: [0, 1, 2, 3, 4]
        }
      ],
      assets: [
        asset('character', 'templates.missingRecording.asset.reporter.name', 'templates.missingRecording.asset.reporter.description', 'templates.missingRecording.asset.reporter.role'),
        asset('character', 'templates.missingRecording.asset.recordist.name', 'templates.missingRecording.asset.recordist.description', 'templates.missingRecording.asset.recordist.role'),
        asset('location', 'templates.missingRecording.asset.station.name', 'templates.missingRecording.asset.station.description'),
        asset('prop', 'templates.missingRecording.asset.recorder.name', 'templates.missingRecording.asset.recorder.description'),
        asset('style', 'templates.missingRecording.asset.style.name', 'templates.missingRecording.asset.style.description')
      ]
    }
  },
  {
    id: 'unsent-letter',
    category: 'series',
    title: 'templates.unsentLetter.title',
    description: 'templates.unsentLetter.description',
    premise: 'templates.unsentLetter.premise',
    format: 'episodic_series',
    aspectRatio: '9:16',
    duration: 180,
    tags: ['templates.tags.emotion', 'templates.tags.voiceover'],
    accent: 'plum',
    blueprint: {
      audience: 'templates.unsentLetter.audience',
      visualStyle: 'templates.blueprint.styles.unsentLetter',
      adaptationGoal: 'templates.blueprint.goals.unsentLetter',
      theme: 'templates.blueprint.themes.unsentLetter',
      tone: 'templates.blueprint.tones.unsentLetter',
      lens: 'templates.blueprint.lenses.memory',
      lighting: 'templates.blueprint.lighting.unsentLetter',
      colorTone: 'templates.blueprint.colorTone.unsentLetter',
      episodes: [
        { title: 'templates.unsentLetter.episode1.title', summary: 'templates.unsentLetter.episode1.summary' },
        { title: 'templates.unsentLetter.episode2.title', summary: 'templates.unsentLetter.episode2.summary' },
        { title: 'templates.unsentLetter.episode3.title', summary: 'templates.unsentLetter.episode3.summary' }
      ],
      scenes: [
        {
          episodeIndex: 0,
          phase: 'setup',
          title: 'templates.unsentLetter.scene1.title',
          summary: 'templates.unsentLetter.scene1.summary',
          location: 'templates.unsentLetter.scene1.location',
          timeOfDay: 'templates.unsentLetter.scene1.time',
          shotFunctions: ['establish', 'arrival', 'clue', 'voiceover'],
          dialogue: 'templates.unsentLetter.scene1.dialogue',
          dialogueType: 'voice_over',
          dialogueSpeakerAssetIndex: 1,
          soundEffects: ['templates.blueprint.sound.paper', 'templates.blueprint.sound.clock'],
          referenceAssetIndexes: [0, 1, 3, 4, 5]
        },
        {
          episodeIndex: 1,
          phase: 'memory',
          title: 'templates.unsentLetter.scene2.title',
          summary: 'templates.unsentLetter.scene2.summary',
          location: 'templates.unsentLetter.scene2.location',
          timeOfDay: 'templates.unsentLetter.scene2.time',
          shotFunctions: ['memory', 'search', 'clue', 'voiceover'],
          dialogue: 'templates.unsentLetter.scene2.dialogue',
          dialogueType: 'voice_over',
          dialogueSpeakerAssetIndex: 2,
          soundEffects: ['templates.blueprint.sound.paper', 'templates.blueprint.sound.trainDistant'],
          referenceAssetIndexes: [0, 2, 3, 4, 5]
        },
        {
          episodeIndex: 2,
          phase: 'unresolved',
          title: 'templates.unsentLetter.scene3.title',
          summary: 'templates.unsentLetter.scene3.summary',
          location: 'templates.unsentLetter.scene3.location',
          timeOfDay: 'templates.unsentLetter.scene3.time',
          shotFunctions: ['establish', 'clue', 'choice', 'aftermath'],
          dialogue: 'templates.unsentLetter.scene3.dialogue',
          dialogueType: 'voice_over',
          dialogueSpeakerAssetIndex: 0,
          soundEffects: ['templates.blueprint.sound.paper', 'templates.blueprint.sound.morningCity'],
          referenceAssetIndexes: [0, 1, 2, 3, 4, 5]
        }
      ],
      assets: [
        asset('character', 'templates.unsentLetter.asset.illustrator.name', 'templates.unsentLetter.asset.illustrator.description', 'templates.unsentLetter.asset.illustrator.role'),
        asset('character', 'templates.unsentLetter.asset.mother.name', 'templates.unsentLetter.asset.mother.description', 'templates.unsentLetter.asset.mother.role'),
        asset('character', 'templates.unsentLetter.asset.father.name', 'templates.unsentLetter.asset.father.description', 'templates.unsentLetter.asset.father.role'),
        asset('location', 'templates.unsentLetter.asset.apartment.name', 'templates.unsentLetter.asset.apartment.description'),
        asset('prop', 'templates.unsentLetter.asset.letters.name', 'templates.unsentLetter.asset.letters.description'),
        asset('style', 'templates.unsentLetter.asset.style.name', 'templates.unsentLetter.asset.style.description')
      ]
    }
  },
  {
    id: 'last-train',
    category: 'horizontal',
    title: 'templates.lastTrain.title',
    description: 'templates.lastTrain.description',
    premise: 'templates.lastTrain.premise',
    format: 'horizontal_short',
    aspectRatio: '16:9',
    duration: 120,
    tags: ['templates.tags.cinematic', 'templates.tags.relationship'],
    accent: 'green',
    blueprint: {
      audience: 'templates.lastTrain.audience',
      visualStyle: 'templates.blueprint.styles.lastTrain',
      adaptationGoal: 'templates.blueprint.goals.lastTrain',
      theme: 'templates.blueprint.themes.lastTrain',
      tone: 'templates.blueprint.tones.lastTrain',
      lens: 'templates.blueprint.lenses.contained',
      lighting: 'templates.blueprint.lighting.lastTrain',
      colorTone: 'templates.blueprint.colorTone.lastTrain',
      episodes: [{}],
      scenes: [
        {
          episodeIndex: 0,
          phase: 'setup',
          title: 'templates.lastTrain.scene1.title',
          summary: 'templates.lastTrain.scene1.summary',
          location: 'templates.lastTrain.scene1.location',
          timeOfDay: 'templates.lastTrain.scene1.time',
          shotFunctions: ['establish', 'arrival', 'clue', 'reaction'],
          dialogue: 'templates.lastTrain.scene1.dialogue',
          dialogueType: 'dialogue',
          dialogueSpeakerAssetIndex: 0,
          soundEffects: ['templates.blueprint.sound.carriage', 'templates.blueprint.sound.announcement'],
          referenceAssetIndexes: [0, 1, 2, 3, 4]
        },
        {
          episodeIndex: 0,
          phase: 'tension',
          title: 'templates.lastTrain.scene2.title',
          summary: 'templates.lastTrain.scene2.summary',
          location: 'templates.lastTrain.scene2.location',
          timeOfDay: 'templates.lastTrain.scene2.time',
          shotFunctions: ['deadline', 'exchange', 'reaction', 'choice'],
          dialogue: 'templates.lastTrain.scene2.dialogue',
          dialogueType: 'dialogue',
          dialogueSpeakerAssetIndex: 1,
          soundEffects: ['templates.blueprint.sound.carriage', 'templates.blueprint.sound.railJoint'],
          referenceAssetIndexes: [0, 1, 2, 3, 4]
        },
        {
          episodeIndex: 0,
          phase: 'decision',
          title: 'templates.lastTrain.scene3.title',
          summary: 'templates.lastTrain.scene3.summary',
          location: 'templates.lastTrain.scene3.location',
          timeOfDay: 'templates.lastTrain.scene3.time',
          shotFunctions: ['deadline', 'exchange', 'choice', 'aftermath'],
          dialogue: 'templates.lastTrain.scene3.dialogue',
          dialogueType: 'dialogue',
          dialogueSpeakerAssetIndex: 0,
          soundEffects: ['templates.blueprint.sound.brakes', 'templates.blueprint.sound.trainDoor'],
          referenceAssetIndexes: [0, 1, 2, 3, 4]
        }
      ],
      assets: [
        asset('character', 'templates.lastTrain.asset.conductor.name', 'templates.lastTrain.asset.conductor.description', 'templates.lastTrain.asset.conductor.role'),
        asset('character', 'templates.lastTrain.asset.sister.name', 'templates.lastTrain.asset.sister.description', 'templates.lastTrain.asset.sister.role'),
        asset('location', 'templates.lastTrain.asset.train.name', 'templates.lastTrain.asset.train.description'),
        asset('prop', 'templates.lastTrain.asset.poster.name', 'templates.lastTrain.asset.poster.description'),
        asset('style', 'templates.lastTrain.asset.style.name', 'templates.lastTrain.asset.style.description')
      ]
    }
  }
]

export function templateToDraft(
  template: StoryTemplate,
  t: (key: MessageKey) => string
): CreateProjectDraft {
  return {
    title: t(template.title),
    description: t(template.description),
    premise: t(template.premise),
    productionFormat: template.format,
    aspectRatio: template.aspectRatio,
    duration: String(template.duration),
    tags: template.tags.map((tag) => t(tag)).join(', ')
  }
}

export function templateShotCount(
  template: StoryTemplate,
  duration = template.duration
) {
  const availableShots = template.blueprint.scenes.reduce(
    (sum, scene) => sum + scene.shotFunctions.length,
    0
  )
  return Math.min(
    availableShots,
    Math.max(4, template.blueprint.scenes.length, Math.ceil(duration / 10))
  )
}

export function templateToProduction(
  template: StoryTemplate,
  project: ProjectSummary,
  t: TemplateTranslator
): ProductionView {
  const baseId = `template-${template.id}-${project.id}`
  const projectTitle = project.title.trim() || t(template.title)
  const descriptionText = project.description?.trim() || t(template.description)
  const sourceText = project.premise?.trim() || t(template.premise)
  const targetDurationSeconds = Math.min(
    1_800,
    Math.max(5, project.targetDurationSeconds ?? template.duration)
  )
  const sourceMaterials = [{
    id: `${baseId}-source-1`,
    title: projectTitle,
    type: 'text' as const,
    excerpt: sourceText,
    status: 'reviewed' as const
  }]
  const episodeIds = template.blueprint.episodes.map(
    (_, index) => `${baseId}-episode-${index + 1}`
  )
  const assetIds = template.blueprint.assets.map(
    (_, index) => `${baseId}-asset-${index + 1}`
  )
  const assets = template.blueprint.assets.map((blueprint, index) =>
    createTemplateAsset(template, blueprint, assetIds[index], t)
  )
  const shotCount = templateShotCount(template, targetDurationSeconds)
  const durations = durationsFor(targetDurationSeconds, shotCount)
  const shotsByScene = distributeShots(
    shotCount,
    template.blueprint.scenes.map((scene) => scene.shotFunctions.length)
  )
  let shotIndex = 0
  const scenes = template.blueprint.scenes.map((scene, sceneIndex) => {
    const sceneId = `${baseId}-scene-${sceneIndex + 1}`
    const selectedFunctions = selectShotFunctions(
      scene.shotFunctions,
      shotsByScene[sceneIndex]
    )
    const shots = selectedFunctions.map((shotFunction, sceneShotIndex) => {
      const currentShotIndex = shotIndex
      shotIndex += 1
      const shotFunctionCopy = TEMPLATE_SHOT_COPY[shotFunction]
      const dialogue = sceneShotIndex === selectedFunctions.length - 1 && scene.dialogue
        ? t(scene.dialogue)
        : null
      return {
        id: `${baseId}-shot-${currentShotIndex + 1}`,
        title: `${t(scene.title)} · ${t(shotFunctionCopy.title)}`,
        composition: t(shotFunctionCopy.composition),
        action: `${t(scene.summary)} ${t(shotFunctionCopy.action)}`,
        camera: t(shotFunctionCopy.camera),
        dialogue,
        dialogueSpeakerId: dialogue && scene.dialogueSpeakerAssetIndex !== undefined
          ? assetIds[scene.dialogueSpeakerAssetIndex] ?? null
          : null,
        dialogueType: dialogue ? scene.dialogueType ?? 'dialogue' : null,
        soundEffects: scene.soundEffects.map((effect) => t(effect)),
        generationPrompt: [
          sourceText,
          t(scene.summary),
          t(shotFunctionCopy.action),
          t(template.blueprint.visualStyle),
          t('templates.blueprint.promptSuffix')
        ].join(' '),
        emotion: t(shotFunctionCopy.emotion),
        lens: t(template.blueprint.lens),
        lighting: t(template.blueprint.lighting),
        colorTone: t(template.blueprint.colorTone),
        weather: scene.weather ? t(scene.weather) : null,
        videoSettings: {
          generatorId: null,
          model: null,
          resolution: null,
          aspectRatio: project.aspectRatio || template.aspectRatio,
          fps: 24,
          takeCount: 1,
          referenceAssetIds: scene.referenceAssetIndexes
            .map((index) => assetIds[index])
            .filter((id): id is string => Boolean(id)),
          referenceImageCandidateIds: []
        },
        durationSeconds: durations[currentShotIndex],
        candidates: []
      }
    })
    return {
      id: sceneId,
      episodeId: episodeIds[scene.episodeIndex] ?? episodeIds[0],
      order: sceneIndex + 1,
      title: t(scene.title),
      summary: t(scene.summary),
      location: t(scene.location),
      timeOfDay: t(scene.timeOfDay),
      shots
    }
  })
  const episodes = template.blueprint.episodes.map((episode, episodeIndex) => {
    const episodeScenes = scenes.filter(
      (scene) => scene.episodeId === episodeIds[episodeIndex]
    )
    const episodeTitle = episode.title
      ? `${projectTitle} · ${t(episode.title)}`
      : projectTitle
    const episodeSummary = episode.summary ? t(episode.summary) : descriptionText
    const episodeDurationSeconds = episodeScenes.reduce(
      (sum, scene) => sum + scene.shots.reduce(
        (sceneSum, shot) => sceneSum + shot.durationSeconds,
        0
      ),
      0
    )
    return {
      id: episodeIds[episodeIndex],
      order: episodeIndex + 1,
      title: episodeTitle,
      summary: episodeSummary,
      script: buildEpisodeScript(episodeTitle, episodeSummary, episodeScenes),
      targetDurationSeconds: episodeDurationSeconds >= 5
        ? episodeDurationSeconds
        : null
    }
  })
  const beats = template.blueprint.scenes.map((scene, index) => ({
    id: `${baseId}-beat-${index + 1}`,
    title: t(scene.title),
    summary: t(scene.summary),
    purpose: t(TEMPLATE_PHASE_COPY[scene.phase].description)
  }))

  return {
    sourceSynopsis: sourceText,
    visualStyle: t(template.blueprint.visualStyle),
    adaptationGoal: t(template.blueprint.adaptationGoal),
    audience: t(template.blueprint.audience),
    totalDurationSeconds: durations.reduce((sum, duration) => sum + duration, 0),
    sourceMaterials,
    storyPlan: {
      logline: sourceText,
      theme: t(template.blueprint.theme),
      tone: t(template.blueprint.tone),
      beats,
      adaptationSuggestions: []
    },
    episodes,
    assets,
    scenes,
    counts: {
      sources: sourceMaterials.length,
      beats: beats.length,
      episodes: episodes.length,
      assets: assets.length,
      characters: assets.filter((item) => item.kind === 'character').length,
      scenes: scenes.length,
      shots: scenes.reduce((sum, scene) => sum + scene.shots.length, 0),
      candidates: 0,
      selectedCandidates: 0
    }
  }
}

function createTemplateAsset(
  template: StoryTemplate,
  blueprint: StoryTemplateAssetBlueprint,
  id: string,
  t: TemplateTranslator
): Asset {
  const name = t(blueprint.name)
  const description = t(blueprint.description)
  const visualStyle = t(template.blueprint.visualStyle)
  const details = emptyAssetCategoryDetails()
  if (blueprint.kind === 'character') {
    details.identity = name
    details.appearance = description
    details.continuity = t('templates.blueprint.assetContinuity')
  } else if (blueprint.kind === 'location') {
    details.environment = description
    details.lighting = t(template.blueprint.lighting)
    details.continuity = t('templates.blueprint.assetContinuity')
  } else if (blueprint.kind === 'prop') {
    details.material = description
    details.storyFunction = t('templates.blueprint.propFunction')
    details.continuity = t('templates.blueprint.assetContinuity')
  } else {
    details.palette = t(template.blueprint.colorTone)
    details.lens = t(template.blueprint.lens)
  }
  return {
    id,
    kind: blueprint.kind,
    name,
    description,
    prompt: `${description} ${visualStyle} ${t('templates.blueprint.promptSuffix')}`,
    negativePrompt: t('templates.blueprint.negativePrompt'),
    continuityNotes: t('templates.blueprint.assetContinuity'),
    categoryDetails: details,
    candidates: [],
    ...(blueprint.kind === 'character'
      ? {
          role: blueprint.role ? t(blueprint.role) : null,
          visualDescription: description
        }
      : {})
  }
}

function buildEpisodeScript(
  title: string,
  summary: string,
  scenes: ProductionView['scenes']
) {
  return [
    title,
    summary,
    ...scenes.flatMap((scene) => [
      '',
      `${scene.order}. ${scene.title} · ${scene.location ?? ''} · ${scene.timeOfDay ?? ''}`,
      scene.summary,
      ...scene.shots.flatMap((shot, index) => [
        `${index + 1}. ${shot.action}`,
        ...(shot.dialogue ? [`“${shot.dialogue}”`] : [])
      ])
    ])
  ].join('\n')
}

function emptyAssetCategoryDetails(): AssetCategoryDetails {
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

function durationsFor(total: number, count: number) {
  let remaining = Math.max(count, Math.round(total))
  return Array.from({ length: count }, (_, index) => {
    const remainingSlots = count - index - 1
    const upperBound = Math.min(20, remaining - remainingSlots)
    const duration = Math.max(
      1,
      Math.min(upperBound, Math.round(remaining / (remainingSlots + 1)))
    )
    remaining -= duration
    return duration
  })
}

function distributeShots(total: number, capacities: number[]) {
  const counts = capacities.map(() => 1)
  let remaining = Math.max(0, total - counts.length)
  let cursor = 0
  while (remaining > 0 && capacities.some((capacity, index) => counts[index] < capacity)) {
    const index = cursor % counts.length
    if (counts[index] < capacities[index]) {
      counts[index] += 1
      remaining -= 1
    }
    cursor += 1
  }
  return counts
}

function selectShotFunctions(
  functions: StoryTemplateShotFunction[],
  count: number
) {
  if (count >= functions.length) return functions
  if (count <= 1) return [functions[functions.length - 1]]
  return Array.from({ length: count }, (_, index) =>
    functions[Math.round(index * (functions.length - 1) / (count - 1))]
  )
}

function phaseCopy(phase: StoryTemplatePhase) {
  return {
    title: `templates.blueprint.phase.${phase}.title`,
    description: `templates.blueprint.phase.${phase}.description`,
    action: `templates.blueprint.phase.${phase}.action`,
    camera: `templates.blueprint.phase.${phase}.camera`,
    emotion: `templates.blueprint.phase.${phase}.emotion`
  } as const
}

function shotCopy(shotFunction: StoryTemplateShotFunction) {
  return {
    title: `templates.blueprint.shot.${shotFunction}.title`,
    action: `templates.blueprint.shot.${shotFunction}.action`,
    composition: `templates.blueprint.shot.${shotFunction}.composition`,
    camera: `templates.blueprint.shot.${shotFunction}.camera`,
    emotion: `templates.blueprint.shot.${shotFunction}.emotion`
  } as const
}

function asset(
  kind: StoryTemplateAssetSlot,
  name: MessageKey,
  description: MessageKey,
  role?: MessageKey
): StoryTemplateAssetBlueprint {
  return { kind, name, description, role }
}
