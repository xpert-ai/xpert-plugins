import { z as z4 } from 'zod/v4'
import type { BaseLanguageModel } from '@langchain/core/language_models/base'
import {
  DEFAULT_REWRITE_TEXT,
  INTERNAL_LLM_INVOKE_OPTIONS,
  LLM_MODE_VALIDATION_ERROR,
} from './constants.js'
import type {
  LlmOutputMethod,
  LlmOutputMethodAttempt,
  LlmOutputTrace,
  MatchPhase,
  ResolvedLlmConfig,
  ResolvedLlmDecision,
} from './runtime-types.js'
import type { LlmDecision, LlmFilterConfig } from './types.js'
import { llmDecisionSchema } from './types.js'
import { extractPrimitiveText, getErrorText, isRecord, shouldFailOpenOnLlmError, toNonEmptyString, withTimeout } from './utils.js'

export function buildInternalModelConfig(
  model: NonNullable<LlmFilterConfig['model']>,
): NonNullable<LlmFilterConfig['model']> {
  const options = isRecord(model.options) ? model.options : {}
  return {
    ...model,
    options: {
      ...options,
      streaming: false,
      temperature: typeof options['temperature'] === 'number' ? options['temperature'] : 0,
    },
  }
}

export function modeIncludesScope(scope: 'input' | 'output' | 'both', phase: MatchPhase): boolean {
  return scope === 'both' || scope === phase
}

function buildInternalLlmPrompt(rulePrompt: string): string {
  return (
    '你不是聊天助手，你是严格的敏感内容分类器。' +
    '\n你的唯一任务是根据审核规则判断文本是否命中，不要提供安全建议、解释性回复或扩展内容。' +
    '\n这是硬规则匹配任务：当审核规则写明“出现/包含/只要命中/必须命中”时，必须严格按字面执行，不允许自由裁量。' +
    '\n你只能返回 JSON，不要输出额外说明。' +
    '\nJSON字段: matched(boolean), action("block"|"rewrite"), replacementText(string), reason(string), categories(string[]).' +
    '\n命中时请尽量给出 replacementText；未命中时返回 {"matched": false}。' +
    '\n说明：系统会统一执行改写策略，即便你返回 action=block 也会按 rewrite 处理。' +
    `\n\n用户审核规则：\n${rulePrompt}`
  )
}

export function buildEvaluationMessages(phase: MatchPhase, text: string, llmConfig: ResolvedLlmConfig) {
  return [
    { role: 'system', content: llmConfig.systemPrompt },
    {
      role: 'user',
      content:
        `phase=${phase}\n` +
        '请严格基于给定文本进行敏感判定，并只返回约定结构。\n' +
        `text:\n${text}`,
    },
  ]
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) {
    return null
  }

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!

    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      depth++
      continue
    }
    if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

export function parseLlmDecision(
  raw: unknown,
  rewriteFallbackText: string,
): ResolvedLlmDecision {
  let payload: unknown = raw

  if (typeof payload === 'string') {
    const rawText = payload
    try {
      payload = JSON.parse(payload)
    } catch {
      const extracted = extractFirstJsonObject(rawText)
      if (!extracted) {
        throw new Error('LLM decision is not valid JSON string')
      }
      try {
        payload = JSON.parse(extracted)
      } catch {
        throw new Error('LLM decision is not valid JSON string')
      }
    }
  }

  if (isRecord(payload) && !('matched' in payload) && 'content' in payload) {
    const content = extractPrimitiveText(payload['content']).trim()
    if (!content) {
      throw new Error('LLM decision content is empty')
    }
    try {
      payload = JSON.parse(content)
    } catch {
      const extracted = extractFirstJsonObject(content)
      if (!extracted) {
        throw new Error('LLM decision content is not valid JSON')
      }
      try {
        payload = JSON.parse(extracted)
      } catch {
        throw new Error('LLM decision content is not valid JSON')
      }
    }
  }

  const parsed = llmDecisionSchema.safeParse(payload as LlmDecision)
  if (!parsed.success) {
    throw new Error(`Invalid LLM decision: ${z4.prettifyError(parsed.error as any)}`)
  }

  const decision = parsed.data
  const reason = toNonEmptyString(decision.reason) ?? undefined
  const categories = Array.isArray(decision.categories) ? decision.categories.filter(Boolean) : undefined

  if (!decision.matched) {
    return {
      matched: false,
      reason,
      categories,
    }
  }

  return {
    matched: true,
    action: 'rewrite',
    replacementText: toNonEmptyString(decision.replacementText) ?? rewriteFallbackText,
    reason,
    categories,
  }
}

