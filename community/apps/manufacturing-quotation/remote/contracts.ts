import { z } from 'zod'
import { catalogSchema, humanLinesSchema, lineSchema, quoteSchema } from '../src/contracts'
export type { Quote } from '../src/contracts'

export const MAX_TITLE = 120
export const MAX_INQUIRY = 8_000
export const MAX_LINES = 30
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

const status = z.enum(['draft', 'ocr_pending', 'ocr_failed', 'analyzing', 'review', 'quoted', 'failed'])
const line = humanLinesSchema.element
const legacyLine = z.object({
  productId: z.string(),
  quantityCartons: z.number().int(),
  evidence: z.string(),
})
const imageSource = z.object({
  type: z.literal('image'),
  fileName: z.string(),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  dataUrl: z.string().max(4 * Math.ceil(MAX_IMAGE_BYTES / 3) + 32)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/),
  ocrText: z.string().optional(),
  warnings: z.array(z.string()).optional(),
})
const record = z.object({
  id: z.string().min(1),
  title: z.string(),
  status,
  revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export const draft = record.extend({
  inquiry: z.string(),
  catalogVersion: z.string(),
  lines: z.array(z.union([line, legacyLine])),
  source: imageSource.nullish(),
  quote: quoteSchema.nullable(),
  errorCode: z.string().nullable(),
  retryAt: z.string().datetime().nullable(),
})
export const projection = z.object({
  catalog: catalogSchema.nullable(),
  records: z.array(record),
  selected: draft.nullable(),
  serviceError: z.string().nullish(),
})

export type Draft = z.infer<typeof draft>
export type DraftLine = z.infer<typeof line>
export type Projection = z.infer<typeof projection>
export const CATEGORIES = lineSchema.shape.category.options
export const PRICE_MARKERS = lineSchema.shape.priceMarker.options
export type LineEditorRow = Omit<DraftLine, 'quantityCartons' | 'category' | 'priceMarker'> & {
  category: DraftLine['category'] | ''
  priceMarker: DraftLine['priceMarker'] | ''
  cartons: string
  key: number
}
export type ActionKey = 'create' | 'create_image' | 'save_inquiry' | 'retry_ocr' | 'analyze' | 'retry' | 'save_lines' | 'confirm'

export function validateLines(rows: LineEditorRow[]) {
  if (!rows.length || rows.length > MAX_LINES) return { error: 'empty_lines' } as const

  const candidates = rows.map(({ key: _, cartons, ...row }) => ({
    ...row,
    productName: row.productName.trim(),
    specification: row.specification.trim(),
    quantityCartons: /^\d+$/.test(cartons) ? Number(cartons) : NaN,
  }))
  if (candidates.some(({ quantityCartons }) => !lineSchema.shape.quantityCartons.safeParse(quantityCartons).success)) {
    return { error: 'invalid_quantity' } as const
  }
  const parsed = humanLinesSchema.safeParse(candidates)
  return parsed.success ? { lines: parsed.data } : { error: 'incomplete_line' }
}
