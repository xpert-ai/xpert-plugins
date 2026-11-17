import type { SaveSupplierQuoteExtractionInput, SupplierQuoteItemInput } from './types.js'

type QuoteHeader = Omit<SaveSupplierQuoteExtractionInput, 'caseId' | 'documentId' | 'quoteSeriesId' | 'items'>

export function normalizeOptional(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export function quoteHeader(input: QuoteHeader) {
  return {
    supplierName: input.supplierName.trim(),
    supplierContact: normalizeOptional(input.supplierContact),
    taxIncluded: input.taxIncluded,
    deliveryTime: normalizeOptional(input.deliveryTime),
    paymentTerms: normalizeOptional(input.paymentTerms),
    warranty: normalizeOptional(input.warranty),
    remarks: normalizeOptional(input.remarks)
  }
}

export function quoteLine(item: SupplierQuoteItemInput) {
  return {
    requirementItemId: normalizeOptional(item.requirementItemId),
    productName: item.productName,
    brand: normalizeOptional(item.brand),
    model: normalizeOptional(item.model),
    specification: normalizeOptional(item.specification),
    quantity: item.quantity,
    unit: normalizeOptional(item.unit),
    unitPrice: normalizeOptional(item.unitPrice),
    totalPrice: normalizeOptional(item.totalPrice),
    taxIncluded: item.taxIncluded,
    taxRate: normalizeOptional(item.taxRate),
    deliveryTime: normalizeOptional(item.deliveryTime),
    paymentTerms: normalizeOptional(item.paymentTerms),
    warranty: normalizeOptional(item.warranty),
    remarks: normalizeOptional(item.remarks),
    rawText: normalizeOptional(item.rawText)
  }
}

// The database has no line ordinal. Preserve multiplicity and compare only fields stored by the extractor.
export function matchesStoredExtraction(input: SaveSupplierQuoteExtractionInput, saved: QuoteHeader, lines: SupplierQuoteItemInput[]) {
  const serialize = (fields: QuoteHeader | SupplierQuoteItemInput) => JSON.stringify(fields, (_key, value) => value ?? undefined)
  if (serialize(quoteHeader(input)) !== serialize(quoteHeader(saved)) || lines.length !== input.items.length) return false
  const sortedLines = (items: SupplierQuoteItemInput[]) => items.map((item) => serialize(quoteLine(item))).sort()
  const previous = sortedLines(lines)
  return sortedLines(input.items).every((line, index) => line === previous[index])
}
