import JSZip from 'jszip'
import { readXpertOoxmlWorkbookLayout } from './xpert-workbook.ooxml.js'

describe('readXpertOoxmlWorkbookLayout', () => {
  it('maps the first four OOXML theme indexes to light and dark colors in specification order', async () => {
    const layout = await readXpertOoxmlWorkbookLayout(await createThemeColorWorkbook())

    expect(layout.styles['xlsx-style-0']?.cl).toEqual({ rgb: '#FFFFFF' })
    expect(layout.styles['xlsx-style-1']?.cl).toEqual({ rgb: '#000000' })
    expect(layout.styles['xlsx-style-2']?.cl).toEqual({ rgb: '#EEECE1' })
    expect(layout.styles['xlsx-style-3']?.cl).toEqual({ rgb: '#1F497D' })
  })
})

async function createThemeColorWorkbook() {
  const zip = new JSZip()
  zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Theme colors" sheetId="1" r:id="rId1"/></sheets></workbook>')
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
  zip.file('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" s="0"/><c r="B1" s="1"/><c r="C1" s="2"/><c r="D1" s="3"/></row></sheetData></worksheet>')
  zip.file('xl/styles.xml', '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><color theme="0"/></font><font><color theme="1"/></font><font><color theme="2"/></font><font><color theme="3"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>')
  zip.file('xl/theme/theme1.xml', '<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2></a:clrScheme></a:themeElements></a:theme>')
  return zip.generateAsync({ type: 'nodebuffer' })
}
