export interface HostContext {
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
  decision: ResumeDecision | null
  /** System-suggested outcome. A suggestion only; a human can override it. Null when unscored. */
  suggestedDecision: ResumeDecision | null
  note: string | null
  revision: number
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
}

export interface BridgeMessage {
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
