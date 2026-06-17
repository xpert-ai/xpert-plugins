import type {
  CrmData,
  CrmField,
  CrmObject,
  CrmRecord,
  HostContext,
  Locale,
  RelatedRecordSection,
  RelationLabels,
  SortMode,
  TextBundle,
  TimelineItem
} from './types'

export const PAGE_SIZE = 25

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function unwrap(response: unknown) {
  if (!isObject(response)) return {}
  if (Object.prototype.hasOwnProperty.call(response, 'data')) return response.data
  if (Object.prototype.hasOwnProperty.call(response, 'result')) return response.result
  if (Object.prototype.hasOwnProperty.call(response, 'payload')) return response.payload
  return response
}

export function buildQuery(context: HostContext, objectKey: string, search: string, recordId?: string) {
  const payload = context.payload ?? {}
  const initialQuery = context.initialQuery ?? {}
  const parameters = {
    ...(payload.parameters ?? {}),
    ...(initialQuery.parameters ?? {}),
    objectKey: objectKey || undefined,
    recordId: recordId || undefined
  }
  return {
    page: 1,
    pageSize: PAGE_SIZE,
    ...initialQuery,
    search: search || undefined,
    parameters
  }
}

export function normalizeData(raw: unknown): CrmData {
  const value = isObject(raw) ? raw : {}
  const table = isObject(value.table) ? value.table : {}
  return {
    summary: isObject(value.summary) ? value.summary : {},
    objects: Array.isArray(value.objects) ? (value.objects as CrmObject[]) : [],
    selectedObject: isObject(value.selectedObject) ? (value.selectedObject as unknown as CrmObject) : null,
    fields: Array.isArray(value.fields) ? (value.fields as CrmField[]) : [],
    views: Array.isArray(value.views) ? (value.views as CrmData['views']) : [],
    table: {
      key: typeof table.key === 'string' ? table.key : 'records',
      items: Array.isArray(table.items) ? (table.items as CrmRecord[]) : [],
      total: typeof table.total === 'number' ? table.total : 0,
      page: typeof table.page === 'number' ? table.page : 1,
      pageSize: typeof table.pageSize === 'number' ? table.pageSize : PAGE_SIZE
    },
    selectedRecord: isObject(value.selectedRecord) ? (value.selectedRecord as unknown as CrmRecord) : null,
    meta: isObject(value.meta) ? value.meta : {}
  }
}

export function resolveNextSelection(
  result: CrmData,
  options: { recordId?: string; keepSelection?: boolean; selected: CrmRecord | null }
) {
  if (options.recordId) {
    return result.table.items.find((item) => item.id === options.recordId) ?? result.selectedRecord ?? null
  }
  if (options.keepSelection && options.selected) {
    return result.table.items.find((item) => item.id === options.selected?.id) ?? result.selectedRecord ?? options.selected
  }
  return null
}

export function getInitialObjectKey(context: HostContext) {
  const fromInitial = context.initialQuery?.parameters?.objectKey
  const fromPayload = context.payload?.parameters?.objectKey
  const value = Array.isArray(fromInitial) ? fromInitial[0] : fromInitial || fromPayload
  return typeof value === 'string' && value.trim() ? value.trim() : 'company'
}

export function getColumns(data: CrmData | null, fields: CrmField[]) {
  const view = data?.views?.find((item) => item.isDefault) ?? data?.views?.[0]
  const columnKeys = Array.isArray(view?.columns) && view.columns.length ? view.columns : fields.slice(0, 6).map((field) => field.fieldKey)
  return getColumnsFromKeys(fields, columnKeys)
}

export function getColumnsFromKeys(fields: CrmField[], columnKeys: string[]) {
  const normalized = columnKeys
    .map((key) => fields.find((field) => field.fieldKey === key))
    .filter((field): field is CrmField => Boolean(field))
    .slice(0, 7)
  return normalized.length ? normalized : fields.slice(0, 7)
}

