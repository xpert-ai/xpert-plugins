import type { WorkbenchNavigationOpenPayload } from '@xpert-ai/contracts'
import type { ViewQuery } from '../../../contracts'

export function pipelineFocus(parameters?: ViewQuery['parameters']) {
  return {
    ...(parameters?.pipelineInstanceId ? { pipelineInstanceId: parameters.pipelineInstanceId } : {}),
    ...(parameters?.pipelineRoundId ? { pipelineRoundId: parameters.pipelineRoundId } : {}),
    ...(parameters?.pipelineNodeId ? { pipelineNodeId: parameters.pipelineNodeId } : {})
  }
}

export function projectPipelineNavigation(projectId: string, focus: ReturnType<typeof pipelineFocus> = {}) {
  return {
    target: 'assistant.project', projectId, viewKey: 'platform.project-tasks__timeline',
    parameters: { initialTab: 'pipeline', ...focus }
  } satisfies WorkbenchNavigationOpenPayload
}
