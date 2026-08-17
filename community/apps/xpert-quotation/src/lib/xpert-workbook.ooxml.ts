import type {
  BorderStyleTypes,
  BooleanNumber,
  HorizontalAlign,
  VerticalAlign,
  WrapStrategy,
  IBorderData,
  IColorStyle,
  IColumnData,
  IFreeze,
  IRowData,
  IStyleData
} from '@univerjs/core'
import { posix as pathPosix } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import JSZip from 'jszip'

export const XPERT_WORKBOOK_SNAPSHOT_IMPORTER = 'xpert-ooxml-v2'

export type XpertOoxmlSheetLayout = {
  cellStyles: Map<string, string>
  rowData: Record<number, Partial<IRowData>>
  columnData: Record<number, Partial<IColumnData>>
  freeze: IFreeze
  defaultColumnWidth: number
  defaultRowHeight: number
  showGridlines: BooleanNumber
  rightToLeft: BooleanNumber
  tabColor: string
}

export type XpertOoxmlWorkbookLayout = {
  styles: Record<string, IStyleData>
  sheets: Map<string, XpertOoxmlSheetLayout>
}

type XmlRecord = Record<string, unknown>

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  processEntities: false
})

const DEFAULT_FREEZE: IFreeze = { xSplit: 0, ySplit: 0, startRow: 0, startColumn: 0 }

export async function readXpertOoxmlWorkbookLayout(buffer: Buffer): Promise<XpertOoxmlWorkbookLayout> {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
  const [workbookXml, relationshipsXml, stylesXml, themeXml] = await Promise.all([
    requireXml(zip, 'xl/workbook.xml'),
    requireXml(zip, 'xl/_rels/workbook.xml.rels'),
    optionalXml(zip, 'xl/styles.xml'),
    optionalXml(zip, 'xl/theme/theme1.xml')
  ])
  const themeColors = parseThemeColors(themeXml)
  const styleRegistry = parseStyleRegistry(stylesXml, themeColors)
  const sheetParts = resolveWorksheetParts(workbookXml, relationshipsXml)
  const sheets = new Map<string, XpertOoxmlSheetLayout>()

  await Promise.all([...sheetParts].map(async ([sheetName, part]) => {
    const worksheetXml = await optionalXml(zip, part)
    if (!worksheetXml) return
    sheets.set(sheetName, parseWorksheetLayout(worksheetXml, styleRegistry.keys, themeColors))
  }))

  return { styles: styleRegistry.styles, sheets }
}

function parseStyleRegistry(xml: string | null, themeColors: string[]) {
  const styles: Record<string, IStyleData> = {}
  if (!xml) return { styles, keys: [] as Array<string | undefined> }
  const styleSheet = child(parseXml(xml), 'styleSheet')
  const fonts = xmlArray(child(child(styleSheet, 'fonts'), 'font'))
  const fills = xmlArray(child(child(styleSheet, 'fills'), 'fill'))
  const borders = xmlArray(child(child(styleSheet, 'borders'), 'border'))
  const baseXfs = xmlArray(child(child(styleSheet, 'cellStyleXfs'), 'xf'))
  const cellXfs = xmlArray(child(child(styleSheet, 'cellXfs'), 'xf'))
  const numberFormats = new Map<number, string>()
  for (const numFmt of xmlArray(child(child(styleSheet, 'numFmts'), 'numFmt'))) {
    const id = attributeNumber(numFmt, 'numFmtId')
    const formatCode = attributeText(numFmt, 'formatCode')
    if (id != null && formatCode) numberFormats.set(id, formatCode)
  }

  const keys = cellXfs.map((rawXf, index) => {
    const xf = record(rawXf)
    const base = record(baseXfs[attributeNumber(xf, 'xfId') ?? 0])
    const style = parseCellStyle(xf, base, { fonts, fills, borders, numberFormats, themeColors })
    if (!Object.keys(style).length) return undefined
    const key = `xlsx-style-${index}`
    styles[key] = style
    return key
  })
  return { styles, keys }
}

