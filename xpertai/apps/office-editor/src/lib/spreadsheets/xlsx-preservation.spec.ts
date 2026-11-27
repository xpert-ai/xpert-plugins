jest.mock('@xpert-ai/plugin-sdk', () => ({ ContentEditorProvider: () => (target: object) => target }))
import JSZip from 'jszip'
import type { IWorkbookData } from '@univerjs/core'
import { readXlsx } from '@xpert-ai/artifact-tool/xlsx'
import { sheetJsWorkbookToUniver } from './file-codec.js'
import { hydrateXlsxSnapshot, xlsxChanges } from './xlsx-preservation.js'
import { OfficeSpreadsheetFormat } from '../spreadsheet-format.provider.js'
async function fixture() {
  const zip = new JSZip();
  zip.file(
    'xl/workbook.xml',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B2"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" state="frozen"/></sheetView></sheetViews><sheetData><row r="1"><c r="A1"><v>10</v></c><c r="B1"><f>A1*2</f><v>20</v></c></row></sheetData><dataValidations count="1"><dataValidation type="whole" sqref="A1"><formula1>0</formula1></dataValidation></dataValidations><tableParts count="1"><tablePart xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></tableParts></worksheet>',
  );
  zip.file(
    'xl/tables/table1.xml',
    '<table name="Keep" ref="A2:B3"><tableColumns><tableColumn name="One"/><tableColumn name="Two"/></tableColumns></table>',
  );
  zip.file(
    'xl/worksheets/_rels/sheet1.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="../tables/table1.xml"/></Relationships>',
  );
  zip.file(
    'xl/charts/chart1.xml',
    '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:ser><c:val><c:numRef><c:f>Data!$A$1</c:f><c:numCache><c:pt idx="0"><c:v>10</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:chart></c:chartSpace>',
  );
  const source = await zip.generateAsync({ type: 'uint8array' });
  const baseline = sheetJsWorkbookToUniver(
    {
      SheetNames: ['Data'],
      Sheets: {
        Data: {
          A1: { t: 'n', v: 10 },
          B1: { t: 'n', v: 20, f: 'A1*2' },
          '!ref': 'A1:B1',
        },
      },
    },
    'test.xlsx',
  );
  await hydrateXlsxSnapshot(new Blob([source.slice().buffer]), baseline);
  return { source, baseline };
}
const clone = (value: IWorkbookData): IWorkbookData =>
  JSON.parse(JSON.stringify(value));

it('preserves table/validation XML and refreshes chart/formula caches across the view and server boundary', async () => {
  const { source, baseline } = await fixture()
  const after = clone(baseline)
  after.sheets['sheet-1'].cellData![0][0].v = 15
  after.sheets['sheet-1'].cellData![0][1].v = 30
  const bytes = await new OfficeSpreadsheetFormat().apply(Buffer.from(source), xlsxChanges(baseline, after))
  const read = await readXlsx(bytes)
  expect(read.sheets[0].cells.B1.value).toBe(30)
  expect(read.sheets[0].freeze.rows).toBe(1)
  const zip = await JSZip.loadAsync(bytes)
  expect(await zip.file('xl/tables/table1.xml')!.async('string')).toBe(await (await JSZip.loadAsync(source)).file('xl/tables/table1.xml')!.async('string'))
  expect(await zip.file('xl/worksheets/sheet1.xml')!.async('string')).toContain('dataValidation')
  expect(await zip.file('xl/charts/chart1.xml')!.async('string')).toContain('>15<')
})
it('rejects lossy structure/style changes and formula errors before invoking a save', async () => {
  const { baseline } = await fixture()
  expect(xlsxChanges(baseline, clone(baseline)).edits).toEqual([])
  const renamed = clone(baseline); renamed.sheets['sheet-1'].name = 'Renamed'
  expect(() => xlsxChanges(baseline, renamed)).toThrow('Undo sheet')
  const styled = clone(baseline); styled.sheets['sheet-1'].cellData![0][0].s = { bl: 1 }
  expect(() => xlsxChanges(baseline, styled)).toThrow('formatting')
  const failed = clone(baseline); failed.sheets['sheet-1'].cellData![0][1].v = '#DIV/0!'
  expect(() => xlsxChanges(baseline, failed)).toThrow('formula error')
})
