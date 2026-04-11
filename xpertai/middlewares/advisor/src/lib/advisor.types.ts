import { AiModelTypeEnum, JsonSchemaObjectType, type ICopilotModel } from '@metad/contracts'
import { z } from 'zod'

export const ADVISOR_MIDDLEWARE_NAME = 'AdvisorMiddleware'
export const ADVISOR_TOOL_NAME = 'advisor'
export const ADVISOR_METADATA_KEY = 'advisor'

export const AdvisorToolInputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'question is required')
    .describe(
      'A focused question for the advisor model. Use this for debugging, architecture tradeoffs, risky decisions, or when you need a second opinion.'
    )
})

export type AdvisorToolInput = z.input<typeof AdvisorToolInputSchema>
export type ResolvedAdvisorToolInput = z.infer<typeof AdvisorToolInputSchema>

export const AdvisorContextConfigSchema = z.object({
  includeSystemPrompt: z.boolean().optional().default(true),
  includeToolResults: z.boolean().optional().default(true),
  maxContextMessages: z.number().int().positive().optional().nullable().default(12),
  maxContextChars: z.number().int().positive().optional().nullable().default(12000)
})

export type AdvisorContextConfig = z.infer<typeof AdvisorContextConfigSchema>

export const AdvisorPluginConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  advisorModel: z.custom<ICopilotModel>((value) => Boolean(value)).optional(),
  maxUsesPerRun: z.number().int().nonnegative().optional().default(3),
  maxUsesPerSession: z.number().int().nonnegative().optional().nullable().default(null),
  appendSystemPrompt: z.boolean().optional().default(true),
  maxTokens: z.number().int().positive().optional().default(1024),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  advisorSystemPrompt: z.string().trim().min(1).optional().nullable().default(null),
  context: AdvisorContextConfigSchema.optional()
})

export type AdvisorPluginConfig = z.infer<typeof AdvisorPluginConfigSchema>

export type ResolvedAdvisorPluginConfig = Omit<AdvisorPluginConfig, 'advisorModel' | 'context'> & {
  advisorModel: ICopilotModel
  context: AdvisorContextConfig
}

export const AdvisorStateSchema = z.object({
  advisorSessionUses: z.number().int().nonnegative().default(0),
  advisorRunUses: z.number().int().nonnegative().default(0)
})

export type AdvisorState = z.infer<typeof AdvisorStateSchema>

export const AdvisorPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      title: {
        en_US: 'Enabled',
        zh_Hans: '启用'
      },
      description: {
        en_US: 'Enable the advisor tool and middleware interception.',
        zh_Hans: '启用 advisor 工具和中间件拦截。'
      },
      default: true
    },
    advisorModel: {
      type: 'object',
      title: {
        en_US: 'Advisor Model',
        zh_Hans: '顾问模型'
      },
      description: {
        en_US: 'The secondary model used when the executor calls `advisor`.',
        zh_Hans: '执行器调用 `advisor` 时使用的辅助模型。'
      },
      'x-ui': {
        component: 'ai-model-select',
        span: 2,
        inputs: {
          modelType: AiModelTypeEnum.LLM,
          hiddenLabel: true
        }
      }
    } as unknown as JsonSchemaObjectType['properties'][string],
    maxUsesPerRun: {
      type: 'number',
      title: {
        en_US: 'Max Uses Per Run',
        zh_Hans: '单轮最大调用次数'
      },
      description: {
        en_US: 'How many times the current run can call `advisor`.',
        zh_Hans: '当前一轮执行最多可调用 `advisor` 的次数。'
      },
      default: 3
    },
    maxUsesPerSession: {
      type: 'number',
      title: {
        en_US: 'Max Uses Per Session',
        zh_Hans: '会话最大调用次数'
      },
      description: {
        en_US: 'Optional session-wide limit. Leave empty for unlimited.',
        zh_Hans: '可选的会话总限额，留空表示不限制。'
      }
    },
    appendSystemPrompt: {
      type: 'boolean',
      title: {
        en_US: 'Append Executor Prompt',
        zh_Hans: '追加执行器提示'
      },
      description: {
        en_US: 'Append a short instruction telling the executor when to use `advisor`.',
        zh_Hans: '向执行器追加一段关于何时使用 `advisor` 的提示。'
      },
      default: true
    },
    maxTokens: {
      type: 'number',
      title: {
        en_US: 'Advisor Max Tokens',
        zh_Hans: '顾问最大输出令牌'
      },
      description: {
        en_US: 'Maximum output tokens for the advisor model.',
        zh_Hans: 'advisor 模型的最大输出令牌数。'
      },
      default: 1024
    },
    temperature: {
      type: 'number',
      title: {
        en_US: 'Advisor Temperature',
        zh_Hans: '顾问温度'
      },
      description: {
        en_US: 'Sampling temperature for the advisor model.',
        zh_Hans: 'advisor 模型采样温度。'
      },
      default: 0.7
    },
    advisorSystemPrompt: {
      type: 'string',
      title: {
        en_US: 'Advisor System Prompt',
        zh_Hans: '顾问系统提示词'
      },
      description: {
        en_US: 'Optional extra system prompt appended before the advisor model call.',
        zh_Hans: '调用 advisor 模型前追加的可选系统提示词。'
      },
      'x-ui': {
        component: 'textarea',
        span: 2
      }
    },
    context: {
      type: 'object',
      title: {
        en_US: 'Context',
        zh_Hans: '上下文'
      },
      properties: {
        includeSystemPrompt: {
          type: 'boolean',
          title: {
            en_US: 'Include System Prompt',
            zh_Hans: '包含系统提示词'
          },
          default: true
        },
        includeToolResults: {
          type: 'boolean',
          title: {
            en_US: 'Include Tool Results',
            zh_Hans: '包含工具结果'
          },
          default: true
        },
        maxContextMessages: {
          type: 'number',
          title: {
            en_US: 'Max Context Messages',
            zh_Hans: '最大上下文消息数'
          },
          description: {
            en_US: 'Tail limit for forwarded conversation messages.',
            zh_Hans: '转发给 advisor 的历史消息尾部数量限制。'
          },
          default: 12
        },
        maxContextChars: {
          type: 'number',
          title: {
            en_US: 'Max Context Characters',
            zh_Hans: '最大上下文字符数'
          },
          description: {
            en_US: 'Tail character budget for forwarded conversation content.',
            zh_Hans: '转发给 advisor 的历史内容字符预算。'
          },
          default: 12000
        }
      }
    }
  }
}

export const AdvisorPluginIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect x="6" y="8" width="52" height="40" rx="12" fill="currentColor" opacity="0.12"/>
  <path d="M19 22c0-5.523 4.477-10 10-10h6c5.523 0 10 4.477 10 10v7c0 5.523-4.477 10-10 10h-6l-8 8v-8c-3.314 0-6-2.686-6-6V22Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
  <path d="M27 25h10M27 32h16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
  <circle cx="45" cy="47" r="9" fill="currentColor" opacity="0.18"/>
  <path d="m41 47 3 3 6-6" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`
