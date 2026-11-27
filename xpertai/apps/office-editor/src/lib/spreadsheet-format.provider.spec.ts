jest.mock('@xpert-ai/plugin-sdk', () => ({ ContentEditorProvider: () => (target: object) => target }))
import { OfficeSpreadsheetFormat } from './spreadsheet-format.provider.js'
import JSZip from 'jszip'

describe('Office XLSX file adapter', () => {
  const adapter = new OfficeSpreadsheetFormat()
  it('preserves unrelated ZIP parts and writes formulas with verified calculation results', async () => {
    const zip = await JSZip.loadAsync(await adapter.create())
    zip.file('customXml/preserved.xml', '<opaque>Keep me</opaque>')
    const original = await zip.generateAsync({ type: 'nodebuffer' })
    const next = await adapter.apply(original, { edits: [
      { sheet: 'Sheet1', cell: 'A1', value: 7 }, { sheet: 'Sheet1', cell: 'B1', value: { formula: '=A1*2' } }
    ], results: [{ sheet: 'Sheet1', cell: 'B1', formula: '=A1*2', value: 14 }] })
    const cells = (await adapter.read(next)).sheets['sheet-1'].cellData[0]
    expect(cells[0].v).toBe(7); expect(cells[1]).toMatchObject({ v: 14, f: '=A1*2' })
    expect(await (await JSZip.loadAsync(next)).file('customXml/preserved.xml')!.async('string')).toBe('<opaque>Keep me</opaque>')
    expect(await adapter.apply(original, { edits: [], results: [] })).toEqual(original)
  })
  it('rejects invalid addresses, unknown sheets, formatting and stale or missing formula results', async () => {
    const bytes = await adapter.create()
    for (const edit of [{ sheet: 'Sheet1', cell: 'XFE1', value: 1 }, { sheet: 'missing', cell: 'A1', value: 1 }])
      await expect(adapter.apply(bytes, { edits: [edit], results: [] })).rejects.toThrow()
    await expect(adapter.apply(bytes, { edits: [{ sheet: 'Sheet1', cell: 'A1', value: 1, style: {} }], results: [] } as never)).rejects.toThrow()
    const edits = [{ sheet: 'Sheet1', cell: 'A1', value: { formula: '=2+2' } }]
    await expect(adapter.apply(bytes, { edits, results: [] })).rejects.toThrow('missing_formula_result')
    await expect(adapter.apply(bytes, { edits, results: [{ sheet: 'Sheet1', cell: 'A1', formula: '=3+3', value: 6 }] })).rejects.toThrow('stale_formula_result')
    await expect(adapter.apply(bytes, { edits, results: [{ sheet: 'Sheet1', cell: 'A1', formula: '=2+2', value: '#VALUE!' }] })).rejects.toThrow('formula_error')
  })
})
