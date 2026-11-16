import { z } from 'zod/v3'
import { command } from '../remote-file/bridge'
import { xpertWorkbook, workbookSubmission, applyWorkbookOperations, same } from '../src/lib/workbooks/core'

export const pendingSave = z.object({ submission: workbookSubmission, workbook: xpertWorkbook }).strict()
export const localWorkbookDraft = z.object({
  format: z.literal('xpert.workbook.local-draft@1'), documentId: z.string().uuid(),
  baseRevision: z.number().int().positive().safe(), base: xpertWorkbook, draft: xpertWorkbook,
  pending: pendingSave.optional()
}).strict().superRefine((value, ctx) => {
  if ([value.base.id, value.draft.id, value.pending?.workbook.id ?? value.documentId].some(id => id !== value.documentId) ||
      (value.pending && value.pending.submission.baseRevision !== value.baseRevision))
    ctx.addIssue({ code: 'custom', message: 'office.local_draft_invalid' })
  if (value.pending) {
    try {
      if (!same(applyWorkbookOperations(value.base, value.pending.submission.operations), value.pending.workbook))
        ctx.addIssue({ code: 'custom', message: 'office.local_draft_invalid' })
    } catch { ctx.addIssue({ code: 'custom', message: 'office.local_draft_invalid' }) }
  }
})
export type LocalWorkbookDraft = z.infer<typeof localWorkbookDraft>
export type PendingSave = z.infer<typeof pendingSave>
const summary = z.object({ draftId: z.string().uuid(), revision: z.number().int().positive().safe(),
  updatedAt: z.number().finite(), bytes: z.number().int().nonnegative() })
export type DraftSummary = z.infer<typeof summary>

/** A single in-flight writer with CAS. A competing tab forks instead of replacing
 * another tab's unsaved content. Keep the exact submission across lost responses. */
export function createWorkbookDrafts(documentId: string) {
  let draftId: string = crypto.randomUUID(), revision = 0
  let tail: Promise<unknown> = Promise.resolve()
  const call = async (input: object) => z.object({ success: z.literal(true), data: z.unknown() }).parse(
    await command('workbench.content.draft', { resourceId: documentId, ...input })).data
  const serial = <T>(work: () => Promise<T>) => {
    const next = tail.then(work, work)
    tail = next.catch(() => undefined)
    return next
  }
  return {
    async list() { return z.array(summary).max(20).parse(await call({ operation: 'list' })).filter(item => item.draftId !== draftId) },
    async read(id: string): Promise<LocalWorkbookDraft> {
      const row = summary.extend({ content: z.string() }).parse(await call({ operation: 'read', draftId: id }))
      const parsed = localWorkbookDraft.parse(JSON.parse(row.content))
      if (parsed.documentId !== documentId) throw new Error('office.local_draft_invalid')
      // Recovery keeps the original until the new content is safely written.
      // Adopting its CAS allows an active original tab to fork on conflict.
      draftId = row.draftId; revision = row.revision
      return parsed
    },
    persist(value: LocalWorkbookDraft) {
      const content = JSON.stringify(localWorkbookDraft.parse(value))
      return serial(async () => {
        const write = () => call({ operation: 'write', draftId, expectedRevision: revision, content })
        let result: unknown
        try { result = await write() }
        catch (error) {
          if (!(error instanceof Error) || !error.message.includes('local_draft.conflict')) throw error
          draftId = crypto.randomUUID(); revision = 0
          result = await write()
        }
        revision = summary.parse(result).revision
      })
    },
    clear() {
      return serial(async () => {
        if (revision) await call({ operation: 'delete', draftId, expectedRevision: revision })
        draftId = crypto.randomUUID(); revision = 0
      })
    },
    remove(item: DraftSummary) { return call({ operation: 'delete', draftId: item.draftId, expectedRevision: item.revision }) }
  }
}
