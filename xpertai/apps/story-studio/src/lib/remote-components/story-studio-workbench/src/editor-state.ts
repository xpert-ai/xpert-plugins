import type { ProductionView } from './production-data'
import type { ProductionFormat, ProjectSummary } from './project-data'

export type ProjectEditDraft = {
  title: string
  description: string
  premise: string
  productionFormat: ProductionFormat
  aspectRatio: string
  targetDurationSeconds: string
  tags: string
}

export type StoryEditorSession = {
  projectId: string
  stage: number
  baseRevision: number
  operationId: string
  dirty: boolean
  saving: boolean
  pendingRemote: boolean
  projectDraft: ProjectEditDraft
  productionDraft: ProductionView | null
}

export function createEditorSession(
  project: ProjectSummary,
  production: ProductionView | null,
  stage: number
): StoryEditorSession {
  return {
    projectId: project.id,
    stage,
    baseRevision: project.revision,
    operationId: crypto.randomUUID(),
    dirty: false,
    saving: false,
    pendingRemote: false,
    projectDraft: {
      title: project.title,
      description: project.description ?? '',
      premise: project.premise ?? '',
      productionFormat: project.productionFormat,
      aspectRatio: project.aspectRatio,
      targetDurationSeconds:
        project.targetDurationSeconds === null
          ? ''
          : String(project.targetDurationSeconds),
      tags: project.tags.join(', ')
    },
    productionDraft: production ? cloneProduction(production) : null
  }
}

export function cloneProduction(production: ProductionView) {
  return structuredClone(production)
}

/**
 * Replays only the actively edited stage on top of a newer Agent snapshot.
 * This preserves Agent changes in all other stages.
 */
export function rebaseProductionStage(
  stage: number,
  latest: ProductionView,
  local: ProductionView
): ProductionView {
  const next = cloneProduction(latest)
  if (stage === 2) {
    next.sourceSynopsis = local.sourceSynopsis
    next.sourceMaterials = cloneProduction(local).sourceMaterials
  } else if (stage === 3) {
    next.adaptationGoal = local.adaptationGoal
    next.audience = local.audience
    next.storyPlan = cloneProduction(local).storyPlan
  } else if (stage === 4) {
    next.episodes = cloneProduction(local).episodes
  } else if (stage === 5) {
    next.visualStyle = local.visualStyle
    next.assets = cloneProduction(local).assets
  } else if (stage === 6) {
    next.scenes = mergeStoryboardMetadata(latest, local)
  } else if (stage === 7) {
    next.scenes = mergeCandidateEdits(latest, local)
  }
  return next
}

function mergeStoryboardMetadata(
  latest: ProductionView,
  local: ProductionView
) {
  const latestSceneById = new Map(
    latest.scenes.map((scene) => [scene.id, scene])
  )
  return cloneProduction(local).scenes.map((scene) => {
    const remoteScene = latestSceneById.get(scene.id)
    const remoteShotById = new Map(
      (remoteScene?.shots ?? []).map((shot) => [shot.id, shot])
    )
    return {
      ...scene,
      shots: scene.shots.map((shot) => ({
        ...shot,
        candidates:
          remoteShotById.get(shot.id)?.candidates ?? shot.candidates
      }))
    }
  })
}

function mergeCandidateEdits(
  latest: ProductionView,
  local: ProductionView
) {
  const localCandidateById = new Map(
    local.scenes.flatMap((scene) =>
      scene.shots.flatMap((shot) =>
        shot.candidates.map((candidate) => [candidate.id, candidate] as const)
      )
    )
  )
  return cloneProduction(latest).scenes.map((scene) => ({
    ...scene,
    shots: scene.shots.map((shot) => ({
      ...shot,
      candidates: shot.candidates.map((candidate) => {
        const edited = localCandidateById.get(candidate.id)
        return edited
          ? {
              ...candidate,
              selected: edited.selected,
              label: edited.label,
              prompt: edited.prompt
            }
          : candidate
      })
    }))
  }))
}
