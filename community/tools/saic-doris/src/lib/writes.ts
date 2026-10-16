import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseValue } from '@xpert-ai/plugin-sdk/data-workbench'
import { COLSPEC, KEY_COLS, type Table } from './tables.js'
import { SaicDatabase, type Row } from './database.js'
// Python str.strip() includes NEL and record separators, but does not strip BOM.
export const pyStrip = (value: string) =>
  value.replace(
    /^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g,
    ''
  )
export const specHash = (spec: string | null, url?: string | null) =>
  createHash('sha256')
    .update(`${pyStrip(spec ?? '')}\n${pyStrip(url ?? '')}`)
    .digest('hex')
    .slice(0, 16)
function pyRepr(value: unknown): string {
  if (typeof value !== 'string') return pyString(value)
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'"
  const escaped = [...value]
    .map((char) =>
      char === '\\'
        ? '\\\\'
        : char === quote
        ? '\\' + char
        : char === '\n'
        ? '\\n'
        : char === '\r'
        ? '\\r'
        : char === '\t'
        ? '\\t'
        : /[\x00-\x1f\x7f-\x9f]/.test(char)
        ? '\\x' + char.charCodeAt(0).toString(16).padStart(2, '0')
        : char
    )
    .join('')
  return quote + escaped + quote
}
export function pyString(value: unknown): string {
  if (value === null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (Array.isArray(value)) return pyList(value)
  if (isObject(value))
    return (
      '{' +
      Object.entries(value)
        .map(([key, item]) => `${pyRepr(key)}: ${pyRepr(item)}`)
        .join(', ') +
      '}'
    )
  return String(value)
}
export const pyList = (values: readonly unknown[]) => `[${values.map(pyRepr).join(', ')}]`
const pyJson = (value: unknown) =>
  JSON.stringify(value).replace(/"(?:\\.|[^"\\])*"|[:,]/g, (token) =>
    token === ':' || token === ',' ? token + ' ' : token
  )
export const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
export const truthy = (value: unknown): boolean =>
  Array.isArray(value) ? value.length > 0 : isObject(value) ? Object.keys(value).length > 0 : !!value
