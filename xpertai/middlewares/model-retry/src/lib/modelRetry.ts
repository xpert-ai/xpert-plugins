import { z } from 'zod/v3'
import { z as z4 } from 'zod/v4'
import { InvalidToolCall, ToolCall } from '@langchain/core/messages/tool'
import { Injectable, Logger } from '@nestjs/common'
import {
  AgentBuiltInState,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  ModelRequest,
  WrapModelCallHandler,
} from '@xpert-ai/plugin-sdk'
import {
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

const extractInvalidToolCalls = (message: AIMessage) => {
  const invalidToolCalls: InvalidToolCall[] = []

  if (Array.isArray(message['invalid_tool_calls'])) {
    invalidToolCalls.push(...message['invalid_tool_calls'])
  }

  return invalidToolCalls
}

const isEmptyModelResult = (message: AIMessage): boolean =>
  !hasMessageContent(message) &&
  extractToolCalls(message).length === 0 &&
  extractInvalidToolCalls(message).length === 0


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
  if (finishReason === 'network_error') {
    const error = new Error(`Model call returned finish_reason "${finishReason}"`)
    error.name = 'ModelNetworkError'
    Object.assign(error, {
      finishReason,
      responseMetadata: message.response_metadata,
      additionalKwargs: message.additional_kwargs,
    })
    return error
  }

  if (!isEmptyModelResult(message)) {
    return null
  }

  const error = new Error(
    'Model call returned empty content without tool calls or invalid tool calls'
  )
  error.name = 'ModelEmptyResponseError'
  Object.assign(error, {
    content: message.content,
    toolCalls: extractToolCalls(message),
    invalidToolCalls: extractInvalidToolCalls(message),
    responseMetadata: message.response_metadata,
    additionalKwargs: message.additional_kwargs,
  })
  return error
}

