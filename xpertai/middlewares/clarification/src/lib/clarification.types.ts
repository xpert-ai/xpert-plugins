import { JsonSchemaObjectType } from '@metad/contracts'
import { z } from 'zod'

export const CLARIFICATION_MIDDLEWARE_NAME = 'ClarificationMiddleware'
export const ASK_CLARIFICATION_TOOL_NAME = 'ask_clarification'
export const CLARIFICATION_METADATA_KEY = 'clarification'

export const ClarificationTypeSchema = z.enum([
  'missing_info',
  'ambiguous_requirement',
  'approach_choice',
  'risk_confirmation',
  'suggestion'
])

export type ClarificationType = z.infer<typeof ClarificationTypeSchema>

export const AskClarificationInputSchema = z.object({
  question: z.string().trim().min(1, 'question is required'),
  clarificationType: ClarificationTypeSchema.optional().default('missing_info'),
  context: z.string().trim().min(1).optional(),
  options: z.array(z.string().trim().min(1)).optional().default([]),
  allowFreeText: z.boolean().optional().default(true),
  required: z.boolean().optional().default(true)
})

export type AskClarificationInput = z.input<typeof AskClarificationInputSchema>
export type ResolvedClarificationInput = z.infer<typeof AskClarificationInputSchema>

export const ClarificationMetadataSchema = z.object({
  version: z.literal('v1'),
  kind: z.literal('clarification'),
  question: z.string(),
  clarificationType: ClarificationTypeSchema,
  context: z.string().optional(),
  options: z.array(z.string()),
  allowFreeText: z.boolean(),
  required: z.boolean()
})

export type ClarificationMetadata = z.infer<typeof ClarificationMetadataSchema>

export const ClarificationPluginConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  appendSystemPrompt: z.boolean().optional().default(true),
  promptMode: z.enum(['strict', 'soft']).optional().default('strict')
})

export type ClarificationPluginConfig = z.infer<typeof ClarificationPluginConfigSchema>

export const ClarificationPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      title: {
        en_US: 'Enabled',
        zh_Hans: '启用'
      },
      description: {
        en_US: 'Enable clarification interception and dynamic tool injection.',
        zh_Hans: '启用澄清拦截与动态工具注入。'
      },
      default: true
    },
    appendSystemPrompt: {
      type: 'boolean',
      title: {
        en_US: 'Append System Prompt',
        zh_Hans: '追加系统提示词'
      },
      description: {
        en_US: 'Append a short clarification rule to the system prompt.',
        zh_Hans: '向系统提示词追加简短的澄清规则。'
      },
      default: true
    },
    promptMode: {
      type: 'string',
      enum: ['strict', 'soft'],
      title: {
        en_US: 'Prompt Mode',
        zh_Hans: '提示模式'
      },
      description: {
        en_US: 'Use strict mode to require clarification before acting, or soft mode to prefer clarification.',
        zh_Hans: '严格模式要求先澄清再行动，宽松模式则优先建议澄清。'
      },
      default: 'strict'
    }
  }
}

export const ClarificationPluginIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect x="8" y="10" width="48" height="34" rx="10" fill="currentColor" opacity="0.14"/>
  <path d="M20 23c0-6.075 4.925-11 11-11h2c6.075 0 11 4.925 11 11v7c0 6.075-4.925 11-11 11h-8l-7 7v-7c-2.209 0-4-1.791-4-4V23Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
  <path d="M29 27a4 4 0 1 1 6.11 3.402C34.108 31.038 33 31.94 33 34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
  <circle cx="33" cy="40" r="2.5" fill="currentColor"/>
</svg>
`
