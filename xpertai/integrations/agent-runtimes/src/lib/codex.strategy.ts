import { agentPrompt, ApprovalData } from './input.js'
import { Injectable } from '@nestjs/common'
import {
  AgentRuntimeStrategy,
  type AgentJson,
  type AgentRuntimeContext,
  type AgentRuntimeHandle,
  type AgentRuntimeStart,
  type IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { ProcessRuntime, type ProcessRun } from './process-runtime.js'
import type { WireMessage } from './jsonl-process.js'

const Thread = z.object({ thread: z.object({ id: z.string() }) })
const Turn = z.object({ turn: z.object({ id: z.string(), status: z.string().optional() }) })
const Delta = z.object({ delta: z.string() })
const Approval = z.object({
  threadId: z.string(),
  turnId: z.string(),
  itemId: z.string(),
  command: z.string().optional(),
  reason: z.string().nullish()
})

@Injectable()
@AgentRuntimeStrategy('codex')
export class CodexRuntimeStrategy implements IAgentRuntimeStrategy {
  readonly capabilities = { recovery: 'none' as const, interactions: true, cancellation: true, background: true }
  constructor(private readonly processes: ProcessRuntime) {}

  async start(request: AgentRuntimeStart, context: AgentRuntimeContext) {
    if (request.previous) return this.inspect(request.previous, context)
    const profile = this.processes.profile(request, context, 'codex')
    const run = await this.processes.launch(profile, context, (run, message) => this.event(run, message))
    try {
      await run.process.request({ method: 'initialize', params: { clientInfo: { name: 'xpert', version: '1.0.0' } } })
      run.process.send({ method: 'initialized' })
      const response = await run.process.request({
        method: 'thread/start',
        params: {
          ...(profile.model ? { model: profile.model } : {}),
          sandbox: 'read-only',
          approvalPolicy: 'on-request'
        }
      })
      const { thread } = Thread.parse(response.result)
      run.observation.handle = {
        sessionId: thread.id,
        runId: context.invocationId,
        metadata: { operationId: context.invocationId }
      }
      await context.checkpoint(run.observation)
      const turn = Turn.parse(
        (
          await run.process.request({
            method: 'turn/start',
            params: {
              threadId: thread.id,
              input: [{ type: 'text', text: agentPrompt(request.input) }]
            }
          })
        ).result
      ).turn
      if (run.observation.handle) run.observation.handle.runId = turn.id
      await context.checkpoint(run.observation)
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
    await run.process.request({
      method: 'turn/interrupt',
      params: { threadId: handle.sessionId, turnId: handle.runId }
    })
    return run.observation
  }

  async respond(handle: AgentRuntimeHandle, interactionId: string, response: AgentJson, context: AgentRuntimeContext) {
    const run = this.processes.find(handle, context)
    if (!run || String(run.pendingRequestId) !== interactionId) throw new Error('Codex approval is no longer pending')
    const decision = z.enum(['accept', 'decline', 'cancel']).parse(response)
    run.process.send({ id: run.pendingRequestId, result: { decision } })
    run.pendingRequestId = undefined
    this.processes.publish(run, { status: 'running', interaction: undefined })
    return run.observation
  }

  private event(run: ProcessRun, message: WireMessage) {
    if (message.method === 'item/agentMessage/delta') {
      run.text = (run.text + Delta.parse(message.params).delta).slice(-2 * 1024 * 1024)
    } else if (message.method === 'turn/completed') {
      const turn = Turn.parse(message.params).turn
      const status = turn.status === 'completed' ? 'succeeded' : turn.status === 'interrupted' ? 'cancelled' : 'failed'
      this.processes.publish(run, { status, ...(status === 'succeeded' ? { result: { text: run.text } } : {}) })
    } else if (message.id !== undefined && message.method?.endsWith('/requestApproval')) {
      const approval = Approval.safeParse(message.params)
      const details = ApprovalData.safeParse(message.params)
      if (!approval.success || !details.success || run.pendingRequestId !== undefined) {
        run.process.send({ id: message.id, result: { decision: 'decline' } })
        return
      }
      run.pendingRequestId = message.id
      this.processes.publish(run, {
        status: 'waiting',
        interaction: {
          id: String(message.id),
          kind: 'approval',
          data: details.data,
          prompt: approval.data.reason || approval.data.command || 'Approve this Codex operation?'
        }
      })
    } else if (message.id !== undefined && message.method) {
      run.process.send({ id: message.id, error: { code: -32601, message: 'Unsupported interactive request' } })
    }
  }
}
