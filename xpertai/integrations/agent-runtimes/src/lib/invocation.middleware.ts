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
  type AgentInvocation,
  type IAgentMiddlewareStrategy,
  type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'

const Options = z
  .object({
    bindings: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
            description: z.string().min(1).max(2000),
            title: z
              .union([
                z.string().min(1).max(120),
                z.object({ en_US: z.string().min(1).max(120), zh_Hans: z.string().min(1).max(120) }).strict()
              ])
              .optional(),
            icon: z
              .object({ type: z.literal('font'), value: z.string().min(1).max(120) })
              .strict()
              .optional(),
            mode: z.enum(['auto', 'wait', 'background']).default('auto')
          })
          .strict()
      )
      .min(1)
      .max(32)
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.bindings.map((item) => item.name)).size === value.bindings.length &&
      value.bindings.every((item) => !['task_status', 'task_cancel'].includes(item.name)),
    'Tool names must be unique and must not shadow task lifecycle tools'
  )
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
    description: { en_US: 'Invoke administrator-approved Agent runtime bindings.' },
    icon: invocationToolDisplay.launch.toolIcon,
    configSchema: {
      type: 'object',
      properties: {
        bindings: {
          type: 'array',
          minItems: 1,
          maxItems: 32,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_]{0,63}$' },
              description: { type: 'string', minLength: 1, maxLength: 2000 },
              title: {
                anyOf: [
                  { type: 'string', minLength: 1, maxLength: 120 },
                  {
                    type: 'object',
                    properties: {
                      en_US: { type: 'string', minLength: 1, maxLength: 120 },
                      zh_Hans: { type: 'string', minLength: 1, maxLength: 120 }
                    },
                    required: ['en_US', 'zh_Hans'],
                    additionalProperties: false
                  }
                ]
              },
              icon: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['font'] },
                  value: { type: 'string', minLength: 1, maxLength: 120 }
                },
                required: ['type', 'value'],
                additionalProperties: false
              },
              mode: { type: 'string', enum: ['auto', 'wait', 'background'], default: 'auto' }
            },
            required: ['id', 'name', 'description'],
            additionalProperties: false
          }
        }
      },
      required: ['bindings'],
      additionalProperties: false
    }
  }
  createMiddleware(options: Options, context: IAgentMiddlewareContext) {
    const configuration = Options.parse(options)
    const api = context.runtime.capabilities.require(AgentInvocationRuntimeCapability)
    return {
      name: 'AgentInvocation',
      tools: [
        ...configuration.bindings.map((binding) => {
          const display = {
            toolName:
              typeof binding.title === 'string'
                ? binding.title
                : binding.title
                ? { en_US: binding.title.en_US, zh_Hans: binding.title.zh_Hans }
                : invocationToolDisplay.launch.toolName,
            toolIcon: binding.icon
              ? { type: binding.icon.type, value: binding.icon.value }
              : invocationToolDisplay.launch.toolIcon
          }
          return tool(
            async ({ prompt, timeoutMs, changeSummary, delivery }, config) => {
              const callId = config.toolCall?.id ?? config.configurable?.tool_call_id
              if (typeof callId !== 'string' || !callId || !api.resolve)
                throw new Error('Agent invocation requires a host tool call scope')
              if (binding.mode !== 'background' && !api.awaitResult)
                throw new Error('This host does not support bounded task waiting')
              await reportInvocationProgress(config, callId, binding.name, display, changeSummary)
              const target = await api.resolve(binding.id)
              let invocation = await api.start({ target, callId, input: { prompt, delivery } })
              if (binding.mode !== 'background') {
                if (!api.awaitResult) throw new Error('This host does not support bounded task waiting')
                invocation = await api.awaitResult(invocation.id, { signal: config.signal, timeoutMs })
              }
              await emitTaskResults(invocation, config)
              return JSON.stringify({
                invocationId: invocation.id,
                ...taskReceipt(invocation)
              })
            },
            {
              name: binding.name,
              verboseParsingErrors: true,
              metadata: display,
              description:
                binding.description +
                (binding.mode === 'background'
                  ? ' Returns a task handle immediately; timeoutMs is ignored in background mode.'
                  : ' Waits briefly, up to timeoutMs, then returns the actual task status.') +
                ' If still running, use task_status with the same task ID for 10–60 seconds and repeat as needed, or do independent work. Do not launch the same task again. Give a final result only after confirmed completion.',
              schema: z
                .object({
                  prompt: z.string().min(1).max(100000),
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
          )
        }),
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
              'Query one or more existing tasks. timeoutMs=0 reads immediately; a positive value waits up to that duration and returns early when any/all complete. Default: 30 seconds. Pending means work continues: query again with the same task IDs (usually 10–60 seconds), or do independent work. Avoid rapid zero-duration polling. No background suspension occurs. Unavailable is uncertain; never relaunch automatically. Completed includes failure/cancellation, so inspect each status. Any-wait leaves other tasks running.',
            schema: z
              .object({
                taskIds: z
                  .array(z.string().uuid())
                  .min(1)
                  .max(32)
                  .refine((ids) => new Set(ids).size === ids.length, 'Task IDs must be unique'),
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
              'Request cancellation of an existing task. Cancelling does not mean termination has been confirmed.',
            verboseParsingErrors: true,
            metadata: invocationToolDisplay.cancel,
            schema: z.object({ taskId: z.string().uuid(), changeSummary }).strict()
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
    taskId: task.id,
    status: task.status,
    result,
    error: task.error,
    interaction: task.interaction ? { kind: task.interaction.kind, prompt: task.interaction.prompt } : undefined
  }
}
