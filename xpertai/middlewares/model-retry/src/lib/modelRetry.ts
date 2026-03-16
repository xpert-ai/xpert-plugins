import { z } from 'zod/v3'
import { z as z4 } from 'zod/v4'
import { ToolCall } from '@langchain/core/messages/tool'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
  AgentBuiltInState,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  ModelRequest,
  WrapModelCallHandler,
  WrapWorkflowNodeExecutionCommand,
} from '@xpert-ai/plugin-sdk'
import {
  IXpertAgentExecution,
  JSONValue,
  JsonSchemaObjectType,
  TAgentMiddlewareMeta,
  TAgentRunnableConfigurable,
  WorkflowNodeTypeEnum,
} from '@metad/contracts'
import { AIMessage } from '@langchain/core/messages'
import { ModelRetryIcon } from './types.js'
import {
  calculateRetryDelay,
  normalizeError,
  normalizeRetryConfig,
  retryBaseSchema,
  shouldRetryError,
  sleep,
} from './retry.js'


export type ModelRetryMiddlewareConfig = z.input<typeof retryBaseSchema>

const configSchemaProperties: JsonSchemaObjectType['properties'] = {
  maxRetries: {
    type: 'number',
    minimum: 0,
    default: 2,
    title: {
      en_US: 'Max Retries',
      zh_Hans: '最大重试次数',
    },
    description: {
      en_US: 'Number of retry attempts after the initial model failure.',
      zh_Hans: '模型首次失败后的重试次数。',
    },
  },
  initialDelayMs: {
    type: 'number',
    minimum: 0,
    default: 1000,
    title: {
      en_US: 'Initial Delay (ms)',
      zh_Hans: '初始延迟（毫秒）',
    },
    description: {
      en_US: 'Delay before the first retry attempt.',
      zh_Hans: '第一次重试前的等待时间。',
    },
  },
  backoffFactor: {
    type: 'number',
    minimum: 0,
    default: 2,
    title: {
      en_US: 'Backoff Factor',
      zh_Hans: '退避因子',
    },
    description: {
      en_US: 'Exponential multiplier applied to each retry delay. Set to 0 for constant delay.',
      zh_Hans: '每次重试延迟使用的指数乘数。设置为 0 表示固定延迟。',
    },
  },
  maxDelayMs: {
    type: 'number',
    minimum: 0,
    default: 60000,
    title: {
      en_US: 'Max Delay (ms)',
      zh_Hans: '最大延迟（毫秒）',
    },
    description: {
      en_US: 'Upper bound for the computed retry delay.',
      zh_Hans: '重试等待时间的最大值。',
    },
  },
  jitter: {
    type: 'boolean',
    default: true,
    title: {
      en_US: 'Jitter',
      zh_Hans: '随机抖动',
    },
    description: {
      en_US: 'Adds bounded jitter to retry delays to avoid synchronized retries.',
      zh_Hans: '为重试延迟增加有限随机抖动，避免并发重试集中发生。',
    },
  },
  retryAllErrors: {
    type: 'boolean',
    default: true,
    title: {
      en_US: 'Retry All Errors',
      zh_Hans: '重试所有错误',
    },
    description: {
      en_US: 'Retry every error when enabled. Disable to use explicit matchers.',
      zh_Hans: '启用后对所有错误重试。关闭后仅对显式匹配规则重试。',
    },
  },
  retryableErrorNames: {
    type: 'array',
    default: [],
    title: {
      en_US: 'Retryable Error Names',
      zh_Hans: '可重试错误名',
    },
    description: {
      en_US: 'Retry when error.name matches any configured value.',
      zh_Hans: '当 error.name 命中任一配置值时进行重试。',
    },
    items: {
      type: 'string',
    },
  } as unknown as JsonSchemaObjectType['properties'][string],
  retryableStatusCodes: {
    type: 'array',
    default: [],
    title: {
      en_US: 'Retryable Status Codes',
      zh_Hans: '可重试状态码',
    },
    description: {
      en_US: 'Retry when status, statusCode, or response.status matches any configured value.',
      zh_Hans: '当 status、statusCode 或 response.status 命中任一配置值时进行重试。',
    },
    items: {
      type: 'number',
    },
  } as unknown as JsonSchemaObjectType['properties'][string],
  retryableMessageIncludes: {
    type: 'array',
    default: [],
    title: {
      en_US: 'Retryable Message Fragments',
      zh_Hans: '可重试消息片段',
    },
    description: {
      en_US: 'Retry when the error message contains any configured fragment.',
      zh_Hans: '当错误消息包含任一配置片段时进行重试。',
    },
    items: {
      type: 'string',
    },
  } as unknown as JsonSchemaObjectType['properties'][string],
  onFailure: {
    type: 'string',
    enum: ['continue', 'error'],
    default: 'continue',
    title: {
      en_US: 'On Failure',
      zh_Hans: '失败处理',
    },
    description: {
      en_US: 'Return an AI message or rethrow the last error after retries are exhausted.',
      zh_Hans: '重试耗尽后返回 AI 消息或重新抛出最后一个错误。',
    },
    'x-ui': {
      enumLabels: {
        continue: {
          en_US: 'Continue',
          zh_Hans: '继续',
        },
        error: {
          en_US: 'Error',
          zh_Hans: '错误',
        },
      },
    },
  },
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const hasMessageContent = (message: AIMessage): boolean => {
  const { content } = message

  if (typeof content === 'string') {
    return content.trim().length > 0
  }

  return content != null
}

const extractToolCalls = (message: AIMessage) => {
  const toolCalls: ToolCall[] = []

  if (Array.isArray(message['tool_calls'])) {
    toolCalls.push(...message['tool_calls'])
  }

  return toolCalls
}

const safeJsonStringify = (value: unknown): string => {
  const seen = new WeakSet<object>()

  try {
    return (
      JSON.stringify(value, (_key, currentValue) => {
        if (typeof currentValue === 'object' && currentValue !== null) {
          if (seen.has(currentValue)) {
            return '[Circular]'
          }
          seen.add(currentValue)
        }
        return currentValue
      }) ?? String(value)
    )
  } catch {
    return String(value)
  }
}

const extractFinishReason = (message: AIMessage): string | null => {
  const candidates: unknown[] = [
    message.response_metadata?.['finish_reason'],
    message.response_metadata?.['finishReason'],
    message.additional_kwargs?.['finish_reason'],
    message.additional_kwargs?.['finishReason'],
  ]

  const messageRecord = message as unknown as Record<string, unknown>
  if (isRecord(messageRecord['generationInfo'])) {
    candidates.push(messageRecord['generationInfo']['finish_reason'])
    candidates.push(messageRecord['generationInfo']['finishReason'])
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }

  return null
}

const toModelResultError = (message: AIMessage): Error | null => {
  const finishReason = extractFinishReason(message)
  if (finishReason !== 'network_error') {
    return null
  }

  const error = new Error(`Model call returned finish_reason "${finishReason}"`)
  error.name = 'ModelNetworkError'
  Object.assign(error, {
    finishReason,
    responseMetadata: message.response_metadata,
    additionalKwargs: message.additional_kwargs,
  })
  return error
}

@Injectable()
@AgentMiddlewareStrategy('ModelRetryMiddleware')
export class ModelRetryMiddleware implements IAgentMiddlewareStrategy {
  @Inject(CommandBus)
  private readonly commandBus: CommandBus

  private readonly logger = new Logger(ModelRetryMiddleware.name)

  readonly meta: TAgentMiddlewareMeta = {
    name: 'ModelRetryMiddleware',
    label: {
      en_US: 'Model Retry Middleware',
      zh_Hans: '模型重试中间件',
    },
    icon: {
      type: 'svg',
      value: ModelRetryIcon,
      color: '#1565C0',
    },
    description: {
      en_US:
        'Retry failed model calls with configurable backoff, bounded jitter, and declarative error matching.',
      zh_Hans:
        '为失败的模型调用提供可配置退避、有限随机抖动和声明式错误匹配的重试能力。',
    },
    configSchema: {
      type: 'object',
      properties: configSchemaProperties,
      required: [],
    },
  }

  async createMiddleware(options: ModelRetryMiddlewareConfig, context: IAgentMiddlewareContext) {
    options ??= {}
    const result = retryBaseSchema.safeParse(options)
    if (!result.success) {
      throw new Error(
        `Invalid model retry middleware options: ${z4.prettifyError(result.error)}`
      )
    }

    const retryConfig = normalizeRetryConfig(result.data)
    const totalAllowedAttempts = retryConfig.maxRetries + 1

    const handleFailure = (error: Error, attemptsMade: number): AIMessage => {
      if (retryConfig.onFailure === 'error') {
        throw error
      }

      const attemptWord = attemptsMade === 1 ? 'attempt' : 'attempts'
      const errorType = error.name || error.constructor.name
      return new AIMessage({
        content: `Model call failed after ${attemptsMade} ${attemptWord} with ${errorType}: ${error.message}`,
      })
    }

    return {
      name: 'ModelRetryMiddleware',
      wrapModelCall: async (
        request: ModelRequest<AgentBuiltInState>,
        handler: WrapModelCallHandler
      ): Promise<AIMessage> => {
        const logScope = this.buildLogScope(context, request)
        try {
          return await this.invokeModel(request, handler, context)
        } catch (error) {
          let lastError = normalizeError(error)
          this.logger.warn(
            `Initial model call failed${logScope}. ${this.formatError(lastError)}`
          )

          if (!shouldRetryError(lastError, retryConfig) || retryConfig.maxRetries === 0) {
            this.logger.error(
              `Model retry stopped${logScope}. attemptsMade=1/${totalAllowedAttempts} retryable=${shouldRetryError(lastError, retryConfig)} onFailure=${retryConfig.onFailure}. ${this.formatError(lastError)}`
            )
            return handleFailure(lastError, 1)
          }

          for (let retryAttempt = 1; retryAttempt <= retryConfig.maxRetries; retryAttempt++) {
            const attemptsMade = retryAttempt + 1
            const delay = calculateRetryDelay(retryConfig, retryAttempt - 1)
            this.logger.warn(
              `Scheduling model retry${logScope}. attempt=${attemptsMade}/${totalAllowedAttempts} delayMs=${delay}`
            )
            if (delay > 0) {
              await sleep(delay)
            }

            try {
              const result = await this.executeTrackedRetry(request, handler, context)
              this.logger.log(
                `Model retry succeeded${logScope}. attempt=${attemptsMade}/${totalAllowedAttempts}`
              )
              return result
            } catch (retryError) {
              lastError = normalizeError(retryError)
              const retryable = shouldRetryError(lastError, retryConfig)

              if (!retryable || retryAttempt === retryConfig.maxRetries) {
                this.logger.error(
            `Model retry exhausted${logScope}. attemptsMade=${attemptsMade}/${totalAllowedAttempts} retryable=${retryable} onFailure=${retryConfig.onFailure}. ${this.formatError(lastError)}`
                )
                return handleFailure(lastError, attemptsMade)
              }

              this.logger.warn(
                `Model retry attempt failed${logScope}. attempt=${attemptsMade}/${totalAllowedAttempts}. ${this.formatError(lastError)}`
              )
            }
          }

          return handleFailure(lastError, retryConfig.maxRetries + 1)
        }
      },
    }
  }

  private async executeTrackedRetry(
    request: ModelRequest<AgentBuiltInState>,
    handler: WrapModelCallHandler,
    context: IAgentMiddlewareContext
  ): Promise<AIMessage> {
    const configurable = request.runtime?.configurable as TAgentRunnableConfigurable | undefined
    if (!this.commandBus || !configurable) {
      return handler(request)
    }

    const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
    let retryResult: AIMessage | undefined

    await this.commandBus.execute<
      WrapWorkflowNodeExecutionCommand<AIMessage>,
      { output?: string | JSONValue; state: AIMessage }
    >(
      new WrapWorkflowNodeExecutionCommand<AIMessage>(
        async (
          execution: Partial<IXpertAgentExecution>
        ): Promise<{ output?: string | JSONValue; state: AIMessage }> => {
          void execution
          retryResult = await this.invokeModel(request, handler, context)
          return {
            state: retryResult,
            output: retryResult.content as JSONValue,
          }
        },
        {
          execution: {
            category: 'workflow',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            inputs: {},
            parentId: executionId,
            threadId: thread_id,
            checkpointNs: checkpoint_ns,
            checkpointId: checkpoint_id,
            agentKey: context.node.key,
            title: context.node.title,
          },
          subscriber,
        }
      )
    )

    if (!retryResult) {
      throw new Error('Retry model execution failed to return a result')
    }

    return retryResult
  }

  private async invokeModel(
    request: ModelRequest<AgentBuiltInState>,
    handler: WrapModelCallHandler,
    context?: IAgentMiddlewareContext
  ): Promise<AIMessage> {
    const result = await handler(request)
    const toolCalls = extractToolCalls(result)
    if (!hasMessageContent(result) && toolCalls.length === 0) {
      const logScope = context ? this.buildLogScope(context, request) : ''
      this.logger.warn({
          context: logScope,
          ai_message: safeJsonStringify(result),
        },
        `Model returned empty content and tool calls${logScope}.`
      )
    }
    const resultError = toModelResultError(result)
    if (resultError) {
      throw resultError
    }
    return result
  }

  private buildLogScope(
    context: IAgentMiddlewareContext,
    request?: ModelRequest<AgentBuiltInState>
  ): string {
    const configurable = request?.runtime?.configurable as
      | Partial<TAgentRunnableConfigurable>
      | undefined

    const segments = [
      context.xpertId ? `xpertId=${context.xpertId}` : null,
      context.agentKey ? `agentKey=${context.agentKey}` : null,
      context.conversationId ? `conversationId=${context.conversationId}` : null,
      context.node?.key ? `nodeKey=${context.node.key}` : null,
      configurable?.executionId ? `executionId=${configurable.executionId}` : null,
    ].filter(Boolean)

    return segments.length > 0 ? ` [${segments.join(' ')}]` : ''
  }

  private formatError(error: Error): string {
    const errorType = error.name || error.constructor.name || 'Error'
    return `${errorType}: ${error.message}`
  }
}
