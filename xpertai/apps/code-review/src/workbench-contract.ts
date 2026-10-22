import { z } from 'zod/v3'
import { reviewRefSchema } from './domain.js'

export const workbenchQuerySchema = z.object({
  page: z.number().int().min(1).max(50).default(1),
  search: z.string().trim().max(200).default(''),
  repository: z.string().max(401).default(''),
  status: z.string().max(40).default(''),
  pinned: z.boolean().default(false),
  recordId: z.string().uuid().optional(),
  history: z.string().max(600).optional()
})
export type WorkbenchQuery = z.infer<typeof workbenchQuerySchema>
export const workbenchEntrySchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  ref: reviewRefSchema,
  title: z.string(),
  source: z.enum(['automatic', 'manual', 'local_git']),
  trigger: z.string(),
  status: z.string(),
  headSha: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  pinned: z.boolean(),
  reviewId: z.string().uuid().nullable(),
  runId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  projectId: z.string().uuid().nullable(),
  instanceId: z.string().uuid().nullable(),
  roundId: z.string().uuid().nullable(),
  publicationUrl: z.string().nullable(),
  count: z.coerce.number().int().positive()
})
export type WorkbenchEntry = z.infer<typeof workbenchEntrySchema>
export const workbenchPageSchema = z.object({
  items: z.array(workbenchEntrySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.literal(20),
  repositories: z.array(z.object({ value: z.string(), label: z.string() }))
})
