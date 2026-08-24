import { BadRequestException, NotFoundException } from '@nestjs/common'
import type {
  StoryProductionDocument,
  StoryProductionSummary,
  StoryScene,
  StoryShot,
  StartStoryProductionInput,
  UpsertStoryProductionSceneInput,
  UpsertStoryProductionShotFields,
  UpsertStoryProductionShotInput
} from './production-types.js'
import { sanitizeAssets, sanitizeScenes } from './story-production-media.js'
import { storyProductionDocumentSchema } from './story-production.schemas.js'

export function buildStartedProduction(
  input: StartStoryProductionInput
): StoryProductionDocument {
  return validateProductionDocument({
    sourceSynopsis: input.sourceSynopsis,
    adaptationGoal: input.adaptationGoal,
    visualStyle: input.visualStyle,
    ...(input.audience ? { audience: input.audience } : {}),
    sourceMaterials: input.sourceMaterials ?? [],
    ...(input.storyPlan ? { storyPlan: input.storyPlan } : {}),
    episodes: input.episodes ?? [],
    assets: input.assets ?? [],
    scenes: [sceneFromInput(input.firstScene)]
  })
}

export function applyProductionSceneUpsert(
  current: StoryProductionDocument,
  input: UpsertStoryProductionSceneInput
) {
  const previous = current.scenes.find((scene) => scene.id === input.scene.id)
  const scene = sceneFromInput(input.scene, previous)
  return {
    production: validateProductionDocument({
      ...current,
      scenes: [
        ...current.scenes.filter((item) => item.id !== scene.id),
        scene
      ].sort((left, right) => left.order - right.order)
    }),
    target: {
      sceneId: scene.id,
      shotIds: scene.shots.map((shot) => shot.id)
    }
  }
}

export function applyProductionShotUpsert(
  current: StoryProductionDocument,
  input: UpsertStoryProductionShotInput
) {
  let foundScene = false
  let shotIds: string[] = []
  const scenes = current.scenes.map((scene) => {
    if (scene.id !== input.sceneId) return scene
    foundScene = true
    const previous = scene.shots.find((shot) => shot.id === input.shot.id)
    const shot = previous
      ? shotFromPatch(input.shot, previous)
      : newShotFromPatch(input.shot)
    const shots = previous
      ? scene.shots.map((item) => (item.id === shot.id ? shot : item))
      : insertShot(scene.shots, shot, input.insertAfterShotId)
    shotIds = shots.map((item) => item.id)
    return {
      ...scene,
      shots
    }
  })
  if (!foundScene) {
    throw new NotFoundException('Story production scene was not found.')
  }
  return {
    production: validateProductionDraftDocument({
      ...current,
      scenes
    }),
    target: {
      sceneId: input.sceneId,
      shotId: input.shot.id,
      shotIds
    }
  }
}

export function productionPatchReceipt(
  saved: {
    success: boolean
    duplicate: boolean
    projectId: string
    revision: number
    production: StoryProductionSummary
  },
  target: {
    sceneId: string
    shotId?: string
    shotIds: string[]
  },
  operationId: string
) {
  return {
    success: saved.success,
    duplicate: saved.duplicate,
    operationId,
    projectId: saved.projectId,
    revision: saved.revision,
    documentRevision: saved.production.documentRevision,
    sceneId: target.sceneId,
    ...(target.shotId ? { shotId: target.shotId } : {}),
    shotIds: target.shotIds,
    counts: saved.production.counts,
    totalDurationSeconds: saved.production.totalDurationSeconds,
    nextAction:
      'Continue with another bounded production mutation or call story_validate_production.'
  }
}

function sceneFromInput(
  input: UpsertStoryProductionSceneInput['scene'],
  previous?: StoryScene
): StoryScene {
  const previousShots = new Map(
    (previous?.shots ?? []).map((shot) => [shot.id, shot])
  )
  return {
    id: input.id,
    ...(input.episodeId ? { episodeId: input.episodeId } : {}),
    order: input.order,
    title: input.title,
    summary: input.summary,
    ...(input.location ? { location: input.location } : {}),
    ...(input.timeOfDay ? { timeOfDay: input.timeOfDay } : {}),
    shots: input.shots.map((shot) =>
      shotFromFullInput(shot, previousShots.get(shot.id))
    )
  }
}

function shotFromFullInput(
  input: UpsertStoryProductionSceneInput['scene']['shots'][number],
  previous?: StoryShot
): StoryShot {
  return completeShot(
    {
      id: input.id,
      title: input.title,
      composition: input.composition,
      action: input.action,
      camera: input.camera,
      soundEffects: input.soundEffects ?? [],
      durationSeconds: input.durationSeconds,
      generationPrompt: input.generationPrompt,
      emotion: input.emotion,
      lens: input.lens,
      lighting: input.lighting,
      colorTone: input.colorTone,
      weather: input.weather
    },
    input.dialogue,
    previous
  )
}

function shotFromPatch(
  input: UpsertStoryProductionShotFields,
  previous: StoryShot
): StoryShot {
  return completeShot(
    {
      id: previous.id,
      title: input.title ?? previous.title,
      composition: input.composition ?? previous.composition,
      action: input.action ?? previous.action,
      camera: input.camera ?? previous.camera,
      soundEffects: input.soundEffects ?? previous.soundEffects ?? [],
      durationSeconds: input.durationSeconds ?? previous.durationSeconds,
      generationPrompt:
        input.generationPrompt === undefined
          ? previous.generationPrompt
          : input.generationPrompt,
      emotion: input.emotion === undefined ? previous.emotion : input.emotion,
      lens: input.lens === undefined ? previous.lens : input.lens,
      lighting:
        input.lighting === undefined ? previous.lighting : input.lighting,
      colorTone:
        input.colorTone === undefined ? previous.colorTone : input.colorTone,
      weather: input.weather === undefined ? previous.weather : input.weather
    },
    input.dialogue === undefined ? undefined : input.dialogue,
    previous
  )
}

