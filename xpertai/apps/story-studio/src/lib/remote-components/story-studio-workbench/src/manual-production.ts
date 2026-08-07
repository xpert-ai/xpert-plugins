import type { ProjectSummary } from './project-data'
import type { ProductionView } from './production-data'
import type { DirectorTranslator } from './director-types'

export function createManualStarterProduction(
  project: ProjectSummary,
  t: DirectorTranslator
): ProductionView {
  const episodeId = `manual-${project.id}-episode-1`
  const sceneId = `manual-${project.id}-scene-1`
  const shotId = `manual-${project.id}-shot-1`
  const sourceText =
    project.premise?.trim() ||
    project.description?.trim() ||
    project.title
  const sourceMaterials = sourceText
    ? [
        {
          id: `manual-${project.id}-source-1`,
          title: project.title,
          type: 'text' as const,
          excerpt: sourceText,
          status: 'reviewed' as const
        }
      ]
    : []
  const targetDurationSeconds = Math.min(
    1_800,
    Math.max(5, project.targetDurationSeconds ?? 60)
  )

  return {
    sourceSynopsis: sourceText,
    visualStyle: t('manualProduction.visualStyle'),
    adaptationGoal: t('manualProduction.adaptationGoal'),
    audience: null,
    totalDurationSeconds: 5,
    sourceMaterials,
    storyPlan: null,
    episodes: [
      {
        id: episodeId,
        order: 1,
        title: t('manualProduction.episodeTitle'),
        summary:
          project.description?.trim() ||
          project.premise?.trim() ||
          t('director.crud.defaultEpisodeSummary'),
        script: t('director.crud.defaultEpisodeScript'),
        targetDurationSeconds
      }
    ],
    assets: [],
    characters: [],
    scenes: [
      {
        id: sceneId,
        episodeId,
        order: 1,
        title: t('director.crud.defaultSceneTitle'),
        summary: t('director.crud.defaultSceneSummary'),
        location: t('director.crud.defaultLocation'),
        timeOfDay: null,
        shots: [
          {
            id: shotId,
            title: t('director.crud.defaultShotTitle'),
            composition: t('director.crud.defaultComposition'),
            action: t('director.crud.defaultAction'),
            camera: t('director.crud.defaultCamera'),
            dialogue: null,
            dialogueSpeakerId: null,
            dialogueType: null,
            soundEffects: [],
            generationPrompt: t('director.crud.defaultPrompt'),
            emotion: null,
            lens: '35mm',
            lighting: null,
            colorTone: null,
            weather: null,
            durationSeconds: 5,
            candidates: []
          }
        ]
      }
    ],
    counts: {
      sources: sourceMaterials.length,
      beats: 0,
      episodes: 1,
      assets: 0,
      characters: 0,
      scenes: 1,
      shots: 1,
      candidates: 0,
      selectedCandidates: 0
    }
  }
}
