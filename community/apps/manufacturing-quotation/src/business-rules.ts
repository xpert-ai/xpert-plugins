export type UiCategory = '沟槽' | '玛钢' | '球铁'
export type PriceMarker = 'a' | 'A' | 'b'

export interface ProductRecord {
  id: string
  sourceCategory: '沟槽' | '玛钢'
  productName: string
  specification: string
  priceMarker: PriceMarker
  aliases: string[]
  unitPrice: string | null
  packingQuantity: number | null
  status: 'enabled' | 'pending_price'
  source: { file: string; sheet: string; row: number }
  blankWeight?: string | null
  finishedWeight?: string | null
  pureWeight?: string | null
  notes?: string
}

export interface Selection {
  category: UiCategory
  productName: string
  specification: string
  priceMarker: PriceMarker
}

const ballIronPrefix = /^(?:球热|球铁)/u

function cleanText(text: string) {
  return text.replace(/\s+/gu, '')
}

export function normalizeSpecification(text: string): string {
  return cleanText(text).toLowerCase().replace(/[×*-]/gu, 'x').replace(/(\p{Nd})[gs](?=$|x)/gu, '$1')
}

export function normalizePriceMarker(raw: string): PriceMarker | null {
  switch (cleanText(raw)) {
    case 'A': return 'A'
    case 'a': case '黑': case '黑袋': case '中': return 'a'
    case 'b': case 'B': case '蓝': case '蓝袋': case '好': return 'b'
    default: return null
  }
}

export function gradeFromEvidence(raw: string, contextRaw = ''): { priceMarker: PriceMarker | null; reviewRequired: boolean } {
  const direct = normalizePriceMarker(raw)
  const context = normalizePriceMarker(contextRaw)
  if ((cleanText(raw) && !direct) || (cleanText(contextRaw) && !context) || (direct && context && direct !== context)) {
    return { priceMarker: null, reviewRequired: true }
  }
  return { priceMarker: direct ?? context ?? 'b', reviewRequired: false }
}

export function uiCategory(record: ProductRecord): UiCategory {
  return record.sourceCategory === '玛钢' && ballIronPrefix.test(cleanText(record.productName)) ? '球铁' : record.sourceCategory
}

export function sourceCategories(sourceText: string): UiCategory[] {
  const categories: UiCategory[] = ['玛钢']
  if (sourceText.includes('沟槽')) categories.push('沟槽')
  if (/球热|球铁|(?<![a-z])QT(?![a-z])/iu.test(sourceText)) categories.push('球铁')
  return categories
}

function normalizeProductName(text: string) {
  const name = cleanText(text).toLowerCase().replace(/^ls/u, '')
  return name === '弯头' ? '90°弯头' : name
}

function matchingName(text: string, category: UiCategory) {
  const name = normalizeProductName(text)
  return category === '球铁' ? normalizeProductName(name.replace(ballIronPrefix, '')) : name
}

function decimalKey(value: string | null | undefined) {
  return value?.replace(/^0+(?=\d)/u, '').replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '') ?? null
}

function quoteFacts(record: ProductRecord) {
  return JSON.stringify([
    record.source.file, record.source.sheet, record.source.row, record.sourceCategory,
    normalizeSpecification(record.specification), record.priceMarker, decimalKey(record.unitPrice),
    record.packingQuantity, record.status, decimalKey(record.blankWeight), decimalKey(record.finishedWeight),
    decimalKey(record.pureWeight), cleanText(record.notes ?? '')
  ])
}

export function matchProducts(records: readonly ProductRecord[], selection: Selection): ProductRecord[] {
  const name = matchingName(selection.productName, selection.category)
  const specification = normalizeSpecification(selection.specification)
  if (!name || !specification) return []

  const scoped = records.filter((record) => uiCategory(record) === selection.category)
  const names = new Set([name])
  for (const record of scoped) {
    if (record.aliases.some((alias) => matchingName(alias, selection.category) === name)) {
      names.add(matchingName(record.productName, selection.category))
    }
  }
  const candidates = scoped.filter((record) =>
    record.priceMarker === selection.priceMarker && normalizeSpecification(record.specification) === specification &&
    names.has(matchingName(record.productName, selection.category))
  )
  if (candidates.length < 2) return candidates

  const first = candidates[0]
  const firstFacts = quoteFacts(first)
  return candidates.every((record) => quoteFacts(record) === firstFacts)
    ? [{ ...first, productName: normalizeProductName(selection.productName) }]
    : candidates
}
