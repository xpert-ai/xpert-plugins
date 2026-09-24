import { z } from 'zod'
import { position } from './xlsx.mjs'

export const address = z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,5}$/)
const range = z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,5}:[A-Z]{1,3}[1-9][0-9]{0,5}$/)
const scalar = z.union([z.string().max(32767), z.number().finite(), z.boolean(), z.null()])
export const cellValue = z.union([
  scalar,
  z.object({ formula: z.string().min(2).max(4096).startsWith('=') }).strict()
])
const name = z.string().min(1).max(31).regex(/^[^\\/?*\[\]:]+$/)
const series = z.object({ name: z.string().max(100), categories: range, values: range }).strict()
const sheet = z.object({
  name,
  rows: z.array(z.array(cellValue).max(256)).max(10000),
  columnWidths: z.array(z.number().min(4).max(80)).max(256).optional(),
  header: z.boolean().default(true),
  freezeRows: z.number().int().min(0).max(100).default(1),
  hidden: z.boolean().default(false),
  numberFormats: z.array(z.object({ range, format: z.string().max(100) }).strict()).max(100).default([]),
  tables: z.array(z.object({ name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,100}$/), range }).strict()).max(20).default([]),
  charts: z.array(z.object({
    type: z.enum(['bar', 'line', 'pie']), title: z.string().max(200), anchor: address,
    series: z.array(series).min(1).max(8)
  }).strict()).max(10).default([])
}).strict()
export const workbookSpec = z.object({
  version: z.literal(1), sheets: z.array(sheet).min(1).max(20)
}).strict().superRefine((v, ctx) => {
  if (new Set(v.sheets.map(s => s.name.toLowerCase())).size !== v.sheets.length)
    ctx.addIssue({ code: 'custom', message: 'Sheet names must be unique' })
  if (v.sheets.every(s => s.hidden)) ctx.addIssue({ code: 'custom', message: 'At least one sheet must be visible' })
  if (v.sheets.reduce((n, s) => n + s.rows.reduce((m, row) => m + row.length, 0), 0) > 100000)
    ctx.addIssue({ code: 'custom', message: 'Workbook exceeds 100000 cells' })
  for (const s of v.sheets) {
    const ranges = [...s.numberFormats.map(f => f.range), ...s.tables.map(t => t.range),
      ...s.charts.flatMap(c => [c.anchor, ...c.series.flatMap(series => [series.values, series.categories])])]
    for (const range of ranges) {
      try {
        const [a, b = a] = range.split(':').map(position)
        if (a.row > b.row || a.column > b.column || b.row >= 10000 || b.column >= 256 ||
            (b.row - a.row + 1) * (b.column - a.column + 1) > 100000) throw new Error('outside bounds')
      } catch { ctx.addIssue({ code: 'custom', message: `Range exceeds v1 limits: ${s.name}!${range}` }) }
    }
  }
})
export const patchSpec = z.object({
  version: z.literal(1), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  edits: z.array(z.object({ sheet: name, cell: address, value: cellValue }).strict()).min(1).max(10000)
}).strict()

export const SUPPORTED_FUNCTIONS = ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'IF', 'IFERROR',
  'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'SUMIF', 'SUMIFS', 'COUNTIF', 'COUNTIFS', 'ABS', 'AND', 'OR', 'NOT']
export function checkFormula(formula) {
  const withoutStrings = formula.replace(/"(?:[^"]|"")*"/g, '""').replace(/'(?:[^']|'')*'/g, "''")
  if (/[\[\]{}#]/.test(withoutStrings) || /(?:^|[!,(+*/ -])[A-Z]+:[A-Z]+\b/i.test(withoutStrings) || /\b\d+:\d+\b/.test(withoutStrings))
    throw new Error('V1 formulas require bounded A1 ranges; external, structured and array references are unsupported')
  for (const match of withoutStrings.matchAll(/([A-Z_][A-Z0-9_.]*)\s*\(/gi))
    if (!SUPPORTED_FUNCTIONS.includes(match[1].toUpperCase())) throw new Error(`Unsupported formula function: ${match[1]}`)
}
