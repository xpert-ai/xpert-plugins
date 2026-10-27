import type { AgentRuntimeContext, AgentRuntimeHandle, AgentRuntimeObservation } from '@xpert-ai/plugin-sdk'

/** Only call after the adapter has verified the complete operation's exit boundary. */
export function runtimeCompletion(
  context: AgentRuntimeContext,
  handle: AgentRuntimeHandle,
  outcome: AgentRuntimeObservation['status'],
  receiptKey: string
): AgentRuntimeObservation['controlEvidence'] {
  if (!context.executionTarget || !['succeeded', 'failed', 'cancelled'].includes(outcome)) return undefined
  if (outcome !== 'succeeded' && outcome !== 'failed' && outcome !== 'cancelled') return undefined
  return {
    version: 1,
    source: 'provider',
    subject: { kind: 'invocation', id: context.invocationId },
    scope: 'operation',
    state: 'settled',
    outcome,
    sessionId: handle.sessionId,
    runId: handle.runId,
    target: context.executionTarget,
    receiptKey,
    observedAt: new Date().toISOString()
  }
}

export function runnerCompletion(
  context: AgentRuntimeContext,
  handle: AgentRuntimeHandle,
  outcome: AgentRuntimeObservation['status'],
  completion: import('@xpert-ai/plugin-sdk').AgentRunnerExitEvidence | undefined
): AgentRuntimeObservation['controlEvidence'] {
  const runner = handle.runner
  if (
    !runner ||
    !completion ||
    runner.supervision !== 1 ||
    completion.version !== 1 ||
    completion.coverage !== 'descendants' ||
    completion.invocationId !== context.invocationId ||
    completion.invocationId !== runner.invocationId ||
    completion.processId !== runner.processId ||
    completion.environment.type !== runner.environment.type ||
    completion.environment.environmentId !== runner.environment.environmentId ||
    completion.environment.instanceId !== runner.environment.instanceId
  )
    return undefined
  return runtimeCompletion(context, handle, outcome, `runner:${runner.processId}`)
}
