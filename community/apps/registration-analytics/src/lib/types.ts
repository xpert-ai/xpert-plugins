export type RegistrationStatus = 'confirmed' | 'pending' | 'cancelled'
export type RegistrationChannel = 'website' | 'wechat' | 'offline' | 'partner'

export interface RegistrationScope {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface RegistrationFilterCondition {
  field: string
  op: 'eq' | 'neq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte'
  value: string | number
}

export interface RegistrationQueryCondition {
  activityId?: string
  filters?: RegistrationFilterCondition[]
  groupBy?: string[]
  aggregates?: Array<{ field: string; op: 'count' | 'sum' | 'avg' | 'min' | 'max' }>
  page?: number
  pageSize?: number
}

export interface RegistrationQueryInput {
  question?: string
  condition?: RegistrationQueryCondition
}

export interface SavedQueryInput {
  name: string
  question: string
  condition: RegistrationQueryCondition
}

export interface RegistrationViewData {
  summary: Record<string, unknown>
  table: {
    items: Array<Record<string, unknown>>
    total: number
    page: number
    pageSize: number
  }
  savedQueries: Array<{
    id: string
    name: string
    question: string
    condition: RegistrationQueryCondition
    createdAt?: Date | string
  }>
  fields: Array<{ key: string; label: string; type: string }>
  suggestedQuestions: string[]
}
