import { agentPrompt, ApprovalData } from './input.js'
import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import {
  AgentRuntimeStrategy,
  type AgentJson,
  type AgentRuntimeContext,
  type AgentRuntimeHandle,
  type AgentRuntimeObservation,
  type AgentRuntimeStart,
  type IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { ProcessRuntime } from './process-runtime.js'

type Permission = { behavior: 'allow'; updatedInput: object } | { behavior: 'deny'; message: string }
interface ClaudeQueryInput {
  prompt: string
  options: {
    cwd: string
    model?: string
    abortController: AbortController
    env: NodeJS.ProcessEnv
    permissionMode: 'default'
    settingSources: string[]
    canUseTool(tool: string, input: object): Promise<Permission>
  }
}
interface ClaudeSdk {
  query(input: ClaudeQueryInput): AsyncIterable<unknown>
}

@Injectable()
export class ClaudeSdkLoader {
  async load(): Promise<ClaudeSdk> {
    const packageName = '@anthropic-ai/claude-agent-sdk'
    const sdk: unknown = await import(packageName)
    if (!sdk || typeof sdk !== 'object' || !('query' in sdk) || typeof sdk.query !== 'function') {
      throw new Error('A compatible Claude Agent SDK is required')
    }
    return sdk as ClaudeSdk
  }
}

interface ClaudeRun {
  context: AgentRuntimeContext
  observation: AgentRuntimeObservation
  abort: AbortController
  permission?: { id: string; input: object; resolve(value: Permission): void }
  writes: Promise<void>
  timer: NodeJS.Timeout
}
const Event = z
  .object({
    type: z.string(),
    subtype: z.string().optional(),
    session_id: z.string().optional(),
    result: z.string().optional(),
    is_error: z.boolean().optional()
  })
  .passthrough()

@Injectable()
@AgentRuntimeStrategy('claude-code')
export class ClaudeCodeRuntimeStrategy implements IAgentRuntimeStrategy, OnModuleDestroy {
  readonly capabilities = { recovery: 'none' as const, interactions: true, cancellation: true, background: true }
  private readonly runs = new Map<string, ClaudeRun>()
  constructor(private readonly profiles: ProcessRuntime, private readonly sdk: ClaudeSdkLoader) {}

  async start(request: AgentRuntimeStart, context: AgentRuntimeContext) {
    if (request.previous) return this.inspect(request.previous, context)
    const profile = this.profiles.profile(request, context, 'claude-code')
    const sdk = await this.sdk.load()
    const cwd = await this.profiles.directory(profile, context)
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH }
    for (const key of profile.environmentKeys) if (process.env[key]) env[key] = process.env[key]
    if (this.runs.has(context.invocationId)) throw new Error('Claude operation already exists')
    const run: ClaudeRun = {
      context,
      observation: { status: 'running', handle: { sessionId: context.invocationId, runId: context.invocationId } },
      abort: new AbortController(),
      writes: Promise.resolve(),
      timer: setTimeout(() => {
        this.publish(run, { status: 'unknown', error: 'Claude runtime timed out' })
        run.abort.abort()
      }, profile.timeoutMs)
    }
    this.runs.set(context.invocationId, run)
    try {
      await context.checkpoint(run.observation)
      const stream = sdk.query({
        prompt: agentPrompt(request.input),
        options: {
          cwd,
          model: profile.model,
          abortController: run.abort,
          env,
          permissionMode: 'default',
          settingSources: [],
          canUseTool: (tool, input) =>
            new Promise<Permission>((resolve) => {
              if (tool === 'AskUserQuestion' || run.permission || run.abort.signal.aborted) {
                resolve({ behavior: 'deny', message: 'Operation unavailable' })
                return
              }
              const details = ApprovalData.safeParse(input)
              if (!details.success) { resolve({ behavior: 'deny', message: 'Tool input cannot be reviewed' }); return }
              const id = randomUUID()
              run.permission = { id, input, resolve }
              this.publish(run, {
                status: 'waiting',
                interaction: { id, kind: 'approval', prompt: `Approve Claude tool: ${tool}`, data: details.data }
              })
            })
        }
      })
      void this.consume(run, stream)
    } catch (error) {
      clearTimeout(run.timer)
      run.permission?.resolve({ behavior: 'deny', message: 'Runtime failed to start' })
      run.permission = undefined
      run.abort.abort()
      this.publish(run, { status: 'unknown', interaction: undefined, error: 'Claude launch outcome is uncertain; do not replay' })
      await run.writes
      this.runs.delete(context.invocationId)
      throw error
    }
    return run.observation
  }

  async inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
    return (
      this.find(handle, context)?.observation ?? {
        status: 'unknown',
        handle,
        error: 'Claude runner is unavailable; do not replay the operation'
      }
    )
  }
  async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    const run = this.find(handle, context)
    if (!run) return this.inspect(handle, context)
    this.publish(run, { status: 'cancelling' })
    run.permission?.resolve({ behavior: 'deny', message: 'Execution cancelled' })
    run.permission = undefined
    run.abort.abort()
    return run.observation
  }
  async respond(handle: AgentRuntimeHandle, id: string, answer: AgentJson, context: AgentRuntimeContext) {
    const run = this.find(handle, context)
    if (!run?.permission || run.permission.id !== id || typeof answer !== 'boolean')
      throw new Error('Invalid Claude approval')
    const pending = run.permission
    run.permission = undefined
    pending.resolve(
      answer ? { behavior: 'allow', updatedInput: pending.input } : { behavior: 'deny', message: 'User declined' }
    )
    this.publish(run, { status: 'running', interaction: undefined })
    return run.observation
  }

  private find(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    const run = this.runs.get(handle.runId)
    if (run && JSON.stringify(run.context.scope) !== JSON.stringify(context.scope))
      throw new Error('Claude run scope mismatch')
    return run
  }
  private publish(run: ClaudeRun, observation: AgentRuntimeObservation) {
    if (['succeeded', 'failed', 'cancelled'].includes(run.observation.status)) return
    run.observation = { ...run.observation, ...observation }
    const snapshot = structuredClone(run.observation)
    run.writes = run.writes.then(() => run.context.checkpoint(snapshot)).catch(() => run.abort.abort())
  }
  private async consume(run: ClaudeRun, stream: AsyncIterable<unknown>) {
    try {
      for await (const raw of stream) {
        const event = Event.parse(raw)
        if (event.session_id && run.observation.handle) run.observation.handle.sessionId = event.session_id
        if (event.type === 'result')
          this.publish(
            run,
            event.is_error || event.subtype !== 'success'
              ? { status: 'failed' }
              : { status: 'succeeded', result: { text: event.result ?? '' } }
          )
      }
      if (!['succeeded', 'failed'].includes(run.observation.status))
        this.publish(run, {
          status: run.observation.status === 'cancelling' ? 'cancelled' : 'unknown'
        })
    } catch {
      this.publish(run, { status: run.observation.status === 'cancelling' ? 'cancelled' : 'unknown' })
    } finally {
      clearTimeout(run.timer)
      await run.writes
      this.runs.delete(run.context.invocationId)
    }
  }
  onModuleDestroy() {
    for (const run of this.runs.values()) {
      clearTimeout(run.timer)
      run.permission?.resolve({ behavior: 'deny', message: 'Runtime stopped' })
      run.abort.abort()
    }
    this.runs.clear()
  }
}
