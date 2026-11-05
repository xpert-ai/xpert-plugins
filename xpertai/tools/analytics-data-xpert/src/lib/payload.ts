import { z } from 'zod/v3'
import type { JSONValue } from '@xpert-ai/contracts'
const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])
const json: z.ZodType<JSONValue> = z.lazy(() => z.union([scalar, z.array(json), z.record(json)]))
/** Native Action arguments stay plugin-owned; the host only interprets Dataset/Binding. */
export const dataXpertPayloadSchema = z.object({
  resourceId: z.string().min(1).max(160), actionTypeCode: z.string().min(1).max(160),
  target: z.object({
    entityId: z.string().trim().min(1).max(256).optional(),
    entityTypeCode: z.string().trim().min(1).max(256).optional(),
    entityRef: z.string().trim().min(1).max(512).optional()
  }).strict().refine(target => Boolean(target.entityId || target.entityRef), 'Target reference is required'),
  params: z.record(json),
  parameterPaths: z.record(z.array(z.string().min(1)).min(1).max(8)).default({})
}).strict()
