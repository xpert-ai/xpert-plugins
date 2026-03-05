import type { ICopilotModel } from '@metad/contracts'

export const AgentBehaviorMonitorIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 4h18v2H3V4zm2 4h14l-1.5 9h-11L5 8zm6 3h2v4h-2v-4zM9 11h2v4H9v-4zm4 0h2v4h-2v-4zM6 20h12v2H6v-2z"/></svg>`

export const RuleTypeValues = [
  'repeat_failure',
  'high_frequency',
  'prompt_injection',
  'sensitive_instruction',
] as const

export const TargetValues = ['input', 'tool_call', 'tool_result'] as const
export const ActionValues = ['alert_only', 'block', 'end_run'] as const
export const SeverityValues = ['low', 'medium', 'high'] as const

export type RuleType = (typeof RuleTypeValues)[number]
export type MonitorTarget = (typeof TargetValues)[number]
export type RuleAction = (typeof ActionValues)[number]
export type RuleSeverity = (typeof SeverityValues)[number]

export type BehaviorRule = {
  id?: string
  enabled?: boolean
  ruleType: RuleType
  target?: MonitorTarget
  windowSeconds?: number
  threshold?: number
  action?: RuleAction
  severity?: RuleSeverity
  alertMessage?: string
  judgeModel?: ICopilotModel | null
}

export type AgentBehaviorMonitorConfig = {
  enabled?: boolean
  evidenceMaxLength?: number
  ringBufferSize?: number
  rules?: BehaviorRule[]
}

export type TraceEvent = {
  timestamp: string
  eventType: 'input' | 'tool_call' | 'tool_error' | 'llm_judge'
  toolName?: string
  detail: string
}

export type HitRecord = {
  timestamp: string
  executionId?: string
  threadId?: string
  ruleId: string
  ruleType: RuleType
  severity: RuleSeverity
  action: RuleAction
  maskedEvidence: string
  reason: string
}
