import { z } from 'zod'
import { inspectComputerJsonl, requireComputerProfile as requireProfile, startComputerJsonl, type ComputerJsonlAdapter } from './computer-jsonl.js'
import type { AgentRuntimeContext, AgentRuntimeHandle } from '@xpert-ai/plugin-sdk'
import type { ProcessRuntime } from './process-runtime.js'
import { completionFailure } from './computer-completion.js'

const Events = z.array(z.object({
  type: z.string(),
  item: z.object({ type: z.string(), text: z.string().optional() }).passthrough().optional(),
  message: z.string().optional(), error: z.object({ message: z.string().optional() }).passthrough().optional()
}).passthrough())
const adapter: ComputerJsonlAdapter = {
  provider: 'codex-computer', toolId: 'codex', activityProtocol: 'codex',
  completion(value) {
    const parsed = Events.safeParse(value)
    if (!parsed.success) return completionFailure('protocol_invalid', 'Codex returned an invalid JSONL event shape.')
    const events = parsed.data
    const failed = events.find(event => event.type === 'turn.failed' || event.type === 'error')
    if (failed) return completionFailure('cli_error', `Codex ${failed.type}: ${failed.error?.message || failed.message || 'the CLI reported an execution error'}.`, { finalEventType: failed.type })
    if (!events.some(event => event.type === 'turn.completed')) return completionFailure('missing_final_result', 'Codex exited without a turn.completed event.')
    const text = events.filter(event => event.type === 'item.completed' && event.item?.type === 'agent_message').at(-1)?.item?.text
    if (!text?.trim()) return completionFailure('missing_final_result', 'Codex completed without a final public Agent message.', { finalEventType: 'turn.completed' })
    return { ok: true, text, diagnostic: { code: 'completed', message: 'Codex completed successfully.', finalEventType: 'turn.completed' } }
  }
}
export const startComputerCodex = startComputerJsonl
export const inspectComputerCodex = (handle: AgentRuntimeHandle, context: AgentRuntimeContext, profiles: ProcessRuntime) => inspectComputerJsonl(handle, context, profiles, adapter)
export const requireComputerProfile = (handle: AgentRuntimeHandle, context: AgentRuntimeContext, profiles: ProcessRuntime) => requireProfile(handle, context, profiles, adapter)
