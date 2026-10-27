import type { AgentRuntimeDeploymentSpec, AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import { agentPrompt } from './input.js'
import { outputDelivery, taskResult } from './task-result.js'
import { Injectable } from '@nestjs/common'
import {
  AgentRuntimeStrategy,
  type AgentRuntimeContext,
  type AgentRuntimeHandle,
  type AgentRuntimeStart,
  type IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { ProcessRuntime, type ProcessRun } from './process-runtime.js'
import type { WireMessage } from './jsonl-process.js'

const Message = z.object({
  message: z
    .object({
      role: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()),
      stopReason: z.string().optional()
    })
    .passthrough()
})

@Injectable()
@AgentRuntimeStrategy('pi')
export class PiRuntimeStrategy implements IAgentRuntimeStrategy {
  get managedProfiles() {
    return this.processes.managedProfiles('pi')
  }
  async resolveManagedDeployment(
    reference: string,
    _scope: Readonly<AgentInvocationScope>
  ): Promise<AgentRuntimeDeploymentSpec | undefined> {
    if (!this.managedProfiles.some((profile) => profile.reference === reference)) return undefined
    return {
      type: 'process',
      command: 'pi',
      args: ['--mode', 'rpc'],
      environment: { LANG: 'C.UTF-8' },
      timeoutMs: 600000
    }
  }
  readonly capabilities = {
    hostAffinity: 1 as const,
    completionEvidence: 2 as const,
    idempotentCancellation: true,
    recovery: 'none' as const,
    interactions: false,
    cancellation: true,
    background: true
  }
  constructor(private readonly processes: ProcessRuntime) {}

  async start(request: AgentRuntimeStart, context: AgentRuntimeContext) {
    if (request.previous) return this.inspect(request.previous, context)
    const profile = await this.processes.profile(request, context, 'pi')
    const run = await this.processes.launch(profile, context, (run, message) => this.event(run, message))
    run.delivery = outputDelivery(request.input.delivery)
    try {
      await run.process.request({ type: 'prompt', message: agentPrompt(request.input) })
      return run.observation
    } catch (error) {
      await this.processes.failedLaunch(run)
      throw error
    }
  }

  inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    return this.processes.inspect(handle, context)
  }

  async cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext) {
    const run = this.processes.find(handle, context)
    if (!run || run.exited) return this.inspect(handle, context)
    if (run.cancellationRequested) return run.observation
    run.cancellationRequested = true
    this.processes.publish(run, { status: 'cancelling' })
    try {
      await run.process.request({ type: 'abort' })
    } finally {
      run.process.stop()
    }
    return run.observation
  }

  private event(run: ProcessRun, event: WireMessage) {
    if (event.type === 'message_end') {
      const parsed = Message.safeParse(event)
      if (parsed.success && parsed.data.message.role === 'assistant') {
        run.text = parsed.data.message.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text ?? '')
          .join('')
          .slice(-2 * 1024 * 1024)
        run.lastStopReason = parsed.data.message.stopReason
      }
    } else if (event.type === 'agent_settled') {
      // agent_end can precede automatic retries; only settled is a terminal receipt.
      this.processes.publish(
        run,
        run.cancellationRequested
          ? { status: 'cancelled' }
          : run.lastStopReason === 'error'
          ? { status: 'failed' }
          : { status: 'succeeded', result: taskResult(run.text, run.delivery) }
      )
    } else if (event.type === 'extension_ui_request') {
      this.processes.publish(run, {
        status: 'failed',
        error: 'Pi extension UI requests are not supported by this profile'
      })
    }
  }
}
