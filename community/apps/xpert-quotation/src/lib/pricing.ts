import type { PriceItem, QuotationLineKind, RecognizedLine } from './types.js'

export function matchPrice(line: RecognizedLine, items: PriceItem[]) {
  const compatible = items.filter((item) => item.kind === priceKindForLine(line.kind))
  const code = normalizeKey(line.code)
  const exactCode = code ? compatible.filter((item) => normalizeKey(item.code) === code) : []
  const candidates = exactCode.length ? exactCode : compatible.filter((item) => {
    return normalizeKey(item.name) === normalizeKey(line.name)
      && compatibleOptional(item.specification, line.specification)
      && compatibleOptional(item.unit, line.unit)
  })
  if (candidates.length === 1) {
    return { status: 'matched' as const, item: candidates[0], candidates, evidence: exactCode.length ? '编码精确匹配' : '名称、规格、单位精确匹配' }
  }
  if (candidates.length > 1) return { status: 'review_required' as const, candidates, evidence: '存在多个同优先级价格，需人工或模型复核' }
  return { status: 'unmatched' as const, candidates: [], evidence: '价格清单中没有相同编码或标准键' }
}

export function multiplyAmount(quantity: string, unitPrice: string) {
  const left = parseDecimal(quantity)
  const right = parseDecimal(unitPrice)
  const numerator = left.integer * right.integer
  const scale = left.scale + right.scale
  return roundScaled(numerator, scale, 2)
}

export function sumAmounts(values: string[]) {
  const cents = values.reduce((sum, value) => sum + decimalToCents(value), 0n)
  return centsToDecimal(cents)
}

function priceKindForLine(kind: QuotationLineKind): PriceItem['kind'] {
  if (kind === 'bill') return 'project_rate'
  return kind
}

function compatibleOptional(left?: string, right?: string) {
  if (!left || !right) return true
  return normalizeKey(left) === normalizeKey(right)
}

export function normalizeKey(value?: string | null) {
  return value?.toLowerCase().replace(/[\s\-_/\\,，.。()（）]/g, '') ?? ''
}

function parseDecimal(value: string) {
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) throw new Error(`Invalid decimal ${value}.`)
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const [whole, fraction = ''] = unsigned.split('.')
  const integer = BigInt(`${whole}${fraction}` || '0') * (negative ? -1n : 1n)
  return { integer, scale: fraction.length }
}

function roundScaled(value: bigint, sourceScale: number, targetScale: number) {
  if (sourceScale <= targetScale) return centsToDecimal(value * (10n ** BigInt(targetScale - sourceScale)))
  const divisor = 10n ** BigInt(sourceScale - targetScale)
  const negative = value < 0n
  const absolute = negative ? -value : value
  const rounded = (absolute + divisor / 2n) / divisor
  return centsToDecimal(negative ? -rounded : rounded)
}

function decimalToCents(value: string) {
  const parsed = parseDecimal(value)
  if (parsed.scale <= 2) return parsed.integer * (10n ** BigInt(2 - parsed.scale))
  return BigInt(roundScaled(parsed.integer, parsed.scale, 2).replace('.', ''))
}

function centsToDecimal(cents: bigint) {
  const negative = cents < 0n
  const absolute = negative ? -cents : cents
  const text = absolute.toString().padStart(3, '0')
  return `${negative ? '-' : ''}${text.slice(0, -2)}.${text.slice(-2)}`
}
