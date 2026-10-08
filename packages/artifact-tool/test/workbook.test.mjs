import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createWorkbook, editWorkbook, inspectWorkbook, recalculateWorkbook, sha256, readXlsx } from '../src/index.mjs'
import { patchXlsx } from '../src/xlsx.mjs'

export const fixture = { version: 1, sheets: [
  { name: 'Sales', rows: [['Month', 'Revenue', 'Cost', 'Profit'], ['Q1', 120, 80, { formula: '=B2-C2' }],
    ['Q2', 180, 100, { formula: '=B3-C3' }], ['Q3', 240, 130, { formula: '=B4-C4' }]],
    columnWidths: [20, 18, 18, 18], numberFormats: [{ range: 'B2:D4', format: '#,##0.00' }],
    tables: [{ name: 'SalesTable', range: 'A1:D4' }],
    charts: [{ type: 'bar', title: 'Revenue', anchor: 'A7', series: [{ name: 'Revenue', categories: 'A2:A4', values: 'B2:B4' }] }] },
  { name: 'Summary', rows: [['Metric', 'Value'], ['Revenue', { formula: '=SUM(Sales!B2:B4)' }],
    ['Profit', { formula: '=SUM(Sales!D2:D4)' }], ['Margin', { formula: '=IFERROR(B3/B2,0)' }]] },
  { name: 'Hidden', hidden: true, rows: [['Keep me'], [42]] }
] }
let original
test('CLI version follows the package version managed by Changesets', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.mjs', import.meta.url)), '--version'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { name: manifest.name, version: manifest.version })
})
test('native chart, table and cross-sheet calculation produce real cached values', async () => {
  original = await createWorkbook(fixture)
  const data = await readXlsx(original)
  assert.equal(data.sheets[1].cells.B2.value, 540)
  assert.equal(data.sheets[1].cells.B3.value, 230)
  assert.equal(data.sheets[1].cells.B4.value, 230 / 540)
  assert.equal(data.charts.length, 1); assert.equal(data.tables.length, 1)
  assert.equal(data.sheets[2].hidden, 'hidden')
  const zip = await JSZip.loadAsync(original)
  const sheet = await zip.file('xl/worksheets/sheet2.xml').async('string')
  assert.match(sheet, /<f>SUM\(Sales!B2:B4\)<\/f><v>540<\/v>/)
  const chart = await zip.file(data.charts[0]).async('string')
  assert.match(chart, /numCache/); assert.match(chart, />240</)
})
test('revisioned edits update formulas and chart caches without losing unrelated parts', async () => {
  const digest = sha256(original)
  const updated = await editWorkbook(original, { version: 1, sha256: digest, edits: [{ sheet: 'Sales', cell: 'B2', value: 150 }] })
  assert.equal(sha256(original), digest)
  const data = await readXlsx(updated)
  assert.equal(data.sheets[1].cells.B2.value, 570); assert.equal(data.sheets[0].cells.D2.value, 70)
  assert.equal(data.sheets[2].hidden, 'hidden'); assert.equal(data.sheets[0].freeze.rows, 1)
  const a = await JSZip.loadAsync(original), b = await JSZip.loadAsync(updated)
  for (const path of ['xl/styles.xml', 'xl/tables/table1.xml', 'xl/worksheets/sheet3.xml'])
    assert.deepEqual(await a.file(path).async('uint8array'), await b.file(path).async('uint8array'))
  assert.match(await b.file(data.charts[0]).async('string'), />150</)
})
test('browser scalar/formula patches keep drawings/tables and refresh supplied caches', async () => {
  const bytes = await patchXlsx(original, [{ sheet: 'Sales', cell: 'B2', value: 200 }],
    [{ sheet: 'Summary', cell: 'B2', formula: '=SUM(Sales!B2:B4)', value: 620 }])
  const read = await readXlsx(bytes)
  assert.equal(read.sheets[1].cells.B2.value, 620)
  assert.equal(read.charts.length, 1); assert.equal(read.tables.length, 1)
})
test('bounded inspection reports truncation rather than silently treating a sample as the workbook', async () => {
  const info = await inspectWorkbook(original, { sheet: 'Sales', range: 'A1:B3', limit: 2 })
  assert.equal(info.totalMatched, 6); assert.equal(info.cells.length, 2); assert.equal(info.truncated, true)
})
test('stale revision, unknown function and invalid formulas fail before output', async () => {
  await assert.rejects(editWorkbook(original, { version: 1, sha256: '0'.repeat(64), edits: [{ sheet: 'Sales', cell: 'B2', value: 1 }] }), /revision/)
  await assert.rejects(createWorkbook({ version: 1, sheets: [{ name: 'Bad', rows: [[{ formula: '=WEBSERVICE("https://example.com")' }]] }] }), /Unsupported formula/)
  await assert.rejects(createWorkbook({ version: 1, sheets: [{ name: 'Bad', rows: [[{ formula: '=1/0' }]] }] }), /Formula failed/)
  await assert.rejects(createWorkbook({ version: 1, sheets: [{ name: 'Bad', rows: [[{ formula: '=SUM([other.xlsx]Sheet1!A1)' }]] }] }), /external/)
})
test('unsupported formulas in uploaded workbooks remain inspectable and reject recalculation', async () => {
  const changed = await patchXlsx(original, [{ sheet: 'Sales', cell: 'D2', value: { formula: '=UNSUPPORTED(B2)' } }])
  assert.ok((await inspectWorkbook(changed)).cells.some(c => c.formula?.includes('UNSUPPORTED')))
  await assert.rejects(recalculateWorkbook(changed), /Unsupported formula/)
})
test('table header edits update the native table definition; duplicates and oversized ranges fail', async () => {
  const bytes = await editWorkbook(original, { version: 1, sha256: sha256(original), edits: [{ sheet: 'Sales', cell: 'B1', value: 'Income' }] })
  const zip = await JSZip.loadAsync(bytes)
  assert.match(await zip.file('xl/tables/table1.xml').async('string'), /name="Income"/)
  await assert.rejects(editWorkbook(original, { version: 1, sha256: sha256(original), edits: [{ sheet: 'Sales', cell: 'B1', value: 'Cost' }] }), /unique/)
  await assert.rejects(createWorkbook({ version: 1, sheets: [{ name: 'Bad', rows: [[1]], numberFormats: [{ range: 'A1:XFD999999', format: '0' }] }] }), /limits/)
})
