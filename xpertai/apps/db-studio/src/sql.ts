import { quoteSqlIdentifier } from '@xpert-ai/sql-workbench'
export { splitWorkbenchSql, requireReadStatement } from '@xpert-ai/sql-workbench'

/** DB Studio currently offers SQL editing for these plugin dialects. Unknown engines fail closed. */
export function quoteDatabaseIdentifier(name: string, engine: string): string {
  if (engine === 'postgres' || engine === 'hana') return quoteSqlIdentifier(name, '"')
  if (engine === 'mysql' || engine === 'doris') return quoteSqlIdentifier(name, '`')
  throw new Error('sql_editor_dialect_unavailable')
}
