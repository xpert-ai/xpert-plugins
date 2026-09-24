// Preserve the original OPC package. Only supported cell values, formula caches and chart caches change.
import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const CHART = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const MAX_BYTES = 100 * 1024 * 1024
const serializer = new XMLSerializer()
export const elements = (node, name) => Array.from(node.getElementsByTagNameNS('*', name))
const child = (node, name) => Array.from(node.childNodes).find(n => n.nodeType === 1 && n.localName === name)
const content = (node, name) => child(node, name)?.textContent ?? ''
export function parseXml(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('DTD/entity declarations are unsupported')
  return new DOMParser({ onError: (level, message) => { throw new Error(`Invalid XML: ${message}`) } }).parseFromString(text, 'application/xml')
}
export function position(address) {
  const m = /^\$?([A-Z]{1,3})\$?([1-9][0-9]{0,6})$/.exec(address)
  if (!m) throw new Error(`Invalid cell address: ${address}`)
  const column = Array.from(m[1]).reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
  const row = Number(m[2]) - 1
  if (column > 16383 || row > 1048575) throw new Error('Cell outside XLSX bounds')
  return { row, column }
}
export function cellAddress(row, column) {
  let text = ''; for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) text = String.fromCharCode(65 + (n - 1) % 26) + text
  return text + (row + 1)
}
function targetPath(base, target) {
  const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '..') { if (!parts.length) throw new Error('Invalid package relationship'); parts.pop() }
    else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}
