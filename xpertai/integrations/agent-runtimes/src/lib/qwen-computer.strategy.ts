import { Injectable } from '@nestjs/common'
import { z } from 'zod'
import {
  AgentExecutionRunnerCapability, AgentRuntimeStrategy,
  type AgentRuntimeContext, type AgentRuntimeHandle, type AgentRuntimeStart, type IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'
import { ProcessRuntime } from './process-runtime.js'
import { inspectComputerJsonl, requireComputerProfile, startComputerJsonl, type ComputerJsonlAdapter } from './computer-jsonl.js'
import { completionFailure, publicDiagnostic } from './computer-completion.js'

const Events = z.array(z.object({
  type: z.string(), subtype: z.string().optional(), is_error: z.boolean().optional(), result: z.string().optional(),
  permission_denials: z.array(z.unknown()).optional(), parent_tool_use_id: z.string().nullable().optional(),
  error: z.union([z.string(), z.object({ message: z.string().optional() }).passthrough()]).optional(),
  errors: z.array(z.string()).optional()
}).passthrough())
const denialSchema = z.object({ tool_name: z.string(), tool_input: z.object({ command: z.string().optional() }).passthrough().optional() })
const adapter: ComputerJsonlAdapter = {
  provider: 'qwen-computer', toolId: 'qwen', activityProtocol: 'qwen',
  completion(value) {
    const parsed = Events.safeParse(value)
    if (!parsed.success) return completionFailure('protocol_invalid', 'Qwen returned an invalid JSONL event shape.')
    const events = parsed.data
    const results = events.filter(event => event.type === 'result' && !event.parent_tool_use_id)
    const denials = events.filter(event => !event.parent_tool_use_id).flatMap(event => event.permission_denials ?? [])
    const denied = denials.map(value => denialSchema.safeParse(value)).find(value => value.success)?.data
    const result = results[0]
    const details = {
      ...(result ? { finalEventType: result.type,
        ...(result.subtype ? { finalEventSubtype: publicDiagnostic(result.subtype) } : {}) } : {}),
      permissionDenials: denials.length,
      ...(denied ? { toolName: publicDiagnostic(denied.tool_name),
        ...(denied.tool_input?.command ? { command: publicDiagnostic(denied.tool_input.command) } : {}) } : {})
    }
    if (results.length > 1) return completionFailure('ambiguous_final_result', 'Qwen returned multiple main-session result events.', details)
    const fatal = events.find(event => !event.parent_tool_use_id && event.type !== 'result' && (event.type === 'error' || event.is_error))
    if (result?.subtype === 'success' && result.is_error === false && result.result?.trim() && !fatal) {
      return { ok: true, text: result.result, diagnostic: { ...details, code: 'completed',
        message: denials.length ? 'Qwen completed successfully after earlier tool permission denials; see the execution activity.' : 'Qwen completed successfully.' } }
    }
    const error = fatal ?? result
    const cause = (typeof error?.error === 'string' ? error.error : error?.error?.message) || error?.errors?.join('; ')
    // Earlier denials must not hide a later explicit provider/CLI failure.
    if (denials.length && !fatal && !cause) return completionFailure('permission_denied',
      `Qwen could not complete after tool permission denial${details.toolName ? `: ${details.toolName}` : ''}${details.command ? ` (${details.command})` : ''}. Non-interactive execution cannot request approval.`, details)
    if (!result && !fatal) return completionFailure('missing_final_result', 'Qwen exited without a main-session result event.', details)
    return completionFailure('cli_error', `Qwen did not complete successfully${error?.subtype ? ` (${error.subtype})` : ''}: ${cause || 'the final result was unsuccessful or empty'}.`, details)
  }
}

/** Structured receipt + exit code confirm execution, never the model's completion sentence. */
@Injectable()
@AgentRuntimeStrategy('qwen-computer')
export class QwenComputerRuntimeStrategy implements IAgentRuntimeStrategy {
  readonly capabilities = {
    activity: { version: 1 as const, presentation: 'coding' as const },
    executionTools: [{ id: 'qwen', versions: ['0.24.7'], environments: ['computer' as const] }],
    recovery: 'session' as const, interactions: false, cancellation: true, background: true
  }
  constructor(private readonly profiles: ProcessRuntime) {}
  start(request: AgentRuntimeStart, context: AgentRuntimeContext) {
    if (request.previous) return this.inspect(request.previous, context)
    return startComputerJsonl(request, context, this.profiles.profile(request, context, 'qwen-computer'))
  }
  inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    return inspectComputerJsonl(handle, context, this.profiles, adapter)
  }
  async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    requireComputerProfile(handle, context, this.profiles, adapter)
    if (!handle.runner) throw new Error('Qwen Computer receipt is unavailable')
    const result = await context.capabilities.require(AgentExecutionRunnerCapability).stop(handle.runner)
    return { status: result.state === 'exited' ? 'cancelled' as const : result.state === 'unknown' ? 'unknown' as const : 'cancelling' as const, handle }
  }
}
