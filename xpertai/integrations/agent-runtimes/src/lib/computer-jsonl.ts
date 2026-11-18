import { runnerCompletion } from './runtime-completion.js'
import {
  AgentExecutionRunnerCapability,
  type AgentRuntimeContext,
  type AgentRuntimeHandle,
  type AgentRuntimeObservation,
  type AgentRuntimeStart
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { agentPrompt } from './input.js'
import { withProjectWorkspaceContext } from './project-workspace.js'
import { outputDelivery, resolveTaskResult, deliveryPaths } from './task-result.js'
import type { RuntimeProfile } from './managed-profiles.js'
import type { RuntimeProfiles } from './managed-profiles.js'
import type { JsonlActivityProtocol } from './activity.js'
import { collectJsonlActivity } from './computer-activity.js'
import { appendActivities } from './activity.js'
import { completionFailure, completionMetadata, type CompletionCheck } from './computer-completion.js'

export interface ComputerJsonlAdapter {
  provider: RuntimeProfile['provider']
  toolId: string
  activityProtocol: JsonlActivityProtocol
  completion(events: unknown[]): CompletionCheck
}
const State = z
  .object({
    state: z.enum(['idle', 'running', 'exited', 'failed']),
    events: z.array(z.unknown()),
    previewTruncated: z.boolean().optional(),
    exitCode: z.number().int().optional(),
    error: z.string().optional(),
    startedAt: z.string().datetime({ offset: true }).optional()
  })
  .passthrough()

export async function startComputerJsonl(
  request: AgentRuntimeStart,
  context: AgentRuntimeContext,
  profile: RuntimeProfile
) {
  const runner = context.capabilities.require(AgentExecutionRunnerCapability)
  const metadata = {
    profileId: profile.id,
    profileVersion: profile.version,
    workspaceId: context.scope.workspaceId,
    ...(request.target.configuration.managedRuntime
      ? { managedRuntime: request.target.configuration.managedRuntime }
      : {}),
    delivery: outputDelivery(request.input.delivery)
  }
  const receipt = await runner.start(context.invocationId, async (receipt) => {
    await context.checkpoint({
      status: 'running',
      handle: {
        sessionId: context.invocationId,
        runId: context.invocationId,
        runner: receipt,
        metadata
      }
    })
  })
  const handle: AgentRuntimeHandle = {
    sessionId: context.invocationId,
    runId: context.invocationId,
    runner: receipt,
    metadata
  }
  await context.checkpoint({ status: 'running', handle })
  // The service accepts one prompt only. A lost acknowledgement is inspected, never replayed.
  await runner.request(receipt, {
    method: 'POST', path: '/task',
    body: { prompt: agentPrompt(withProjectWorkspaceContext(request.input, context, receipt)) }
  })
  return { status: 'running' as const, handle }
}

export async function inspectComputerJsonl(
  handle: AgentRuntimeHandle,
  context: AgentRuntimeContext,
  profiles: RuntimeProfiles,
  adapter: ComputerJsonlAdapter
): Promise<AgentRuntimeObservation> {
  requireComputerProfile(handle, context, profiles, adapter)
  if (!handle.runner) throw new Error('Computer task receipt is unavailable')
  const receipt = handle.runner
  const runner = context.capabilities.require(AgentExecutionRunnerCapability)
  const process = await runner.inspect(handle.runner)
  if (context.settlement) {
    const stopped = await runner.stop(receipt)
    const controlEvidence = runnerCompletion(context, handle, context.settlement.status, stopped.completion)
    return {
      ...context.settlement,
      handle,
      status: controlEvidence ? context.settlement.status : 'unknown',
      controlEvidence
    }
  }
  if (process.state !== 'running') {
    await appendActivities(context, [], true, ['source_lost'])
    const diagnostic = completionFailure(
      'runner_unavailable',
      'The CLI runner is unavailable; completion cannot be verified.'
    ).diagnostic
    // A verified process-family exit permits failure delivery, never a fabricated success or replay.
    const controlEvidence =
      process.state === 'exited' ? runnerCompletion(context, handle, 'failed', process.completion) : undefined
    return {
      status: controlEvidence ? 'failed' : 'unknown',
      handle: { ...handle, metadata: { ...handle.metadata, completion: completionMetadata(diagnostic) } },
      error: `[${diagnostic.code}] ${diagnostic.message}`,
      controlEvidence
    }
  }
  const state = State.parse(await runner.request(handle.runner, { method: 'GET', path: '/task' }))
  const progress = {
    source: 'executor' as const,
    observedAt: new Date().toISOString(),
    ...(state.startedAt ? { startedAt: state.startedAt } : {}),
    phase: state.state === 'running' ? 'working' : state.state
  }
  const terminal = state.state === 'exited' || state.state === 'failed'
  const activity = context.activity || (terminal && state.previewTruncated)
    ? await collectJsonlActivity(
        context,
        handle,
        adapter.activityProtocol,
        terminal
      )
    : undefined
  if (state.state === 'running') return { status: 'running', handle, progress }
  if (state.state === 'idle') return { status: 'unknown', handle, progress }
  const collected = activity?.status === 'collected' ? activity : undefined
  if (activity?.status === 'unavailable' && state.previewTruncated && state.state === 'exited' && state.exitCode === 0) {
    const diagnostic = completionFailure(
      'activity_unavailable',
      'CLI completion data is temporarily unavailable; retry collection without rerunning the task.'
    ).diagnostic
    return {
      status: 'unknown',
      handle: { ...handle, metadata: { ...handle.metadata, completion: completionMetadata(diagnostic) } },
      progress,
      error: `[${diagnostic.code}] ${diagnostic.message}`
    }
  }
  const receiptLost = activity?.status === 'incomplete' || collected?.gap || (!collected && state.previewTruncated)
  let completion = receiptLost
    ? completionFailure(
        'activity_incomplete',
        `CLI protocol events are incomplete${activity?.status === 'incomplete' ? ` (${activity.reason})` : ''}; final execution cannot be verified.`
      )
    : adapter.completion(collected?.events ?? state.events)
  if (state.state === 'failed')
    completion = completionFailure(
      'process_failed',
      state.error || 'The CLI process or JSONL transport failed.',
      completion.diagnostic
    )
  else if (state.exitCode === undefined)
    completion = completionFailure(
      'missing_exit_code',
      'The CLI exited without a process exit code.',
      completion.diagnostic
    )
  else if (state.exitCode !== 0 && (completion.ok || ['missing_final_result', 'activity_incomplete'].includes(completion.diagnostic.code)))
    completion = completionFailure(
      'process_exit_nonzero',
      `The CLI process exited with code ${state.exitCode}.`,
      completion.diagnostic
    )
  const diagnostic = { ...completion.diagnostic, ...(state.exitCode !== undefined ? { exitCode: state.exitCode } : {}) }
  handle = { ...handle, metadata: { ...handle.metadata, completion: completionMetadata(diagnostic) } }
  const delivery = outputDelivery(handle.metadata?.delivery)
  // Missing final protocol data is a failed result even after exit code 0.
  // Persist it before cleanup; descendant completion below still gates terminal settlement.
  let observation: AgentRuntimeObservation =
    state.state === 'exited' && state.exitCode === 0 && completion.ok
      ? {
          status: 'succeeded',
          handle,
          progress
        }
      : {
          status: 'failed',
          handle,
          progress,
          error: `[${diagnostic.code}] ${diagnostic.message}${
            diagnostic.exitCode !== undefined ? ` (exit code ${diagnostic.exitCode})` : ''
          }`
        }
  if (observation.status === 'succeeded' && completion.ok) {
    observation.result = {
      ...(await resolveTaskResult(completion.text, delivery, runner.readTaskReportFile
        ? (path) => runner.readTaskReportFile(receipt, path) : undefined)),
      data: { workingDirectory: receipt.workingDirectory }
    }
  }
  if (observation.result && delivery.mode !== 'none') {
    const paths = deliveryPaths(delivery)
    try {
      if (!paths.length) throw new Error('No declared deliverables')
      const artifacts = await runner.collectArtifacts(handle.runner, { mode: delivery.mode, paths })
      if (!artifacts.length) throw new Error('No committed exports')
      observation.result.artifacts = artifacts
      observation.result.export = { mode: delivery.mode, status: 'completed' }
    } catch {
      observation.result.export = {
        mode: delivery.mode,
        status: 'failed',
        error: paths.length ? 'artifact_collection_failed: recover delivery without rerunning the task.' : 'delivery_selection_required: select the exact file paths to collect.'
      }
    }
  }
  // Durable result before cleanup also protects API restart between these operations.
  await context.checkpoint(observation)
  const stopped = await runner.stop(handle.runner)
  const controlEvidence = runnerCompletion(context, handle, observation.status, stopped.completion)
  return { ...observation, status: controlEvidence ? observation.status : 'unknown', controlEvidence }
}

export function requireComputerProfile(
  handle: AgentRuntimeHandle,
  context: AgentRuntimeContext,
  profiles: RuntimeProfiles,
  adapter: ComputerJsonlAdapter
) {
  const profile = profiles.receiptProfile(handle, context, adapter.provider)
  if (
    !handle.runner ||
    handle.runner.tool.id !== adapter.toolId ||
    !profile ||
    profile.executionEnvironment !== 'computer' ||
    profile.version !== handle.metadata?.profileVersion ||
    !context.scope.workspaceId
  )
    throw new Error('Computer task profile is unavailable')
}
