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
import { kimiCompletion } from './kimi-protocol.js'

const adapter: ComputerJsonlAdapter = {
  provider: 'kimi-computer',
  toolId: 'kimi',
  activityProtocol: 'kimi',
  completion: kimiCompletion
}

/** Structured receipt + exit code confirm execution, never the model's completion sentence. */
@Injectable()
@AgentRuntimeStrategy('kimi-computer')
export class KimiComputerRuntimeStrategy implements IAgentRuntimeStrategy {
  readonly capabilities = {
    activity: { version: 1 as const, presentation: 'coding' as const },
    executionTools: [{ id: 'kimi', versions: ['2.1.1'], environments: ['computer' as const] }],
    recovery: 'session' as const,
    interactions: false,
    cancellation: true,
    background: true
  }
  constructor(private readonly profiles: ProcessRuntime) {}
  start(request: AgentRuntimeStart, context: AgentRuntimeContext) {
    if (request.previous) return this.inspect(request.previous, context)
    return startComputerJsonl(request, context, this.profiles.profile(request, context, 'kimi-computer'))
  }
  inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    return inspectComputerJsonl(handle, context, this.profiles, adapter)
  }
  async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    requireComputerProfile(handle, context, this.profiles, adapter)
    if (!handle.runner) throw new Error('Kimi Computer receipt is unavailable')
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
