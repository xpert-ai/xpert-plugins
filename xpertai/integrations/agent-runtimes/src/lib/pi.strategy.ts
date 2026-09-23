import { agentPrompt } from './input.js'
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
  readonly capabilities = { recovery: 'none' as const, interactions: false, cancellation: true, background: true }
  constructor(private readonly processes: ProcessRuntime) {}

  async start(request: AgentRuntimeStart, context: AgentRuntimeContext) {
    if (request.previous) return this.inspect(request.previous, context)
    const profile = this.processes.profile(request, context, 'pi')
    const run = await this.processes.launch(profile, context, (run, message) => this.event(run, message))
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
    if (!run) return this.inspect(handle, context)
    run.cancellationRequested = true
    this.processes.publish(run, { status: 'cancelling' })
    await run.process.request({ type: 'abort' })
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
          : { status: 'succeeded', result: { text: run.text } }
      )
    } else if (event.type === 'extension_ui_request') {
      this.processes.publish(run, {
        status: 'failed',
        error: 'Pi extension UI requests are not supported by this profile'
      })
    }
  }
}
