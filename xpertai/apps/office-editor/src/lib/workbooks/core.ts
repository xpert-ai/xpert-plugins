import { z } from 'zod/v3'
import { structuralState, structuralOperation, createStructuralState, assertStructuralState } from './structure/model.js'
import { transformWorkbook } from './structure/transform.js'
import { createStructuralMapper } from './structure/references.js'

/** Engine-independent wire/storage contract. Extensions are opaque compatibility
 * data: changes to them are barriers, never guessed cell-level merges. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
const json: z.ZodType<Json> = z.lazy(() => z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)]))
const extensions = z.record(json)
export const sheetCell = z.object({ value: z.union([z.null(), z.boolean(), z.number().finite(), z.string()]),
  formula: z.string().max(32000).optional(), extensions }).strict()
const sheet = z.object({ id: z.string().min(1), title: z.string().min(1).max(100),
  rows: z.number().int().min(1).max(1048576), columns: z.number().int().min(1).max(16384),
  cells: z.record(z.string().regex(/^\d+:\d+$/), sheetCell), extensions }).strict()
export const xpertWorkbook = z.object({ format: z.literal('xpert.workbook'), schemaVersion: z.union([z.literal(1), z.literal(2)]),
  id: z.string().uuid(), title: z.string().min(1).max(300), order: z.array(z.string()).min(1).max(100),
  sheets: z.record(sheet), extensions, axes: structuralState.optional() }).strict().superRefine((book, ctx) => {
  if ((book.schemaVersion === 2) !== Boolean(book.axes)) ctx.addIssue({ code: 'custom', message: 'Invalid structure version' })
  if (book.axes) {
    try { assertStructuralState(book, book.axes) }
    catch { ctx.addIssue({ code: 'custom', message: 'Invalid axis identities' }) }
  }
  if (new Set(book.order).size !== book.order.length || Object.keys(book.sheets).length !== book.order.length ||
      book.order.some(id => book.sheets[id]?.id !== id)) ctx.addIssue({ code: 'custom', message: 'Invalid sheet identities' })
  if (new Set(Object.values(book.sheets).map(sheet => sheet.title.toLowerCase())).size !== book.order.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate sheet titles' })
  for (const sheet of Object.values(book.sheets)) for (const key of Object.keys(sheet.cells)) {
    const [row, column] = key.split(':').map(Number)
    if (key !== `${row}:${column}` || row >= sheet.rows || column >= sheet.columns)
      ctx.addIssue({ code: 'custom', message: 'Cell outside sheet' })
  }
})
export type XpertWorkbook = z.infer<typeof xpertWorkbook>
export const workbookOperation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('set_cell'), sheetId: z.string().min(1), row: z.number().int().min(0).max(1048575),
    column: z.number().int().min(0).max(16383), cell: sheetCell.nullable() }).strict(),
  z.object({ kind: z.literal('replace_structure'), workbook: xpertWorkbook }).strict(),
  z.object({ kind: z.literal('transform_structure'), operation: structuralOperation, identitySeed: z.string().uuid() }).strict()
])
export type WorkbookOperation = z.infer<typeof workbookOperation>
export const workbookSubmission = z.object({ protocol: z.enum(['xpert.workbook.operations@1', 'xpert.workbook.operations@2']),
  requestId: z.string().min(1).max(128), baseRevision: z.number().int().positive().safe(),
  operations: z.array(workbookOperation).min(1).max(10000) }).strict()
export type WorkbookSubmission = z.infer<typeof workbookSubmission>

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
}
export const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b)
export function structure(book: XpertWorkbook) {
  return { ...book, sheets: Object.fromEntries(Object.entries(book.sheets).map(([id, sheet]) => [id, { ...sheet, cells: {} }])) }
}
export function diffWorkbook(base: XpertWorkbook, next: XpertWorkbook): WorkbookOperation[] {
  if (base.id !== next.id) throw new Error('office.workbook_invalid')
  if (!same(structure(base), structure(next))) return [{ kind: 'replace_structure', workbook: next }]
  const operations: WorkbookOperation[] = []
  for (const id of base.order) {
    const before = base.sheets[id].cells, after = next.sheets[id].cells
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) if (!same(before[key] ?? null, after[key] ?? null)) {
      const [row, column] = key.split(':').map(Number)
      operations.push({ kind: 'set_cell', sheetId: id, row, column, cell: after[key] ?? null })
    }
  }
  return operations
}
export function applyWorkbookOperations(base: XpertWorkbook, operations: WorkbookOperation[]): XpertWorkbook {
  if (operations.some(op => op.kind === 'transform_structure')) {
    if (operations.length !== 1 || operations[0].kind !== 'transform_structure') throw new Error('office.workbook_invalid')
    const operation = operations[0], axes = base.axes ?? createStructuralState(base, operation.identitySeed)
    return transformWorkbook(base, axes, operation.operation, `${operation.identitySeed}/insert`).workbook
  }
  if (operations.some(op => op.kind === 'replace_structure')) {
    if (operations.length !== 1 || operations[0].kind !== 'replace_structure' || operations[0].workbook.id !== base.id)
      throw new Error('office.workbook_invalid')
    return xpertWorkbook.parse(operations[0].workbook)
  }
  const next = structuredClone(base), touched = new Set<string>()
  for (const op of operations) {
    if (op.kind !== 'set_cell') continue
    const target = next.sheets[op.sheetId], key = `${op.row}:${op.column}`, identity = `${op.sheetId}/${key}`
    if (!target || op.row >= target.rows || op.column >= target.columns || touched.has(identity)) throw new Error('office.workbook_invalid')
    touched.add(identity)
    if (op.cell === null) delete target.cells[key]
    else target.cells[key] = structuredClone(op.cell)
  }
  return xpertWorkbook.parse(next)
}

/** Check every intervening transition, not only the head: catches ABA and
 * structural changes subsequently undone. Caller enforces a contiguous history. */
