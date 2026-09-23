import { agentPrompt } from './input.js'
import { Injectable } from '@nestjs/common'
import {
  AgentRuntimeStrategy,
  type AgentRuntimeContext,
  type AgentRuntimeHandle,
  type AgentRuntimeObservation,
  type AgentRuntimeStart,
  type IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { ProcessRuntime } from './process-runtime.js'
import type { RuntimeProfile } from './config.js'

const Session = z.object({ id: z.string() })
const Message = z.object({
  info: z
    .object({
      role: z.string(),
      parentID: z.string().optional(),
      finish: z.string().optional(),
      error: z.unknown().optional(),
      time: z.object({ completed: z.number().optional() }).optional()
    })
    .passthrough(),
  parts: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
    metadata: z.object({ providerExecuted: z.boolean().optional() }).passthrough().optional()
  }).passthrough())
})

@Injectable()
@AgentRuntimeStrategy('opencode')
export class OpenCodeRuntimeStrategy implements IAgentRuntimeStrategy {
  readonly capabilities = { recovery: 'session' as const, interactions: false, cancellation: true, background: true }
  constructor(private readonly profiles: ProcessRuntime) {}

  async start(request: AgentRuntimeStart, context: AgentRuntimeContext) {
    if (request.previous) return this.inspect(request.previous, context)
    const profile = this.profiles.profile(request, context, 'opencode')
    const session = Session.parse(
      await this.http(profile, '/session', 'POST', { title: `Xpert ${context.invocationId}` })
    )
    const handle: AgentRuntimeHandle = {
      sessionId: session.id,
      runId: `msg_${context.invocationId.replaceAll('-', '')}`,
      metadata: { profileId: profile.id, profileVersion: profile.version }
    }
    const observation: AgentRuntimeObservation = { status: 'running', handle }
    await context.checkpoint(observation)
    // Session receipt is durable before dispatch. Reconnection only inspects, never re-sends.
    void this.http(profile, `/session/${encodeURIComponent(session.id)}/message`, 'POST', {
      messageID: handle.runId,
      parts: [{ type: 'text', text: agentPrompt(request.input) }]
    })
      .then(async (raw) => {
        const message = Message.parse(raw)
        await context.checkpoint(await this.observe(profile, handle, message))
      })
      .catch(async () => {
        await context
          .checkpoint({ status: 'unknown', handle, error: 'OpenCode request disconnected; inspect before retrying' })
          .catch(() => undefined)
      })
    return observation
  }

  async inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
    const profile = this.profile(handle, context)
    const messages = z
      .array(Message)
      .parse(await this.http(profile, `/session/${encodeURIComponent(handle.sessionId)}/message`, 'GET'))
    const response = messages
      .slice()
      .reverse()
      .find(
        (item) => item.info.role === 'assistant' && item.info.parentID === handle.runId
      )
    return this.observe(profile, handle, response)
  }

  private async observe(profile: RuntimeProfile, handle: AgentRuntimeHandle, message?: z.infer<typeof Message>): Promise<AgentRuntimeObservation> {
    const states = z
      .record(z.object({ type: z.string() }).passthrough())
      .parse(await this.http(profile, '/session/status', 'GET'))
    const state = states[handle.sessionId]?.type
    if (state === 'busy' || state === 'retry') return { status: 'running', handle }
    // A completed assistant message can still be an intermediate tool/compaction step.
    // Inspect only the latest matching message, and require both idle and a final receipt.
    if ((!state || state === 'idle') && message?.info.role === 'assistant' &&
        message.info.parentID === handle.runId && message.info.time?.completed !== undefined) {
      if (message.info.error) return this.result(handle, message)
      if (message.info.finish && !['tool-calls', 'unknown'].includes(message.info.finish) &&
          !message.parts.some((part) => part.type === 'tool' && !part.metadata?.providerExecuted)) {
        return this.result(handle, message)
      }
    }
    return { status: 'unknown', handle }
  }

  async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
    const profile = this.profile(handle, context)
    const acknowledged = z
      .boolean()
      .parse(await this.http(profile, `/session/${encodeURIComponent(handle.sessionId)}/abort`, 'POST', {}))
    return { status: acknowledged ? 'cancelled' : 'cancelling', handle }
  }

  private profile(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    const profile = this.profiles.configuration.profiles.find(
      (item) => item.id === handle.metadata?.profileId && item.provider === 'opencode'
    )
    if (
      !profile ||
      profile.version !== handle.metadata?.profileVersion ||
      !context.scope.workspaceId ||
      !profile.workspaceIds.includes(context.scope.workspaceId)
    )
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
            text: message.parts
              .filter((part) => part.type === 'text')
              .map((part) => part.text ?? '')
              .join('')
              .slice(-2 * 1024 * 1024)
          }
        }
  }

  private async http(profile: RuntimeProfile, path: string, method: string, body?: object): Promise<unknown> {
    if (!profile.serverUrl) throw new Error('OpenCode server URL is required')
    const base = new URL(profile.serverUrl)
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
      throw new Error('Invalid OpenCode server URL')
    const url = new URL(`${base.pathname.replace(/\/$/, '')}${path}`, base.origin)
    url.searchParams.set('directory', profile.workspaceRoot)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (profile.authorizationEnvironmentKey) {
      const authorization = process.env[profile.authorizationEnvironmentKey]
      if (!authorization) throw new Error('OpenCode authorization is not configured')
      headers.authorization = authorization
    }
    const response = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(profile.timeoutMs)
    })
    if (!response.ok) throw new Error(`OpenCode HTTP ${response.status}`)
    const text = await response.text()
    if (text.length > 4 * 1024 * 1024) throw new Error('OpenCode response exceeded the size limit')
    return JSON.parse(text)
  }
}
