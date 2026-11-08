import { z } from 'zod/v3'
import { kindSchema } from './resource-contract'

/** @beta A paged projection of display blueprints and authorized fixed V2 versions. */
export const directoryQuerySchema = z.object({
  audience: z.enum(['catalog', 'mine', 'public']).default('catalog'), kind: kindSchema,
  page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(50).default(24),
  search: z.string().max(100).default(''), category: z.string().max(80).default(''),
  appearance: z.enum(['all', 'light', 'dark']).default('all'), locale: z.enum(['en', 'zh-Hans', 'zh-Hant']).default('en')
}).strict()
export const directoryItemSchema = z.object({
  id: z.string(), kind: kindSchema, title: z.string(), description: z.string(), categories: z.array(z.string()),
  state: z.enum(['planned', 'not-installed', 'released']), releaseId: z.string().uuid().nullable(), version: z.string().nullable(),
  coverKey: z.string().optional(), coverAssetId: z.string().optional(), features: z.array(z.string()).default([]),
  dataMode: z.enum(['demo', 'web', 'external']).optional(), requirements: z.array(z.string()).default([])
}).strict()
export const directoryPageSchema = z.object({ items: z.array(directoryItemSchema), page: z.number(), pageSize: z.number(), total: z.number() }).strict()
export type DirectoryItem = z.infer<typeof directoryItemSchema>
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>
