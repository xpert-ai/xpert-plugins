import { z } from 'zod/v3'
import { LIMITS } from './constants.js'

export const bounded = (max: number, required = false) => z.string().trim()
  .refine(v => !required || v.length > 0, 'required')
  .refine(v => [...v].length <= max, 'too_long')
const optionalText = (max: number) => bounded(max).nullable().transform(v => v || null)
export const editableItemSchema = z.object({
  id: z.string().uuid(), task: bounded(LIMITS.task, true),
  owner: optionalText(LIMITS.owner), deadlineText: optionalText(LIMITS.deadline)
}).strict()
export const extractionItemSchema = z.object({
  task: bounded(LIMITS.task, true), owner: optionalText(LIMITS.owner),
  deadlineText: optionalText(LIMITS.deadline),
  sourceSegmentIds: z.array(z.string().regex(/^S\d+$/)).min(1).max(100),
  reviewNote: optionalText(LIMITS.note).optional().default(null)
}).strict()
export const extractionSchema = z.object({ items: z.array(extractionItemSchema).max(LIMITS.items) }).strict()
export const editItemsSchema = z.array(editableItemSchema).max(LIMITS.items)
  .refine(items => new Set(items.map(i => i.id)).size === items.length, 'duplicate_item_id')
export const createSchema = z.object({
  operationId: z.string().uuid(), title: bounded(LIMITS.title, true),
  sourceText: z.string().transform(v => v.replace(/\r\n?/g, '\n'))
    .refine(v => v.trim().length > 0, 'required').refine(v => [...v].length <= LIMITS.source, 'too_long')
}).strict()
export const retrySchema = z.object({ meetingId: z.string().uuid(), operationId: z.string().uuid(), expectedRevision: z.number().int().positive() }).strict()
export const saveSchema = retrySchema.extend({ items: editItemsSchema }).strict()
export const configSchema = z.object({
  timeoutSeconds: z.number().int().min(30).max(600).default(120),
  debug: z.boolean().default(false),
  testFailAttemptId: z.string().uuid().optional()
}).strict()
export type PluginConfig = z.infer<typeof configSchema>
export type CreateInput = z.infer<typeof createSchema>
export type RetryInput = z.infer<typeof retrySchema>
export type SaveInput = z.infer<typeof saveSchema>
export type ExtractionInput = z.infer<typeof extractionSchema>
export type EditableItem = z.infer<typeof editableItemSchema>
