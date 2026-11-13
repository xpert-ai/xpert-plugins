export type WeeklyRadarEntryStatus =
  | 'planned'
  | 'in_progress'
  | 'blocked'
  | 'pending_confirm'
  | 'ai_failed'
  | 'done'

export type WeeklyRadarWeeklyStatus = 'draft' | 'confirmed'

export type WeeklyRadarRiskLevel = 'high' | 'medium' | 'low'

export interface WeeklyRadarScope {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface WeeklyRadarEntryDto {
  id: string
  weekKey: string
  title: string
  status: WeeklyRadarEntryStatus
  owner?: string | null
  dueDate?: string | null
  evidenceRef?: string | null
  evidenceQuote?: string | null
  note?: string | null
  ageDays: number
  createdAt?: string | null
  updatedAt?: string | null
}

export interface WeeklyRadarRiskDto {
  id: string
  level: WeeklyRadarRiskLevel
  title: string
  detail: string
  suggestion: string
  reasons: string[]
  entryIds: string[]
  entryTitles: string[]
  evidenceRefs: string[]
  ageDays: number
}

export interface WeeklyRadarMetricsDto {
  weekKey: string
  total: number
  byStatus: Record<string, number>
  openEntries: number
  riskCount: number
  highRiskCount: number
  confirmedWeeks: number
}

export interface WeeklyRadarWeeklyDto {
  id: string
  weekKey: string
  highlights?: string | null
  nextActions?: string | null
  metrics?: WeeklyRadarMetricsDto | null
  risks?: WeeklyRadarRiskDto[]
  status: WeeklyRadarWeeklyStatus
  generatedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}
