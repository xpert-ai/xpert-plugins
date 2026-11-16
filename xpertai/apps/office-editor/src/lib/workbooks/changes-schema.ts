import { z } from 'zod/v3'
import { workbookOperation } from './core.js'
export const workbookChange = z.object({ revision: z.number().int().positive(), baseRevision: z.number().int().positive(),
  protocol: z.enum(['xpert.workbook.operations@1', 'xpert.workbook.operations@2']), operations: z.array(workbookOperation).min(1).max(10000) })
export const workbookChanges = z.discriminatedUnion('reset', [
  z.object({ reset: z.literal(true), revision: z.number().int().positive() }),
  z.object({ reset: z.literal(false), revision: z.number().int().positive(), cursor: z.number().int().positive(),
    items: z.array(workbookChange).max(50), more: z.boolean(), canWrite: z.boolean(), title: z.string(), sourcePath: z.string(), sourceHash: z.string() })
])
