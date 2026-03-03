import type { ICopilotModel } from '@metad/contracts'
import { z } from 'zod/v3'

export type SensitiveRule = {
  id: string
  pattern: string
  type: 'keyword' | 'regex'
  scope: 'input' | 'output' | 'both'
  severity: 'high' | 'medium'
  action: 'block' | 'rewrite'
  replacementText?: string
}

export type RuleModeConfig = {
  mode?: 'rule'
  rules?: Array<Partial<SensitiveRule> | null>
  caseSensitive?: boolean
  normalize?: boolean
  // Backward compatibility: ignore historical field if present.
  generalPack?: unknown
}

export type LlmScope = 'input' | 'output' | 'both'
export type LlmOutputMethod = 'functionCalling' | 'jsonMode' | 'jsonSchema'
export type LlmErrorAction = 'block' | 'rewrite'

export type LlmFilterConfig = {
  model?: ICopilotModel
  scope?: LlmScope
  rulePrompt?: string
  // @deprecated Use rulePrompt instead.
  systemPrompt?: string
  outputMethod?: LlmOutputMethod
  // @deprecated LLM mode keeps rewrite fallback on errors.
  onLlmError?: LlmErrorAction
  // @deprecated LLM mode keeps rewrite fallback on errors.
  errorRewriteText?: string
  // @deprecated LLM mode no longer blocks.
  blockMessage?: string
  rewriteFallbackText?: string
  timeoutMs?: number
}

export type LlmModeConfig = {
  mode: 'llm'
  llm?: LlmFilterConfig | null
  // Backward compatibility: ignore historical field if present.
  generalPack?: unknown
}

export type SensitiveFilterConfig = RuleModeConfig | LlmModeConfig

export type LlmDecision = {
  matched: boolean
  action?: 'block' | 'rewrite'
  replacementText?: string | null
  reason?: string | null
  categories?: string[] | null
}

export type CompiledSensitiveRule = SensitiveRule & {
  index: number
  normalizedPattern: string
  matchRegex?: RegExp
  rewriteRegex?: RegExp
}

export const SensitiveFilterIcon = `<svg width="800px" height="800px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l7 3v6c0 5.2-3.3 9.9-7 11-3.7-1.1-7-5.8-7-11V5l7-3zm0 2.1L7 6v5c0 3.9 2.3 7.8 5 8.9 2.7-1.1 5-5 5-8.9V6l-5-1.9zM8.8 12.6l1.4-1.4 1.8 1.8 3.8-3.8 1.4 1.4-5.2 5.2-3.2-3.2z"/></svg>`

const sensitiveRuleDraftSchema = z
  .object({
    id: z.string().optional().nullable(),
    pattern: z.string().optional().nullable(),
    type: z.enum(['keyword', 'regex']).optional().nullable(),
    scope: z.enum(['input', 'output', 'both']).optional().nullable(),
    severity: z.enum(['high', 'medium']).optional().nullable(),
    action: z.enum(['block', 'rewrite']).optional().nullable(),
    replacementText: z.string().optional().nullable(),
  })
  .nullable()

const llmConfigSchema = z
  .object({
    model: z.custom<ICopilotModel>().optional().nullable(),
    scope: z.enum(['input', 'output', 'both']).optional().nullable(),
    rulePrompt: z.string().optional().nullable(),
    systemPrompt: z.string().optional().nullable(),
    outputMethod: z.enum(['functionCalling', 'jsonMode', 'jsonSchema']).optional().default('jsonMode'),
    onLlmError: z.enum(['block', 'rewrite']).optional().nullable(),
    errorRewriteText: z.string().optional().nullable(),
    blockMessage: z.string().optional().nullable(),
    rewriteFallbackText: z.string().optional().nullable(),
    timeoutMs: z.number().int().positive().max(120000).optional().nullable(),
  })

const ruleModeConfigSchema = z.object({
  mode: z.literal('rule').optional(),
  rules: z.array(sensitiveRuleDraftSchema).optional().default([]),
  caseSensitive: z.boolean().optional().default(false),
  normalize: z.boolean().optional().default(true),
  llm: z.unknown().optional(),
  // Backward compatibility only.
  generalPack: z.unknown().optional(),
})

const llmModeConfigSchema = z.object({
  mode: z.literal('llm'),
  llm: llmConfigSchema.optional().nullable().default({}),
  rules: z.unknown().optional(),
  caseSensitive: z.unknown().optional(),
  normalize: z.unknown().optional(),
  // Backward compatibility only.
  generalPack: z.unknown().optional(),
})

export const sensitiveFilterConfigSchema = z.union([ruleModeConfigSchema, llmModeConfigSchema])

export const llmDecisionSchema = z.object({
  matched: z.boolean(),
  action: z.enum(['block', 'rewrite']).optional().nullable(),
  replacementText: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  categories: z.array(z.string()).optional().nullable(),
})
