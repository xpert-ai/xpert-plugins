import { isDeepStrictEqual } from 'node:util'
import { executionRuntimeTargetsEqual } from '@xpert-ai/contracts'
import { agentPrompt, ApprovalData } from './input.js'
import { outputDelivery, taskResult } from './task-result.js'
import type { AgentOutputDelivery } from '@xpert-ai/plugin-sdk'
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
import { supervisedProcess } from './supervised-process.js'
import { runtimeCompletion } from './runtime-completion.js'
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
    spawnClaudeCodeProcess(options: {
      command: string
      args: string[]
      cwd?: string
      env: NodeJS.ProcessEnv
      signal: AbortSignal
    }): ReturnType<typeof supervisedProcess>['child']
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
  persisted?: boolean
  settled?: boolean
  delivery: AgentOutputDelivery
  context: AgentRuntimeContext
  observation: AgentRuntimeObservation
  abort: AbortController
  permission?: { id: string; input: object; resolve(value: Permission): void }
  writes: Promise<void>
  processes: Array<ReturnType<typeof supervisedProcess>>
  resultObservation?: AgentRuntimeObservation
  closing?: boolean
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
  readonly capabilities = {
    hostAffinity: 1 as const,
    completionEvidence: 2 as const,
    idempotentCancellation: true,
    recovery: 'none' as const,
    interactions: true,
    cancellation: true,
    background: true
  }
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
      delivery: outputDelivery(request.input.delivery),
      context,
      observation: { status: 'running', handle: { sessionId: context.invocationId, runId: context.invocationId } },
      abort: new AbortController(),
      writes: Promise.resolve(),
      processes: [],
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
          spawnClaudeCodeProcess: (options) => {
            if (run.closing) throw new Error('Claude execution is closing')
            const process = supervisedProcess(options.command, options.args, options.cwd ?? cwd, options.env)
            const stop = () => {
              process.stop()
            }
            options.signal.addEventListener('abort', stop, { once: true })
            if (options.signal.aborted || run.abort.signal.aborted) process.stop()
            void process.finished.then(() => options.signal.removeEventListener('abort', stop))
            run.processes.push(process)
            return process.child
          },
          canUseTool: (tool, input) =>
            new Promise<Permission>((resolve) => {
              if (tool === 'AskUserQuestion' || run.permission || run.abort.signal.aborted) {
                resolve({ behavior: 'deny', message: 'Operation unavailable' })
                return
              }
              const details = ApprovalData.safeParse(input)
              if (!details.success) {
                resolve({ behavior: 'deny', message: 'Tool input cannot be reviewed' })
                return
              }
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
      run.processes.forEach((process) => process.stop())
      await Promise.all(run.processes.map((process) => process.finished))
      this.publish(run, {
        status: 'unknown',
        interaction: undefined,
        error: 'Claude launch outcome is uncertain; do not replay'
      })
      await run.writes
      this.runs.delete(context.invocationId)
      throw error
    }
    return run.observation
  }

  async inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
    const run = this.find(handle, context)
    if (run?.settled) {
      await context.checkpoint(run.observation)
      this.runs.delete(context.invocationId)
    }
    return (
      run?.observation ?? {
        status: 'unknown',
        handle,
        error: 'Claude runner is unavailable; do not replay the operation'
      }
    )
  }
  async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    const run = this.find(handle, context)
    if (!run || run.settled) return this.inspect(handle, context)
    if (run.observation.status === 'cancelling') return run.observation
    this.publish(run, { status: 'cancelling' })
    run.permission?.resolve({ behavior: 'deny', message: 'Execution cancelled' })
    run.permission = undefined
    run.abort.abort()
    run.processes.forEach((process) => process.stop())
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
    if (
      run &&
      (!isDeepStrictEqual(run.context.scope, context.scope) ||
        !executionRuntimeTargetsEqual(run.context.executionTarget, context.executionTarget) ||
        run.observation.handle?.sessionId !== handle.sessionId ||
        run.context.invocationId !== context.invocationId)
    )
      throw new Error('Claude run scope mismatch')
    return run
  }
  private publish(run: ClaudeRun, observation: AgentRuntimeObservation) {
    if (['succeeded', 'failed', 'cancelled'].includes(run.observation.status)) return
    if (!run.closing && ['succeeded', 'failed', 'cancelled'].includes(observation.status)) {
      run.resultObservation ??= observation
      const snapshot = structuredClone({ ...run.observation, ...observation })
      run.writes = run.writes
        .then(() => run.context.checkpoint(snapshot))
        .then(() => {
          run.persisted = true
        })
        .catch(() => {
          run.persisted = false
          run.abort.abort()
        })
      return
    }
    run.observation = { ...run.observation, ...observation }
    const snapshot = structuredClone(run.observation)
    run.writes = run.writes
      .then(() => run.context.checkpoint(snapshot))
      .then(() => {
        run.persisted = true
      })
      .catch(() => {
        run.persisted = false
        run.abort.abort()
      })
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
              : { status: 'succeeded', result: taskResult(event.result ?? '', run.delivery) }
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
      run.closing = true
      await run.writes
      run.processes.forEach((process) => process.stop())
      const exits = await Promise.all(run.processes.map((process) => process.finished))
      const final = run.resultObservation ?? { status: 'unknown' as const }
      const proof = exits.length > 0 && exits.every(Boolean)
      this.publish(run, {
        ...final,
        ...(!proof ? { status: 'unknown' as const } : {}),
        ...(proof && run.observation.handle
          ? {
              controlEvidence: runtimeCompletion(
                run.context,
                run.observation.handle,
                final.status,
                'sdk-supervisor-exit'
              )
            }
          : {})
      })
      await run.writes
      run.settled = true
      if (run.persisted) this.runs.delete(run.context.invocationId)
    }
  }
  onModuleDestroy() {
    for (const run of this.runs.values()) {
      clearTimeout(run.timer)
      run.permission?.resolve({ behavior: 'deny', message: 'Runtime stopped' })
      run.abort.abort()
      run.processes.forEach((process) => process.stop())
    }
    this.runs.clear()
  }
}
