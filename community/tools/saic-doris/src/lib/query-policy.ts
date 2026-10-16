import sqlParser from 'node-sql-parser'
import { requireDorisReadStatement } from '@xpert-ai/plugin-mysql/doris'
import { isTable } from './tables.js'
const parser = new sqlParser.Parser()
/** Free SQL has a smaller surface than the fixed metadata tools. The parser resolves
 * comma joins, subqueries and unions; qualified/system tables are never accepted.
 */
export function configQuery(sql: string): string {
  if (/sc_credential/i.test(sql)) throw new Error('sc_credential 对 MCP 不可见')
  if (/\/\*[!+]/.test(sql)) throw new Error('不允许可执行注释或查询提示')
  let statement: string
  try {
    statement = requireDorisReadStatement(sql)
  } catch {
    throw new Error('只允许单条只读查询，禁止写入、危险函数或未支持语法')
  }
  const metadata = statement.match(
    /^(?:DESCRIBE|DESC|SHOW\s+(?:COLUMNS|INDEX|INDEXES|KEYS|TABLETS|DATA)\s+FROM)\s+`?([A-Za-z_][A-Za-z_0-9]*)`?$/i
  )
  if (metadata) {
    if (!isTable(metadata[1].toLowerCase())) throw new Error(`表 ${metadata[1]} 不在 MCP 可读范围`)
    return statement
  }
  if (/^SHOW\b/i.test(statement))
    throw new Error('自由 SHOW 仅允许六张配置表的列、索引和分桶；建表语句请用 describe_config_table')
  const select = statement.replace(/^EXPLAIN\s+/i, '')
  try {
    const parsed = parser.parse(select, { database: 'MySQL' })
    const ast = Array.isArray(parsed.ast) ? parsed.ast : [parsed.ast]
    if (ast.length !== 1 || ast[0].type !== 'select') throw new Error('select_required')
    for (const reference of parsed.tableList) {
      const [operation, database, table] = reference.split('::')
      if (operation !== 'select' || database !== 'null' || !isTable(table.toLowerCase()))
        throw new Error(`表 ${database === 'null' ? table : `${database}.${table}`} 不在 MCP 可读范围`)
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('不在 MCP 可读范围')) throw error
    throw new Error('只允许可解析的配置表 SELECT/WITH/EXPLAIN 查询')
  }
  return statement
}
