import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { matchProducts, normalizePriceMarker, normalizeSpecification, uiCategory, type ProductRecord } from './business-rules.js'
import { BusinessError, humanLinesSchema, type Catalog, type ProposalLine, type Quote } from './contracts.js'
import { DEMO_PRODUCTS } from './demo-catalog.js'

const nonempty = z.string().trim().min(1)
const positiveDecimal = z.string().regex(/^\d+(?:\.\d+)?$/u).refine((value) => /[1-9]/u.test(value))
const productSchema = z.object({
  id: nonempty,
  sourceCategory: z.enum(['沟槽', '玛钢']),
  productName: nonempty,
  specification: nonempty,
  priceMarker: z.enum(['a', 'A', 'b']),
  aliases: z.array(nonempty),
  unitPrice: positiveDecimal.nullable(),
  packingQuantity: z.number().int().positive().safe().nullable(),
  status: z.enum(['enabled', 'pending_price']),
  source: z.object({ file: nonempty, sheet: nonempty, row: z.number().int().positive().safe() }).strict(),
  blankWeight: positiveDecimal.nullish(),
  finishedWeight: positiveDecimal.nullish(),
  pureWeight: positiveDecimal.nullish(),
  notes: z.string().optional()
}).strict().refine((record) => (record.status === 'pending_price') === (record.unitPrice === null))
const recordsSchema = z.array(productSchema).min(1)

function compareProductIds(left: ProductRecord, right: ProductRecord) {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

function assertCatalog(records: readonly ProductRecord[]) {
  if (!recordsSchema.safeParse(records).success) throw new BusinessError('invalid_catalog')
  const ids = new Set(records.map(({ id }) => id))
  const businessKeys = new Set(records.map((record) => JSON.stringify([
    record.sourceCategory, record.productName.replace(/\s+/gu, '').toLowerCase(),
    normalizeSpecification(record.specification), record.priceMarker
  ])))
  if (ids.size !== records.length || businessKeys.size !== records.length) throw new BusinessError('invalid_catalog')
}

export function catalogFingerprint(records: readonly ProductRecord[]): string {
  const canonical = [...records].sort(compareProductIds).map((record) => ({
    id: record.id, sourceCategory: record.sourceCategory, productName: record.productName,
    specification: record.specification, priceMarker: record.priceMarker, aliases: [...record.aliases].sort(),
    unitPrice: record.unitPrice, packingQuantity: record.packingQuantity, status: record.status,
    source: { file: record.source.file, sheet: record.source.sheet, row: record.source.row },
    blankWeight: record.blankWeight ?? null, finishedWeight: record.finishedWeight ?? null,
    pureWeight: record.pureWeight ?? null, notes: record.notes ?? ''
  }))
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

assertCatalog(DEMO_PRODUCTS)
const catalogVersion = catalogFingerprint(DEMO_PRODUCTS)

function formatCents(cents: bigint) {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
}

function matchLines(records: readonly ProductRecord[], input: readonly ProposalLine[]) {
  const parsed = humanLinesSchema.safeParse(input)
  if (!parsed.success) throw new BusinessError('invalid_proposal')
  const ordered = [...records].sort(compareProductIds)
  return parsed.data.map((line) => {
    if (line.gradeRaw.trim() && normalizePriceMarker(line.gradeRaw) !== line.priceMarker) throw new BusinessError('invalid_grade')
    const candidates = matchProducts(ordered, line)
    if (!candidates.length) throw new BusinessError('not_found_product')
    if (candidates.length > 1) throw new BusinessError('ambiguous_product')
    return { line, product: candidates[0] }
  })
}

export function calculateQuote(records: readonly ProductRecord[], version: string, input: readonly ProposalLine[]): Quote {
  assertCatalog(records)
  if (version !== catalogFingerprint(records)) throw new BusinessError('stale_catalog')

  let totalCents = 0n
  const warnings = new Set<string>()
  const lines = matchLines(records, input).map(({ line, product }): Quote['lines'][number] => {
    const { id, unitPrice, packingQuantity } = product
    const matched = {
      productId: id, category: line.category, productName: line.productName,
      specification: normalizeSpecification(line.specification), priceMarker: line.priceMarker,
      quantityCartons: line.quantityCartons
    }
    if (unitPrice === null) {
      warnings.add('pending_price')
      return { ...matched, packingQuantity: null, unitPrice, lineAmount: null, totalPieces: null, status: 'pending_price' }
    }
    if (packingQuantity === null) {
      warnings.add('missing_packaging')
      return { ...matched, packingQuantity, unitPrice, lineAmount: null, totalPieces: null, status: 'missing_packaging' }
    }

    const pieces = BigInt(line.quantityCartons) * BigInt(packingQuantity)
    if (pieces > BigInt(Number.MAX_SAFE_INTEGER)) throw new BusinessError('invalid_catalog')
    const [whole, fraction = ''] = unitPrice.split('.')
    const scale = 10n ** BigInt(fraction.length)
    const numerator = pieces * BigInt(whole + fraction) * 100n
    // All inputs are positive, so integer ceiling rounds each line up before summing.
    const cents = (numerator + scale - 1n) / scale
    totalCents += cents
    return { ...matched, packingQuantity, unitPrice, lineAmount: formatCents(cents), totalPieces: Number(pieces), status: 'priced' }
  })
  if (lines.every((line) => line.status === 'pending_price')) throw new BusinessError('no_priced_products')
  return {
    catalogVersion: version, synthetic: true, currency: 'CNY', lines, total: formatCents(totalCents),
    totalKind: warnings.size ? 'subtotal' : 'total', ...(warnings.size ? { warnings: [...warnings] } : {})
  }
}

@Injectable()
export class PricingService {
  async catalog(): Promise<Catalog> {
    return { catalogVersion, synthetic: true,
      products: DEMO_PRODUCTS.map((record) => ({
        id: record.id, category: uiCategory(record), productName: record.productName, specification: record.specification,
        priceMarker: record.priceMarker, aliases: [...record.aliases], status: record.status
      })) }
  }

  validate(input: ProposalLine[]): void {
    matchLines(DEMO_PRODUCTS, input)
  }

  async quote(version: string, input: ProposalLine[]): Promise<Quote> {
    return calculateQuote(DEMO_PRODUCTS, version, input)
  }
}
