import type { AgentInvocationInput, AgentRunnerReceipt, AgentRuntimeContext } from '@xpert-ai/plugin-sdk'

/** Task semantics come from the host; filesystem location comes from the acquired runner, never provider names. */
export function withProjectWorkspaceContext(
  input: Readonly<AgentInvocationInput>,
  context: Pick<AgentRuntimeContext, 'projectTask'>,
  receipt?: AgentRunnerReceipt
): Readonly<AgentInvocationInput> {
  // Reviews keep their own evidence/permission instructions. A project association alone is not an implementation.
  if (context.projectTask?.purpose.type !== 'implementation' || !receipt) return input
  return {
    ...input,
    prompt: [
      `Assigned project working directory (JSON string): ${JSON.stringify(receipt.workingDirectory)}`,
      'Before implementation, read project.md when present in this directory and discover relevant installed skills under skills/. Apply the project target, file boundaries and environment instructions. If the task conflicts with those constraints, report the concrete conflict to the calling Agent for revision. Use the selected development environment for builds and tests, including its runtime settings. Requested delivery paths are relative to this directory; copy requested deliverables there when work uses another authorized directory. These instructions do not expand your assigned task or tool permissions.',
      input.prompt
    ].join('\n\n')
  }
}
