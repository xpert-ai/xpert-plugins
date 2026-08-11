import * as React from 'react'
import type { MessageKey } from './i18n'
import type { ProjectSummary } from './project-data'
import type { ProductionView } from './production-data'
import {
  executeAction,
  getErrorMessage,
  notify,
  requireSuccessfulAction
} from './runtime'

type Translator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

type GenerateTakesInput = {
  sceneId: string
  shotId: string
  prompt: string
  toolsetId: string
  model: string
  resolution: string
  aspectRatio: string
  fps: number
  takeCount: number
  referenceAssetIds: string[]
  referenceImageCandidateIds: string[]
  redoScope?: string
}

export function useMediaGenerationActions(options: {
  project: ProjectSummary | null
  production: ProductionView | null
  reload: (projectId: string) => Promise<unknown>
  refreshVideoTasks: (projectId: string) => Promise<unknown>
  selectVideoGenerator: (toolsetId: string) => void
  setBusy: (busy: boolean) => void
  t: Translator
}) {
  const {
    project,
    production,
    reload,
    refreshVideoTasks,
    selectVideoGenerator,
    setBusy,
    t
  } = options
  const [generating, setGenerating] = React.useState(false)

  async function generateTakes(input: GenerateTakesInput) {
    if (!project || !production) return
    const scene = production.scenes.find((item) => item.id === input.sceneId)
    const shot = scene?.shots.find((item) => item.id === input.shotId)
    if (!scene || !shot) return
    setGenerating(true)
    try {
      requireSuccessfulAction(
        await executeAction('generate_shot_takes', project.id, {
          projectId: project.id,
          operationId: crypto.randomUUID(),
          sceneId: input.sceneId,
          shotId: input.shotId,
          toolsetId: input.toolsetId,
          takeCount: input.takeCount,
          prompt: input.prompt,
          model: input.model,
          resolution: input.resolution,
          aspectRatio: input.aspectRatio,
          fps: input.fps,
          referenceAssetIds: input.referenceAssetIds,
          referenceImageCandidateIds: input.referenceImageCandidateIds,
          durationSeconds: Math.max(2, Math.min(30, Math.round(shot.durationSeconds))),
          generateAudio: true,
          ...(input.redoScope ? { redoScope: input.redoScope } : {})
        })
      )
      notify('success', t('generation.started', { count: input.takeCount }))
      await refreshVideoTasks(project.id)
    } catch (error) {
      notifyError(error)
    } finally {
      setGenerating(false)
    }
  }

  async function setGenerator(toolsetId: string) {
    if (!project) return
    try {
      requireSuccessfulAction(
        await executeAction('set_project_video_generator', project.id, {
          projectId: project.id,
          toolsetId
        })
      )
      selectVideoGenerator(toolsetId)
    } catch (error) {
      notifyError(error)
    }
  }

  async function selectCandidate(sceneId: string, shotId: string, candidateId: string) {
    if (!project) return
    setBusy(true)
    try {
      requireSuccessfulAction(
        await executeAction('select_shot_video', project.id, {
          projectId: project.id,
          sceneId,
          shotId,
          candidateId,
          operationId: crypto.randomUUID(),
          changeSummary: t('changes.generationCandidateSelected', { shot: shotId })
        })
      )
      notify('success', t('generation.candidateSelected', { shot: shotId }))
      await reload(project.id)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy(false)
    }
  }

  async function cancelTask(taskId: string) {
    if (!project) return
    try {
      requireSuccessfulAction(
        await executeAction('cancel_video_task', project.id, {
          projectId: project.id,
          taskId,
          operationId: crypto.randomUUID(),
          changeSummary: t('changes.videoTrackingStopped')
        })
      )
      await refreshVideoTasks(project.id)
    } catch (error) {
      notifyError(error)
    }
  }

  async function retryTask(taskId: string) {
    if (!project) return
    try {
      requireSuccessfulAction(
        await executeAction('retry_video_task', project.id, {
          projectId: project.id,
          taskId,
          operationId: crypto.randomUUID(),
          changeSummary: t('changes.videoGenerationRetried')
        })
      )
      await refreshVideoTasks(project.id)
    } catch (error) {
      notifyError(error)
    }
  }

  function notifyError(error: unknown) {
    notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
  }

  return {
    generating,
    generateTakes,
    setGenerator,
    selectCandidate,
    cancelTask,
    retryTask
  }
}
