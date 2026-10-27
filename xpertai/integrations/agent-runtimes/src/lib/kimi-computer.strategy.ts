import { runnerCompletion } from './runtime-completion.js'
import { Injectable } from '@nestjs/common'
import {
  AgentExecutionRunnerCapability,
  AgentRuntimeStrategy,
  type AgentRuntimeContext,
  type AgentRuntimeHandle,
  type AgentRuntimeStart,
  type IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'
import { RuntimeProfiles } from './managed-profiles.js'
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
  get managedProfiles() {
    return this.profiles.managedProfiles('kimi-computer')
  }
  readonly capabilities = {
    completionEvidence: 2 as const,
    idempotentCancellation: true,
    activity: { version: 1 as const, presentation: 'coding' as const },
    executionTools: [{ id: 'kimi', versions: ['2.1.1'], environments: ['computer' as const] }],
    recovery: 'session' as const,
    interactions: false,
    cancellation: true,
    background: true
  }
  constructor(private readonly profiles: RuntimeProfiles) {}
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
    const outcome = context.settlement?.status ?? 'cancelled'
    const controlEvidence = runnerCompletion(context, handle, outcome, result.completion)
    return {
      status: controlEvidence
        ? ('cancelled' as const)
        : result.state === 'stopping'
        ? ('cancelling' as const)
        : ('unknown' as const),
      handle,
      controlEvidence
    }
  }
}
