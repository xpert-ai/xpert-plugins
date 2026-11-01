import { runnerCompletion } from './runtime-completion.js'
import { Injectable } from '@nestjs/common'
import {
  AgentExecutionRunnerCapability,
  AgentRuntimeStrategy,
  type AgentRuntimeContext,
  type AgentRuntimeHandle,
  type AgentRuntimeObservation,
  type AgentRuntimeStart,
  type IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'
import { RuntimeProfiles } from './managed-profiles.js'
import { startComputerCodex, inspectComputerCodex, requireComputerProfile } from './codex-computer.js'

/** Computer exec is a separate capability surface from the interactive App Server adapter. */
@Injectable()
@AgentRuntimeStrategy('codex-computer')
export class CodexComputerRuntimeStrategy implements IAgentRuntimeStrategy {
  get managedProfiles() {
    return this.profiles.managedProfiles('codex-computer')
  }
  readonly capabilities = {
    completionEvidence: 2 as const,
    idempotentCancellation: true,
    activity: { version: 1 as const, presentation: 'coding' as const },
    executionTools: [{ id: 'codex', versions: ['0.159.2'], environments: ['computer' as const] }],
    recovery: 'session' as const,
    interactions: false,
    cancellation: true,
    background: true
  }
  constructor(private readonly profiles: RuntimeProfiles) {}
  start(request: AgentRuntimeStart, context: AgentRuntimeContext) {
    if (request.previous) return this.inspect(request.previous, context)
    return startComputerCodex(request, context, this.profiles.profile(request, context, 'codex-computer'))
  }
  async inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    requireComputerProfile(handle, context, this.profiles)
    // A durable result may precede cleanup. Recover that result after an API
    // restart without trying to read a JSONL service that has already exited.
    const observation = context.settlement
      ? { ...context.settlement, handle }
      : await inspectComputerCodex(handle, context, this.profiles)
    return ['succeeded', 'failed', 'cancelled'].includes(observation.status)
      ? this.settle(handle, context, observation)
      : observation
  }
  async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    requireComputerProfile(handle, context, this.profiles)
    if (!handle.runner) throw new Error('Codex Computer receipt is unavailable')
    return this.settle(handle, context, { status: 'cancelled', handle })
  }

  private async settle(
    handle: AgentRuntimeHandle,
    context: AgentRuntimeContext,
    observation: AgentRuntimeObservation
  ): Promise<AgentRuntimeObservation> {
    const receipt = handle.runner!
    const result = await context.capabilities.require(AgentExecutionRunnerCapability).stop(receipt)
    const outcome = context.settlement?.status ?? observation.status
    if (outcome !== 'succeeded' && outcome !== 'failed' && outcome !== 'cancelled')
      throw new Error('Invalid Computer settlement outcome')
    const controlEvidence = result.state === 'exited'
      ? runnerCompletion(context, handle, outcome, result.completion)
      : undefined
    return {
      ...observation,
      status: controlEvidence
        ? observation.status
        : result.state === 'stopping' && observation.status === 'cancelled'
        ? ('cancelling' as const)
        : ('unknown' as const),
      controlEvidence
    }
  }
}