function newShotFromPatch(input: UpsertStoryProductionShotFields): StoryShot {
  return completeShot(
    {
      id: input.id,
      title: requiredShotText(input.title, 'New shot requires title.'),
      composition: requiredShotText(
        input.composition,
        'New shot requires composition.'
      ),
      action: requiredShotText(input.action, 'New shot requires action.'),
      camera: requiredShotText(input.camera, 'New shot requires camera.'),
      soundEffects: input.soundEffects ?? [],
      durationSeconds: requiredShotNumber(
        input.durationSeconds,
        'New shot requires durationSeconds.'
      ),
      generationPrompt: input.generationPrompt,
      emotion: input.emotion,
      lens: input.lens,
      lighting: input.lighting,
      colorTone: input.colorTone,
      weather: input.weather
    },
    input.dialogue,
    undefined
  )
}

function completeShot(
  input: {
    id: string
    title: string
    composition: string
    action: string
    camera: string
    soundEffects: string[]
    durationSeconds: number
    generationPrompt?: string | null
    emotion?: string | null
    lens?: string | null
    lighting?: string | null
    colorTone?: string | null
    weather?: string | null
  },
  dialogue: UpsertStoryProductionShotFields['dialogue'] | undefined,
  previous?: StoryShot
): StoryShot {
  const shot: StoryShot = {
    id: input.id,
    title: input.title,
    composition: input.composition,
    action: input.action,
    camera: input.camera,
    durationSeconds: input.durationSeconds,
    ...(input.soundEffects.length ? { soundEffects: input.soundEffects } : {}),
    ...optionalShotText('generationPrompt', input.generationPrompt),
    ...optionalShotText('emotion', input.emotion),
    ...optionalShotText('lens', input.lens),
    ...optionalShotText('lighting', input.lighting),
    ...optionalShotText('colorTone', input.colorTone),
    ...optionalShotText('weather', input.weather),
    ...(previous?.videoSettings
      ? { videoSettings: previous.videoSettings }
      : {}),
    ...(previous?.candidates ? { candidates: previous.candidates } : {})
  }
  applyDialogue(shot, dialogue, previous)
  return shot
}

function applyDialogue(
  shot: StoryShot,
  dialogue: UpsertStoryProductionShotFields['dialogue'] | undefined,
  previous?: StoryShot
) {
  if (dialogue === undefined) {
    const previousDialogue = optionalText(previous?.dialogue)
    if (!previousDialogue) return
    shot.dialogue = previousDialogue
    const speakerId = optionalText(previous?.dialogueSpeakerId)
    if (speakerId) shot.dialogueSpeakerId = speakerId
    if (previous?.dialogueType) shot.dialogueType = previous.dialogueType
    return
  }
  if (dialogue === null) return
  shot.dialogue = dialogue.text
  if (dialogue.speakerId) shot.dialogueSpeakerId = dialogue.speakerId
  if (dialogue.type) shot.dialogueType = dialogue.type
}

function optionalShotText(
  key:
    | 'generationPrompt'
    | 'emotion'
    | 'lens'
    | 'lighting'
    | 'colorTone'
    | 'weather',
  value?: string | null
) {
  const text = optionalText(value)
  return text ? { [key]: text } : {}
}

function optionalText(value?: string | null) {
  const text = value?.trim()
  return text ? text : null
}

function requiredShotText(value: string | undefined, message: string) {
  const text = optionalText(value)
  if (!text) {
    throw new BadRequestException({
      errorCode: 'story_shot_required_field_missing',
      message
    })
  }
  return text
}

function requiredShotNumber(value: number | undefined, message: string) {
  if (value === undefined) {
    throw new BadRequestException({
      errorCode: 'story_shot_required_field_missing',
      message
    })
  }
  return value
}

function insertShot(
  shots: StoryShot[],
  shot: StoryShot,
  insertAfterShotId?: string
) {
  if (!insertAfterShotId) {
    return [...shots, shot]
  }
  const index = shots.findIndex((item) => item.id === insertAfterShotId)
  if (index < 0) {
    throw new NotFoundException(
      'insertAfterShotId was not found in the requested scene.'
    )
  }
  return [...shots.slice(0, index + 1), shot, ...shots.slice(index + 1)]
}

function validateProductionDocument(
  production: StoryProductionDocument
): StoryProductionDocument {
  storyProductionDocumentSchema.parse({
    ...production,
    assets: sanitizeAssets(production.assets ?? []),
    scenes: sanitizeScenes(production.scenes)
  })
  return production
}

function validateProductionDraftDocument(
  production: StoryProductionDocument
): StoryProductionDocument {
  if (production.scenes.length > 40) {
    throw new BadRequestException(
      'Production cannot contain more than 40 scenes.'
    )
  }
  const shots = production.scenes.flatMap((scene) => {
    if (scene.shots.length > 24) {
      throw new BadRequestException(
        `Scene ${scene.id} cannot contain more than 24 shots.`
      )
    }
    return scene.shots
  })
  const duration = shots.reduce(
    (total, shot) => total + shot.durationSeconds,
    0
  )
  if (duration > 300) {
    throw new BadRequestException(
      'Total shot duration must not exceed 300 seconds while drafting.'
    )
  }
  return production
}