export function trueValue(value: unknown) {
  if (Array.isArray(value) || isObject(value))
    throw new Error(`unhashable type: '${Array.isArray(value) ? 'list' : 'dict'}'`)
  return (
    value === true || value === 1 || (typeof value === 'string' && ['1', 'true', 'True', 'yes', 'Y'].includes(value))
  )
}
export function integer(value: unknown): number {
  const text = pyStrip(pyString(value))
  if (!/^[+-]?\d+$/.test(text)) throw new Error(`invalid literal for int() with base 10: '${text}'`)
  const n = Number(text)
  if (!Number.isSafeInteger(n)) throw new Error('integer_out_of_safe_range')
  return n
}
export function clean(table: Table, value: unknown): Row {
  if (!isObject(value)) throw new Error('每行必须是对象 {列名: 值}')
  const spec = COLSPEC[table],
    result: Row = {},
    unknown = Object.keys(value).filter((k) => !Object.hasOwn(spec, k))
  if (unknown.length) throw new Error(`未知列 ${pyList(unknown)}；${table} 允许列: ${pyList(Object.keys(spec).sort())}`)
  for (const [column, [type, required, length]] of Object.entries(spec)) {
    const v = Object.hasOwn(value, column) ? value[column] : undefined
    if (v == null) {
      if (required) throw new Error(`缺必填列 ${column}`)
      continue
    }
    if (type === 'str')
      result[column] = length ? [...pyStrip(pyString(v))].slice(0, length).join('') : pyStrip(pyString(v))
    else if (type === 'int') result[column] = integer(v)
    else if (type === 'bool') result[column] = trueValue(v)
    else if (type === 'dt') result[column] = [...pyStrip(pyString(v))].slice(0, 19).join('')
    else result[column] = typeof v === 'string' ? v : pyJson(v)
  }
  return result
}
const quote = (name: string) => '`' + name.replaceAll('`', '``') + '`'
export class SaicWrites {
  constructor(readonly db: SaicDatabase, readonly stream: { enabled: boolean; minRows: number; chunkSize: number }) {}
  async insert(table: Table, row: Row) {
    const columns = Object.keys(row)
    return this.db.exec(
      `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(',')})`,
      Object.values(row)
    )
  }
  async upsert(table: Table, rows: unknown[]) {
    if (!rows.length) return { error: 'rows 为空' }
    if (rows.length > 500) return { error: `单次最多 500 行，收到 ${rows.length}` }
    const cleaned: Row[] = []
    for (const [i, row] of rows.entries()) {
      try {
        cleaned.push(clean(table, row))
      } catch (e) {
        return { error: `第${i + 1}行: ${e instanceof Error ? e.message : 'invalid_row'}` }
      }
    }
    const keys = KEY_COLS[table],
      keyOf = (row: Row) => JSON.stringify(keys.map((k) => row[k])),
      oldMap = new Map<string, Row>()
    const where = cleaned.map(() => '(' + keys.map((k) => `${quote(k)} = ?`).join(' AND ') + ')').join(' OR ')
    const old = await this.db.fetch(
      `SELECT * FROM ${quote(table)} WHERE ${where}`,
      cleaned.flatMap((row) => keys.map((k) => row[k])),
      rows.length + 1
    )
    for (const row of old.data) oldMap.set(keyOf(row), row)
    const columns = Object.keys(COLSPEC[table])
    const full = cleaned.map((row) => {
      const merged = { ...oldMap.get(keyOf(row)), ...row }
      return columns.map((c) => merged[c] ?? (COLSPEC[table][c][0] === 'bool' ? true : null))
    })
    if (this.stream.enabled && rows.length >= this.stream.minRows) {
      try {
        let loaded = 0,
          filtered = 0
        for (let i = 0; i < full.length; i += this.stream.chunkSize) {
          const batch = full.slice(i, i + this.stream.chunkSize)
          const receipt = await this.db.adapter.importRows(
            {
              table,
              columns,
              rows: batch.map((row) =>
                row.map((value) => (typeof value === 'string' ? value.replace(/[\t\n\r]/g, ' ') : value))
              ),
              operationId: `saic_${randomUUID()}`
            },
            this.db.signal
          )
          // Preserve the source's Publish Timeout acceptance and fallback policy.
          if (
            receipt.outcome !== 'succeeded' &&
            !(
              receipt.outcome === 'pending' &&
              receipt.diagnostics.includes('committed_awaiting_visibility_do_not_replay')
            )
          )
            throw new Error('stream_load_failed')
          if (receipt.diagnostics.includes('duplicate_label_no_replay')) throw new Error('stream_load_duplicate_label')
          loaded += receipt.loadedRows ?? batch.length
          filtered += receipt.filteredRows ?? 0
        }
        if (filtered) throw new Error('stream_load_filtered_rows')
        return {
          table,
          rows: rows.length,
          affected: loaded,
          mode: 'stream',
          note: 'Stream Load 批量（UNIQUE KEY 按主键覆盖）'
        }
      } catch (error) {
        if (this.db.signal?.aborted) throw error
      }
    }
    let affected = 0
    for (let i = 0; i < full.length; i += 100) {
      const batch = full.slice(i, i + 100)
      affected += await this.db.exec(
        `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES ${batch
          .map(() => `(${columns.map(() => '?').join(',')})`)
          .join(',')}`,
        batch.flat()
      )
    }
    return { table, rows: rows.length, affected, note: '读-合并-整行INSERT：未提供的列保留旧值，不会被重置' }
  }
  async merge(table: Table, key: Row, changes: Row) {
    const unknown = Object.keys(changes).filter((k) => !Object.hasOwn(COLSPEC[table], k))
    if (unknown.length) return { error: `未知列 ${pyList(unknown)}` }
    const current = await this.db.fetch(
      `SELECT * FROM ${quote(table)} WHERE ${Object.keys(key)
        .map((k) => `${quote(k)} = ?`)
        .join(' AND ')}`,
      Object.values(key),
      1
    )
    if (!current.data.length)
      return {
        error: `${table} 中找不到记录: {${Object.entries(key)
          .map(([k, v]) => `'${k}': ${typeof v === 'string' ? `'${v}'` : v}`)
          .join(', ')}}（请先用 upsert_*/create_task 创建）`
      }
    const row = Object.fromEntries(Object.entries({ ...current.data[0], ...changes }).filter(([, v]) => v != null))
    return { table, affected: await this.insert(table, row), mode: 'merge-insert(UNIQUE KEY 覆盖)' }
  }
}
