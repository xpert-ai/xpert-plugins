import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import { stableJson, xpertWorkbook, type XpertWorkbook } from './core.js'

const backupSchema = z.object({ format: z.literal('xpert.workbook.backup'), schemaVersion: z.literal(1),
  documentId: z.string().uuid(), revision: z.number().int().positive().max(2147483647),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), workbook: xpertWorkbook }).strict()
const checksum = (book: XpertWorkbook) => createHash('sha256').update(stableJson(book)).digest('hex')

/** This checksum detects damaged archives, not authorship or authorization.
 * Restore is a draft on the same resource; the ordinary writer creates a new revision. */
export function createWorkbookBackup(book: XpertWorkbook, revision: number) {
  return backupSchema.parse({ format: 'xpert.workbook.backup', schemaVersion: 1,
    documentId: book.id, revision, sha256: checksum(book), workbook: book })
}
export function readWorkbookBackup(input: unknown, documentId: string): XpertWorkbook {
  const backup = backupSchema.parse(input)
  if (backup.documentId !== documentId || backup.workbook.id !== documentId ||
    checksum(backup.workbook) !== backup.sha256) throw new Error('office.workbook_backup_invalid')
  return backup.workbook
}
