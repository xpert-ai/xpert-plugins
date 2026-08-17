import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { BadRequestException } from '@nestjs/common'
import type { PriceItem, PriceItemKind } from './types.js'

const requireFromHere = createRequire(import.meta.url)
const XLSX = requireFromHere('xlsx') as typeof import('xlsx')
const MAX_PRICE_ITEMS = 5_000

const HEADERS = {
  code: ['编码', '材料编码', '项目编码', '清单编码', 'code'],
  name: ['名称', '材料名称', '项目名称', 'name'],
  specification: ['规格', '规格型号', '型号', 'specification', 'spec'],
  unit: ['单位', '计量单位', 'unit'],
  unitPrice: ['单价', '材料单价', '综合单价', '价格', '不含税单价', '含税单价', 'unitprice', 'price'],
  kind: ['类型', '价格类型', '类别', 'kind', 'type']
} as const

export function parsePriceBook(buffer: Buffer): PriceItem[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true, cellFormula: false })
  const items: PriceItem[] = []
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: null })
    const header = findHeader(rows)
    if (!header) continue
    for (let index = header.rowIndex + 1; index < rows.length; index += 1) {
      const row = rows[index]
      const name = cellText(row[header.columns.name])
      const unitPrice = decimalText(row[header.columns.unitPrice])
      if (!name || !unitPrice) continue
      const code = optionalCellText(row[header.columns.code])
      const specification = optionalCellText(row[header.columns.specification])
      const unit = optionalCellText(row[header.columns.unit])
      const rawKind = optionalCellText(row[header.columns.kind])
      const kind = normalizeKind(rawKind)
      const sourceRow = index + 1
      items.push({
        id: createHash('sha256').update([sheetName, sourceRow, code, name, specification, unit, unitPrice, kind].join('\u0000')).digest('hex').slice(0, 24),
        kind,
        ...(code ? { code } : {}),
        name,
        ...(specification ? { specification } : {}),
        ...(unit ? { unit } : {}),
        unitPrice,
        sourceSheet: sheetName,
        sourceRow
      })
      if (items.length > MAX_PRICE_ITEMS) {
        throw new BadRequestException(`Price list contains more than ${MAX_PRICE_ITEMS} usable rows.`)
      }
    }
  }
  if (!items.length) {
    throw new BadRequestException('No price rows were found. Include a header row with 名称 and 单价 columns.')
  }
  return items
}

function findHeader(rows: unknown[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const normalized = rows[rowIndex].map((value) => normalizeHeader(cellText(value)))
    const columns = {
      code: findColumn(normalized, HEADERS.code),
      name: findColumn(normalized, HEADERS.name),
      specification: findColumn(normalized, HEADERS.specification),
      unit: findColumn(normalized, HEADERS.unit),
      unitPrice: findColumn(normalized, HEADERS.unitPrice),
      kind: findColumn(normalized, HEADERS.kind)
    }
    if (columns.name >= 0 && columns.unitPrice >= 0) return { rowIndex, columns }
  }
  return null
}

function findColumn(row: string[], candidates: readonly string[]) {
  return row.findIndex((value) => candidates.some((candidate) => value === normalizeHeader(candidate)))
}

function normalizeKind(value?: string): PriceItemKind {
  const normalized = normalizeHeader(value ?? '')
  if (normalized.includes('措施') || normalized === 'measure') return 'measure'
  if (normalized.includes('综合') || normalized.includes('项目') || normalized === 'projectrate') return 'project_rate'
  return 'material'
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[\s_()（）:：/\\-]/g, '')
}

function cellText(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function optionalCellText(value: unknown) {
  const result = cellText(value)
  return result || undefined
}

function decimalText(value: unknown) {
  const text = cellText(value).replace(/,/g, '')
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(text)) return undefined
  return trimDecimal(text)
}

function trimDecimal(value: string) {
  const [integer, fraction = ''] = value.split('.')
  const trimmed = fraction.replace(/0+$/, '')
  return trimmed ? `${integer}.${trimmed}` : integer
}
