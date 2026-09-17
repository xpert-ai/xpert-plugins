import type { PlanPayload } from './types.js'

/** Shared by the workbench and Agent approval card; values match the frozen plan. */
export function approvalDetails(payload: PlanPayload) {
  const transfer = payload.transfer
  return {
    target: payload.target,
    sql: payload.sql,
    parameters: payload.sql ? payload.parameters ?? [] : undefined,
    import: transfer ? {
      database: transfer.database,
      schema: transfer.schema,
      engineCatalog: transfer.engineCatalog,
      table: transfer.table,
      columns: transfer.columns,
      rowCount: transfer.rows.length,
      previewRows: transfer.rows.slice(0, 5),
      previewTruncated: transfer.rows.length > 5,
    } : undefined,
    policyRevision: payload.policyRevision,
    expiresAt: payload.expiresAt,
    digest: payload.digest,
  }
}
