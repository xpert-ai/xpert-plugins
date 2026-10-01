import { agentPrompt } from './input.js'
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import { mkdir, realpath } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import type {
  AgentRuntimeContext,
  AgentRuntimeHandle,
  AgentRuntimeObservation,
  AgentRuntimeStart
} from '@xpert-ai/plugin-sdk'
import { RUNTIME_CONFIGURATION, type RuntimeConfiguration, type RuntimeProfile } from './config.js'
import { JsonlProcess, type WireMessage } from './jsonl-process.js'

export interface ProcessRun {
  profile: RuntimeProfile
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
  constructor(@Inject(RUNTIME_CONFIGURATION) readonly configuration: RuntimeConfiguration) {}

  profile(request: AgentRuntimeStart, context: AgentRuntimeContext, provider: RuntimeProfile['provider']) {
    const profile = this.configuration.profiles.find(
      (entry) => entry.id === request.target.reference && entry.provider === provider
    )
    if (
      !profile ||
      request.target.configuration.profileVersion !== profile.version ||
      !context.scope.workspaceId ||
      !profile.workspaceIds.includes(context.scope.workspaceId)
    ) {
      throw new Error('Agent runtime profile is unavailable in this workspace or its version changed')
    }
    agentPrompt(request.input)
    if (request.input.files?.length) throw new Error('This runtime profile has no file materialization adapter')
    return profile
  }

  async launch(
    profile: RuntimeProfile,
    context: AgentRuntimeContext,
    onMessage: (run: ProcessRun, message: WireMessage) => void
  ) {
    if (this.runs.size >= 100) throw new Error('Agent runner capacity reached')
    if (this.runs.has(context.invocationId)) throw new Error('Agent operation already has a runner')
    const cwd = await this.directory(profile, context)
    const handle: AgentRuntimeHandle = {
      sessionId: context.invocationId,
      runId: context.invocationId,
      metadata: { profileId: profile.id }
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

  async directory(profile: RuntimeProfile, context: AgentRuntimeContext) {
    const root = await realpath(profile.workspaceRoot)
    const owner = createHash('sha256').update(JSON.stringify(context.scope)).digest('hex')
    const cwd = resolve(root, owner, context.invocationId)
    const path = relative(root, cwd)
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Invalid runtime workspace')
    await mkdir(cwd, { recursive: true, mode: 0o700 })
    if ((await realpath(cwd)) !== cwd) throw new Error('Runtime workspace must not traverse symlinks')
    return cwd
  }

  find(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
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
