import { CSV_COLUMNS, experimentRowSchema, type ExperimentRow, type ExperimentStatistics, type ConditionStatistics } from './experiment-contracts.js'

// RFC 4180 quoting, UTF-8 BOM, CRLF/LF; reject malformed rows instead of guessing a dialect.
export function parseExperimentCsv(csv: string): ExperimentRow[] {
  if (Buffer.byteLength(csv, 'utf8') > 1024 * 1024) throw new Error('CSV must be at most 1 MiB.')
  const table = parseCsv(csv.replace(/^\uFEFF/, ''))
  const header = table.shift()?.map((value) => value.trim()) ?? []
  for (const column of CSV_COLUMNS) {
    if (!header.includes(column)) throw new Error(`Missing required column: ${column}`)
  }
  if (new Set(header).size !== header.length) throw new Error('CSV contains duplicate column names.')
  if (header.length !== CSV_COLUMNS.length) throw new Error('CSV must contain exactly the seven documented columns.')
  if (!table.length) throw new Error('CSV contains no experiment records.')
  if (table.length > 10000) throw new Error('CSV must contain at most 10000 records.')
  const ids = new Set<string>()
  return table.map((cells, index) => {
    if (cells.length !== header.length) throw new Error(`Row ${index + 2}: expected ${header.length} cells.`)
    const input: Record<string, unknown> = {}
    header.forEach((key, cell) => {
      const value = cells[cell].trim()
      if (!value) throw new Error(`Row ${index + 2}: ${key} is empty.`)
      if (key === 'experiment_id' || key === 'environment') input[key] = value
      else {
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) throw new Error(`Row ${index + 2}: ${key} must be a decimal number.`)
        input[key] = Number(value)
      }
    })
    const result = experimentRowSchema.safeParse(input)
    if (!result.success) throw new Error(`Row ${index + 2}: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
    if (ids.has(result.data.experiment_id)) throw new Error(`Row ${index + 2}: duplicate experiment_id ${result.data.experiment_id}`)
    ids.add(result.data.experiment_id)
    return result.data
  })
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], value = '', quoted = false, closed = false
  const cell = () => { row.push(value); value = ''; closed = false }
  const line = () => { cell(); if (row.some((item) => item.trim())) rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { value += '"'; i++ }
        else { quoted = false; closed = true }
      } else value += char
    } else if (char === ',') cell()
    else if (char === '\n' || char === '\r') { line(); if (char === '\r' && text[i + 1] === '\n') i++ }
    else if (char === '"' && !value && !closed) quoted = true
    else {
      if (closed || char === '"') throw new Error('Malformed CSV quoting.')
      value += char
    }
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.')
  if (value || row.length || closed) line()
  return rows
}

export function computeExperimentStatistics(rows: ExperimentRow[]): ExperimentStatistics {
  if (!rows.length) throw new Error('At least one experiment record is required.')
  const groups = new Map<string, ExperimentRow[]>()
  rows.forEach((row) => {
    const key = JSON.stringify([row.distance_m, row.angle_deg, row.environment])
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  })
  const mean = (items: ExperimentRow[], key: 'accuracy' | 'rssi_std' | 'phase_dispersion') => items.map((row) => row[key]).sort((a, b) => a - b).reduce((sum, value) => sum + value / items.length, 0)
  const conditions: ConditionStatistics[] = [...groups.values()].map((items) => ({
    distance_m: items[0].distance_m, angle_deg: items[0].angle_deg, environment: items[0].environment,
    record_count: items.length, average_accuracy: mean(items, 'accuracy'),
    average_rssi_std: mean(items, 'rssi_std'), average_phase_dispersion: mean(items, 'phase_dispersion')
  })).sort((a, b) => a.distance_m - b.distance_m || a.angle_deg - b.angle_deg || (a.environment < b.environment ? -1 : a.environment > b.environment ? 1 : 0))
  const best = conditions.reduce((a, b) => b.average_accuracy > a.average_accuracy ? b : a)
  const worst = conditions.reduce((a, b) => b.average_accuracy < a.average_accuracy ? b : a)
  return {
    record_count: rows.length, average_accuracy: mean(rows, 'accuracy'), conditions,
    best_condition: best, worst_condition: worst,
    accuracy_drop_vs_best: best.average_accuracy - worst.average_accuracy,
    rssi_std_change: worst.average_rssi_std - best.average_rssi_std,
    phase_dispersion_change: worst.average_phase_dispersion - best.average_phase_dispersion
  }
}
