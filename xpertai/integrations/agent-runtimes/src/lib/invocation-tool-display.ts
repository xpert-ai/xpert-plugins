import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import type { RunnableConfig } from '@langchain/core/runnables'
import { ChatMessageEventTypeEnum, type IconDefinition } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'

export type InvocationToolDisplay = {
  toolName: string | { en_US: string; zh_Hans: string }
  toolIcon: IconDefinition
}

export const invocationToolDisplay: Record<'launch' | 'status' | 'cancel', InvocationToolDisplay> = {
  launch: {
    toolName: { en_US: 'Delegate task', zh_Hans: '委派任务' },
    toolIcon: { type: 'font', value: 'ri-play-circle-line' }
  },
  status: {
    toolName: { en_US: 'Task progress', zh_Hans: '查看任务进度' },
    toolIcon: { type: 'font', value: 'ri-time-line' }
  },
  cancel: {
    toolName: { en_US: 'Cancel task', zh_Hans: '取消任务' },
    toolIcon: { type: 'font', value: 'ri-stop-circle-line' }
  }
}

/** Update the existing tool step; never create a separate step or affect task execution. */
export async function reportInvocationProgress(
  config: RunnableConfig,
  callId: string | undefined,
  name: string,
  display: InvocationToolDisplay,
  summary?: string
) {
  if (!callId || !summary?.trim()) return
  const title =
    typeof display.toolName === 'string'
      ? display.toolName
      : RequestContext.getLanguageCode()?.startsWith('zh')
      ? display.toolName.zh_Hans
      : display.toolName.en_US
  try {
    await dispatchCustomEvent(
      ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
      {
        id: callId,
        tool_call_id: callId,
        category: 'Tool',
        tool: name,
        title,
        icon: display.toolIcon,
        message: summary.trim(),
        status: 'running'
      },
      config
    )
  } catch {
    // Progress events are best-effort; the host still emits normal tool start/end/error events.
  }
}
