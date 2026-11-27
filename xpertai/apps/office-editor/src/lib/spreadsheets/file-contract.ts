import { z } from 'zod/v3'
import type { IWorkbookData } from '@univerjs/core'
import { workbookSchema } from '../workbooks/native-schema.js'

const scalar = z.union([z.string().max(32767), z.number().finite(), z.boolean(), z.null()])
const address = z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/)
const location = { sheet: z.string().min(1).max(31), cell: address }
const formula = z.string().min(1).max(8192)

// File saves can change values and formulas only. Neither a caller nor a view can
// smuggle formatting, worksheet structure, or replacement ZIP parts into a save.
export const xlsxChangesSchema = z.object({
  edits: z.array(z.object({ ...location, value: z.union([scalar, z.object({ formula }).strict()]) }).strict()).max(100000),
  results: z.array(z.object({ ...location, formula, value: scalar }).strict()).max(100000)
}).strict()
export type XlsxChanges = z.infer<typeof xlsxChangesSchema>
export const fileFormatSchema = z.enum(['xlsx', 'xls', 'csv', 'tsv'])
export type FileFormat = z.infer<typeof fileFormatSchema>
export const snapshotChangesSchema = z.object({
  format: z.enum(['xls', 'csv', 'tsv']),
  snapshot: z.custom<IWorkbookData>(value => workbookSchema.safeParse(value).success)
}).strict()
export const fileChangesSchema = z.union([xlsxChangesSchema, snapshotChangesSchema])
export type FileChanges = z.infer<typeof fileChangesSchema>

export const fileTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('resource'), providerKey: z.string().min(1).max(200), resourceId: z.string().min(1).max(300) }).strict(),
  z.object({ kind: z.literal('file'), path: z.string().min(1).max(4096), editorKey: z.string().min(1).max(200) }).strict()
])
export type FileTarget = z.infer<typeof fileTargetSchema>
