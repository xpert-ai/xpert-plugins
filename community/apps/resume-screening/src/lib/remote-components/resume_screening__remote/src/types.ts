export interface HostContext {
  debug?: import('./debug').RemoteDebugConfig
  manifest?: { key?: string }
  payload?: unknown
  initialQuery?: { search?: string; parameters?: Record<string, unknown> }
  locale?: string
  theme?: {
    mode?: 'light' | 'dark'
    density?: 'default' | 'compact'
    tokens?: Record<string, string | number>
  }
}

export type ResumeDecision = 'interview' | 'pending' | 'rejected'

export interface PrescreenFinding {
  rule: string
  severity: 'error' | 'warning'
  message: string
  evidence?: string
}

export interface CandidateRow {
  candidateId: string
  name: string
  yearsOfExperience: number
  degree: string
  skills: string[]
  prescreen: PrescreenFinding[]
  totalScore: number | null
  adjustedTotal?: number | null
  decision: ResumeDecision | null
  /** System-suggested outcome. A suggestion only; a human can override it. Null when unscored. */
  suggestedDecision: ResumeDecision | null
  note: string | null
  revision: number
  dimensions?: Array<{ dimension: 'experience' | 'skills' | 'project_relevance' | 'stability' | 'bonus'; score: number; reason: string }>
  aiTotalScore?: number | null
  scoreState?: import('../../../types.js').ScoreState
  candidateRevision?: number
}

export interface WorkbenchTable {
  key: string
  items: CandidateRow[]
  total: number
  page: number
  pageSize: number
}

export interface ResumeWorkbenchData {
  screeningId: string | null
  title: string | null
  jobTitle: string | null
  status: string | null
  tableKey: string
  table: WorkbenchTable
  jdText: string
  screenings: Array<{ id: string; title: string; jobTitle: string }>
  edit?: import('../../../types.js').ScreeningEditState
}

export interface BridgeMessage {
  debug?: HostContext['debug']
  channel?: string
  protocolVersion?: number
  instanceId?: string
  requestId?: string
  type?: string
  manifest?: HostContext['manifest']
  payload?: unknown
  initialQuery?: HostContext['initialQuery']
  locale?: string
  theme?: HostContext['theme']
  data?: unknown
  result?: unknown
  message?: string
}

declare global {
  interface Window {
    React: typeof import('react')
    ReactDOM: typeof import('react-dom') & {
      createRoot?: (container: Element | DocumentFragment | null) => { render(node: import('react').ReactNode): void }
    }
    __resumeScreeningReload?: () => void
  }
}
