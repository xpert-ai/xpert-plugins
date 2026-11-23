import { randomUUID } from 'node:crypto'
import { createWorkbookBackup, readWorkbookBackup } from './backup.js'
import { fromUniver } from './univer-adapter.js'
import { blankWorkbook } from './model.js'
import { exportWorkbookFile, importWorkbookFile } from './files.js'

it('round-trips native extensions, formulas, styles and sheets without an XLSX conversion', async () => {
  const native = blankWorkbook(randomUUID(), '原生恢复')
  native.sheets['sheet-1'].cellData = { 0: { 0: { v: '9007199254740993.001', t: 1, s: 'gold' }, 1: { f: '=A1', v: 99 } } }
  native.styles = { gold: { bg: { rgb: '#B89960' } } }
  native.resources = [{ name: 'UNRECOGNIZED_EXTENSION', data: '{"preserve":true}' }]
  const book = fromUniver(native), backup = createWorkbookBackup(book, 12)
  expect(readWorkbookBackup(backup, native.id)).toEqual(book)
  const file = exportWorkbookFile(native, 'native', undefined, 12)
  const restored = await importWorkbookFile(native.id, 'Ignored restore title', 'copy.xpert-workbook.json', file.buffer)
  expect(fromUniver(restored)).toEqual(book)
  expect(restored.sheets['sheet-1'].cellData[0][1]?.v).toBeUndefined()
})
it('rejects changed bytes, other resource IDs, unknown versions and incomplete archives', () => {
  const book = fromUniver(blankWorkbook(randomUUID(), 'Backup')), backup = createWorkbookBackup(book, 2)
  expect(() => readWorkbookBackup({ ...backup, workbook: { ...book, title: 'Changed' } }, book.id)).toThrow()
  expect(() => readWorkbookBackup(backup, randomUUID())).toThrow()
  expect(() => readWorkbookBackup({ ...backup, schemaVersion: 2 }, book.id)).toThrow()
  expect(() => readWorkbookBackup(book, book.id)).toThrow()
  expect(() => createWorkbookBackup(book, 0)).toThrow()
})
