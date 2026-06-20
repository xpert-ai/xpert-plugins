export type Locale = 'zh_Hans' | 'en_US'
export type Mode = 'closed' | 'view' | 'edit' | 'create'
export type SortMode = 'server' | 'asc' | 'desc'
export type Density = 'comfortable' | 'compact'

export interface HostContext {
  locale?: string
  manifest?: unknown
  payload?: {
    parameters?: Record<string, unknown>
  }
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

export interface CrmObject {
  objectKey: string
  label?: string
  pluralLabel?: string
  icon?: string
  description?: string
  fields?: CrmField[]
}

export interface CrmFieldOption {
  value: string
  label?: string
  color?: string
}

export interface CrmField {
  objectKey?: string
  fieldKey: string
  type?: string
  label?: string
  required?: boolean
  defaultValue?: unknown
  options?: CrmFieldOption[]
  relationObjectKey?: string
  displayOrder?: number
}

export interface CrmRecord {
  id: string
  objectKey?: string
  values?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
  activities?: Array<Record<string, unknown>>
}

export interface CrmView {
  viewKey?: string
  name?: string
  columns?: string[]
  isDefault?: boolean
}

export interface CrmTable {
  key: string
  items: CrmRecord[]
  total: number
  page: number
  pageSize: number
}

export interface CrmData {
  summary: Record<string, unknown>
  objects: CrmObject[]
  selectedObject: CrmObject | null
  fields: CrmField[]
  views: CrmView[]
  table: CrmTable
  selectedRecord: CrmRecord | null
  meta: Record<string, unknown>
}

export type RelationLabels = Record<string, Record<string, string>>

export interface RelatedRecordSection {
  objectKey: string
  objectLabel?: string
  objectPluralLabel?: string
  relationFieldKey: string
  relationFieldLabel?: string
  fields: CrmField[]
  items: CrmRecord[]
  total: number
}

export interface TimelineItem {
  id: string
  type: 'activity' | 'note' | 'task'
  objectKey?: string | null
  recordId?: string | null
  title: string
  body?: string
  status?: string
  occurredAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface TextBundle {
  loading: string
  workspace: string
  nativeCrm: string
  newChat: string
  allRecords: string
  records: string
  record: string
  objects: string
  searchPlaceholder: string
  filter: string
  sort: string
  options: string
  refresh: string
  addNew: string
  newRecord: string
  create: string
  edit: string
  save: string
  saving: string
  cancel: string
  close: string
  details: string
  empty: string
  noValue: string
  countAll: string
  calculate: string
  notEmpty: string
  updated: string
  created: string
  fields: string
  required: string
  untitled: string
  saved: string
  loadFailed: string
  saveFailed: string
  showCompact: string
  showComfortable: string
  viewMode: string
  selectedCount: string
  clearSelection: string
  selectAll: string
  sortBy: string
  noSorting: string
  ascending: string
  descending: string
  tableDensity: string
  compactDensity: string
  comfortableDensity: string
  visibleRows: string
  relationReference: string
  searchActive: string
  fieldsMenu: string
  visibleFields: string
  viewSaved: string
  atLeastOneColumn: string
  searchRelation: string
  relatedRecords: string
  relationNoResults: string
  clearRelation: string
  loadingRelatedRecords: string
  linkedBy: string
  openRelatedRecord: string
  moreRelatedRecords: string
  timeline: string
  properties: string
  noTimelineItems: string
  activity: string
  note: string
  task: string
  due: string
}

declare global {
  interface Window {
    __crmReload?: () => void
  }
}
