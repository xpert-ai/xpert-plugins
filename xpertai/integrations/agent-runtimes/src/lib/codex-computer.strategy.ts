import { Injectable } from '@nestjs/common'
import {
  AgentExecutionRunnerCapability, AgentRuntimeStrategy,
  type AgentRuntimeContext, type AgentRuntimeHandle, type AgentRuntimeStart, type IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'
import { ProcessRuntime } from './process-runtime.js'
import { startComputerCodex, inspectComputerCodex, requireComputerProfile } from './codex-computer.js'

/** Computer exec is a separate capability surface from the interactive App Server adapter. */
@Injectable()
@AgentRuntimeStrategy('codex-computer')
export class CodexComputerRuntimeStrategy implements IAgentRuntimeStrategy {
  readonly capabilities = {
    activity: { version: 1 as const, presentation: 'coding' as const },
    executionTools: [{ id: 'codex', versions: ['0.159.2'], environments: ['computer' as const] }],
    recovery: 'session' as const, interactions: false, cancellation: true, background: true
  }
  constructor(private readonly profiles: ProcessRuntime) {}
  start(request: AgentRuntimeStart, context: AgentRuntimeContext) {
    if (request.previous) return this.inspect(request.previous, context)
    return startComputerCodex(request, context, this.profiles.profile(request, context, 'codex-computer'))
  }
  inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    return inspectComputerCodex(handle, context, this.profiles)
  }
  async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    requireComputerProfile(handle, context, this.profiles)
    if (!handle.runner) throw new Error('Codex Computer receipt is unavailable')
    const result = await context.capabilities.require(AgentExecutionRunnerCapability).stop(handle.runner)
    return { status: result.state === 'exited' ? 'cancelled' as const : result.state === 'unknown' ? 'unknown' as const : 'cancelling' as const, handle }
  }
}
