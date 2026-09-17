import type { DatabaseLocation, DatabaseResult, DatabaseValue } from '@xpert-ai/plugin-sdk/data-workbench'
import type { JsonRecord } from './bridge'
export interface Target extends DatabaseLocation {
  dataSourceId: string
  sessionId?: string
}
export interface SavedRecord {
  id: string
  kind: string
  title: string
  revision: number
  status: string
  updatedAt: string
  payload: JsonRecord
  summary?: JsonRecord
}
export interface Draft {
  key: string
  id?: string
  revision?: number
  title: string
  sql: string
  target: Target
  dirty: boolean
}
export interface QueryReceipt {
  executionId: string
  dataSourceId: string
  result: DatabaseResult
}
export interface Run {
  input: Target & { sql: string; limit: number; offset: number; parameters?: DatabaseValue[] }
  receipt: QueryReceipt
}
export interface Plan extends SavedRecord {
  payload: {
    target: Target
    sql?: string
    digest: string
    reason: string
    policyRevision: number
    expiresAt: string
    receipt?: unknown
  }
}
export function cleanTarget(value: Target): Target {
  return {
    dataSourceId: value.dataSourceId,
    database: value.database,
    schema: value.schema,
    engineCatalog: value.engineCatalog,
    sessionId: value.sessionId,
  }
}
export function download(name: string, content: string) {
  const url = URL.createObjectURL(
      new Blob([content], { type: name.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' })
    ),
    link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const uid = () => crypto.randomUUID(),
  blank: DatabaseResult = {
    columns: [],
    rows: [],
    durationMs: 0,
    hasMore: false,
    truncated: false,
    outcome: 'succeeded',
    diagnostics: [],
  }
export const targetEmpty = { dataSourceId: '' }
export const newDraft = (target: Target, sql = 'SELECT 1 AS ready;'): Draft => ({
  key: uid(),
  title: 'Query',
  target,
  sql,
  dirty: true,
})
export const jsonContent = (record: SavedRecord) => String((record.payload ?? record.summary)?.content ?? '{}')
