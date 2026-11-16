import React, { useState } from 'react'
import { Button, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@xpert-ai/plugin-shadcn-ui'
import { t } from '../remote-file/i18n'
import type { DraftSummary } from './local-drafts'

export function DraftRecovery(props: {
  open: boolean; onOpenChange(value: boolean): void; drafts: DraftSummary[]; disabled: boolean;
  onRestore(id: string): Promise<void>; onRemove(item: DraftSummary): Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [removing, setRemoving] = useState<DraftSummary | null>(null)
  const run = async (work: () => Promise<void>) => { setPending(true); try { await work() } finally { setPending(false) } }
  return <><Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent className="workbook-draft-dialog">
      <DialogHeader><DialogTitle>{t('workbook.localDrafts')}</DialogTitle>
        <DialogDescription>{t('workbook.localDraftHint')}</DialogDescription></DialogHeader>
      <div className="workbook-draft-list">
        {!props.drafts.length && <p>{t('workbook.noLocalDrafts')}</p>}
        {props.drafts.map(item => <div key={item.draftId} className="workbook-draft-row">
          <span>{new Date(item.updatedAt).toLocaleString()} · {Math.ceil(item.bytes / 1024)} KB</span>
          <Button variant="ghost" disabled={pending} onClick={() => setRemoving(item)}>{t('workbook.deleteDraft')}</Button>
          <Button variant="outline" disabled={pending || props.disabled} onClick={() => void run(() => props.onRestore(item.draftId))}>{t('workbook.recoverDraft')}</Button>
        </div>)}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => props.onOpenChange(false)}>{t('common.close')}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
    <AlertDialog open={Boolean(removing)} onOpenChange={open => { if (!open) setRemoving(null) }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('workbook.deleteDraft')}</AlertDialogTitle>
        <AlertDialogDescription>{t('workbook.deleteDraftHint')}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (removing) void run(() => props.onRemove(removing)) }}>{t('workbook.deleteDraft')}</AlertDialogAction>
        </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>
}
