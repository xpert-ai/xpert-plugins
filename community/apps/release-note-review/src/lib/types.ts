export type RelnoteStatus = 'draft' | 'ai_running' | 'ai_done' | 'ai_failed' | 'confirmed'
export type RelnoteRunStatus = 'running' | 'succeeded' | 'failed'
export type RelnoteRollout = 'full' | 'canary'
export type RelnoteRiskLevel = 'high' | 'medium' | 'low'
export type RelnoteRiskCategory = 'wakeword' | 'navigation_cast' | 'rollback_missing' | 'compatibility' | 'other'
export interface RelnoteRisk { level: RelnoteRiskLevel; category: RelnoteRiskCategory; item: string; evidence: string; suggestion: string }
export interface RelnoteScope { tenantId?: string; organizationId?: string | null; userId?: string; assistantId?: string; conversationId?: string }
