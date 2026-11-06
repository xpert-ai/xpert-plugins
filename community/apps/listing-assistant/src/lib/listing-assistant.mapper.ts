import type { ListingDraftInput, ListingEvidence, ListingFieldFlags } from './types.js'

type ExtractionLike = {
  title?: string | null
  description?: string | null
  price?: string | null
  category?: string | null
  specs?: unknown[] | null
  missingFields?: string[] | null
  uncertainFields?: string[] | null
}

export type NormalizedDraftInput = {
  title: string | null
  description: string | null
  price: string | null
  currency: string | null
  category: string | null
  attributes: Record<string, string | null> | null
  specs: Array<{ name: string; price: string | null; stock: number | null }> | undefined
}

const FLAGGED_FIELDS = ['title', 'description', 'price', 'category', 'specs'] as const
const EVIDENCE_FIELDS = FLAGGED_FIELDS

/**
 * Builds the per-field review markers shown by the workbench.
 * A field is `missing` when the model reports it absent or returns no value,
 * `uncertain` when the model flags ambiguity, and `ai` when it was drafted.
 */
export function buildFieldFlags(extraction: ExtractionLike): ListingFieldFlags {
  const missing = new Set(extraction.missingFields ?? [])
  const uncertain = new Set(extraction.uncertainFields ?? [])
  const values: Record<(typeof FLAGGED_FIELDS)[number], unknown> = {
    title: extraction.title,
    description: extraction.description,
    price: extraction.price,
    category: extraction.category,
    specs: extraction.specs?.length ? extraction.specs : null
  }

  const flags: ListingFieldFlags = {}
  for (const field of FLAGGED_FIELDS) {
    const value = values[field]
    if (missing.has(field) || !hasValue(value)) {
      flags[field] = 'missing'
    } else if (uncertain.has(field)) {
      flags[field] = 'uncertain'
    } else {
      flags[field] = 'ai'
    }
  }
  return flags
}

/**
 * Removes markers for fields the operator has supplied, so confirmed values are
 * no longer highlighted. Unconfirmed fields keep their original marker.
 */
export function mergeFieldFlags(existing: ListingFieldFlags | null, input: NormalizedDraftInput): ListingFieldFlags {
  const flags: ListingFieldFlags = { ...(existing ?? {}) }
  const provided: Record<(typeof FLAGGED_FIELDS)[number], unknown> = {
    title: input.title,
    description: input.description,
    price: input.price,
    category: input.category,
    specs: input.specs?.length ? input.specs : null
  }
  for (const field of FLAGGED_FIELDS) {
    if (hasValue(provided[field])) {
      delete flags[field]
    }
  }
  return flags
}

/**
 * Keeps only the short source excerpts the model returned for known fields.
 * Unknown keys, blanks and over-long values are dropped so the workbench can
 * treat the result as trusted display data.
 */
export function normalizeEvidence(value: unknown): ListingEvidence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const evidence: ListingEvidence = {}
  for (const field of EVIDENCE_FIELDS) {
    const raw = source[field]
    if (typeof raw !== 'string') continue
    const quote = raw.trim()
    if (quote) evidence[field] = quote.slice(0, 300)
  }
  return Object.keys(evidence).length ? evidence : null
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

export function normalizeDraftInput(input: ListingDraftInput): NormalizedDraftInput {
  return {
    title: cleanText(input.title, 200),
    description: cleanText(input.description, 20000),
    price: cleanText(input.price, 40),
    currency: cleanText(input.currency, 10),
    category: cleanText(input.category, 120),
    attributes: normalizeAttributes(input.attributes),
    specs: Array.isArray(input.specs)
      ? input.specs
          .filter((spec) => spec && typeof spec.name === 'string' && spec.name.trim())
          .slice(0, 50)
          .map((spec) => ({
            name: spec.name.trim().slice(0, 120),
            price: cleanText(spec.price, 40),
            stock: typeof spec.stock === 'number' && spec.stock >= 0 ? Math.floor(spec.stock) : null
          }))
      : undefined
  }
}

export function normalizeAttributes(value: ListingDraftInput['attributes']): Record<string, string | null> | null {
  if (!value || typeof value !== 'object') return null
  const entries = Object.entries(value)
    .filter(([key]) => key && key.trim())
    .slice(0, 50)
    .map(([key, raw]) => [key.trim().slice(0, 60), raw === null || raw === undefined ? null : String(raw).slice(0, 500)])
  return entries.length ? Object.fromEntries(entries) : null
}

export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

/**
 * Splits pasted supplier copy into one entry per listing. A line containing
 * only `---` separates entries; everything else is treated as one listing.
 */
export function splitBatchSource(text: string): string[] {
  return text
    .split(/^[ \t]*---[ \t]*$/m)
    .map((part) => part.trim())
    .filter(Boolean)
}
