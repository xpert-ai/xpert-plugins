import { z } from 'zod/v3'
import { editableItemSchema } from '../src/lib/schemas.js'
export const itemSchema = editableItemSchema.extend({ sourceSegmentIds: z.array(z.string()), origin: z.enum(['ai','manual']), humanAdjusted: z.boolean(), reviewNote: z.string().nullable() })
export const analysisSessionSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('ready'), number: z.number(), conversationId: z.string().uuid(), executionId: z.string().uuid(), threadId: z.string().optional() }),
  z.object({ state: z.literal('pending') }), z.object({ state: z.literal('unavailable') })
])
export type ReadySession = Extract<z.infer<typeof analysisSessionSchema>, { state: 'ready' }>
export const detailSchema = z.object({
  id: z.string().uuid(), title: z.string(), status: z.enum(['processing','review_ready','confirmed','failed']), sourceText: z.string(),
  sourceSegments: z.object({ segments: z.array(z.object({ id: z.string(), start: z.number(), end: z.number() })) }),
  items: z.array(itemSchema).nullable(), initialItems: z.array(itemSchema).nullable(), revision: z.number(), updatedAt: z.string(), confirmedAt: z.string().nullable(),
  lastSaveOperationId: z.string().nullable(), confirmOperationId: z.string().nullable(),
  attempt: z.object({ number: z.number(), status: z.string(), errorCode: z.string().nullable() }).nullable(),
  analysisSession: analysisSessionSchema
})
export type Detail = z.infer<typeof detailSchema>
export const listSchema = z.object({ items: z.array(z.object({ id: z.string(), title: z.string(), status: z.string(), updatedAt: z.string() })), nextCursor: z.string().optional() })
export type List = z.infer<typeof listSchema>
export const dataSchema = z.object({ item: detailSchema.optional(), meta: z.object({ page: z.literal('new') }).optional() })
