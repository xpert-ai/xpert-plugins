import type { AIMessage } from '@langchain/core/messages'
import type { LlmFilterConfig, SensitiveRule } from './types.js'

export type FilterMode = 'rule' | 'llm'
export type MatchPhase = 'input' | 'output'

export type ResolvedLlmDecision = {
  matched: boolean
  action?: SensitiveRule['action']
  replacementText?: string
  reason?: string
  categories?: string[]
}

export type ResolvedLlmConfig = {
  model: NonNullable<LlmFilterConfig['model']>
  scope: 'input' | 'output' | 'both'
  rulePrompt: string
  systemPrompt: string
  outputMethod: 'functionCalling' | 'jsonMode' | 'jsonSchema'
  legacyOnLlmError?: 'block' | 'rewrite'
  legacyErrorRewriteText?: string
  rewriteFallbackText: string
  timeoutMs?: number
}

export type ResolvedWecomGroup = {
  webhookUrl: string
}

export type ResolvedWecomConfig = {
  groups: ResolvedWecomGroup[]
  timeoutMs: number
}

export type AuditEntry = {
  timestamp: string
  mode: FilterMode
  phase: MatchPhase
  matched: boolean
  source: 'rule' | 'llm' | 'error-policy'
  action?: SensitiveRule['action']
  reason?: string
  errorPolicyTriggered: boolean
}

export type AuditSnapshot = {
  mode: FilterMode
  finalAction: 'pass' | 'block' | 'rewrite'
  records: AuditEntry[]
  summary: {
    total: number
    matched: number
    blocked: number
    rewritten: number
    errorPolicyTriggered: number
  }
  llmOutput?: {
    requestedOutputMethod: 'functionCalling' | 'jsonMode' | 'jsonSchema'
    resolvedOutputMethod?: 'functionCalling' | 'jsonMode' | 'jsonSchema' | 'plainText'
    methodAttempts: Array<'functionCalling' | 'jsonMode' | 'jsonSchema' | 'plainText'>
    fallbackTriggered: boolean
  }
}

export type BufferedOutputResolution = {
  finalMessage: AIMessage
  matched: boolean
  source: 'rule' | 'llm' | 'error-policy'
  action?: SensitiveRule['action']
  reason?: string
  errorPolicyTriggered: boolean
}

export type LlmOutputMethod = 'functionCalling' | 'jsonMode' | 'jsonSchema'
export type LlmOutputMethodAttempt = LlmOutputMethod | 'plainText'

export type LlmOutputTrace = {
  requestedOutputMethod: LlmOutputMethod
  resolvedOutputMethod: LlmOutputMethodAttempt
  methodAttempts: LlmOutputMethodAttempt[]
  fallbackTriggered: boolean
}
