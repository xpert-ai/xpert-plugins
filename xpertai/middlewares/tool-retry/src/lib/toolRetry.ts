import { z } from 'zod/v3'
import { z as z4 } from 'zod/v4'
import { Injectable } from '@nestjs/common'
import {
  AgentBuiltInState,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  ToolCallRequest,
  ToolCallHandler,
} from '@xpert-ai/plugin-sdk'
import { ToolMessage } from '@langchain/core/messages'
import { JsonSchemaObjectType, TAgentMiddlewareMeta } from '@metad/contracts'
import { ToolRetryIcon } from './types.js'
import {
  calculateRetryDelay,
  normalizeError,
  normalizeRetryConfig,
  retryBaseSchemaObject,
  shouldRetryError,
  sleep,
  validateRetryMatchers,
} from './retry.js'

const toolRetrySchema = retryBaseSchemaObject
  .extend({
    toolNames: z.array(z.string().trim().min(1)).optional(),
  })
  .superRefine(validateRetryMatchers)

export type ToolRetryMiddlewareConfig = z.input<typeof toolRetrySchema>

const configSchemaProperties: JsonSchemaObjectType['properties'] = {
  toolNames: {
    type: 'array',
    default: [],
    title: {
      en_US: 'Tool Names',
      zh_Hans: '工具名称',
    },
    description: {
      en_US: 'Only retry the listed tools. Leave empty to apply retries to all tools.',
      zh_Hans: '仅对列出的工具启用重试。留空则对所有工具生效。',
    },
    items: {
      type: 'string',
    },
  } as unknown as JsonSchemaObjectType['properties'][string],
  maxRetries: {
    type: 'number',
    minimum: 0,
    default: 2,
    title: {
      en_US: 'Max Retries',
      zh_Hans: '最大重试次数',
    },
    description: {
      en_US: 'Number of retry attempts after the initial tool failure.',
      zh_Hans: '工具首次失败后的重试次数。',
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
      en_US: 'Return a tool error message or rethrow the last error after retries are exhausted.',
      zh_Hans: '重试耗尽后返回工具错误消息或重新抛出最后一个错误。',
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

const normalizeToolNames = (toolNames?: string[]): string[] =>
  Array.from(new Set((toolNames ?? []).map((value) => value.trim()).filter((value) => value.length > 0)))

const extractToolName = (request: ToolCallRequest<AgentBuiltInState>): string => {
  if (request.tool && typeof request.tool === 'object' && 'name' in request.tool) {
    const name = (request.tool as { name?: unknown }).name
    if (typeof name === 'string' && name.length > 0) {
      return name
    }
  }

  return request.toolCall.name
}

@Injectable()
@AgentMiddlewareStrategy('ToolRetryMiddleware')
export class ToolRetryMiddleware implements IAgentMiddlewareStrategy {
  readonly meta: TAgentMiddlewareMeta = {
    name: 'ToolRetryMiddleware',
    label: {
      en_US: 'Tool Retry Middleware',
      zh_Hans: '工具重试中间件',
    },
    icon: {
      type: 'svg',
      value: ToolRetryIcon,
      color: '#2E7D32',
    },
    description: {
      en_US:
        'Retry failed tool executions with configurable backoff, bounded jitter, and declarative error matching.',
      zh_Hans:
        '为失败的工具调用提供可配置退避、有限随机抖动和声明式错误匹配的重试能力。',
    },
    configSchema: {
      type: 'object',
      properties: configSchemaProperties,
      required: [],
    },
  }

  async createMiddleware(
    options: ToolRetryMiddlewareConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: IAgentMiddlewareContext
  ) {
    const result = toolRetrySchema.safeParse(options)
    if (!result.success) {
      throw new Error(`Invalid tool retry middleware options: ${z4.prettifyError(result.error)}`)
    }

    const retryConfig = normalizeRetryConfig(result.data)
    const toolNameFilter = normalizeToolNames(result.data.toolNames)

    const handleFailure = (
      toolName: string,
      toolCallId: string,
      error: Error,
      attemptsMade: number
    ): ToolMessage => {
      if (retryConfig.onFailure === 'error') {
        throw error
      }

      const attemptWord = attemptsMade === 1 ? 'attempt' : 'attempts'
      return new ToolMessage({
        content: `Tool '${toolName}' failed after ${attemptsMade} ${attemptWord} with ${error.constructor.name}`,
        tool_call_id: toolCallId,
        name: toolName,
        status: 'error',
      })
    }

    return {
      name: 'ToolRetryMiddleware',
      wrapToolCall: async (
        request: ToolCallRequest<AgentBuiltInState>,
        handler: ToolCallHandler<AgentBuiltInState>
      ) => {
        const toolName = extractToolName(request)
        if (toolNameFilter.length > 0 && !toolNameFilter.includes(toolName)) {
          return handler(request)
        }

        const toolCallId = request.toolCall.id ?? ''

        try {
          return await handler(request)
        } catch (error) {
          let lastError = normalizeError(error)

          if (!shouldRetryError(lastError, retryConfig) || retryConfig.maxRetries === 0) {
            return handleFailure(toolName, toolCallId, lastError, 1)
          }

          for (let retryAttempt = 1; retryAttempt <= retryConfig.maxRetries; retryAttempt++) {
            const delay = calculateRetryDelay(retryConfig, retryAttempt - 1)
            if (delay > 0) {
              await sleep(delay)
            }

            try {
              return await handler(request)
            } catch (retryError) {
              lastError = normalizeError(retryError)
              const attemptsMade = retryAttempt + 1

              if (!shouldRetryError(lastError, retryConfig) || retryAttempt === retryConfig.maxRetries) {
                return handleFailure(toolName, toolCallId, lastError, attemptsMade)
              }
            }
          }

          return handleFailure(toolName, toolCallId, lastError, retryConfig.maxRetries + 1)
        }
      },
    }
  }
}