function parseCellStyle(
  xf: XmlRecord,
  base: XmlRecord,
  input: {
    fonts: unknown[]
    fills: unknown[]
    borders: unknown[]
    numberFormats: Map<number, string>
    themeColors: string[]
  }
) {
  const style: IStyleData = {}
  Object.assign(style, parseFont(record(input.fonts[xfNumber(xf, base, 'fontId') ?? 0]), input.themeColors))
  const background = parseFill(record(input.fills[xfNumber(xf, base, 'fillId') ?? 0]), input.themeColors)
  if (background) style.bg = background
  const border = parseBorder(record(input.borders[xfNumber(xf, base, 'borderId') ?? 0]), input.themeColors)
  if (border) style.bd = border
  const numFmtId = xfNumber(xf, base, 'numFmtId') ?? 0
  const numberFormat = input.numberFormats.get(numFmtId) ?? BUILTIN_NUMBER_FORMATS[numFmtId]
  if (numberFormat && numberFormat !== 'General') style.n = { pattern: numberFormat }
  Object.assign(style, parseAlignment(record(child(xf, 'alignment') ?? child(base, 'alignment'))))
  return style
}

function parseFont(font: XmlRecord, themeColors: string[]): IStyleData {
  const result: IStyleData = {}
  const family = attributeText(child(font, 'name'), 'val')
  const size = attributeNumber(child(font, 'sz'), 'val')
  const color = parseColor(child(font, 'color'), themeColors)
  if (family) result.ff = family
  if (size != null) result.fs = size
  if (hasChild(font, 'b')) result.bl = UNIVER_BOOLEAN.TRUE
  if (hasChild(font, 'i')) result.it = UNIVER_BOOLEAN.TRUE
  if (hasChild(font, 'u')) result.ul = { s: UNIVER_BOOLEAN.TRUE }
  if (hasChild(font, 'strike')) result.st = { s: UNIVER_BOOLEAN.TRUE }
  if (color) result.cl = color
  return result
}

function parseFill(fill: XmlRecord, themeColors: string[]) {
  const pattern = record(child(fill, 'patternFill'))
  if (attributeText(pattern, 'patternType') !== 'solid') return undefined
  return parseColor(child(pattern, 'fgColor'), themeColors)
}

function parseBorder(border: XmlRecord, themeColors: string[]) {
  const result: IBorderData = {}
  const top = parseBorderSide(child(border, 'top'), themeColors)
  const right = parseBorderSide(child(border, 'right'), themeColors)
  const bottom = parseBorderSide(child(border, 'bottom'), themeColors)
  const left = parseBorderSide(child(border, 'left'), themeColors)
  const diagonal = parseBorderSide(child(border, 'diagonal'), themeColors)
  if (top) result.t = top
  if (right) result.r = right
  if (bottom) result.b = bottom
  if (left) result.l = left
  if (diagonal && attributeBoolean(border, 'diagonalDown')) result.tl_br = diagonal
  if (diagonal && attributeBoolean(border, 'diagonalUp')) result.bl_tr = diagonal
  return Object.keys(result).length ? result : undefined
}

function parseBorderSide(value: unknown, themeColors: string[]) {
  const side = record(value)
  const borderStyle = BORDER_STYLES[attributeText(side, 'style') ?? '']
  if (borderStyle == null || borderStyle === UNIVER_BORDER_STYLE.NONE) return undefined
  return {
    s: borderStyle,
    cl: parseColor(child(side, 'color'), themeColors) ?? { rgb: '#000000' }
  }
}

function parseAlignment(alignment: XmlRecord): IStyleData {
  const result: IStyleData = {}
  const horizontal = HORIZONTAL_ALIGNMENTS[attributeText(alignment, 'horizontal') ?? '']
  const vertical = VERTICAL_ALIGNMENTS[attributeText(alignment, 'vertical') ?? '']
  const rotation = attributeNumber(alignment, 'textRotation')
  if (horizontal != null) result.ht = horizontal
  if (vertical != null) result.vt = vertical
  if (attributeBoolean(alignment, 'wrapText')) result.tb = UNIVER_WRAP_STRATEGY.WRAP
  if (rotation != null) result.tr = { a: rotation }
  return result
}

