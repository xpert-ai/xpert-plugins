import type { WorkbenchNavigationOpenPayload } from '@xpert-ai/contracts'
import { isObject, unwrap } from './shared/runtime'
import type { HostContext, RemoteValue } from './shared/types'

type PipelineFocus = Partial<Record<'pipelineInstanceId' | 'pipelineRoundId' | 'pipelineNodeId', string>>

export function pipelineFocus(context: HostContext | null): PipelineFocus {
  const parameters = context?.initialQuery?.parameters
  if (!isObject(parameters)) return {}
  const focus: PipelineFocus = {}
  for (const key of ['pipelineInstanceId', 'pipelineRoundId', 'pipelineNodeId'] as const) {
    if (typeof parameters[key] === 'string' && parameters[key]) focus[key] = parameters[key]
  }
  return focus
}

export function startedPipelineFocus(receipt: RemoteValue): PipelineFocus {
  const data = unwrap(receipt)
  if (!isObject(data) || typeof data.instanceId !== 'string') throw Error('Invalid pipeline start receipt')
  return { pipelineInstanceId: data.instanceId, ...(typeof data.roundId === 'string' ? { pipelineRoundId: data.roundId } : {}) }
}

// Select the Project and its native task View in one authorized Assistant navigation.
export function projectPipelineNavigation(projectId: string, focus: PipelineFocus = {}) {
  return {
    target: 'assistant.project', projectId, viewKey: 'platform.project-tasks__timeline',
    parameters: { initialTab: 'pipeline', ...focus }
  } satisfies WorkbenchNavigationOpenPayload
}
