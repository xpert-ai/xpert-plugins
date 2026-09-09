import { z } from 'zod/v3'
import { id, revision } from './contracts.js'

export const minimalReceiptSchema = z
  .object({
    resultStatus: z.literal('unavailable'),
    errorCode: z.literal('tool_result_unavailable'),
    success: z.boolean().optional(),
    operationId: id.optional(),
    drawingId: id.optional(),
    sceneRevision: revision.optional(),
    irRevision: revision.optional(),
    versionId: id.optional(),
    versionNumber: revision.optional(),
    shareUrl: z.string().max(4096).optional(),
    jobId: id.optional(),
    previewId: id.optional(),
    status: z.string().max(80).optional(),
    message: z.string().max(240),
    nextAction: z.string().max(400)
  })
  .strict()
export type MinimalReceipt = z.infer<typeof minimalReceiptSchema>
export type ResultIdentity = Omit<MinimalReceipt, 'resultStatus' | 'errorCode' | 'message' | 'nextAction'>

const schemas = new WeakMap<z.ZodTypeAny, z.ZodUnion<[z.ZodTypeAny, typeof minimalReceiptSchema]>>()
export function recoverableSchema<T extends z.ZodTypeAny>(schema: T) {
  let result = schemas.get(schema)
  if (!result) {
    result = z.union([schema, minimalReceiptSchema])
    schemas.set(schema, result)
  }
  return result
}