function parseWorksheetLayout(xml: string, styleKeys: Array<string | undefined>, themeColors: string[]): XpertOoxmlSheetLayout {
  const worksheet = child(parseXml(xml), 'worksheet')
  const rowData: Record<number, Partial<IRowData>> = {}
  const columnData: Record<number, Partial<IColumnData>> = {}
  const cellStyles = new Map<string, string>()
  const rows = xmlArray(child(child(worksheet, 'sheetData'), 'row'))
  for (const rowValue of rows) {
    const row = record(rowValue)
    const rowIndex = (attributeNumber(row, 'r') ?? 1) - 1
    const rowEntry: Partial<IRowData> = {}
    const height = attributeNumber(row, 'ht')
    const styleKey = styleKeys[attributeNumber(row, 's') ?? -1]
    if (height != null) rowEntry.h = pointsToPixels(height)
    if (attributeBoolean(row, 'hidden')) rowEntry.hd = UNIVER_BOOLEAN.TRUE
    if (styleKey) rowEntry.s = styleKey
    if (Object.keys(rowEntry).length) rowData[rowIndex] = rowEntry
    for (const cellValue of xmlArray(child(row, 'c'))) {
      const cell = record(cellValue)
      const address = attributeText(cell, 'r')?.toUpperCase()
      const cellStyleKey = styleKeys[attributeNumber(cell, 's') ?? 0]
      if (address && cellStyleKey) cellStyles.set(address, cellStyleKey)
    }
  }

  for (const columnValue of xmlArray(child(child(worksheet, 'cols'), 'col'))) {
    const column = record(columnValue)
    const start = Math.max(0, (attributeNumber(column, 'min') ?? 1) - 1)
    const end = Math.max(start, (attributeNumber(column, 'max') ?? start + 1) - 1)
    const width = attributeNumber(column, 'width')
    const hidden = attributeBoolean(column, 'hidden')
    const styleKey = styleKeys[attributeNumber(column, 'style') ?? -1]
    for (let index = start; index <= end; index += 1) {
      const entry: Partial<IColumnData> = {}
      if (width != null) entry.w = excelColumnWidthToPixels(width)
      if (hidden) entry.hd = UNIVER_BOOLEAN.TRUE
      if (styleKey) entry.s = styleKey
      if (Object.keys(entry).length) columnData[index] = entry
    }
  }

  const sheetFormat = record(child(worksheet, 'sheetFormatPr'))
  const sheetView = record(xmlArray(child(child(worksheet, 'sheetViews'), 'sheetView'))[0])
  const parsedTabColor = parseColor(child(record(child(worksheet, 'sheetPr')), 'tabColor'), themeColors)?.rgb
  const tabColor = typeof parsedTabColor === 'string' ? parsedTabColor : ''
  return {
    cellStyles,
    rowData,
    columnData,
    freeze: parseFreeze(child(sheetView, 'pane')),
    defaultColumnWidth: excelColumnWidthToPixels(attributeNumber(sheetFormat, 'defaultColWidth') ?? 11.86),
    defaultRowHeight: pointsToPixels(attributeNumber(sheetFormat, 'defaultRowHeight') ?? 18),
    showGridlines: attributeText(sheetView, 'showGridLines') === '0' ? UNIVER_BOOLEAN.FALSE : UNIVER_BOOLEAN.TRUE,
    rightToLeft: attributeBoolean(sheetView, 'rightToLeft') ? UNIVER_BOOLEAN.TRUE : UNIVER_BOOLEAN.FALSE,
    tabColor
  }
}

function parseFreeze(value: unknown): IFreeze {
  const pane = record(value)
  if (attributeText(pane, 'state') !== 'frozen' && attributeText(pane, 'state') !== 'frozenSplit') return { ...DEFAULT_FREEZE }
  const xSplit = Math.max(0, Math.floor(attributeNumber(pane, 'xSplit') ?? 0))
  const ySplit = Math.max(0, Math.floor(attributeNumber(pane, 'ySplit') ?? 0))
  const topLeft = decodeCellAddress(attributeText(pane, 'topLeftCell') ?? '')
  return {
    xSplit,
    ySplit,
    startRow: topLeft?.row ?? ySplit,
    startColumn: topLeft?.column ?? xSplit
  }
}

function resolveWorksheetParts(workbookXml: string, relationshipsXml: string) {
  const workbook = child(parseXml(workbookXml), 'workbook')
  const relationships = child(parseXml(relationshipsXml), 'Relationships')
  const targets = new Map<string, string>()
  for (const relationshipValue of xmlArray(child(relationships, 'Relationship'))) {
    const relationship = record(relationshipValue)
    const id = attributeText(relationship, 'Id')
    const target = attributeText(relationship, 'Target')
    const type = attributeText(relationship, 'Type')
    if (id && target && type?.endsWith('/worksheet')) targets.set(id, normalizeWorksheetPart(target))
  }
  const result = new Map<string, string>()
  for (const sheetValue of xmlArray(child(child(workbook, 'sheets'), 'sheet'))) {
    const sheet = record(sheetValue)
    const name = attributeText(sheet, 'name')
    const relationshipId = attributeText(sheet, 'id')
    const part = relationshipId ? targets.get(relationshipId) : undefined
    if (name && part) result.set(name, part)
  }
  return result
}