export function resolveRuntimeLlmConfig(config: LlmFilterConfig | null | undefined): ResolvedLlmConfig {
  if (!isRecord(config)) {
    throw new Error(LLM_MODE_VALIDATION_ERROR)
  }

  const model = isRecord(config.model) ? (config.model as NonNullable<LlmFilterConfig['model']>) : null
  const scope = toNonEmptyString(config.scope) as ResolvedLlmConfig['scope'] | null
  const rulePrompt = toNonEmptyString(config.rulePrompt) ?? toNonEmptyString(config.systemPrompt)
  if (!model || !scope || !rulePrompt) {
    throw new Error(LLM_MODE_VALIDATION_ERROR)
  }

  const outputMethodRaw = toNonEmptyString(config.outputMethod) as ResolvedLlmConfig['outputMethod'] | null
  const outputMethod = ['functionCalling', 'jsonMode', 'jsonSchema'].includes(outputMethodRaw ?? '')
    ? (outputMethodRaw as ResolvedLlmConfig['outputMethod'])
    : 'jsonMode'

  const timeoutMs =
    typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
      ? Math.min(Math.floor(config.timeoutMs), 120000)
      : undefined

  const legacyOnLlmError = toNonEmptyString(config.onLlmError) as 'block' | 'rewrite' | null
  const legacyErrorRewriteText = toNonEmptyString(config.errorRewriteText) ?? undefined

  return {
    model,
    scope,
    rulePrompt,
    systemPrompt: buildInternalLlmPrompt(rulePrompt),
    outputMethod,
    legacyOnLlmError: legacyOnLlmError ?? undefined,
    legacyErrorRewriteText,
    rewriteFallbackText: toNonEmptyString(config.rewriteFallbackText) ?? DEFAULT_REWRITE_TEXT,
    timeoutMs,
  }
}

export function buildOutputMethodCandidates(preferred: LlmOutputMethod): LlmOutputMethod[] {
  const queue: LlmOutputMethod[] = [preferred, 'functionCalling', 'jsonMode', 'jsonSchema']
  const unique: LlmOutputMethod[] = []
  for (const method of queue) {
    if (!unique.includes(method)) {
      unique.push(method)
    }
  }
  return unique
}

export function isUnsupportedStructuredOutputError(error: unknown): boolean {
  const message = getErrorText(error).toLowerCase()
  const patterns = [
    'response_format type is unavailable',
    'invalid response_format',
    'response_format',
    'unsupported schema',
    'not support',
  ]
  return patterns.some((pattern) => message.includes(pattern))
}

export async function invokeLlmDecision(input: {
  phase: MatchPhase
  text: string
  llmConfig: ResolvedLlmConfig
  ensureModel: () => Promise<BaseLanguageModel>
  ensureStructuredModel: (method: LlmOutputMethod) => Promise<any>
}): Promise<{ decision: ResolvedLlmDecision; trace: LlmOutputTrace }> {
  const { phase, text, llmConfig, ensureModel, ensureStructuredModel } = input
  const messages = buildEvaluationMessages(phase, text, llmConfig)
  const model = await ensureModel()
  const candidates = buildOutputMethodCandidates(llmConfig.outputMethod)
  const attempts: LlmOutputMethodAttempt[] = []

  for (const method of candidates) {
    attempts.push(method)
    try {
      const structuredModel = await ensureStructuredModel(method)
      if (!structuredModel) {
        throw new Error(`Structured output is not available for method: ${method}`)
      }
      const raw = await withTimeout(
        structuredModel.invoke(messages, INTERNAL_LLM_INVOKE_OPTIONS),
        llmConfig.timeoutMs,
      )
      return {
        decision: parseLlmDecision(raw, llmConfig.rewriteFallbackText),
        trace: {
          requestedOutputMethod: llmConfig.outputMethod,
          resolvedOutputMethod: method,
          methodAttempts: attempts,
          fallbackTriggered: method !== llmConfig.outputMethod || attempts.length > 1,
        },
      }
    } catch (error) {
      if (isUnsupportedStructuredOutputError(error)) {
        continue
      }
      throw error
    }
  }

  attempts.push('plainText')
  const raw = await withTimeout(
    model.invoke(messages, INTERNAL_LLM_INVOKE_OPTIONS),
    llmConfig.timeoutMs,
  )
  return {
    decision: parseLlmDecision(raw, llmConfig.rewriteFallbackText),
    trace: {
      requestedOutputMethod: llmConfig.outputMethod,
      resolvedOutputMethod: 'plainText',
      methodAttempts: attempts,
      fallbackTriggered: true,
    },
  }
}

export function resolveOnErrorDecision(llmConfig: ResolvedLlmConfig, error: unknown): ResolvedLlmDecision {
  const reason = `llm-error:${error instanceof Error ? error.message : String(error)}`
  if (shouldFailOpenOnLlmError(error)) {
    return {
      matched: false,
      reason: `llm-fail-open:${reason}`,
    }
  }
  return {
    matched: true,
    action: 'rewrite',
    replacementText: llmConfig.legacyErrorRewriteText ?? llmConfig.rewriteFallbackText,
    reason,
  }
}
