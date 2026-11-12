import { z } from 'zod'

export const NAMESPACE = 'manufacturing_quotation'
export const PLUGIN_NAME = '@xpert-ai/plugin-manufacturing-quotation'
export const FEATURE = `${NAMESPACE}.review`
export const MIDDLEWARE = 'ManufacturingQuotationMiddleware'
export const VIEW_PROVIDER = `${NAMESPACE}.view-provider`
export const VIEW_KEY = `${NAMESPACE}.workbench`
export const TEMPLATE_KEY = 'manufacturing-quotation-assistant'
export const RECOGNITION_MODEL = 'deepseek-flash'
export const RECOGNITION_OPTIONS = { thinking: false, max_tokens: 4096, maxRetries: 0 }
export const TOOL_NAMES = ['manufacturing_read_inquiry', 'manufacturing_get_catalog', 'manufacturing_save_proposal', 'manufacturing_report_failure'] as const

export const lineSchema = z.object({
  category: z.enum(['沟槽', '玛钢', '球铁']),
  productName: z.string().trim().min(1).max(100),
  specification: z.string().trim().min(1).max(100),
  priceMarker: z.enum(['a', 'A', 'b']).describe('Case-sensitive grade: 黑/黑袋/standalone 中/a -> a; 蓝/蓝袋/好/b/B -> b; uppercase A -> A. Use b only when grade evidence and heading grade are both absent. Never map 黑袋 to b.'),
  gradeRaw: z.string().max(100).describe('Copy the exact original grade text, such as 黑袋, 蓝袋, 中, a, A or b. Use an empty string only when the source row has no grade; priceMarker must agree with this evidence and its heading context.'),
  correctionReason: z.string().max(500).optional().describe('Explain a supported OCR correction, never use a reason to invent a product mapping. The only verified glyph correction is the complete source name 三涌 to 三通, requiring one catalog match for the same category, specification and grade. Otherwise report failure so the user can correct the source text.'),
  quantityCartons: z.number().int().min(1).max(1_000_000),
  evidence: z.string().trim().min(1).max(1000)
}).strict()
export const linesSchema = z.array(lineSchema).min(1).max(30)
export type ProposalLine = z.infer<typeof lineSchema>
export const humanLinesSchema = z.array(lineSchema.extend({ evidence: z.string().max(1000) })).min(1).max(30)
export const catalogSchema = z.object({
  catalogVersion: z.string().regex(/^[a-f0-9]{64}$/), synthetic: z.literal(true),
  products: z.array(z.object({
    id: z.string(), category: z.enum(['沟槽', '玛钢', '球铁']), productName: z.string(), specification: z.string(),
    priceMarker: z.enum(['a', 'A', 'b']), aliases: z.array(z.string()), status: z.enum(['enabled', 'pending_price'])
  }).strict()).min(1).max(100)
}).strict()
export type Catalog = z.infer<typeof catalogSchema>
const amount = z.string().regex(/^\d+\.\d{2}$/)
export const quoteSchema = z.object({
  catalogVersion: z.string(), synthetic: z.literal(true), currency: z.literal('CNY'),
  lines: z.array(z.object({
    productId: z.string(), category: z.string(), productName: z.string(), specification: z.string(),
    priceMarker: z.enum(['a', 'A', 'b']).nullable().optional(),
    quantityCartons: z.number().int().positive(), packingQuantity: z.number().int().positive().nullable(),
    unitPrice: z.string().regex(/^\d+(\.\d+)?$/).nullable(), lineAmount: amount.nullable(),
    totalPieces: z.number().int().positive().nullable().optional(),
    status: z.enum(['priced', 'missing_packaging', 'pending_price']).optional()
  }).strict()).min(1).max(30), total: amount,
  totalKind: z.enum(['total', 'subtotal']).optional(), warnings: z.array(z.string()).optional()
}).strict()
export type Quote = z.infer<typeof quoteSchema>
export type Status = 'draft' | 'analyzing' | 'review' | 'quoted' | 'failed' | 'ocr_pending' | 'ocr_failed'
export interface ImageSource {
  type: 'image'; fileName: string; mimeType: string; dataUrl: string; sha256: string
  ocrText?: string; warnings?: string[]
}
export interface Scope { tenantId: string; organizationId: string | null; userId: string; assistantId: string }
export class BusinessError extends Error {
  constructor(public readonly code: string) { super(code) }
}
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new BusinessError('invalid_input')
  return result.data
}
export function requireScope(scope: Scope): Scope {
  if (!scope.tenantId || !scope.userId || !scope.assistantId || scope.organizationId === undefined) throw new BusinessError('forbidden')
  return scope
}
