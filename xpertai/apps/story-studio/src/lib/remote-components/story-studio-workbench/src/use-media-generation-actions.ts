import * as React from 'react'
import type { MessageKey } from './i18n'
import type { ProductionView } from './production-data'
import { productionActionDocument } from './production-panel'
import type { ProjectSummary } from './project-data'
import {
  executeAction,
  getErrorMessage,
  getResponsePayload,
  invokeClientCommand,
  isRemoteObject,
  notify,
  requireSuccessfulAction,
  type RemoteResponse,
  type RemoteValue
} from './runtime'
import {
  buildSeedanceAssistantMessage,
  buildSeedanceGenerationTargets,
  buildSeedanceStatusAssistantMessage
} from './seedance-generation'

const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

type Translator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

export function useMediaGenerationActions(options: {
  project: ProjectSummary | null
  production: ProductionView | null
  reload: (projectId: string) => Promise<unknown>
  setBusy: (busy: boolean) => void
  t: Translator
}) {
  const { project, production, reload, setBusy, t } = options
  const [generating, setGenerating] = React.useState(false)

  async function generate() {
    if (!project || !production) return
    setGenerating(true)
    try {
      const targets = buildSeedanceGenerationTargets(production)
      if (!targets.length) throw new Error(t('generation.noImages'))
      const response = await invokeClientCommand(
        ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
        {
          text: buildSeedanceAssistantMessage({
            projectId: project.id,
            revision: project.revision,
            aspectRatio: project.aspectRatio,
            targets
          }),
          clientMessageId: `story-studio:seedance:${project.id}:${Date.now()}`,
          state: {
            source: '@xpert-ai/plugin-story-studio',
            action: 'generate_seedance_storyboard_videos',
            projectId: project.id,
            targetCount: targets.length
          }
        }
      )
      requireAcceptedCommand(response, t('generation.sendFailed'))
      notify('success', t('generation.sent', { count: targets.length }))
    } catch (error) {
      notifyError(error)
    } finally {
      setGenerating(false)
    }
  }

  async function query() {
    if (!project) return
    setGenerating(true)
    try {
      const response = await invokeClientCommand(
        ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
        {
          text: buildSeedanceStatusAssistantMessage({
            projectId: project.id,
            revision: project.revision
          }),
          clientMessageId: `story-studio:seedance-status:${project.id}:${Date.now()}`,
          state: {
            source: '@xpert-ai/plugin-story-studio',
            action: 'query_seedance_storyboard_videos',
            projectId: project.id
          }
        }
      )
      requireAcceptedCommand(response, t('generation.queryFailed'))
      notify('success', t('generation.querySent'))
    } catch (error) {
      notifyError(error)
    } finally {
      setGenerating(false)
    }
  }

  async function runInstruction(instruction: string) {
    if (!project || !instruction.trim()) return
    setGenerating(true)
    try {
      const response = await invokeClientCommand(
        ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
        {
          text: buildDirectorInstruction(
            project.id,
            project.revision,
            instruction
          ),
          clientMessageId: `story-studio:generation-director:${project.id}:${Date.now()}`,
          state: {
            source: '@xpert-ai/plugin-story-studio',
            action: 'direct_seedance_generation',
            projectId: project.id,
            revision: project.revision
          }
        }
      )
      requireAcceptedCommand(response, t('generation.sendFailed'))
      notify('success', t('generation.instructionSent'))
    } catch (error) {
      notifyError(error)
    } finally {
      setGenerating(false)
    }
  }

  async function selectCandidate(
    sceneId: string,
    shotId: string,
    candidateId: string
  ) {
    if (!project || !production) return
    const draft = structuredClone(production)
    const scene = draft.scenes.find((item) => item.id === sceneId)
    const shot = scene?.shots.find((item) => item.id === shotId)
    const candidate = shot?.candidates.find(
      (item) => item.id === candidateId && item.kind === 'video'
    )
    if (!shot || !candidate) return
    shot.candidates.forEach((item) => {
      if (item.kind === 'video') item.selected = item.id === candidateId
    })
    setBusy(true)
    try {
      requireSuccessfulAction(
        await executeAction('save_production', project.id, {
          projectId: project.id,
          operationId: crypto.randomUUID(),
          baseRevision: project.revision,
          production: productionActionDocument(draft),
          changeSummary: t('changes.generationCandidateSelected', {
            shot: shot.title
          })
        })
      )
      notify(
        'success',
        t('generation.candidateSelected', { shot: shot.title })
      )
      await reload(project.id)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy(false)
    }
  }

  function notifyError(error: unknown) {
    notify(
      'error',
      getErrorMessage(error instanceof Error ? error : String(error))
    )
  }

  return {
    generating,
    generate,
    query,
    runInstruction,
    selectCandidate
  }
}

function requireAcceptedCommand(
  response: RemoteValue | RemoteResponse,
  fallback: string
) {
  const result = getResponsePayload(response)
  if (isRemoteObject(result) && result.success === false) {
    throw new Error(
      typeof result.message === 'string' ? result.message : fallback
    )
  }
}

function buildDirectorInstruction(
  projectId: string,
  revision: number,
  instruction: string
) {
  return [
    `Act as the media-generation director for Story Studio project ${projectId}.`,
    `The approved ShotSpec at project revision ${revision} is read-only. Do not call story_save_production and do not modify scenes, shots, timing, camera, action, dialogue, or asset references.`,
    'You may inspect the project, submit or query Seedance generation jobs, attach completed Workspace MP4 candidates to the matching shot, and report candidate tradeoffs.',
    `Director instruction: ${instruction.trim()}`
  ].join('\n\n')
}
