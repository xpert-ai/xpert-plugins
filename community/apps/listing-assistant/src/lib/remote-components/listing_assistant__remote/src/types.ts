export type Status = 'draft' | 'parsing' | 'review' | 'saved' | 'failed'

export type TaskSummary = {
  id: string
  status: Status
  title: string | null
  price: string | null
  sourcePreview: string
  attemptCount: number
  lastErrorMessage: string | null
  parsedAt: string | null
  savedAt: string | null
  updatedAt: string | null
}

export type TaskDetail = {
  id: string
  status: Status
  sourceText: string
  attemptCount: number
  lastErrorCode: string | null
  lastErrorMessage: string | null
  parsedAt: string | null
  savedAt: string | null
  draft: {
    title: string | null
    description: string | null
    price: string | null
    currency: string | null
    category: string | null
    attributes: Record<string, string | number | null> | null
    fieldFlags: Record<string, 'ai' | 'missing' | 'uncertain'> | null
    specs: Array<{ name: string; price: string | null; stock: number | null }>
  } | null
  runs: Array<{
    attempt: number
    status: 'running' | 'succeeded' | 'failed'
    errorCode: string | null
    errorMessage: string | null
    startedAt: string | null
    finishedAt: string | null
  }>
}

export type WorkbenchData = {
  tasks: TaskSummary[]
  selectedTask: TaskDetail | null
}

export interface HostContext {
  locale?: string
  initialQuery?: {
    parameters?: Record<string, unknown>
    search?: string
  }
}

export interface BridgeMessage {
  channel?: string
  protocolVersion?: number
  instanceId?: string | null
  type?: string
  requestId?: string
  locale?: string
  data?: unknown
  result?: unknown
  payload?: unknown
  message?: string
}