export function getDefaultColumnKeys(data: CrmData | null, fields: CrmField[]) {
  const view = data?.views?.find((item) => item.isDefault) ?? data?.views?.[0]
  const keys = Array.isArray(view?.columns) && view.columns.length ? view.columns : fields.slice(0, 6).map((field) => field.fieldKey)
  return getColumnsFromKeys(fields, keys).map((field) => field.fieldKey)
}

export function getRelationLabels(data: CrmData | null): RelationLabels {
  const value = data?.meta?.relationLabels
  if (!isObject(value)) return {}
  const relationLabels: RelationLabels = {}
  Object.entries(value).forEach(([fieldKey, labels]) => {
    if (!isObject(labels)) return
    relationLabels[fieldKey] = Object.fromEntries(Object.entries(labels).map(([recordId, label]) => [recordId, String(label)]))
  })
  return relationLabels
}

export function getRelatedRecordSections(data: CrmData | null): RelatedRecordSection[] {
  const value = data?.meta?.relatedRecords
  if (!Array.isArray(value)) return []
  return value
    .filter(isObject)
    .map((section) => ({
      objectKey: typeof section.objectKey === 'string' ? section.objectKey : '',
      objectLabel: typeof section.objectLabel === 'string' ? section.objectLabel : undefined,
      objectPluralLabel: typeof section.objectPluralLabel === 'string' ? section.objectPluralLabel : undefined,
      relationFieldKey: typeof section.relationFieldKey === 'string' ? section.relationFieldKey : '',
      relationFieldLabel: typeof section.relationFieldLabel === 'string' ? section.relationFieldLabel : undefined,
      fields: Array.isArray(section.fields) ? (section.fields as CrmField[]) : [],
      items: Array.isArray(section.items) ? (section.items as CrmRecord[]) : [],
      total: typeof section.total === 'number' ? section.total : 0
    }))
    .filter((section) => section.objectKey && section.relationFieldKey && section.total > 0)
}

export function getTimelineItems(data: CrmData | null): TimelineItem[] {
  const value = data?.meta?.timeline
  if (!Array.isArray(value)) return []
  return value
    .filter(isObject)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      type: normalizeTimelineType(item.type),
      objectKey: typeof item.objectKey === 'string' ? item.objectKey : null,
      recordId: typeof item.recordId === 'string' ? item.recordId : null,
      title: typeof item.title === 'string' && item.title.trim() ? item.title : 'Activity',
      body: typeof item.body === 'string' && item.body.trim() ? item.body : undefined,
      status: typeof item.status === 'string' && item.status.trim() ? item.status : undefined,
      occurredAt: stringifyDate(item.occurredAt),
      createdAt: stringifyDate(item.createdAt),
      updatedAt: stringifyDate(item.updatedAt)
    }))
    .filter((item) => item.id)
}

export function toFormValues(fields: CrmField[], values: Record<string, unknown>, includeDefaults = false) {
  const form: Record<string, unknown> = {}
  fields.forEach((field) => {
    if (!field.fieldKey) return
    if (Object.prototype.hasOwnProperty.call(values, field.fieldKey)) {
      form[field.fieldKey] = values[field.fieldKey]
    } else if (includeDefaults && field.defaultValue !== undefined) {
      form[field.fieldKey] = field.defaultValue
    } else {
      form[field.fieldKey] = field.type === 'boolean' ? false : ''
    }
  })
  return form
}

export function normalizeFormValues(fields: CrmField[], form: Record<string, unknown>) {
  const values: Record<string, unknown> = {}
  fields.forEach((field) => {
    const value = form[field.fieldKey]
    if (field.type === 'boolean') {
      values[field.fieldKey] = Boolean(value)
      return
    }
    if (value === undefined || value === null) return
    if (typeof value === 'string' && value.trim() === '') return
    values[field.fieldKey] = value
  })
  return values
}

