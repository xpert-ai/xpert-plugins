import { Injectable } from '@nestjs/common'
import {
  AgentExecutionRunnerCapability,
  AgentRuntimeStrategy,
  type AgentRuntimeContext,
  type AgentRuntimeHandle,
  type AgentRuntimeStart,
  type IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'
import { ProcessRuntime } from './process-runtime.js'
import {
  inspectComputerJsonl,
  requireComputerProfile,
  startComputerJsonl,
  type ComputerJsonlAdapter
} from './computer-jsonl.js'
import { messageCompletion } from './message-completion.js'

const adapter: ComputerJsonlAdapter = {
  provider: 'codebuddy-computer',
  toolId: 'codebuddy',
  activityProtocol: 'codebuddy',
  completion: (value) => messageCompletion('CodeBuddy', value)
}

/** Structured receipt + exit code confirm execution, never the model's completion sentence. */
@Injectable()
@AgentRuntimeStrategy('codebuddy-computer')
export class CodeBuddyComputerRuntimeStrategy implements IAgentRuntimeStrategy {
  readonly capabilities = {
    activity: { version: 1 as const, presentation: 'coding' as const },
    executionTools: [{ id: 'codebuddy', versions: ['2.161.1'], environments: ['computer' as const] }],
    recovery: 'session' as const,
    interactions: false,
    cancellation: true,
    background: true
  }
  constructor(private readonly profiles: ProcessRuntime) {}
  start(request: AgentRuntimeStart, context: AgentRuntimeContext) {
    if (request.previous) return this.inspect(request.previous, context)
    return startComputerJsonl(request, context, this.profiles.profile(request, context, 'codebuddy-computer'))
  }
  inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    return inspectComputerJsonl(handle, context, this.profiles, adapter)
  }
  async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    requireComputerProfile(handle, context, this.profiles, adapter)
    if (!handle.runner) throw new Error('CodeBuddy Computer receipt is unavailable')
    const result = await context.capabilities.require(AgentExecutionRunnerCapability).stop(handle.runner)
    return {
      status:
        result.state === 'exited'
          ? ('cancelled' as const)
          : result.state === 'unknown'
          ? ('unknown' as const)
          : ('cancelling' as const),
      handle
    }
  }
}
