import { z } from 'zod/v3'
const index = z.string().regex(/^\d+$/)
const cell = z.object({ v: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]).optional(),
  f: z.string().max(32000).nullable().optional(), t: z.number().nullable().optional() }).passthrough().nullable()
const sheet = z.object({ id: z.string().min(1), name: z.string().min(1).max(100), rowCount: z.number().int().min(1).max(1048576),
  columnCount: z.number().int().min(1).max(16384), cellData: z.record(index, z.record(index, cell)).default({}) }).passthrough()
export const workbookSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(300),
  appVersion: z.literal('0.25.0'), locale: z.string().min(1), styles: z.record(z.object({}).passthrough().nullable()),
  sheetOrder: z.array(z.string().min(1)).min(1).max(100), sheets: z.record(sheet) }).passthrough().superRefine((book, ctx) => {
  const ids = new Set(book.sheetOrder)
  if (ids.size !== book.sheetOrder.length || ids.size !== Object.keys(book.sheets).length ||
    book.sheetOrder.some(id => !book.sheets[id] || book.sheets[id].id !== id)) ctx.addIssue({ code: 'custom', message: 'office.workbook_structure' })
  const names = book.sheetOrder.map(id => book.sheets[id]?.name.toLowerCase())
  if (new Set(names).size !== names.length) ctx.addIssue({ code: 'custom', message: 'office.workbook_sheet_names' })
  for (const tab of Object.values(book.sheets)) for (const [row, cells] of Object.entries(tab.cellData)) {
    if (Number(row) >= tab.rowCount || Object.keys(cells).some(col => Number(col) >= tab.columnCount))
      ctx.addIssue({ code: 'custom', message: 'office.workbook_cell_bounds' })
  }
})
export type NativeWorkbook = z.infer<typeof workbookSchema>
