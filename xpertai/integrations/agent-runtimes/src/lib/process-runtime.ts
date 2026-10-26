import { agentPrompt } from './input.js'
import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { mkdir, realpath } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import type {
  AgentRuntimeContext,
  AgentRuntimeHandle,
  AgentRuntimeObservation,
  AgentRuntimeStart
} from '@xpert-ai/plugin-sdk'
import type { AgentOutputDelivery } from '@xpert-ai/plugin-sdk'
import { RuntimeProfiles, type RuntimeProvider, type RuntimeProfile } from './managed-profiles.js'
import type { AgentRuntimeDeployment } from '@xpert-ai/plugin-sdk'
export type ProcessProfile = RuntimeProfile & Exclude<AgentRuntimeDeployment, { type: 'service' }>
import { JsonlProcess, type WireMessage } from './jsonl-process.js'

export interface ProcessRun {
  delivery?: AgentOutputDelivery
  profile: ProcessProfile
  context: AgentRuntimeContext
  observation: AgentRuntimeObservation
  process: JsonlProcess
  text: string
  lastStopReason?: string
  cancellationRequested: boolean
  pendingRequestId?: string | number
  timer: NodeJS.Timeout
  writes: Promise<void>
}

@Injectable()
export class ProcessRuntime implements OnModuleDestroy {
  readonly runs = new Map<string, ProcessRun>()
  constructor(private readonly profiles: RuntimeProfiles) {}

  managedProfiles(provider: RuntimeProvider) { return this.profiles.managedProfiles(provider) }
  async profile(request: AgentRuntimeStart, context: AgentRuntimeContext, provider: RuntimeProvider) {
    const profile = this.profiles.profile(request, context, provider)
    const deployment = await this.profiles.deployment(profile, context)
    if (deployment.type === 'service') throw new Error('Process/SDK deployment required')
    return { ...deployment, ...profile }
  }

  async launch(
    profile: ProcessProfile,
    context: AgentRuntimeContext,
    onMessage: (run: ProcessRun, message: WireMessage) => void
  ) {
    if (this.runs.size >= 100) throw new Error('Agent runner capacity reached')
    if (this.runs.has(context.invocationId)) throw new Error('Agent operation already has a runner')
    const cwd = await this.directory(profile, context)
    const handle: AgentRuntimeHandle = {
      sessionId: context.invocationId,
      runId: context.invocationId,
      metadata: { provider: profile.provider, profileId: profile.id, profileVersion: profile.version, workspaceId: context.scope.workspaceId, managedRuntime: { type: 'builtin', version: profile.version }, deploymentRevision: profile.revision }
    }
    const run: ProcessRun = {
      profile,
      context,
      observation: { status: 'running', handle },
      text: '',
      cancellationRequested: false,
      writes: Promise.resolve(),
      timer: setTimeout(() => {
        this.publish(run, { status: 'unknown', error: 'Agent execution timed out; outcome requires reconciliation' })
        run.process.stop()
      }, profile.timeoutMs),
      process: new JsonlProcess(
        profile,
        cwd,
        (message) => onMessage(run, message),
        () => {
          if (!terminal(run.observation))
            this.publish(run, { status: run.cancellationRequested ? 'cancelled' : 'unknown' })
          clearTimeout(run.timer)
          void run.writes.finally(() => this.runs.delete(context.invocationId))
        }
      )
    }
    this.runs.set(context.invocationId, run)
    try {
      await context.checkpoint(run.observation)
    } catch (error) {
      clearTimeout(run.timer)
      run.process.stop()
      throw error
    }
    return run
  }

  async failedLaunch(run: ProcessRun) {
    this.publish(run, { status: 'unknown', error: 'Agent launch outcome is uncertain; do not replay' })
    run.process.stop()
    await run.writes
  }

  async directory(profile: ProcessProfile, context: AgentRuntimeContext) {
    if (!profile.workspaceRoot) throw new Error('Managed workspace root is required')
    const root = await realpath(profile.workspaceRoot)
    const owner = createHash('sha256').update(JSON.stringify(context.scope)).digest('hex')
    const cwd = resolve(root, owner, context.invocationId)
    const path = relative(root, cwd)
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Invalid runtime workspace')
    await mkdir(cwd, { recursive: true, mode: 0o700 })
    if ((await realpath(cwd)) !== cwd) throw new Error('Runtime workspace must not traverse symlinks')
    return cwd
  }

  assertReceipt(handle: AgentRuntimeHandle, context: AgentRuntimeContext, provider: RuntimeProvider) {
    if (handle.metadata?.provider !== provider || !this.profiles.receiptProfile(handle, context, provider)) throw new Error('Invalid managed process receipt')
  }

  private provider(handle: AgentRuntimeHandle): RuntimeProvider {
    const provider = handle.metadata?.provider
    if (provider !== 'codex' && provider !== 'pi' && provider !== 'claude-code') throw new Error('Invalid process provider receipt')
    return provider
  }

  find(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    const profile = this.profiles.receiptProfile(handle, context, this.provider(handle))
    if (!profile) throw new Error('Managed process receipt is unavailable')
    const run = this.runs.get(handle.metadata?.operationId?.toString() ?? context.invocationId)
    if (
      run &&
      (run.context.invocationId !== context.invocationId ||
        JSON.stringify(run.context.scope) !== JSON.stringify(context.scope))
    ) {
      throw new Error('Agent run scope mismatch')
    }
    return run
  }

  async inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
    const run = this.find(handle, context)
    return run
      ? run.observation
      : { status: 'unknown', handle, error: 'Runner is unavailable; do not replay this operation' }
  }

  publish(run: ProcessRun, observation: AgentRuntimeObservation) {
    if (terminal(run.observation)) return
    run.observation = { ...run.observation, ...observation }
    const snapshot = structuredClone(run.observation)
    run.writes = run.writes
      .then(() => run.context.checkpoint(snapshot))
      .catch(() => {
        // A failed durable receipt must not allow an unobserved runner to keep mutating files.
        run.process.stop()
      })
    if (terminal(run.observation)) {
      clearTimeout(run.timer)
      run.process.stop()
    }
  }

  onModuleDestroy() {
    for (const run of this.runs.values()) run.process.stop()
    this.runs.clear()
  }
}

function terminal(observation: AgentRuntimeObservation) {
  return ['succeeded', 'failed', 'cancelled'].includes(observation.status)
}
