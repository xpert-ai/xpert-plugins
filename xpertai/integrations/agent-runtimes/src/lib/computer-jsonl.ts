import {
  AgentExecutionRunnerCapability,
  type AgentRuntimeContext,
  type AgentRuntimeHandle,
  type AgentRuntimeObservation,
  type AgentRuntimeStart
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { agentPrompt } from './input.js'
import { outputDelivery, taskResult } from './task-result.js'
import type { RuntimeProfile } from './config.js'
import type { ProcessRuntime } from './process-runtime.js'
import { collectJsonlActivity } from './computer-activity.js'
import { appendActivities } from './activity.js'
import { completionFailure, completionMetadata, type CompletionCheck } from './computer-completion.js'

export interface ComputerJsonlAdapter {
  provider: RuntimeProfile['provider']
  toolId: string
  activityProtocol: 'qwen' | 'codex'
  completion(events: unknown[]): CompletionCheck
}
const State = z.object({
  state: z.enum(['idle', 'running', 'exited', 'failed']),
  events: z.array(z.unknown()),
  previewTruncated: z.boolean().optional(),
  exitCode: z.number().int().optional(),
  error: z.string().optional(),
  startedAt: z.string().datetime({ offset: true }).optional()
}).passthrough()

export async function startComputerJsonl(request: AgentRuntimeStart, context: AgentRuntimeContext, profile: RuntimeProfile) {
  const runner = context.capabilities.require(AgentExecutionRunnerCapability)
  const metadata = { profileId: profile.id, profileVersion: profile.version,
    delivery: outputDelivery(request.input.delivery) }
  const receipt = await runner.start(context.invocationId, async (receipt) => {
    await context.checkpoint({ status: 'running', handle: {
      sessionId: context.invocationId, runId: context.invocationId, runner: receipt, metadata
    } })
  })
  const handle: AgentRuntimeHandle = { sessionId: context.invocationId, runId: context.invocationId, runner: receipt, metadata }
  await context.checkpoint({ status: 'running', handle })
  // The service accepts one prompt only. A lost acknowledgement is inspected, never replayed.
  await runner.request(receipt, { method: 'POST', path: '/task', body: { prompt: agentPrompt(request.input) } })
  return { status: 'running' as const, handle }
}

export async function inspectComputerJsonl(handle: AgentRuntimeHandle, context: AgentRuntimeContext, profiles: ProcessRuntime, adapter: ComputerJsonlAdapter): Promise<AgentRuntimeObservation> {
  requireComputerProfile(handle, context, profiles, adapter)
  if (!handle.runner) throw new Error('Computer task receipt is unavailable')
  const receipt = handle.runner
  const runner = context.capabilities.require(AgentExecutionRunnerCapability)
  const process = await runner.inspect(handle.runner)
  if (process.state !== 'running') {
    await appendActivities(context, [], true, ['source_lost'])
    const diagnostic = completionFailure('runner_unavailable', 'The CLI runner is unavailable; completion cannot be verified.').diagnostic
    return { status: 'unknown', handle: { ...handle, metadata: { ...handle.metadata, completion: completionMetadata(diagnostic) } }, error: `[${diagnostic.code}] ${diagnostic.message}` }
  }
  const state = State.parse(await runner.request(handle.runner, { method: 'GET', path: '/task' }))
  const progress = { source: 'executor' as const, observedAt: new Date().toISOString(),
    ...(state.startedAt ? { startedAt: state.startedAt } : {}),
    phase: state.state === 'running' ? 'working' : state.state }
  const activity = context.activity ? await collectJsonlActivity(context, handle, adapter.activityProtocol, state.state === 'exited' || state.state === 'failed') : undefined
  if (state.state === 'running') return { status: 'running', handle, progress }
  if (state.state === 'idle') return { status: 'unknown', handle, progress }
  const receiptLost = activity?.gap || (!activity && state.previewTruncated)
  let completion = receiptLost
    ? completionFailure('activity_incomplete', 'CLI protocol events are incomplete; final execution cannot be verified.')
    : adapter.completion(activity?.events ?? state.events)
  if (state.state === 'failed') completion = completionFailure('process_failed', state.error || 'The CLI process or JSONL transport failed.', completion.diagnostic)
  else if (state.exitCode === undefined) completion = completionFailure('missing_exit_code', 'The CLI exited without a process exit code.', completion.diagnostic)
  else if (state.exitCode !== 0 && (completion.ok || completion.diagnostic.code === 'missing_final_result'))
    completion = completionFailure('process_exit_nonzero', `The CLI process exited with code ${state.exitCode}.`, completion.diagnostic)
  const diagnostic = { ...completion.diagnostic, ...(state.exitCode !== undefined ? { exitCode: state.exitCode } : {}) }
  handle = { ...handle, metadata: { ...handle.metadata, completion: completionMetadata(diagnostic) } }
  const delivery = outputDelivery(handle.metadata?.delivery)
  const observation: AgentRuntimeObservation = state.state === 'exited' && state.exitCode === 0 && completion.ok
    ? { status: 'succeeded', handle, progress, result: { ...taskResult(completion.text, delivery), data: { workingDirectory: receipt.workingDirectory } } }
    : { status: receiptLost && state.exitCode === 0 ? 'unknown' : 'failed', handle, progress,
        error: `[${diagnostic.code}] ${diagnostic.message}${diagnostic.exitCode !== undefined ? ` (exit code ${diagnostic.exitCode})` : ''}` }
  if (observation.result && delivery.mode !== 'none') {
    const paths = delivery.paths ?? (observation.result.items ?? []).flatMap(item => item.type === 'file' ? [item.path] : [])
    try {
      if (!paths.length) throw new Error('No declared deliverables')
      const artifacts = await runner.collectArtifacts(handle.runner, { mode: delivery.mode, paths })
      if (!artifacts.length) throw new Error('No committed exports')
      observation.result.artifacts = artifacts
      observation.result.export = { mode: delivery.mode, status: 'completed' }
    } catch {
      observation.result.export = { mode: delivery.mode, status: 'failed', error: 'Requested files could not be exported. Inspect the workspace.' }
    }
  }
  // Durable result before cleanup also protects API restart between these operations.
  await context.checkpoint(observation)
  await runner.stop(handle.runner)
  return observation
}

export function requireComputerProfile(handle: AgentRuntimeHandle, context: AgentRuntimeContext, profiles: ProcessRuntime, adapter: ComputerJsonlAdapter) {
  const profile = profiles.configuration.profiles.find(item => item.id === handle.metadata?.profileId && item.provider === adapter.provider)
  if (!handle.runner || handle.runner.tool.id !== adapter.toolId || !profile || profile.executionEnvironment !== 'computer' || profile.version !== handle.metadata?.profileVersion ||
      !context.scope.workspaceId || !profile.workspaceIds.includes(context.scope.workspaceId)) throw new Error('Computer task profile is unavailable')
}