export function displayRecordTitle(record: CrmRecord, fields: CrmField[], t: TextBundle) {
  const values = record.values ?? {}
  const title =
    values.name ||
    [values.firstName, values.lastName].filter(Boolean).join(' ') ||
    values.title ||
    fields.map((field) => values[field.fieldKey]).find(Boolean)
  return title ? String(title) : record.id || t.untitled
}

export function formatText(value: unknown, field: CrmField, _fields: CrmField[], t: TextBundle) {
  if (value === undefined || value === null || value === '') return t.noValue
  const text = String(value)
  if (field.type === 'rich_text' && text.length > 96) return `${text.slice(0, 96)}...`
  if (text.length > 64) return `${text.slice(0, 64)}...`
  return text
}

export function formatCurrency(value: unknown, locale: Locale) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue)) return String(value)
  return numberValue.toLocaleString(locale === 'zh_Hans' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0
  })
}

export function formatDate(value: unknown, locale: Locale) {
  if (!value) return ''
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString(locale === 'zh_Hans' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function resolveText(value: unknown, locale: Locale) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (isObject(value)) {
    const preferred = locale === 'zh_Hans' ? value.zh_Hans : value.en_US
    const fallback = locale === 'zh_Hans' ? value.en_US : value.zh_Hans
    return String(preferred || fallback || '')
  }
  return String(value)
}

export function objectIcon(object: CrmObject) {
  const key = object.objectKey || ''
  const icon = object.icon || ''
  if (key === 'company' || icon.includes('building')) return 'building'
  if (key === 'person' || icon.includes('contacts')) return 'person'
  if (key === 'opportunity' || icon.includes('line-chart')) return 'target'
  if (key === 'task' || icon.includes('checkbox')) return 'check'
  if (key === 'note' || icon.includes('note')) return 'note'
  if (key === 'workflow') return 'workflow'
  return 'grid'
}

export function fieldIcon(field: CrmField) {
  if (field.type === 'url') return 'link'
  if (field.type === 'email') return 'mail'
  if (field.type === 'phone') return 'phone'
  if (field.type === 'date' || field.type === 'datetime') return 'calendar'
  if (field.type === 'currency' || field.type === 'number') return 'money'
  if (field.type === 'relation') return 'link'
  if (field.type === 'select' || field.type === 'multi_select') return 'list'
  if (field.fieldKey?.toLowerCase().includes('owner')) return 'person'
  return 'hash'
}

export function columnWidth(field: CrmField, index: number) {
  if (index === 0) return 240
  if (field.type === 'url' || field.type === 'email') return 220
  if (field.type === 'phone') return 170
  if (field.type === 'select' || field.type === 'multi_select') return 180
  if (field.type === 'currency' || field.type === 'number') return 150
  if (field.type === 'date' || field.type === 'datetime') return 160
  if (field.type === 'boolean') return 130
  if (field.type === 'relation') return 210
  if (field.type === 'rich_text') return 280
  return 220
}

export function sortRecords(records: CrmRecord[], field: CrmField | undefined, sortMode: SortMode) {
  if (!field || sortMode === 'server') return records
  return [...records].sort((a, b) => {
    const left = String(a.values?.[field.fieldKey] ?? '')
    const right = String(b.values?.[field.fieldKey] ?? '')
    return sortMode === 'asc' ? left.localeCompare(right) : right.localeCompare(left)
  })
}

export function countNonEmpty(records: CrmRecord[], fieldKey: string) {
  return records.filter((record) => {
    const value = record.values?.[fieldKey]
    return value !== undefined && value !== null && String(value).trim() !== ''
  }).length
}

export function recordInitial(title: string) {
  const trimmed = title.trim()
  if (!trimmed) return '#'
  const firstTwo = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
  return firstTwo.slice(0, 2).toUpperCase()
}

export function isUrlLike(value: string) {
  return /^https?:\/\//i.test(value) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(value)
}

export function shortUrl(value: string) {
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/^www\./, '')
  }
}

function stringifyDate(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  return String(value)
}

function normalizeTimelineType(value: unknown): TimelineItem['type'] {
  if (value === 'note' || value === 'task') return value
  return 'activity'
}
