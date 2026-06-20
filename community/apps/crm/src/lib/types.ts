export type CrmFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'select'
  | 'multi_select'
  | 'relation'
  | 'email'
  | 'phone'
  | 'url'
  | 'currency'
  | 'rich_text'

export type CrmActivityType =
  | 'schema_seeded'
  | 'record_created'
  | 'record_updated'
  | 'agent_record_created'
  | 'agent_record_updated'
  | 'view_action'

export interface CrmScope {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface CrmFieldOption {
  value: string
  label: string
  color?: string
}

export interface CrmFieldDefinitionInput {
  objectKey: string
  fieldKey: string
  type: CrmFieldType
  label: string
  required?: boolean
  isUnique?: boolean
  defaultValue?: unknown
  options?: CrmFieldOption[]
  relationObjectKey?: string
  displayOrder?: number
  metadata?: Record<string, unknown>
}

export interface CrmObjectDefinitionInput {
  objectKey: string
  label: string
  pluralLabel: string
  icon?: string
  description?: string
  displayOrder?: number
  fields: CrmFieldDefinitionInput[]
}

export interface CrmRecordInput {
  objectKey: string
  values: Record<string, unknown>
  source?: 'agent' | 'workbench' | 'seed'
}

export interface CrmRecordSearchInput {
  objectKey?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface CrmRelatedRecordSection {
  objectKey: string
  objectLabel?: string
  objectPluralLabel?: string
  relationFieldKey: string
  relationFieldLabel?: string
  fields: unknown[]
  items: unknown[]
  total: number
}

export interface CrmTimelineItem {
  id: string
  type: 'activity' | 'note' | 'task'
  objectKey?: string | null
  recordId?: string | null
  title: string
  body?: string
  status?: string
  occurredAt?: Date | string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
  payload?: Record<string, unknown>
}

export interface CrmRecordUpdateInput {
  objectKey?: string
  recordId: string
  values: Record<string, unknown>
  source?: 'agent' | 'workbench'
}

export interface CrmViewColumnsUpdateInput {
  objectKey: string
  viewKey?: string
  columns: string[]
}

export interface CrmViewDataInput extends CrmRecordSearchInput {
  recordId?: string
}

export interface CrmTableResult<T> {
  key: string
  items: T[]
  total: number
  page: number
  pageSize: number
}
