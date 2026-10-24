jest.mock('@xpert-ai/plugin-sdk', () => ({ ContentEditorProvider: () => (target: object) => target }))
import { OfficeSpreadsheetFormat } from './spreadsheet-format.provider.js'

describe('Office content editor adapter', () => {
  const adapter = new OfficeSpreadsheetFormat()
  it('round-trips values and formulas without changing the input version', async () => {
    const original = await adapter.create()
    const next = await adapter.apply(original, { sheetId: 'Sheet1', cells: [
      { row: 0, column: 0, value: 7 }, { row: 0, column: 1, value: '', formula: 'A1*2' }
    ] })
    expect((await adapter.read(original)).sheets[0].cells.some((cell) => cell.value === 7)).toBe(false)
    const sheet = (await adapter.read(next)).sheets[0]
    expect(sheet.cells).toEqual(expect.arrayContaining([
      { row: 0, column: 0, value: 7 }, { row: 0, column: 1, value: '', formula: 'A1*2' }
    ]))
  })
  it('rejects an out-of-bounds patch and an unknown worksheet', async () => {
    const bytes = await adapter.create()
    await expect(adapter.apply(bytes, { sheetId: 'Sheet1', cells: [{ row: 1000, column: 0, value: 'bad' }] })).rejects.toThrow()
    await expect(adapter.apply(bytes, { sheetId: 'missing', cells: [{ row: 0, column: 0, value: 'bad' }] })).rejects.toThrow()
  })
})