function parseThemeColors(xml: string | null) {
  if (!xml) return []
  const theme = child(parseXml(xml), 'theme')
  const scheme = record(child(child(theme, 'themeElements'), 'clrScheme'))
  return THEME_COLOR_KEYS.map((key) => {
    const color = record(child(scheme, key))
    const srgb = attributeText(child(color, 'srgbClr'), 'val')
    const system = attributeText(child(color, 'sysClr'), 'lastClr')
    return normalizeRgb(srgb ?? system) ?? ''
  })
}

function parseColor(value: unknown, themeColors: string[]): IColorStyle | undefined {
  const color = record(value)
  const rgb = normalizeRgb(attributeText(color, 'rgb'))
  const themeIndex = attributeNumber(color, 'theme')
  const indexed = attributeNumber(color, 'indexed')
  const base = rgb
    ?? (themeIndex != null ? themeColors[themeIndex] : undefined)
    ?? (indexed != null ? INDEXED_COLORS[indexed] : undefined)
    ?? (attributeBoolean(color, 'auto') ? '#000000' : undefined)
  if (!base) return undefined
  return { rgb: applyTint(base, attributeNumber(color, 'tint') ?? 0) }
}

function xfNumber(xf: XmlRecord, base: XmlRecord, key: string) {
  return attributeNumber(xf, key) ?? attributeNumber(base, key)
}

function child(value: unknown, key: string): unknown {
  return record(value)[key]
}

function hasChild(value: XmlRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function record(value: unknown): XmlRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as XmlRecord : {}
}

function xmlArray(value: unknown): unknown[] {
  return value == null ? [] : Array.isArray(value) ? value : [value]
}

function attributeText(value: unknown, key: string) {
  const raw = record(value)[`@_${key}`]
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : undefined
}

function attributeNumber(value: unknown, key: string) {
  const text = attributeText(value, key)
  if (text == null || text.trim() === '') return undefined
  const number = Number(text)
  return Number.isFinite(number) ? number : undefined
}

function attributeBoolean(value: unknown, key: string) {
  const text = attributeText(value, key)?.toLowerCase()
  return text === '1' || text === 'true'
}

function parseXml(xml: string): XmlRecord {
  return record(parser.parse(xml))
}

async function requireXml(zip: JSZip, path: string) {
  const value = await optionalXml(zip, path)
  if (value == null) throw new Error(`XLSX is missing required OOXML entry ${path}.`)
  return value
}

async function optionalXml(zip: JSZip, path: string) {
  return zip.file(path)?.async('string') ?? null
}

