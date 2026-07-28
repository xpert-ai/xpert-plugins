import {
  isRemoteObject,
  type RemoteObject,
  type RemoteValue
} from './runtime'

export type ProjectStatus =
  | 'draft'
  | 'planning'
  | 'production'
  | 'review'
  | 'completed'
  | 'failed'
  | 'archived'

export type ProductionFormat =
  | 'vertical_short'
  | 'horizontal_short'
  | 'episodic_series'
  | 'feature'
  | 'custom'

export interface ProjectSummary {
  id: string
  title: string
  description: string | null
  premise: string | null
  productionFormat: ProductionFormat
  aspectRatio: string
  targetDurationSeconds: number | null
  status: ProjectStatus
  revision: number
  tags: string[]
  failureCode: string | null
  failureMessage: string | null
  failureRecoverable: boolean | null
  updatedAt: string | null
  nextAction: string
}

export function readProjectList(payload: RemoteObject) {
  const projectsObject = isRemoteObject(payload.projects)
    ? payload.projects
    : null
  const tableObject = isRemoteObject(payload.table) ? payload.table : null
  const items =
    (projectsObject && Array.isArray(projectsObject.items)
      ? projectsObject.items
      : null) ??
    (tableObject && Array.isArray(tableObject.items)
      ? tableObject.items
      : [])
  return items
    .map(parseProject)
    .filter((item): item is ProjectSummary => Boolean(item))
}

export function readPagination(
  payload: RemoteObject,
  defaultPageSize: number
) {
  const projectsObject = isRemoteObject(payload.projects)
    ? payload.projects
    : null
  const tableObject = isRemoteObject(payload.table) ? payload.table : null
  const page =
    (projectsObject && readNumber(projectsObject, 'page')) ??
    (tableObject && readNumber(tableObject, 'page')) ??
    1
  const pageSize =
    (projectsObject && readNumber(projectsObject, 'pageSize')) ??
    (tableObject && readNumber(tableObject, 'pageSize')) ??
    defaultPageSize
  const total =
    (projectsObject && readNumber(projectsObject, 'total')) ??
    (tableObject && readNumber(tableObject, 'total')) ??
    readProjectList(payload).length
  return {
    page: Math.max(1, page),
    pageSize: Math.max(1, pageSize),
    total: Math.max(0, total)
  }
}

export function parseProject(value: RemoteValue): ProjectSummary | null {
  if (!isRemoteObject(value)) return null
  const id = readString(value, 'id')
  const title = readString(value, 'title')
  const status = readProjectStatus(value.status)
  const productionFormat = readProductionFormat(value.productionFormat)
  const revision = readNumber(value, 'revision')
  if (!id || !title || !status || !productionFormat || revision === null) {
    return null
  }
  return {
    id,
    title,
    description: readNullableString(value, 'description'),
    premise: readNullableString(value, 'premise'),
    productionFormat,
    aspectRatio: readString(value, 'aspectRatio') ?? '9:16',
    targetDurationSeconds: readNumber(value, 'targetDurationSeconds'),
    status,
    revision,
    tags: readStringArray(value, 'tags'),
    failureCode: readNullableString(value, 'failureCode'),
    failureMessage: readNullableString(value, 'failureMessage'),
    failureRecoverable: readBoolean(value, 'failureRecoverable'),
    updatedAt: readNullableString(value, 'updatedAt'),
    nextAction: readString(value, 'nextAction') ?? ''
  }
}

export function findProjectId(value: RemoteValue): string | null {
  if (!isRemoteObject(value)) return null
  const direct = readString(value, 'projectId')
  if (direct) return direct
  for (const key of ['data', 'result', 'project', 'receipt']) {
    const found = findProjectId(value[key])
    if (found) return found
  }
  return readString(value, 'id')
}

export function readProjectStatusFilter(
  value: string
): ProjectStatus | 'all' | null {
  return value === 'all' ? 'all' : readProjectStatus(value)
}

export function readProductionFormat(
  value: RemoteValue
): ProductionFormat | null {
  switch (value) {
    case 'vertical_short':
    case 'horizontal_short':
    case 'episodic_series':
    case 'feature':
    case 'custom':
      return value
    default:
      return null
  }
}

function readProjectStatus(value: RemoteValue): ProjectStatus | null {
  switch (value) {
    case 'draft':
    case 'planning':
    case 'production':
    case 'review':
    case 'completed':
    case 'failed':
    case 'archived':
      return value
    default:
      return null
  }
}

function readString(record: RemoteObject, key: string) {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNullableString(record: RemoteObject, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

function readNumber(record: RemoteObject, key: string) {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBoolean(record: RemoteObject, key: string) {
  const value = record[key]
  return typeof value === 'boolean' ? value : null
}

function readStringArray(record: RemoteObject, key: string) {
  const value = record[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}
