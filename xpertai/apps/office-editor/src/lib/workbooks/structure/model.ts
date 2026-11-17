import { z } from 'zod/v3'
import { axisSchema, axisLength } from './axis.js'
import type { XpertWorkbook } from '../core.js'

export const structuralState = z.object({ format: z.literal('xpert.workbook.axes'), version: z.literal(1),
  sheets: z.record(z.object({ rows: axisSchema, columns: axisSchema }).strict()) }).strict()
export type StructuralState = z.infer<typeof structuralState>
export const structuralOperation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('insert_axis'), sheetId: z.string().min(1), axis: z.enum(['rows', 'columns']),
    index: z.number().int().nonnegative(), count: z.number().int().positive().max(10000) }).strict(),
  z.object({ kind: z.literal('delete_axis'), sheetId: z.string().min(1), axis: z.enum(['rows', 'columns']),
    index: z.number().int().nonnegative(), count: z.number().int().positive().max(10000) }).strict(),
  z.object({ kind: z.literal('reorder_rows'), sheetId: z.string().min(1), index: z.number().int().nonnegative(),
    order: z.array(z.number().int().nonnegative()).min(1).max(10000) }).strict(),
  z.object({ kind: z.literal('sort_rows'), sheetId: z.string().min(1), startRow: z.number().int().nonnegative(),
    endRow: z.number().int().nonnegative(), column: z.number().int().nonnegative(), direction: z.enum(['ascending', 'descending']) }).strict(),
  z.object({ kind: z.literal('rename_sheet'), sheetId: z.string().min(1), title: z.string().trim().min(1).max(31)
    .refine(title => !/[\\/?*[\]:]/.test(title) && !title.startsWith("'") && !title.endsWith("'")) }).strict(),
  z.object({ kind: z.literal('merge_cells'), sheetId: z.string().min(1), startRow: z.number().int().nonnegative(),
    endRow: z.number().int().nonnegative(), startColumn: z.number().int().nonnegative(), endColumn: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('unmerge_cells'), sheetId: z.string().min(1), startRow: z.number().int().nonnegative(),
    endRow: z.number().int().nonnegative(), startColumn: z.number().int().nonnegative(), endColumn: z.number().int().nonnegative() }).strict()
])
export type StructuralOperation = z.infer<typeof structuralOperation>
export function createStructuralState(book: XpertWorkbook, epoch: string): StructuralState {
  return structuralState.parse({ format: 'xpert.workbook.axes', version: 1, sheets: Object.fromEntries(book.order.map((id, index) => [id, {
    rows: [{ segment: `${epoch}/${index}/r`, start: 0, count: book.sheets[id].rows }],
    columns: [{ segment: `${epoch}/${index}/c`, start: 0, count: book.sheets[id].columns }]
  }])) })
}
export function assertStructuralState(book: XpertWorkbook, axes: StructuralState) {
  structuralState.parse(axes)
  if (Object.keys(axes.sheets).length !== book.order.length || book.order.some(id => !axes.sheets[id] ||
    axisLength(axes.sheets[id].rows) !== book.sheets[id].rows || axisLength(axes.sheets[id].columns) !== book.sheets[id].columns))
    throw new Error('office.workbook_axis_invalid')
}