@Injectable()
@AgentMiddlewareStrategy('ModelRetryMiddleware')
export class ModelRetryMiddleware implements IAgentMiddlewareStrategy {
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
        const startedAt = Date.now()
        try {
          return await this.invokeModel(request, handler, context)
        } catch (error) {
          let lastError = normalizeError(error)
          let retryable = shouldRetryError(lastError, retryConfig)
          this.logger.warn(
            `Model call failed${logScope}. phase=initial attempt=1/${totalAllowedAttempts} retryable=${retryable} elapsedMs=${Date.now() - startedAt}. ${this.formatError(lastError)}`
          )

          if (!retryable || retryConfig.maxRetries === 0) {
            this.logger.error(
              `Model retry stopped${logScope}. phase=initial attemptsMade=1/${totalAllowedAttempts} retryable=${retryable} onFailure=${retryConfig.onFailure} elapsedMs=${Date.now() - startedAt}. ${this.formatError(lastError)}`
            )
            return handleFailure(lastError, 1)
          }

          for (let retryAttempt = 1; retryAttempt <= retryConfig.maxRetries; retryAttempt++) {
            const attemptsMade = retryAttempt + 1
            const delay = calculateRetryDelay(retryConfig, retryAttempt - 1)
            this.logger.warn(
              `Scheduling model retry${logScope}. phase=retry-scheduled attempt=${attemptsMade}/${totalAllowedAttempts} nextDelayMs=${delay} elapsedMs=${Date.now() - startedAt}`
            )
            if (delay > 0) {
              await sleep(delay)
            }

            try {
              const result = await this.executeTrackedRetry(request, handler, context)
              this.logger.log(
                `Model retry succeeded${logScope}. phase=retry-succeeded attempt=${attemptsMade}/${totalAllowedAttempts} elapsedMs=${Date.now() - startedAt}`
              )
              return result
            } catch (retryError) {
              lastError = normalizeError(retryError)
              retryable = shouldRetryError(lastError, retryConfig)

              if (!retryable || retryAttempt === retryConfig.maxRetries) {
                this.logger.error(
                  `Model retry exhausted${logScope}. phase=retry-exhausted attemptsMade=${attemptsMade}/${totalAllowedAttempts} retryable=${retryable} onFailure=${retryConfig.onFailure} elapsedMs=${Date.now() - startedAt}. ${this.formatError(lastError)}`
                )
                return handleFailure(lastError, attemptsMade)
              }

              this.logger.warn(
                `Model retry attempt failed${logScope}. phase=retry-failed attempt=${attemptsMade}/${totalAllowedAttempts} retryable=${retryable} elapsedMs=${Date.now() - startedAt}. ${this.formatError(lastError)}`
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
    if (!configurable) {
      return handler(request)
    }

    const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
    return context.runtime.wrapWorkflowNodeExecution(async () => {
      const retryResult = await this.invokeModel(request, handler, context)
      return {
        state: retryResult,
        output: retryResult.content as JSONValue,
      }
    }, {
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
    })
  }

  private async invokeModel(
    request: ModelRequest<AgentBuiltInState>,
    handler: WrapModelCallHandler,
    context?: IAgentMiddlewareContext
  ): Promise<AIMessage> {
    const result = await handler(request)
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
    const modelInfo = this.extractModelInfo(request?.model)

    const segments = [
      context.xpertId ? `xpertId=${context.xpertId}` : null,
      context.agentKey ? `agentKey=${context.agentKey}` : null,
      context.conversationId ? `conversationId=${context.conversationId}` : null,
      context.node?.key ? `nodeKey=${context.node.key}` : null,
      context.node?.title ? `nodeTitle=${JSON.stringify(context.node.title)}` : null,
      configurable?.executionId ? `executionId=${configurable.executionId}` : null,
      configurable?.thread_id ? `threadId=${configurable.thread_id}` : null,
      configurable?.checkpoint_ns ? `checkpointNs=${configurable.checkpoint_ns}` : null,
      configurable?.checkpoint_id ? `checkpointId=${configurable.checkpoint_id}` : null,
      modelInfo.provider ? `provider=${modelInfo.provider}` : null,
      modelInfo.model ? `model=${modelInfo.model}` : null,
      request?.toolChoice ? `toolChoice=${this.formatToolChoice(request.toolChoice)}` : null,
      Array.isArray(request?.tools) ? `toolCount=${request.tools.length}` : null,
      Array.isArray(request?.messages) ? `messageCount=${request.messages.length}` : null,
      request?.systemMessage ? 'hasSystemMessage=true' : null,
    ].filter(Boolean)

    return segments.length > 0 ? ` [${segments.join(' ')}]` : ''
  }

  private extractModelInfo(model: unknown): { provider?: string; model?: string } {
    if (!isRecord(model)) {
      return {}
    }

    const provider = this.pickString(model, [
      'provider',
      'providerName',
      '_provider',
      '_providerName',
    ])

    const modelName = this.pickString(model, [
      'model',
      'modelName',
      '_model',
      '_modelName',
    ])

    return {
      provider: provider ?? model.constructor?.name,
      model: modelName,
    }
  }

  private pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = source[key]
      if (typeof value === 'string' && value.trim().length > 0) {
        return value
      }
    }

    return undefined
  }

  private formatToolChoice(
    toolChoice: ModelRequest<AgentBuiltInState>['toolChoice']
  ): string {
    if (typeof toolChoice === 'string') {
      return toolChoice
    }

    const functionName = toolChoice?.function?.name
    return functionName ? `function:${functionName}` : 'function'
  }

  private formatError(error: Error): string {
    const errorType = error.name || error.constructor.name || 'Error'
    const errorStatusCode = this.extractErrorStatusCode(error)
    const segments = [
      `errorName=${errorType}`,
      errorStatusCode != null ? `errorStatusCode=${errorStatusCode}` : null,
      `errorMessage=${JSON.stringify(error.message)}`,
    ].filter(Boolean)

    return segments.join(' ')
  }

  private extractErrorStatusCode(error: Error): number | undefined {
    const candidate = error as Error & {
      status?: unknown
      statusCode?: unknown
      response?: { status?: unknown } | null
      cause?: {
        status?: unknown
        statusCode?: unknown
        response?: { status?: unknown } | null
      } | null
    }

    const values = [
      candidate.status,
      candidate.statusCode,
      candidate.response?.status,
      candidate.cause?.status,
      candidate.cause?.statusCode,
      candidate.cause?.response?.status,
    ]

    for (const value of values) {
      const statusCode = this.toStatusCode(value)
      if (statusCode != null) {
        return statusCode
      }
    }

    return undefined
  }

  private toStatusCode(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value)
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed)
      }
    }

    return undefined
  }
}
