import { z } from 'zod'
import {
  inspectComputerJsonl,
  requireComputerProfile as requireProfile,
  startComputerJsonl,
  type ComputerJsonlAdapter
} from './computer-jsonl.js'
import type { AgentRuntimeContext, AgentRuntimeHandle } from '@xpert-ai/plugin-sdk'
import type { RuntimeProfiles } from './managed-profiles.js'
import { completionFailure } from './computer-completion.js'

const Events = z.array(
  z
    .object({
      type: z.string(),
      item: z.object({ type: z.string(), text: z.string().optional() }).passthrough().optional(),
      message: z.string().optional(),
      error: z.object({ message: z.string().optional() }).passthrough().optional()
    })
    .passthrough()
)
const adapter: ComputerJsonlAdapter = {
  provider: 'codex-computer',
  toolId: 'codex',
  activityProtocol: 'codex',
  completion(value) {
    const parsed = Events.safeParse(value)
    if (!parsed.success) return completionFailure('protocol_invalid', 'Codex returned an invalid JSONL event shape.')
    const events = parsed.data
    const completedIndex = events.map((event) => event.type).lastIndexOf('turn.completed')
    // Generic errors can describe a recovered transport attempt. A later typed
    // completion supersedes them; explicit turn failures remain terminal.
    const failed = events.find(
      (event, index) => event.type === 'turn.failed' || (event.type === 'error' && index > completedIndex)
    )
    if (failed)
      return completionFailure(
        'cli_error',
        `Codex ${failed.type}: ${failed.error?.message || failed.message || 'the CLI reported an execution error'}.`,
        { finalEventType: failed.type }
      )
    if (completedIndex < 0)
      return completionFailure('missing_final_result', 'Codex exited without a turn.completed event.')
    const text = events
      .filter((event) => event.type === 'item.completed' && event.item?.type === 'agent_message')
      .at(-1)?.item?.text
    return {
      ok: true,
      text: text ?? '',
      diagnostic: { code: 'completed', message: 'Codex completed successfully.', finalEventType: 'turn.completed' }
    }
  }
}
export const startComputerCodex = startComputerJsonl
export const inspectComputerCodex = (
  handle: AgentRuntimeHandle,
  context: AgentRuntimeContext,
  profiles: RuntimeProfiles
) => inspectComputerJsonl(handle, context, profiles, adapter)
export const requireComputerProfile = (
  handle: AgentRuntimeHandle,
  context: AgentRuntimeContext,
  profiles: RuntimeProfiles
) => requireProfile(handle, context, profiles, adapter)
