import {
  splitWorkbenchSql,
  type DatabaseWorkbenchAdapter,
  type DatabaseValue,
  type DatabaseResult
} from '@xpert-ai/plugin-sdk/data-workbench'
export type Row = Record<string, DatabaseValue>
export interface FetchResult {
  rowCount: number
  truncated: boolean
  data: Row[]
}
const NUMERIC = new Set(['1', '2', '3', '4', '5', '8', '9', '13'])
export function rowsOf(result: DatabaseResult): Row[] {
  return result.rows.map((values) =>
    Object.fromEntries(
      result.columns.map((column, index) => {
        const value = values[index] ?? null
        // MySQL field codes are typed driver metadata, never inferred from column names.
        const number = typeof value === 'string' && NUMERIC.has(column.dataType) ? Number(value) : NaN
        return [
          column.name,
          Number.isFinite(number) && (Number.isSafeInteger(number) || ['4', '5'].includes(column.dataType))
            ? number
            : value
        ]
      })
    )
  )
}
export class SaicDatabase {
  private nowCache?: { value: string; at: number }
  constructor(readonly adapter: DatabaseWorkbenchAdapter, readonly signal?: AbortSignal) {}
  async fetch(sql: string, parameters: DatabaseValue[] = [], cap = 500): Promise<FetchResult> {
    const statements = splitWorkbenchSql(sql)
    const firstWord = statements[0].words[0]
    if (statements.length === 1 && (firstWord === 'SELECT' || firstWord === 'WITH')) {
      // Count the original query (including its LIMIT) before fetching the capped payload.
      const count = await this.adapter.query(
        {
          sql: `SELECT COUNT(*) AS row_count FROM (\n${sql}\n) AS saic_count`,
          parameters,
          mode: 'read',
          limit: 1,
          timeoutMs: 30000
        },
        this.signal
      )
      const total = Number(count.rows[0]?.[0])
      if (!Number.isSafeInteger(total) || total < 0) throw new Error('invalid_row_count')
      const result = await this.adapter.query(
        { sql, parameters, mode: 'read', limit: Math.max(1, Math.min(cap, 50000)), timeoutMs: 30000 },
        this.signal
      )
      return { rowCount: total, truncated: total > cap, data: rowsOf(result).slice(0, cap) }
    }
    const result = await this.adapter.query(
      { sql, parameters, mode: 'read', limit: 50000, timeoutMs: 30000 },
      this.signal
    )
    if (result.hasMore || result.truncated) throw new Error('metadata_result_limit_exceeded')
    return { rowCount: result.rows.length, truncated: result.rows.length > cap, data: rowsOf(result).slice(0, cap) }
  }
  async exec(sql: string, parameters: DatabaseValue[]) {
    const result = await this.adapter.query({ sql, parameters, mode: 'write', timeoutMs: 30000 }, this.signal)
    if (result.outcome !== 'succeeded') throw new Error('write_outcome_unconfirmed')
    return result.affectedRows ?? 0
  }
  async now() {
    if (this.nowCache && Date.now() - this.nowCache.at < 30000) return this.nowCache.value
    let value: string
    try {
      value = String((await this.fetch('SELECT NOW() AS n', [], 1)).data[0].n).slice(0, 19)
    } catch (error) {
      if (this.signal?.aborted) throw error
      value = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      }).format(new Date())
    }
    this.nowCache = { value, at: Date.now() }
    return value
  }
}
