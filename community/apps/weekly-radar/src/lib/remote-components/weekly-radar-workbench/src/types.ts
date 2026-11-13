export type Locale = 'zh_Hans' | 'en_US'

export interface HostContext {
  locale?: string
  manifest?: unknown
  payload?: { parameters?: Record<string, unknown> }
  initialQuery?: {
    page?: number
    pageSize?: number
    search?: string
    parameters?: Record<string, unknown>
  }
  theme?: unknown
}

export interface BridgeMessage {
  channel?: string
  protocolVersion?: number
  instanceId?: string | null
  type?: string
  requestId?: string
  manifest?: unknown
  payload?: HostContext['payload']
  initialQuery?: HostContext['initialQuery']
  locale?: string
  theme?: unknown
  data?: unknown
  result?: unknown
  message?: string
}

export type RadarEntryStatus =
  | 'planned'
  | 'in_progress'
  | 'blocked'
  | 'pending_confirm'
  | 'ai_failed'
  | 'done'

export type RadarRiskLevel = 'high' | 'medium' | 'low'

export interface RadarEntry {
  id: string
  weekKey: string
  title: string
  status: RadarEntryStatus
  owner?: string | null
  dueDate?: string | null
  evidenceRef?: string | null
  evidenceQuote?: string | null
  note?: string | null
  ageDays: number
  createdAt?: string | null
  updatedAt?: string | null
}

export interface RadarRisk {
  id: string
  level: RadarRiskLevel
  title: string
  detail: string
  suggestion: string
  reasons: string[]
  entryIds: string[]
  entryTitles: string[]
  evidenceRefs: string[]
  ageDays: number
}

export interface RadarMetrics {
  weekKey: string
  total: number
  byStatus: Record<string, number>
  openEntries: number
  riskCount: number
  highRiskCount: number
  confirmedWeeks: number
}

export interface RadarWeekly {
  id: string
  weekKey: string
  highlights?: string | null
  nextActions?: string | null
  metrics?: RadarMetrics | null
  risks?: RadarRisk[]
  status: 'draft' | 'confirmed'
  generatedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface RadarData {
  weekKey: string
  entries: RadarEntry[]
  total: number
  metrics: RadarMetrics | null
  risks: RadarRisk[]
  weekly: RadarWeekly | null
  weeklies: RadarWeekly[]
}

export interface TextBundle {
  loading: string
  title: string
  subtitle: string
  week: string
  refresh: string
  entries: string
  risks: string
  report: string
  addEntry: string
  entryTitle: string
  entryTitlePlaceholder: string
  owner: string
  dueDate: string
  status: string
  generate: string
  confirm: string
  emptyEntries: string
  emptyRisks: string
  emptyReport: string
  total: string
  open: string
  riskCount: string
  highRisk: string
  highlights: string
  nextActions: string
  history: string
  draft: string
  confirmed: string
  ageDays: string
  evidence: string
  suggestion: string
  save: string
  saving: string
  loadFailed: string
  actionFailed: string
  noValue: string
  statusLabels: Record<RadarEntryStatus, string>
  levelLabels: Record<RadarRiskLevel, string>
}

declare global {
  interface Window {
    __radarReload?: () => void
  }
}
