import { z } from 'zod/v3'

export const projectSearchSchema = z.object({ search: z.string().trim().max(200).default(''), page: z.number().int().positive().default(1) }).strict()
export const dashboardSearchSchema = projectSearchSchema.extend({ projectId: z.string().uuid().optional() })
export const dashboardProjectSchema = z.object({ id: z.string().uuid(), name: z.string() })
export const dashboardProjectsSchema = z.object({ items: z.array(dashboardProjectSchema), page: z.number().int().positive(), hasMore: z.boolean() })
