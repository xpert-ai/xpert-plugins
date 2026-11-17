import type { ContentTransferSnapshot } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { blankWorkbook, type NativeWorkbook } from './model.js'

const text = z.string().max(100000)
const transferSchema = z.object({ schema: z.literal('xpert.content-transfer@1'),
  source: z.object({ providerKey: z.string().min(1).max(200), resourceId: z.string().min(1).max(200),
    revision: z.string().min(1).max(256), title: z.string().min(1).max(200) }).strict(),
  sections: z.array(z.object({ anchor: z.object({ kind: z.string().min(1).max(200), id: z.string().min(1).max(1000) }).strict(), text }).strict()).max(1000)
}).strict()

/** One immutable import into a NEW workbook. Literal cell values never execute source text as formulas. */
export function workbookFromTransfer(id: string, title: string, raw: ContentTransferSnapshot): NativeWorkbook {
  const transfer = transferSchema.parse(raw)
  if (Buffer.byteLength(JSON.stringify(transfer)) > 2_000_000) throw new Error('office.transfer_size_limit')
  const book = blankWorkbook(id, title), sheet = book.sheets[book.sheetOrder[0]]
  sheet.name = 'Source outline'
  const rows = [['Element', 'Type', 'Text', 'Source', 'Revision'], ...transfer.sections.map(section => [
    section.anchor.id, section.anchor.kind, section.text,
    `${transfer.source.providerKey}:${transfer.source.resourceId}`, transfer.source.revision])]
  sheet.rowCount = Math.max(sheet.rowCount, rows.length)
  sheet.columnCount = Math.max(sheet.columnCount, 5)
  sheet.cellData = Object.fromEntries(rows.map((row, r) => [String(r), Object.fromEntries(row.map((v, c) => [String(c), { v, t: 1 }]))]))
  return book
}