function normalizeWorksheetPart(target: string) {
  const normalized = target.replace(/\\/g, '/').replace(/^\//, '')
  const part = normalized.startsWith('xl/') ? normalized : pathPosix.join('xl', normalized)
  const safe = pathPosix.normalize(part)
  if (!safe.startsWith('xl/worksheets/')) throw new Error(`Invalid worksheet OOXML target ${target}.`)
  return safe
}

function normalizeRgb(value?: string) {
  const normalized = value?.trim().replace(/^#/, '')
  if (!normalized || !/^[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/.test(normalized)) return undefined
  const rgb = normalized.length === 8 ? normalized.slice(2) : normalized
  return `#${rgb.toUpperCase()}`
}

function applyTint(rgb: string, tint: number) {
  if (!tint) return rgb
  const channels = [1, 3, 5].map((offset) => Number.parseInt(rgb.slice(offset, offset + 2), 16))
  const adjusted = channels.map((channel) => {
    const next = tint < 0 ? channel * (1 + tint) : channel * (1 - tint) + 255 * tint
    return Math.max(0, Math.min(255, Math.round(next))).toString(16).padStart(2, '0')
  })
  return `#${adjusted.join('').toUpperCase()}`
}

function pointsToPixels(points: number) {
  return Math.round(points * 96 / 72 * 100) / 100
}

function excelColumnWidthToPixels(width: number) {
  return Math.max(0, Math.round((width < 1 ? width * 12 : width * 7 + 5) * 100) / 100)
}

function decodeCellAddress(address: string) {
  const match = /^([A-Z]{1,3})([1-9][0-9]*)$/i.exec(address.trim())
  if (!match) return undefined
  let column = 0
  for (const character of match[1].toUpperCase()) column = column * 26 + character.charCodeAt(0) - 64
  return { row: Number(match[2]) - 1, column: column - 1 }
}

const UNIVER_BOOLEAN = { FALSE: 0, TRUE: 1 } as const satisfies Record<string, BooleanNumber>
const UNIVER_WRAP_STRATEGY = { WRAP: 3 } as const satisfies Record<string, WrapStrategy>
const UNIVER_HORIZONTAL_ALIGN = {
  LEFT: 1, CENTER: 2, RIGHT: 3, JUSTIFIED: 4, BOTH: 5, DISTRIBUTED: 6
} as const satisfies Record<string, HorizontalAlign>
const UNIVER_VERTICAL_ALIGN = {
  TOP: 1, MIDDLE: 2, BOTTOM: 3
} as const satisfies Record<string, VerticalAlign>
const UNIVER_BORDER_STYLE = {
  NONE: 0, THIN: 1, HAIR: 2, DOTTED: 3, DASHED: 4, DASH_DOT: 5,
  DASH_DOT_DOT: 6, DOUBLE: 7, MEDIUM: 8, MEDIUM_DASHED: 9,
  MEDIUM_DASH_DOT: 10, MEDIUM_DASH_DOT_DOT: 11, SLANT_DASH_DOT: 12, THICK: 13
} as const satisfies Record<string, BorderStyleTypes>

const BORDER_STYLES: Record<string, BorderStyleTypes> = {
  none: UNIVER_BORDER_STYLE.NONE,
  thin: UNIVER_BORDER_STYLE.THIN,
  hair: UNIVER_BORDER_STYLE.HAIR,
  dotted: UNIVER_BORDER_STYLE.DOTTED,
  dashed: UNIVER_BORDER_STYLE.DASHED,
  dashDot: UNIVER_BORDER_STYLE.DASH_DOT,
  dashDotDot: UNIVER_BORDER_STYLE.DASH_DOT_DOT,
  double: UNIVER_BORDER_STYLE.DOUBLE,
  medium: UNIVER_BORDER_STYLE.MEDIUM,
  mediumDashed: UNIVER_BORDER_STYLE.MEDIUM_DASHED,
  mediumDashDot: UNIVER_BORDER_STYLE.MEDIUM_DASH_DOT,
  mediumDashDotDot: UNIVER_BORDER_STYLE.MEDIUM_DASH_DOT_DOT,
  slantDashDot: UNIVER_BORDER_STYLE.SLANT_DASH_DOT,
  thick: UNIVER_BORDER_STYLE.THICK
}

const HORIZONTAL_ALIGNMENTS: Record<string, HorizontalAlign> = {
  left: UNIVER_HORIZONTAL_ALIGN.LEFT,
  center: UNIVER_HORIZONTAL_ALIGN.CENTER,
  centerContinuous: UNIVER_HORIZONTAL_ALIGN.CENTER,
  right: UNIVER_HORIZONTAL_ALIGN.RIGHT,
  justify: UNIVER_HORIZONTAL_ALIGN.JUSTIFIED,
  fill: UNIVER_HORIZONTAL_ALIGN.BOTH,
  distributed: UNIVER_HORIZONTAL_ALIGN.DISTRIBUTED
}

const VERTICAL_ALIGNMENTS: Record<string, VerticalAlign> = {
  top: UNIVER_VERTICAL_ALIGN.TOP,
  center: UNIVER_VERTICAL_ALIGN.MIDDLE,
  bottom: UNIVER_VERTICAL_ALIGN.BOTTOM,
  justify: UNIVER_VERTICAL_ALIGN.MIDDLE,
  distributed: UNIVER_VERTICAL_ALIGN.MIDDLE
}

const BUILTIN_NUMBER_FORMATS: Record<number, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00',
  9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'm/d/yy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy',
  18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yy h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 49: '@'
}

// OOXML theme indexes are ordered lt1, dk1, lt2, dk2. The clrScheme XML
// usually writes dk1 before lt1, so its document order must not be reused here.
const THEME_COLOR_KEYS = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']

const INDEXED_COLORS = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#808080',
  '#9999FF', '#993366', '#FFFFCC', '#CCFFFF', '#660066', '#FF8080', '#0066CC', '#CCCCFF',
  '#000080', '#FF00FF', '#FFFF00', '#00FFFF', '#800080', '#800000', '#008080', '#0000FF',
  '#00CCFF', '#CCFFFF', '#CCFFCC', '#FFFF99', '#99CCFF', '#FF99CC', '#CC99FF', '#FFCC99',
  '#3366FF', '#33CCCC', '#99CC00', '#FFCC00', '#FF9900', '#FF6600', '#666699', '#969696',
  '#003366', '#339966', '#003300', '#333300', '#993300', '#993366', '#333399', '#333333'
]