async function open(input) {
  if (input.byteLength > 20 * 1024 * 1024) throw new Error('XLSX exceeds 20 MiB')
  const zip = await JSZip.loadAsync(input)
  const entries = Object.values(zip.files).filter(f => !f.dir)
  if (entries.length > 3000) throw new Error('XLSX has too many ZIP entries')
  let size = 0
  for (const file of entries) {
    size += file._data?.uncompressedSize ?? 0
    if (size > MAX_BYTES || (file._data?.uncompressedSize ?? 0) > 30 * 1024 * 1024) throw new Error('Expanded XLSX exceeds limits')
  }
  return zip
}
async function xml(zip, path, required = true) {
  const entry = zip.file(path)
  if (!entry) { if (required) throw new Error(`Missing XLSX part: ${path}`); return null }
  return parseXml(await entry.async('string'))
}
function basicStyle(doc, index) {
  if (!doc) return {}
  const xf = child(doc.documentElement, 'cellXfs')?.childNodes
  const format = Array.from(xf ?? []).filter(n => n.nodeType === 1)[index]
  if (!format) return {}
  const lookup = (group, id) => Array.from(child(doc.documentElement, group)?.childNodes ?? []).filter(n => n.nodeType === 1)[Number(id)]
  const font = lookup('fonts', format.getAttribute('fontId'))
  const fill = lookup('fills', format.getAttribute('fillId'))
  const rgb = n => { const value = n?.getAttribute('rgb'); return value ? '#' + value.slice(-6) : undefined }
  const style = {}
  if (font) {
    if (child(font, 'b')) style.bl = 1
    if (child(font, 'i')) style.it = 1
    const color = rgb(child(font, 'color')); if (color) style.cl = { rgb: color }
    const size = Number(child(font, 'sz')?.getAttribute('val')); if (size) style.fs = size
    const family = child(font, 'name')?.getAttribute('val'); if (family) style.ff = family
  }
  const background = fill && rgb(elements(fill, 'fgColor')[0]); if (background) style.bg = { rgb: background }
  const numFmt = elements(doc, 'numFmt').find(n => n.getAttribute('numFmtId') === format.getAttribute('numFmtId'))
  if (numFmt) style.n = { pattern: numFmt.getAttribute('formatCode') }
  return style
}
async function model(zip) {
  const workbook = await xml(zip, 'xl/workbook.xml')
  const rels = await xml(zip, 'xl/_rels/workbook.xml.rels')
  const shared = await xml(zip, 'xl/sharedStrings.xml', false)
  const styles = await xml(zip, 'xl/styles.xml', false)
  const strings = shared ? elements(shared, 'si').map(n => elements(n, 't').map(t => t.textContent).join('')) : []
  const sheets = []; let cellCount = 0
  for (const entry of elements(workbook, 'sheet')) {
    const rel = elements(rels, 'Relationship').find(r => r.getAttribute('Id') === entry.getAttributeNS(REL, 'id'))
    if (!rel || rel.getAttribute('TargetMode') === 'External') throw new Error('Invalid worksheet relationship')
    const path = targetPath('xl/workbook.xml', rel.getAttribute('Target'))
    const document = await xml(zip, path)
    const cells = {}
    for (const node of elements(document, 'c')) {
      if (++cellCount > 100000) throw new Error('Workbook exceeds 100000 cells')
      const address = node.getAttribute('r'); position(address)
      const type = node.getAttribute('t'); const raw = content(node, 'v')
      let value = raw === '' ? null : Number(raw)
      if (type === 's') value = strings[Number(raw)] ?? ''
      else if (type === 'inlineStr') value = elements(node, 't').map(n => n.textContent).join('')
      else if (type === 'str' || type === 'e' || type === 'd') value = raw
      else if (type === 'b') value = raw === '1'
      const formulaNode = child(node, 'f')
      cells[address] = { value, ...(formulaNode ? { formula: '=' + formulaNode.textContent.replace(/^=/, ''), formulaType: formulaNode.getAttribute('t') || 'normal' } : {}),
        ...(type === 'e' ? { error: raw } : {}), style: basicStyle(styles, Number(node.getAttribute('s') || 0)) }
    }
    const pane = elements(document, 'pane')[0]
    sheets.push({ name: entry.getAttribute('name'), path, hidden: entry.getAttribute('state') || 'visible', cells,
      freeze: { rows: Number(pane?.getAttribute('ySplit') || 0), columns: Number(pane?.getAttribute('xSplit') || 0) },
      merges: elements(document, 'mergeCell').map(n => n.getAttribute('ref')) })
  }
  const paths = Object.keys(zip.files)
  return { sheets, charts: paths.filter(p => /^xl\/(?:drawings\/)?charts\/chart\d+\.xml$/.test(p)),
    tables: paths.filter(p => /^xl\/tables\/table\d+\.xml$/.test(p)),
    definedNames: elements(workbook, 'definedName').map(n => ({ name: n.getAttribute('name'), formula: n.textContent })),
    unsupported: paths.filter(p => /vbaProject|_xmlsignatures|externalLinks\//i.test(p)) }
}
export async function readXlsx(input) { return model(await open(input)) }

function setValue(doc, node, value, formula, error) {
  for (const name of ['f', 'v', 'is']) { const current = child(node, name); if (current) node.removeChild(current) }
  node.removeAttribute('t')
  const add = (name, text) => { const n = doc.createElementNS(NS, name); n.textContent = String(text); node.appendChild(n); return n }
  if (formula) add('f', formula.replace(/^=/, ''))
  if (value === null || value === undefined) return
  if (error) { node.setAttribute('t', 'e'); add('v', error) }
  else if (typeof value === 'string') {
    if (formula) { node.setAttribute('t', 'str'); add('v', value) }
    else { node.setAttribute('t', 'inlineStr'); const container = add('is', ''); const text = doc.createElementNS(NS, 't'); text.setAttribute('xml:space', 'preserve'); text.textContent = value; container.appendChild(text) }
  } else if (typeof value === 'boolean') { node.setAttribute('t', 'b'); add('v', value ? 1 : 0) }
  else if (Number.isFinite(value)) add('v', value)
  else throw new Error('Cell result must be a finite scalar')
}
function getCell(doc, address) {
  const pos = position(address)
  const data = elements(doc, 'sheetData')[0]
  if (!data) throw new Error('Missing worksheet data')
  let row = Array.from(data.childNodes).find(n => n.nodeType === 1 && n.getAttribute('r') === String(pos.row + 1))
  if (!row) {
    row = doc.createElementNS(NS, 'row'); row.setAttribute('r', String(pos.row + 1))
    const next = Array.from(data.childNodes).find(n => n.nodeType === 1 && Number(n.getAttribute('r')) > pos.row + 1)
    data.insertBefore(row, next ?? null)
  }
  let cell = elements(row, 'c').find(n => n.getAttribute('r') === address)
  if (!cell) {
    cell = doc.createElementNS(NS, 'c'); cell.setAttribute('r', address)
    const next = elements(row, 'c').find(n => position(n.getAttribute('r')).column > pos.column)
    row.insertBefore(cell, next ?? null)
  }
  const dimension = elements(doc, 'dimension')[0]
  if (dimension) {
    const [start, end = start] = dimension.getAttribute('ref').split(':'); const a = position(start), b = position(end)
    dimension.setAttribute('ref', `${cellAddress(Math.min(a.row, pos.row), Math.min(a.column, pos.column))}:${cellAddress(Math.max(b.row, pos.row), Math.max(b.column, pos.column))}`)
  }
  return cell
}
function referenceValues(formula, sheets) {
  const match = /^(?:'((?:[^']|'')+)'|([^!]+))!(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?$/.exec(formula)
  if (!match) throw new Error(`Unsupported chart reference: ${formula}`)
  const sheet = sheets.find(s => s.name === (match[1]?.replace(/''/g, "'") ?? match[2]))
  if (!sheet) throw new Error('Chart references a missing worksheet')
  const a = position(match[3]), b = position(match[4] ?? match[3]); const values = []
  if ((b.row - a.row + 1) * (b.column - a.column + 1) > 10000) throw new Error('Chart range exceeds limits')
  for (let r = a.row; r <= b.row; r++) for (let c = a.column; c <= b.column; c++) values.push(sheet.cells[cellAddress(r, c)]?.value ?? null)
  return values
}
async function refreshCharts(zip, data) {
  for (const path of data.charts) {
    const doc = await xml(zip, path)
    for (const ref of [...elements(doc, 'numRef'), ...elements(doc, 'strRef')]) {
      const formula = content(ref, 'f'); const values = referenceValues(formula, data.sheets)
      const numeric = ref.localName === 'numRef'; const name = numeric ? 'numCache' : 'strCache'
      const old = child(ref, name); if (old) ref.removeChild(old)
      const cache = doc.createElementNS(CHART, 'c:' + name); ref.appendChild(cache)
      const count = doc.createElementNS(CHART, 'c:ptCount'); count.setAttribute('val', String(values.length)); cache.appendChild(count)
      values.forEach((value, index) => {
        if (value === null || (numeric && typeof value !== 'number')) return
        const pt = doc.createElementNS(CHART, 'c:pt'); pt.setAttribute('idx', String(index))
        const v = doc.createElementNS(CHART, 'c:v'); v.textContent = String(value); pt.appendChild(v); cache.appendChild(pt)
      })
    }
    zip.file(path, serializer.serializeToString(doc))
  }
}
async function updateTableHeaders(zip, data, edits) {
  for (const sheet of data.sheets) {
    if (!edits.some(e => e.sheet === sheet.name)) continue
    const sheetXml = await xml(zip, sheet.path)
    const parts = elements(sheetXml, 'tablePart')
    if (!parts.length) continue
    const slash = sheet.path.lastIndexOf('/')
    const rels = await xml(zip, sheet.path.slice(0, slash + 1) + '_rels/' + sheet.path.slice(slash + 1) + '.rels')
    for (const part of parts) {
      const rel = elements(rels, 'Relationship').find(r => r.getAttribute('Id') === part.getAttributeNS(REL, 'id'))
      if (!rel || rel.getAttribute('TargetMode') === 'External') throw new Error('Invalid table relationship')
      const path = targetPath(sheet.path, rel.getAttribute('Target')); const table = await xml(zip, path)
      if (table.documentElement.getAttribute('headerRowCount') === '0') continue
      const [first, last] = table.documentElement.getAttribute('ref').split(':').map(position)
      if (!edits.some(e => e.sheet === sheet.name && position(e.cell).row === first.row &&
          position(e.cell).column >= first.column && position(e.cell).column <= last.column)) continue
      const columns = elements(table, 'tableColumn'); const names = []
      for (let index = 0; index < columns.length; index++) {
        const cell = sheet.cells[cellAddress(first.row, first.column + index)]
        if (!cell || cell.formula || cell.value == null || !String(cell.value).trim()) throw new Error('Table headers must be non-empty literal labels')
        names.push(String(cell.value))
      }
      if (new Set(names.map(n => n.toLowerCase())).size !== names.length) throw new Error('Table headers must be unique')
      columns.forEach((column, index) => column.setAttribute('name', names[index]))
      zip.file(path, serializer.serializeToString(table))
    }
  }
}
export async function patchXlsx(input, edits, results = []) {
  const zip = await open(input); const data = await model(zip)
  if (data.unsupported.length) throw new Error('Signed, macro-enabled and externally linked workbooks cannot be edited in v1')
  const docs = new Map()
  for (const edit of [...edits, ...results]) {
    const sheet = data.sheets.find(s => s.name === edit.sheet)
    if (!sheet) throw new Error(`Unknown worksheet: ${edit.sheet}`)
    const previous = sheet.cells[edit.cell]
    if (previous?.formulaType && previous.formulaType !== 'normal') throw new Error('Shared/array formulas cannot be edited in v1')
    if (!docs.has(sheet.path)) docs.set(sheet.path, await xml(zip, sheet.path))
    const doc = docs.get(sheet.path)
    const formula = typeof edit.value === 'object' && edit.value !== null ? edit.value.formula : edit.formula
    const value = typeof edit.value === 'object' && edit.value !== null ? null : edit.value
    setValue(doc, getCell(doc, edit.cell), value, formula, edit.error)
    sheet.cells[edit.cell] = { value, ...(formula ? { formula, formulaType: 'normal' } : {}), style: previous?.style ?? {} }
  }
  for (const [path, doc] of docs) zip.file(path, serializer.serializeToString(doc))
  await updateTableHeaders(zip, data, edits)
  if (edits.length || results.length) {
    const book = await xml(zip, 'xl/workbook.xml')
    let calc = elements(book, 'calcPr')[0]
    if (!calc) { calc = book.createElementNS(NS, 'calcPr'); book.documentElement.appendChild(calc) }
    calc.setAttribute('fullCalcOnLoad', '1'); calc.setAttribute('forceFullCalc', '1'); calc.setAttribute('calcMode', 'auto')
    zip.file('xl/workbook.xml', serializer.serializeToString(book))
    // A stale calculation chain must not describe a newly edited formula graph.
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml')
      for (const path of ['xl/_rels/workbook.xml.rels', '[Content_Types].xml']) {
        const doc = await xml(zip, path)
        for (const n of elements(doc, path.endsWith('.rels') ? 'Relationship' : 'Override'))
          if (/calcChain/.test(n.getAttribute('Type') || n.getAttribute('PartName'))) n.parentNode.removeChild(n)
        zip.file(path, serializer.serializeToString(doc))
      }
    }
    await refreshCharts(zip, data)
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
