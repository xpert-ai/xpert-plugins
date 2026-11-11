import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { invocationToolDisplay, reportInvocationProgress } from './invocation-tool-display.js'
import { emitTaskResults } from './result-cards.js'
import {
  AgentMiddlewareStrategy,
  AgentInvocationRuntimeCapability,
  AGENT_TASK_RESULTS_FEATURE,
  agentOutputDeliverySchema,
  emitResourceCard,
  type AgentInvocation,
  type IAgentMiddlewareStrategy,
  type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'

const Options = z.object({}).strict()
type Options = z.infer<typeof Options>
const changeSummary = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .optional()
  .describe(
    'Brief present-tense activity summary in the user language, e.g. 等待编程任务完成. Describe intent, not unconfirmed success.'
  )

/** Presentation adapter only: identity, resolution, execution and waiting belong to the host. */
@Injectable()
@AgentMiddlewareStrategy('AgentInvocation')
export class AgentInvocationMiddleware implements IAgentMiddlewareStrategy<Options> {
  readonly meta: TAgentMiddlewareMeta = {
    name: 'AgentInvocation',
    features: [AGENT_TASK_RESULTS_FEATURE],
    label: { en_US: 'Agent invocation', zh_Hans: '智能体调用' },
    description: {
      en_US: 'Delegate tasks using authorized Agent runtimes without configuration.',
      zh_Hans: '无需配置，使用已授权的智能体运行时委派任务。'
    },
    icon: invocationToolDisplay.launch.toolIcon
  }

  createMiddleware(options: Options, context: IAgentMiddlewareContext) {
    Options.parse(options ?? {})
    const api = context.runtime.capabilities.require(AgentInvocationRuntimeCapability)
    if (!api.listManaged || !api.resolveManaged) throw new Error('This host does not support automatic Agent runtimes')
    // Graph construction can precede the conversation identity. Discover inside the tool call.
    const display = invocationToolDisplay.launch
    return {
      name: 'AgentInvocation',
      tools: [
        tool(
          async ({ prompt, runtime, timeoutMs, changeSummary, delivery }, config) => {
            const callId = config.toolCall?.id ?? config.configurable?.tool_call_id
            if (typeof callId !== 'string' || !callId || !api.resolveManaged)
              throw new Error('Agent invocation requires a host tool call scope')
            if (!api.awaitResult) throw new Error('This host does not support bounded task waiting')
            await reportInvocationProgress(config, callId, 'delegate_task', display, changeSummary)
            const available = await api.listManaged!()
            const selected = runtime
              ? available.find((item) => item.reference === runtime)
              : available.length === 1
                ? available[0]
                : undefined
            if (!selected)
              return JSON.stringify({
                status: available.length ? 'runtime_selection_required' : 'runtime_unavailable',
                message: available.length
                  ? 'Choose a listed runtime and call again. No task has started.'
                  : 'No authorized runtime backend is available. No task has started.',
                runtimes: available.map((item) => ({ runtime: item.reference, title: item.title }))
              })
            const target = await api.resolveManaged({ provider: selected.provider, reference: selected.reference })
            let invocation = await api.start({ target, callId, input: { prompt, delivery } })
            if (api.getResourceCard && !invocation.request.dispatch?.projectTask) {
              try {
                const card = await api.getResourceCard(invocation.id)
                if (card) await emitResourceCard(card, config)
              } catch {
                /* A presentation failure cannot undo an accepted invocation. */
              }
            }
            invocation = await api.awaitResult(invocation.id, { signal: config.signal, timeoutMs })
            await emitTaskResults(invocation, config)
            return JSON.stringify(taskReceipt(invocation))
          },
          {
            name: 'delegate_task',
            verboseParsingErrors: true,
            metadata: display,
            description:
              'Delegate a coding task to an authorized Agent runtime. If multiple runtimes are available, omit runtime to discover choices without starting work, then choose a returned runtime. Waits briefly up to timeoutMs and returns invocationId and the actual task status. If still running, pass the returned invocationId in task_status.taskIds for a bounded wait, or do independent work. Do not launch the same task again. Give a final result only after confirmed completion.',
            schema: z
              .object({
                prompt: z.string().min(1).max(100000),
                runtime: z
                  .string()
                  .min(1)
                  .max(200)
                  .optional()
                  .describe(
                    'Optional runtime reference returned by this tool. Omit to select the only available runtime or discover choices. Not a command, binding UUID or credential.'
                  ),
                changeSummary,
                delivery: agentOutputDeliverySchema
                  .default({ mode: 'none' })
                  .describe(
                    'Default none: analysis, code changes and tests stay in the workspace. Choose files only when the user requests file deliverables; choose archive only for explicit packaging/export. Optional paths limits exact relative files; otherwise the child declares requested deliverables. Never export the entire workspace.'
                  ),
                timeoutMs: z.number().int().min(1000).max(60_000).optional()
              })
              .strict()
          }
        ),
        tool(
          async ({ taskIds, mode, timeoutMs, changeSummary }, config) => {
            const callId = config.toolCall?.id ?? config.configurable?.tool_call_id
            if (typeof callId !== 'string' || !callId || !api.waitForTasks)
              throw new Error('This host does not support bounded task dependencies')
            await reportInvocationProgress(config, callId, 'task_status', invocationToolDisplay.status, changeSummary)
            const result = await api.waitForTasks({ taskIds, mode, callId, timeoutMs }, { signal: config.signal })
            for (const task of result.tasks) await emitTaskResults(task, config)
            return JSON.stringify({ reason: result.reason, tasks: result.tasks.map(taskReceipt) })
          },
          {
            name: 'task_status',
            verboseParsingErrors: true,
            metadata: invocationToolDisplay.status,
            description:
              'Query existing Agent invocations using invocationId from delegate_task or project_dispatch_task. Project projectTaskId and taskExecutionId are different identities and are not accepted here. timeoutMs=0 reads immediately; a positive value waits up to that duration and returns early when any/all complete. Default: 30 seconds. Pending means work continues: use the same invocation IDs for another bounded wait or do independent work. Avoid rapid zero-duration polling. No background suspension occurs. When Project dispatch has registered durable result delivery, end the current turn after independent work and let its result event resume coordination. Unavailable is uncertain; never relaunch automatically. Completed includes failure/cancellation, so inspect each status. Any-wait leaves other tasks running.',
            schema: z
              .object({
                taskIds: z
                  .array(z.string().uuid())
                  .min(1)
                  .max(32)
                  .refine((ids) => new Set(ids).size === ids.length, 'Task IDs must be unique')
                  .describe('Agent invocationId values returned by dispatch. Never projectTaskId or taskExecutionId.'),
                mode: z.enum(['any', 'all']).default('all'),
                changeSummary,
                timeoutMs: z.number().int().min(0).max(60_000).default(30_000)
              })
              .strict()
          }
        ),
        tool(
          async ({ taskId, changeSummary }, config) => {
            const callId = config.toolCall?.id ?? config.configurable?.tool_call_id
            await reportInvocationProgress(
              config,
              typeof callId === 'string' ? callId : undefined,
              'task_cancel',
              invocationToolDisplay.cancel,
              changeSummary
            )
            const task = await api.cancel(taskId)
            await emitTaskResults(task, config)
            return JSON.stringify(taskReceipt(task))
          },
          {
            name: 'task_cancel',
            description:
              'Request cancellation using an existing Agent invocationId from dispatch, never a Project projectTaskId or taskExecutionId. Cancelling does not mean termination has been confirmed.',
            verboseParsingErrors: true,
            metadata: invocationToolDisplay.cancel,
            schema: z.object({ taskId: z.string().uuid().describe('Agent invocationId returned by dispatch.'), changeSummary }).strict()
          }
        )
      ]
    }
  }
}

function taskReceipt(task: AgentInvocation) {
  // Keep adapter-only data (such as host working directories) out of model-visible receipts.
  const result = task.result
    ? { text: task.result.text, items: task.result.items, artifacts: task.result.artifacts, export: task.result.export }
    : undefined
  return {
    // All tools expose the same invocation identity; taskId remains the existing receipt alias.
    invocationId: task.id,
    taskId: task.id,
    status: task.status,
    result,
    error: task.error,
    interaction: task.interaction ? { kind: task.interaction.kind, prompt: task.interaction.prompt } : undefined
  }
}
