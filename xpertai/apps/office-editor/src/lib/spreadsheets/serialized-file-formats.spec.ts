jest.mock('@xpert-ai/plugin-sdk', () => ({ ContentEditorProvider: () => (target: object) => target }))
import * as XLSX from 'xlsx'
import { OfficeXlsFormat, OfficeCsvFormat, OfficeTsvFormat } from './serialized-file-formats.js'

describe('serialized spreadsheet files', () => {
  it.each([new OfficeXlsFormat(), new OfficeCsvFormat(), new OfficeTsvFormat()])('%s writes edits back to the original format', async format => {
    const snapshot = await format.read(await format.create())
    const sheet = snapshot.sheets[snapshot.sheetOrder[0]]
    sheet.cellData = { 0: { 0: { v: '中文,带引号"与\t制表符', t: 1 }, 1: { v: 7, t: 2 } },
      1: { 0: { v: 14, t: 2, ...(format.format === 'xls' ? {} : { f: '=B1*2' }) } } }
    const saved = await format.apply(Buffer.alloc(0), { format: format.format, snapshot })
    const reopened = await format.read(saved)
    const data = reopened.sheets[reopened.sheetOrder[0]].cellData!
    expect(data[0][0]?.v).toBe('中文,带引号"与\t制表符')
    expect(data[0][1]?.v).toBe(7)
    expect(data[1][0]?.v).toBe(14)
    expect(data[1][0]?.f).toBeUndefined()
  })
  it('rejects multi-sheet text saves and a mismatched format', async () => {
    const csv = new OfficeCsvFormat(), snapshot = await csv.read(await csv.create())
    const id = snapshot.sheetOrder[0]
    snapshot.sheets.second = { ...snapshot.sheets[id], id: 'second', name: 'Other' }
    snapshot.sheetOrder.push('second')
    await expect(csv.apply(Buffer.alloc(0), { format: 'csv', snapshot })).rejects.toThrow('one worksheet')
    await expect(csv.apply(Buffer.alloc(0), { format: 'xls', snapshot })).rejects.toThrow('editor_mismatch')
  })
  it.each([
    { codec: new OfficeCsvFormat(), delimiter: ',' },
    { codec: new OfficeTsvFormat(), delimiter: '\t' },
  ])('preserves untouched text fields in $codec.format when another cell is edited', async ({ codec, delimiter }) => {
    const fields = ['00123', '9007199254740993', '1.00', '2026-01-02', ' 10 ', '=1+1', '25']
    const source = Buffer.from([...fields, 'before'].join(delimiter))
    const snapshot = await codec.read(source)
    const row = snapshot.sheets[snapshot.sheetOrder[0]].cellData![0]
    expect(row[0]).toMatchObject({ v: '00123', t: 1 })
    expect(row[5].f).toBeUndefined()
    expect(row[6]).toMatchObject({ v: 25, t: 2 })
    row[7].v = 'after'
    const saved = await codec.apply(source, { format: codec.format, snapshot })
    expect(saved.toString()).toBe([...fields, 'after'].join(delimiter))
  })
  it('rejects XLS formula writes before serialization can lose them', async () => {
    const codec = new OfficeXlsFormat(), snapshot = await codec.read(await codec.create())
    snapshot.sheets[snapshot.sheetOrder[0]].cellData = { 0: { 0: { f: '=1+1', v: 2, t: 2 } } }
    await expect(codec.apply(Buffer.alloc(0), { format: 'xls', snapshot })).rejects.toThrow('xls_formula_read_only')
  })
  it('keeps all worksheets in XLS', async () => {
    const codec = new OfficeXlsFormat(), book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[10]]), 'First')
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[20]]), 'Second')
    const snapshot = await codec.read(XLSX.write(book, { type: 'buffer', bookType: 'xls' }))
    const saved = await codec.apply(Buffer.alloc(0), { format: 'xls', snapshot })
    expect(XLSX.read(saved).SheetNames).toEqual(['First', 'Second'])
  })
  it('retains hidden and very hidden XLS sheets across a cell edit, rename and reorder', async () => {
    const codec = new OfficeXlsFormat(), book = XLSX.utils.book_new()
    for (const name of ['Public', 'Hidden', 'Internal']) {
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['before']]), name)
    }
    XLSX.utils.book_set_sheet_visibility(book, 'Hidden', 1)
    XLSX.utils.book_set_sheet_visibility(book, 'Internal', 2)
    const source = XLSX.write(book, { type: 'buffer', bookType: 'xls' })
    const snapshot = await codec.read(source)
    const [visible, hidden, internal] = snapshot.sheetOrder
    expect(snapshot.sheetOrder.map(id => snapshot.sheets[id].hidden)).toEqual([0, 1, 1])
    snapshot.sheets[visible].cellData![0][0].v = 'after'
    snapshot.sheets[internal].name = 'Renamed'
    snapshot.sheetOrder = [visible, internal, hidden]
    const saved = XLSX.read(await codec.apply(source, { format: 'xls', snapshot }))
    expect(saved.Sheets.Public.A1.v).toBe('after')
    expect(saved.SheetNames).toEqual(['Public', 'Renamed', 'Hidden'])
    expect(saved.Workbook?.Sheets?.map(sheet => sheet.Hidden)).toEqual([0, 2, 1])
  })
})
