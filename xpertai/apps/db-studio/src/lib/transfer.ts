import type { DatabaseResult, DatabaseValue } from '@xpert-ai/plugin-sdk/data-workbench'
export function parseCsv(source: string): string[][] {
  if (source.length > 8 * 1024 * 1024) throw new Error('file_too_large')
  const rows: string[][] = []
  let row: string[] = [],
    value = '',
    quoted = false,
    endedQuote = false
  const push = () => {
      row.push(value)
      value = ''
      endedQuote = false
    },
    end = () => {
      push()
      rows.push(row)
      row = []
      if (rows.length > 10001) throw new Error('import_row_limit_exceeded')
    }
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          value += '"'
          i++
        } else {
          quoted = false
          endedQuote = true
        }
      } else value += c
      continue
    }
    if (c === '"') {
      if (value || endedQuote) throw new Error('invalid_csv_quote')
      quoted = true
    } else if (c === ',') push()
    else if (c === '\n') end()
    else if (c === '\r') {
      if (source[i + 1] === '\n') i++
      end()
    } else {
      if (endedQuote) throw new Error('invalid_csv_after_quote')
      value += c
    }
  }
  if (quoted) throw new Error('unterminated_csv_quote')
  if (value || row.length || endedQuote) end()
  return rows
}
export function parseImport(source: string, format: 'csv' | 'json'): { columns: string[]; rows: DatabaseValue[][] } {
  if (format === 'csv') {
    const [columns, ...rows] = parseCsv(source.replace(/^\uFEFF/, ''))
    if (
      !columns?.length ||
      new Set(columns).size !== columns.length ||
      rows.some((row) => row.length !== columns.length)
    )
      throw new Error('invalid_csv_columns')
    return { columns, rows }
  }
  const value: unknown = JSON.parse(source)
  if (
    !value ||
    typeof value !== 'object' ||
    !('columns' in value) ||
    !('rows' in value) ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.rows) ||
    value.columns.some((c) => typeof c !== 'string')
  )
    throw new Error('json_requires_columns_and_rows')
  return { columns: value.columns as string[], rows: value.rows as DatabaseValue[][] }
}
export function exportResult(result: DatabaseResult, format: 'csv' | 'json') {
  if (format === 'json')
    return JSON.stringify(
      {
        columns: result.columns.map((c) => c.name),
        columnMetadata: result.columns.map((c) => ({ id: c.id, name: c.name, dataType: c.dataType })),
        rows: result.rows,
      },
      null,
      2
    )
  const escape = (value: DatabaseValue) => {
    let text = value === null ? '' : String(value)
    if (/^[=+@\t\r]|^-(?!\d)/.test(text)) text = "'" + text
    return '"' + text.replaceAll('"', '""') + '"'
  }
  return [result.columns.map((c) => c.name), ...result.rows].map((row) => row.map(escape).join(',')).join('\r\n')
}