export function mergeWorkbookOperations(base: XpertWorkbook, history: XpertWorkbook[], operations: WorkbookOperation[]) {
  return mergeWorkbookOperationResult(base, history, operations).workbook
}
export function mergeWorkbookOperationResult(base: XpertWorkbook, history: XpertWorkbook[], operations: WorkbookOperation[]) {
  applyWorkbookOperations(base, operations)
  if (history.length && operations.some(op => op.kind !== 'set_cell')) throw new Error('office.version_conflict')
  let previous = base
  let mappedOperations = operations
  for (const next of history) {
    if (!same(structure(previous), structure(next))) {
      if (!previous.axes || !next.axes) throw new Error('office.version_conflict')
      const mapper = createStructuralMapper(previous, previous.axes, next, next.axes)
      mappedOperations = mappedOperations.map(op => {
        if (op.kind !== 'set_cell') throw new Error('office.version_conflict')
        const row = mapper.transforms[op.sheetId].rows.index(op.row), column = mapper.transforms[op.sheetId].columns.index(op.column)
        if (row === null || column === null) throw new Error('office.version_conflict')
        const beforeCell = previous.sheets[op.sheetId].cells[`${op.row}:${op.column}`] ?? null
        const expected = beforeCell && { ...beforeCell, ...(beforeCell.formula ? { formula: mapper.formula(beforeCell.formula, op.sheetId) } : {}) }
        if (!same(expected, next.sheets[op.sheetId].cells[`${row}:${column}`] ?? null)) throw new Error('office.version_conflict')
        // Adding/removing a merge changes the meaning of writes inside it.
        const beforeMerges = previous.sheets[op.sheetId].extensions.mergeData ?? []
        const afterMerges = next.sheets[op.sheetId].extensions.mergeData ?? []
        if (!same(beforeMerges, afterMerges)) {
          const ranges = z.array(z.object({ startRow: z.number(), endRow: z.number(), startColumn: z.number(), endColumn: z.number() }))
          if (ranges.parse(beforeMerges).some(range => op.row >= range.startRow && op.row <= range.endRow && op.column >= range.startColumn && op.column <= range.endColumn) ||
            ranges.parse(afterMerges).some(range => row >= range.startRow && row <= range.endRow && column >= range.startColumn && column <= range.endColumn))
            throw new Error('office.version_conflict')
        }
        return { ...op, row, column, cell: op.cell && { ...op.cell, ...(op.cell.formula ? { formula: mapper.formula(op.cell.formula, op.sheetId) } : {}) } }
      })
      previous = next
      continue
    }
    for (const op of mappedOperations) if (op.kind === 'set_cell') {
      const key = `${op.row}:${op.column}`
      if (!same(previous.sheets[op.sheetId].cells[key] ?? null, next.sheets[op.sheetId].cells[key] ?? null))
        throw new Error('office.version_conflict')
    }
    previous = next
  }
  return { workbook: applyWorkbookOperations(previous, mappedOperations), operations: mappedOperations }
}
