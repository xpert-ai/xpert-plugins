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

/** Plugin-owned presentation; the host renders these generic sections without knowing DB Studio. */
export function approvalDisplay(payload: PlanPayload) {
  const localized = (en: string, zh: string) => ({ en_US: en, zh_Hans: zh })
  const text = (label: ReturnType<typeof localized>, value: ReturnType<typeof localized>) => ({ type: 'text' as const, label, text: value })
  const code = (label: ReturnType<typeof localized>, value: string) => ({ type: 'code' as const, label, code: value })
  const preview = (transfer: NonNullable<PlanPayload['transfer']>) => ({
    type: 'table' as const,
    label: localized('Data preview (up to 5 rows)', '数据预览（最多 5 行）'),
    columns: transfer.columns,
    rows: transfer.rows.slice(0, 5),
  })
  const sections: Array<ReturnType<typeof text> | ReturnType<typeof code> | ReturnType<typeof preview>> = []
  const transfer = payload.transfer
  sections.push(text(localized('Impact', '影响范围'), transfer
    ? localized(`Import ${transfer.rows.length} rows`, `将导入 ${transfer.rows.length} 行数据`)
    : localized('See the SQL below for the operation scope. Affected rows, if applicable, are determined after execution.', '操作范围以以下 SQL 为准；涉及数据变更时，影响行数以执行结果为准。')))
  if (payload.sql) sections.push(code(localized('Execution', '执行内容'), payload.sql))
  if (payload.parameters?.length) sections.push(code(localized('SQL parameters (in order)', 'SQL 参数（按顺序）'), JSON.stringify(payload.parameters)))
  if (transfer) {
    sections.push(text(localized('Import columns', '导入字段'), localized(transfer.columns.join(', '), transfer.columns.join(', '))))
    sections.push(preview(transfer))
  }
  return {
    title: localized('Confirm database operation', '数据库操作确认'),
    summary: transfer
      ? localized('Import the data below. Review before approving.', '将导入以下数据，请确认后批准。')
      : localized('Run the SQL below. Review before approving.', '将执行以下 SQL，请确认后批准。'),
    sections,
  }
}
