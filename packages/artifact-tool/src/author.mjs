import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { cellAddress, parseXml, elements } from './xlsx.mjs'
import JSZip from 'jszip'
import { XMLSerializer } from '@xmldom/xmldom'
import { checkFormula, workbookSpec } from './schema.mjs'
const require = createRequire(import.meta.url)
let runtime
const checked = result => { if (result.error) throw new Error(result.error); return result }
export async function excelizeRuntime() {
  runtime ??= require('excelize-wasm').init(join(dirname(require.resolve('excelize-wasm')), 'excelize.wasm.gz'))
  return runtime
}
export async function authorWorkbook(input) {
  const spec = workbookSpec.parse(input)
  const excelize = await excelizeRuntime(); const file = checked(excelize.NewFile())
  const baseFont = { Family: 'Noto Sans CJK SC', Size: 11, Color: '203040' }
  const base = checked(file.NewStyle({ Font: baseFont })).style
  const header = checked(file.NewStyle({ Font: { ...baseFont, Bold: true, Color: 'FFFFFF' },
    Fill: { Type: 'pattern', Pattern: 1, Color: ['16324F'] }, Alignment: { Vertical: 'center', WrapText: true } })).style
  spec.sheets.forEach((sheet, index) => {
    if (index === 0) checked(file.SetSheetName('Sheet1', sheet.name))
    else checked(file.NewSheet(sheet.name))
    const width = Math.max(1, ...sheet.rows.map(r => r.length))
    const last = cellAddress(Math.max(0, sheet.rows.length - 1), width - 1)
    checked(file.SetCellStyle(sheet.name, 'A1', last, base))
    sheet.rows.forEach((row, r) => row.forEach((value, c) => {
      if (value !== null && typeof value === 'object') {
        checkFormula(value.formula); checked(file.SetCellFormula(sheet.name, cellAddress(r, c), value.formula.slice(1)))
      } else checked(file.SetCellValue(sheet.name, cellAddress(r, c), value))
    }))
    for (let c = 0; c < width; c++) {
      const column = cellAddress(0, c).replace(/1$/, '')
      checked(file.SetColWidth(sheet.name, column, column, sheet.columnWidths?.[c] ?? 18))
    }
    if (sheet.header && sheet.rows.length) {
      checked(file.SetCellStyle(sheet.name, 'A1', cellAddress(0, width - 1), header))
      checked(file.SetRowHeight(sheet.name, 1, 28))
    }
    if (sheet.freezeRows) checked(file.SetPanes(sheet.name, { Freeze: true, YSplit: sheet.freezeRows,
      TopLeftCell: 'A' + (sheet.freezeRows + 1), ActivePane: 'bottomLeft' }))
    for (const format of sheet.numberFormats) {
      const id = checked(file.NewStyle({ Font: baseFont, CustomNumFmt: format.format })).style
      checked(file.SetCellStyle(sheet.name, ...format.range.split(':'), id))
    }
    for (const table of sheet.tables) checked(file.AddTable(sheet.name, {
      Name: table.name, Range: table.range, StyleName: 'TableStyleMedium2', ShowRowStripes: true
    }))
    const quoted = "'" + sheet.name.replace(/'/g, "''") + "'!"
    for (const chart of sheet.charts) checked(file.AddChart(sheet.name, chart.anchor, {
      Type: { bar: excelize.Col, line: excelize.Line, pie: excelize.Pie }[chart.type],
      Title: { Paragraph: [{ Text: chart.title, Font: { ...baseFont, Size: 16, Bold: true } }] },
      Dimension: { Width: 600, Height: 320 }, VaryColors: chart.type === 'pie',
      Series: chart.series.map(series => ({ Name: series.name, Categories: quoted + series.categories, Values: quoted + series.values })),
      Legend: { Position: 'bottom', Font: baseFont }, XAxis: { Font: baseFont }, YAxis: { Font: baseFont }
    }))
    checked(file.SetPageLayout(sheet.name, { Size: 9, Orientation: 'landscape', FitToWidth: 1, FitToHeight: 1 }))
    checked(file.SetSheetProps(sheet.name, { PageSetup: { FitToPage: true } }))
  })
  // Hide only after all sheets exist and a visible active sheet has been selected.
  file.SetActiveSheet(spec.sheets.findIndex(s => !s.hidden))
  for (const sheet of spec.sheets) if (sheet.hidden) checked(file.SetSheetVisible(sheet.name, false))
  const zip = await JSZip.loadAsync(checked(file.WriteToBuffer()).buffer)
  // Excelize treats series names as range references. Our schema explicitly defines literal names.
  let chartIndex = 1
  for (const sheet of spec.sheets) for (const chart of sheet.charts) {
    const path = `xl/charts/chart${chartIndex++}.xml`
    const doc = parseXml(await zip.file(path).async('string'))
    elements(doc, 'ser').forEach((series, index) => {
      const tx = elements(series, 'tx')[0]
      if (!tx) return
      while (tx.firstChild) tx.removeChild(tx.firstChild)
      const value = doc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/chart', 'c:v')
      value.textContent = chart.series[index].name; tx.appendChild(value)
    })
    zip.file(path, new XMLSerializer().serializeToString(doc))
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
