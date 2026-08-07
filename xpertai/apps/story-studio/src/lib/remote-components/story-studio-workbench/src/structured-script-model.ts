import { deleteShot, type ShotDraft } from './director-production-crud'
import type { ProductionView, Shot } from './production-data'

export type StructuredScriptDefaults = {
  episodeScript: string
  sceneTitle: string
  sceneSummary: string
  shotAction: string
}

export type ScriptDialogueType = NonNullable<Shot['dialogueType']>

export function displayRequiredScriptText(value: string, fallback: string) {
  return value.trim() === fallback.trim() ? '' : value
}

export function updateSceneScriptText(
  production: ProductionView,
  sceneId: string,
  field: 'title' | 'summary',
  value: string,
  defaults: StructuredScriptDefaults
) {
  const scene = production.scenes.find((item) => item.id === sceneId)
  if (!scene) return false
  scene[field] = value.trim() || defaults[field === 'title' ? 'sceneTitle' : 'sceneSummary']
  syncEpisodeScript(production, scene.episodeId, defaults)
  return true
}

export function updateShotScriptText(
  production: ProductionView,
  sceneId: string,
  shotId: string,
  field: 'action' | 'dialogue',
  value: string,
  defaults: StructuredScriptDefaults
) {
  const scene = production.scenes.find((item) => item.id === sceneId)
  const shot = scene?.shots.find((item) => item.id === shotId)
  if (!scene || !shot) return false
  if (field === 'action') {
    shot.action = value.trim() || defaults.shotAction
  } else {
    shot.dialogue = value
    if (!value.trim()) shot.dialogueSpeakerId = null
  }
  syncEpisodeScript(production, scene.episodeId, defaults)
  return true
}

export function insertScriptShot(
  production: ProductionView,
  sceneId: string,
  afterShotId: string,
  shotId: string,
  draft: ShotDraft,
  defaults: StructuredScriptDefaults
) {
  const scene = production.scenes.find((item) => item.id === sceneId)
  if (
    !scene ||
    scene.shots.length >= 24 ||
    production.totalDurationSeconds + draft.durationSeconds > 300
  ) return false
  const afterIndex = scene.shots.findIndex((item) => item.id === afterShotId)
  const insertAt = afterIndex < 0 ? scene.shots.length : afterIndex + 1
  scene.shots.splice(insertAt, 0, {
    id: shotId,
    ...draft,
    candidates: []
  })
  refreshProductionMetrics(production)
  syncEpisodeScript(production, scene.episodeId, defaults)
  return true
}

export function removeScriptShot(
  production: ProductionView,
  sceneId: string,
  shotId: string,
  defaults: StructuredScriptDefaults
) {
  const scene = production.scenes.find((item) => item.id === sceneId)
  if (!scene || !deleteShot(production, sceneId, shotId)) return false
  refreshProductionMetrics(production)
  syncEpisodeScript(production, scene.episodeId, defaults)
  return true
}

export function addShotDialogue(
  production: ProductionView,
  sceneId: string,
  shotId: string,
  dialogueType: ScriptDialogueType,
  defaults: StructuredScriptDefaults
) {
  const scene = production.scenes.find((item) => item.id === sceneId)
  const shot = scene?.shots.find((item) => item.id === shotId)
  if (!scene || !shot) return false
  shot.dialogue = shot.dialogue ?? ''
  shot.dialogueType = dialogueType
  syncEpisodeScript(production, scene.episodeId, defaults)
  return true
}

export function removeShotDialogue(
  production: ProductionView,
  sceneId: string,
  shotId: string,
  defaults: StructuredScriptDefaults
) {
  const scene = production.scenes.find((item) => item.id === sceneId)
  const shot = scene?.shots.find((item) => item.id === shotId)
  if (!scene || !shot) return false
  shot.dialogue = null
  shot.dialogueSpeakerId = null
  shot.dialogueType = null
  syncEpisodeScript(production, scene.episodeId, defaults)
  return true
}

export function updateShotDialogueMetadata(
  production: ProductionView,
  sceneId: string,
  shotId: string,
  input: {
    dialogueType?: ScriptDialogueType
    dialogueSpeakerId?: string | null
  },
  defaults: StructuredScriptDefaults
) {
  const scene = production.scenes.find((item) => item.id === sceneId)
  const shot = scene?.shots.find((item) => item.id === shotId)
  if (!scene || !shot) return false
  if (input.dialogueType) shot.dialogueType = input.dialogueType
  if ('dialogueSpeakerId' in input) {
    shot.dialogueSpeakerId = input.dialogueSpeakerId ?? null
  }
  syncEpisodeScript(production, scene.episodeId, defaults)
  return true
}

export function syncEpisodeScript(
  production: ProductionView,
  episodeId: string | null,
  defaults: StructuredScriptDefaults
) {
  if (!episodeId) return
  const episode = production.episodes.find((item) => item.id === episodeId)
  if (!episode) return
  const scenes = production.scenes
    .filter((scene) => scene.episodeId === episodeId)
    .sort((left, right) => left.order - right.order)
  const lines = scenes.flatMap((scene) => {
    const title = displayRequiredScriptText(scene.title, defaults.sceneTitle).trim()
    const summary = displayRequiredScriptText(scene.summary, defaults.sceneSummary).trim()
    return [
      title ? `${scene.order}. ${title}` : '',
      summary,
      ...scene.shots.flatMap((shot) => {
        const action = displayRequiredScriptText(shot.action, defaults.shotAction).trim()
        const speaker = production.characters.find(
          (character) => character.id === shot.dialogueSpeakerId
        )?.name
        return [
          action,
          ...(shot.dialogue?.trim()
            ? [speaker ? `${speaker}：` : '', shot.dialogue.trim()]
            : [])
        ]
      })
    ].filter(Boolean)
  })
  episode.script = lines.join('\n') || defaults.episodeScript
}

export function refreshProductionMetrics(production: ProductionView) {
  const shots = production.scenes.flatMap((scene) => scene.shots)
  const candidates = [
    ...production.assets.flatMap((asset) => asset.candidates),
    ...shots.flatMap((shot) => shot.candidates)
  ]
  production.totalDurationSeconds = shots.reduce(
    (total, shot) => total + shot.durationSeconds,
    0
  )
  production.counts = {
    sources: production.sourceMaterials.length,
    beats: production.storyPlan?.beats.length ?? 0,
    episodes: production.episodes.length,
    assets: production.assets.length,
    characters: production.characters.length,
    scenes: production.scenes.length,
    shots: shots.length,
    candidates: candidates.length,
    selectedCandidates: candidates.filter((candidate) => candidate.selected).length
  }
}
