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
    activity: { version: 1 as const, presentation: 'coding' as const },
    executionTools: [{ id: 'codex', versions: ['0.159.2'], environments: ['computer' as const] }],
    recovery: 'session' as const,
    interactions: false,
    cancellation: true,
    idempotentCancellation: true,
    completionEvidence: 2 as const,
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
    const proof = result.completion
    if (result.state !== 'exited' || receipt.supervision !== 1 || !proof ||
      proof.version !== 1 || proof.coverage !== 'descendants' ||
      proof.invocationId !== context.invocationId || proof.invocationId !== receipt.invocationId ||
      proof.processId !== receipt.processId || proof.environment.type !== receipt.environment.type ||
      proof.environment.environmentId !== receipt.environment.environmentId ||
      proof.environment.instanceId !== receipt.environment.instanceId) {
      return { ...observation, status: result.state === 'unknown' || observation.status !== 'cancelled' ? 'unknown' : 'cancelling' }
    }
    const outcome = observation.status
    if (outcome !== 'succeeded' && outcome !== 'failed' && outcome !== 'cancelled')
      throw new Error('Invalid Computer settlement outcome')
    return {
      ...observation,
      controlEvidence: {
        version: 1, source: 'provider', subject: { kind: 'invocation', id: context.invocationId },
        scope: 'operation', state: 'settled', outcome,
        sessionId: handle.sessionId, runId: handle.runId,
        receiptKey: receipt.processId, observedAt: new Date().toISOString(),
        ...(context.executionTarget ? { target: context.executionTarget } : {})
      }
    }
  }
}
