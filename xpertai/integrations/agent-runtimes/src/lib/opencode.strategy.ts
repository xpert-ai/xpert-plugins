import type { AgentRuntimeDeploymentSpec, AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import { agentPrompt } from './input.js'
import { outputDelivery, taskResult } from './task-result.js'
import { Injectable } from '@nestjs/common'
import {
  AgentRuntimeStrategy,
  AgentExecutionRunnerCapability,
  type AgentJson,
  type AgentRuntimeContext,
  type AgentRuntimeHandle,
  type AgentRuntimeObservation,
  type AgentRuntimeStart,
  type IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { RuntimeProfiles } from './managed-profiles.js'
import { appendActivities, openCodeActivities } from './activity.js'
import type { RuntimeProfile } from './managed-profiles.js'

const Session = z.object({ id: z.string() })
const Message = z.object({
  info: z
    .object({
      role: z.string(),
      parentID: z.string().optional(),
      finish: z.string().optional(),
      error: z.unknown().optional(),
      time: z.object({ created: z.number().optional(), completed: z.number().optional() }).optional()
    })
    .passthrough(),
  parts: z.array(
    z
      .object({
        type: z.string(),
        text: z.string().optional(),
        metadata: z.object({ providerExecuted: z.boolean().optional() }).passthrough().optional()
      })
      .passthrough()
  )
})

@Injectable()
@AgentRuntimeStrategy('opencode')
export class OpenCodeRuntimeStrategy implements IAgentRuntimeStrategy {
  get managedProfiles() {
    return this.profiles.managedProfiles('opencode')
  }
  /** A service-owning installed strategy supplies its connection here; never guess a private URL. */
  async resolveManagedDeployment(
    _reference: string,
    _scope: Readonly<AgentInvocationScope>
  ): Promise<AgentRuntimeDeploymentSpec | undefined> {
    return undefined
  }
  readonly capabilities = {
    activity: { version: 1 as const, presentation: 'coding' as const },
    executionTools: [{ id: 'opencode', versions: ['1.18.33'], environments: ['computer' as const] }],
    recovery: 'session' as const,
    interactions: false,
    cancellation: true,
    background: true
  }
  constructor(private readonly profiles: RuntimeProfiles) {}

  async start(request: AgentRuntimeStart, context: AgentRuntimeContext) {
    if (request.previous) return this.inspect(request.previous, context)
    const profile = this.profiles.profile(request, context, 'opencode')
    const runner =
      profile.executionEnvironment === 'computer'
        ? await context.capabilities
            .require(AgentExecutionRunnerCapability)
            .start(context.invocationId, async (receipt) => {
              await context.checkpoint({
                status: 'running',
                handle: {
                  sessionId: 'pending',
                  runId: context.invocationId,
                  runner: receipt,
                  metadata: {
                    profileId: profile.id,
                    profileVersion: profile.version,
                    workspaceId: context.scope.workspaceId,
                    managedRuntime: request.target.configuration.managedRuntime
                  }
                }
              })
            })
        : undefined
    const pending: AgentRuntimeHandle = { sessionId: 'pending', runId: context.invocationId, runner }
    const session = Session.parse(
      await this.http(profile, '/session', 'POST', { title: `Xpert ${context.invocationId}` }, context, pending)
    )
    const handle: AgentRuntimeHandle = {
      sessionId: session.id,
      ...(runner ? { runner } : {}),
      runId: `msg_${context.invocationId.replaceAll('-', '')}`,
      metadata: {
        profileId: profile.id,
        profileVersion: profile.version,
        workspaceId: context.scope.workspaceId,
        delivery: outputDelivery(request.input.delivery),
        ...(profile.deploymentRevision ? { deploymentRevision: profile.deploymentRevision } : {}),
        ...(request.target.configuration.managedRuntime
          ? { managedRuntime: request.target.configuration.managedRuntime }
          : {})
      }
    }
    const observation: AgentRuntimeObservation = { status: 'running', handle }
    await context.checkpoint(observation)
    if (!runner) {
      // The durable session receipt precedes dispatch; recovery never resends the prompt.
      void this.http(
        profile,
        `/session/${encodeURIComponent(session.id)}/message`,
        'POST',
        {
          messageID: handle.runId,
          parts: [{ type: 'text', text: agentPrompt(request.input) }]
        },
        context,
        handle
      )
        .then(async (raw) => {
          const message = Message.parse(raw)
          await context.checkpoint(await this.observe(profile, handle, message, context))
        })
        .catch(async () => {
          await context
            .checkpoint({ status: 'unknown', handle, error: 'OpenCode request disconnected; inspect before retrying' })
            .catch(() => undefined)
        })
      return observation
    }
    await this.http(
      profile,
      `/session/${encodeURIComponent(session.id)}/prompt_async`,
      'POST',
      {
        messageID: handle.runId,
        parts: [{ type: 'text', text: agentPrompt(request.input) }]
      },
      context,
      handle
    )
    return observation
  }

  async inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
    const profile = this.profile(handle, context)
    if (handle.runner) {
      const process = await context.capabilities.require(AgentExecutionRunnerCapability).inspect(handle.runner)
      if (process.state !== 'running' || handle.sessionId === 'pending') return { status: 'unknown', handle }
    }
    let messages: z.infer<typeof Message>[]
    try {
      messages = z
        .array(Message)
        .parse(
          await this.http(
            profile,
            `/session/${encodeURIComponent(handle.sessionId)}/message`,
            'GET',
            undefined,
            context,
            handle
          )
        )
    } catch {
      await appendActivities(context, [], false, ['source_truncated'])
      try {
        // OpenCode exposes limit, but no stable backwards cursor in this pinned
        // contract. Preserve collected history and read the final receipt without
        // claiming that the latest message is the entire session transcript.
        messages = z
          .array(Message)
          .parse(
            await this.http(
              profile,
              `/session/${encodeURIComponent(handle.sessionId)}/message`,
              'GET',
              undefined,
              context,
              handle,
              1
            )
          )
      } catch {
        await appendActivities(context, [], false, ['source_lost'])
        return {
          status: 'unknown',
          handle,
          error: 'OpenCode messages are unavailable or exceed the bounded response size'
        }
      }
    }
    const response = messages
      .slice()
      .reverse()
      .find((item) => item.info.role === 'assistant' && item.info.parentID === handle.runId)
    const observation = await this.observe(profile, handle, response, context)
    await appendActivities(
      context,
      openCodeActivities(messages, handle.runId),
      ['succeeded', 'failed'].includes(observation.status)
    )
    const starts = messages
      .filter((item) => item.info.role === 'assistant' && item.info.parentID === handle.runId)
      .flatMap((item) => (item.info.time?.created !== undefined ? [item.info.time.created] : []))
    if (starts.length)
      observation.progress = {
        source: 'executor',
        observedAt: new Date().toISOString(),
        startedAt: new Date(Math.min(...starts)).toISOString(),
        phase: ['succeeded', 'failed'].includes(observation.status) ? 'completed' : 'working'
      }
    if (handle.runner && ['succeeded', 'failed'].includes(observation.status)) {
      const runner = context.capabilities.require(AgentExecutionRunnerCapability)
      if (observation.result) {
        const result = observation.result,
          delivery = outputDelivery(handle.metadata?.delivery)
        if (delivery.mode !== 'none') {
          // An explicit caller selection is authoritative even when the model omits a file item.
          const paths =
            delivery.paths ?? (result.items ?? []).flatMap((item) => (item.type === 'file' ? [item.path] : []))
          try {
            if (!paths.length) throw new Error('No declared deliverables')
            const artifacts = await runner.collectArtifacts(handle.runner, { mode: delivery.mode, paths })
            if (!artifacts.length) throw new Error('No committed exports')
            result.artifacts = artifacts
            result.export = { mode: delivery.mode, status: 'completed' }
          } catch {
            result.export = {
              mode: delivery.mode,
              status: 'failed',
              error: 'Requested files could not be exported. Task execution has finished; inspect the workspace.'
            }
          }
        }
      }
      // Persist results and artifact references before guest shutdown; host cleanup can retry.
      await context.checkpoint(observation)
      await runner.stop(handle.runner)
    }
    return observation
  }

  private async observe(
    profile: RuntimeProfile,
    handle: AgentRuntimeHandle,
    message?: z.infer<typeof Message>,
    context?: AgentRuntimeContext
  ): Promise<AgentRuntimeObservation> {
    const states = z
      .record(z.object({ type: z.string() }).passthrough())
      .parse(await this.http(profile, '/session/status', 'GET', undefined, context, handle))
    const state = states[handle.sessionId]?.type
    if (state === 'busy' || state === 'retry') return { status: 'running', handle }
    // A completed assistant message can still be an intermediate tool/compaction step.
    // Inspect only the latest matching message, and require both idle and a final receipt.
    if (
      (!state || state === 'idle') &&
      message?.info.role === 'assistant' &&
      message.info.parentID === handle.runId &&
      message.info.time?.completed !== undefined
    ) {
      if (message.info.error) return this.result(handle, message)
      if (
        message.info.finish &&
        !['tool-calls', 'unknown'].includes(message.info.finish) &&
        !message.parts.some((part) => part.type === 'tool' && !part.metadata?.providerExecuted)
      ) {
        return this.result(handle, message)
      }
    }
    return { status: 'unknown', handle }
  }

  async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
    const profile = this.profile(handle, context)
    if (handle.runner) {
      const process = await context.capabilities.require(AgentExecutionRunnerCapability).stop(handle.runner)
      return {
        status: process.state === 'exited' ? 'cancelled' : process.state === 'unknown' ? 'unknown' : 'cancelling',
        handle
      }
    }
    const acknowledged = z
      .boolean()
      .parse(
        await this.http(profile, `/session/${encodeURIComponent(handle.sessionId)}/abort`, 'POST', {}, context, handle)
      )
    return { status: acknowledged ? 'cancelled' : 'cancelling', handle }
  }

  private profile(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    const profile = this.profiles.receiptProfile(handle, context, 'opencode')
    if (!profile || profile.version !== handle.metadata?.profileVersion || !context.scope.workspaceId)
      throw new Error('OpenCode profile is unavailable')
    return profile
  }

  private result(handle: AgentRuntimeHandle, message: z.infer<typeof Message>): AgentRuntimeObservation {
    return message.info.error
      ? { status: 'failed', handle, error: 'OpenCode execution failed' }
      : {
          status: 'succeeded',
          handle,
          result: {
            ...taskResult(
              message.parts
                .filter((part) => part.type === 'text')
                .map((part) => part.text ?? '')
                .join('')
                .slice(-2 * 1024 * 1024),
              outputDelivery(handle.metadata?.delivery)
            ),
            ...(handle.runner ? { data: { workingDirectory: handle.runner.workingDirectory } } : {})
          }
        }
  }

  private async http(
    profile: RuntimeProfile,
    path: string,
    method: 'GET' | 'POST',
    body?: AgentJson,
    context?: AgentRuntimeContext,
    handle?: AgentRuntimeHandle,
    limit?: number
  ): Promise<unknown> {
    if (!context) throw new Error('Runtime context is unavailable')
    if (profile.executionEnvironment === 'service') {
      const deployment = await this.profiles.deployment(profile, context)
      if (deployment.type !== 'service') throw new Error('OpenCode service is unavailable')
      const base = new URL(deployment.serverUrl)
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
        throw new Error('Invalid OpenCode server URL')
      const url = new URL(`${base.pathname.replace(/\/$/, '')}${path}`, base.origin)
      url.searchParams.set('directory', deployment.workspaceRoot)
      if (limit) url.searchParams.set('limit', String(limit))
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (deployment.authorization) headers.authorization = deployment.authorization
      const response = await fetch(url, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(deployment.timeoutMs)
      })
      if (!response.ok) throw new Error(`OpenCode HTTP ${response.status}`)
      const text = await response.text()
      if (text.length > 4 * 1024 * 1024) throw new Error('OpenCode response exceeded the size limit')
      return JSON.parse(text)
    }
    if (!handle?.runner) throw new Error('Computer runner receipt is unavailable')
    return context.capabilities
      .require(AgentExecutionRunnerCapability)
      .request(handle.runner, { method, path, body, ...(limit ? { query: { limit } } : {}) })
  }
}
