import { AiModelTypeEnum, JsonSchemaObjectType, type ICopilotModel } from '@xpert-ai/contracts'
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
      },
      'x-ui': {
        span: 2
      }
    }
  }
}

export const AdvisorPluginIcon = `<svg class="svg-icon" style="vertical-align: middle;fill: currentColor;overflow: hidden;" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M295.37789 295.405352a255.992714 216.60922 90 1 0 433.218439 0 255.992714 216.60922 90 1 0-433.218439 0Z" fill="#FFE4B9" /><path d="M534.475085 156.30285c-199.280482 0-273.951588-31.231111-224.170851-93.732717C360.124355 0.029144 484.654964-15.645487 683.935446 15.625008 766.24695 57.765347 794.209231 157.563122 767.979824 315.0971c-49.820121 62.501606-77.821785 72.071795-84.044378 28.749951V156.30285H534.435701z" fill="#474747" /><path d="M255.994395 157.563122c21.109553-26.268791 47.378344-23.708864 78.766989 7.640398v188.174336C255.994395 400.441132 216.610901 204.587014 255.994395 157.563122z" fill="#474747" /><path d="M369.221942 590.781561c0 144.301124 14.76881 288.562864 44.306431 432.863988H59.076923C88.614544 735.082685 191.996217 590.781561 369.221942 590.781561zM654.752277 590.781561c177.225725 0 280.607398 144.301124 310.145019 432.863988h-354.45145A2153.253177 2153.253177 0 0 0 654.752277 590.781561z" fill="#444444" /><path d="M452.911868 590.781561h118.150483l-39.383494 86.564921h-39.383495zM492.295362 708.932044h39.383495l39.383494 315.067956h-118.150483z" fill="#6570C7" /><path d="M689.212835 866.466022m19.691747 0l118.150483 0q19.691747 0 19.691747 19.691747l0 0q0 19.691747-19.691747 19.691748l-118.150483 0q-19.691747 0-19.691747-19.691748l0 0q0-19.691747 19.691747-19.691747Z" fill="#FFFFFF" /></svg>`
