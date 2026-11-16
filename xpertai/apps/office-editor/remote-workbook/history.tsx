import React, { useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import { LocaleType, type IWorkbookData } from '@univerjs/core'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@xpert-ai/plugin-shadcn-ui'
import { action } from '../remote-file/bridge'
import { t, useLocale } from '../remote-file/i18n'
import { WorkbookEngine } from './engine'
import { workbookSchema } from '../src/lib/workbooks/native-schema'

const history = z.object({ items: z.array(z.object({ revision: z.number(), source: z.string(),
  createdAt: z.string(), createdById: z.string().nullish(), canUndo: z.boolean().default(false) })), nextCursor: z.number().nullable() })
type Revision = z.infer<typeof history>['items'][number]
const noop = () => undefined

export function WorkbookHistory(props: { open: boolean; onOpenChange(open: boolean): void; documentId: string;
  revision: string; canRestore: boolean; dirty: boolean; onRestored(): Promise<void> }) {
  useLocale()
  const [items, setItems] = useState<Revision[]>([]), [cursor, setCursor] = useState<number | null>(null)
  const [selected, setSelected] = useState<number>(), [snapshot, setSnapshot] = useState<IWorkbookData>()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState<'restore' | 'undo' | null>(null)
  const attempt = useRef<{ kind: 'restore' | 'undo'; revision: number; expectedRevision: string; requestId: string }>()
  const previewSequence = useRef(0)
  const load = async (before?: number) => {
    setBusy(true); setError('')
    try {
      const result = history.parse(await action('workbook.history', { documentId: props.documentId, ...(before ? { before } : {}) }))
      setItems(old => before ? [...old, ...result.items.filter(item => !old.some(row => row.revision === item.revision))] : result.items)
      setCursor(result.nextCursor)
    } catch { setError(t('workbook.failed')) } finally { setBusy(false) }
  }
  useEffect(() => { if (props.open) void load(); else { previewSequence.current++; setSelected(undefined); setSnapshot(undefined) } }, [props.open, props.documentId])
  const preview = async (revision: number) => {
    const sequence = ++previewSequence.current
    setSelected(revision); setSnapshot(undefined); setError('')
    try {
      const value = z.object({ snapshot: workbookSchema }).parse(await action('workbook.preview', { documentId: props.documentId, revision }))
      if (previewSequence.current === sequence) setSnapshot({ ...value.snapshot, locale: value.snapshot.locale as LocaleType } as IWorkbookData)
    } catch { if (previewSequence.current === sequence) setError(t('workbook.failed')) }
  }
  const restore = async () => {
    if (!selected || !props.canRestore || busy || !confirm) return
    setBusy(true); setError('')
    try {
      if (!attempt.current || attempt.current.kind !== confirm || attempt.current.revision !== selected || attempt.current.expectedRevision !== props.revision)
        attempt.current = { kind: confirm, revision: selected, expectedRevision: props.revision, requestId: crypto.randomUUID() }
      const { kind, ...input } = attempt.current
      await action(`workbook.${kind}`, { documentId: props.documentId, revision: input.revision, requestId: input.requestId,
        ...(kind === 'restore' ? { expectedRevision: input.expectedRevision } : {}) })
      await props.onRestored(); attempt.current = undefined
    } catch { setError(t(confirm === 'undo' ? 'workbook.undoFailed' : 'workbook.restoreFailed')) } finally { setBusy(false); setConfirm(null) }
  }
  return <>
    <Dialog open={props.open} onOpenChange={open => { if (!busy) props.onOpenChange(open) }}>
      <DialogContent className="workbook-history"><DialogHeader><DialogTitle>{t('workbook.history')}</DialogTitle>
        <DialogDescription>{t('workbook.historyDescription')}</DialogDescription></DialogHeader>
        {error && <p role="alert">{error}</p>}
        {props.dirty && <p role="status">{t('workbook.restoreDirty')}</p>}
        <div className="workbook-history-body"><aside aria-label={t('workbook.history')}>
          {items.map(item => <Button key={item.revision} variant={selected === item.revision ? 'secondary' : 'ghost'}
            aria-pressed={selected === item.revision} disabled={busy} onClick={() => void preview(item.revision)}>
            <span>{t('workbook.revision', { revision: item.revision })}{String(item.revision) === props.revision ? ` · ${t('workbook.current')}` : ''}</span>
            <small>{new Date(item.createdAt).toLocaleString()} · {item.source}</small>
          </Button>)}
          {cursor && <Button disabled={busy} variant="outline" onClick={() => void load(cursor)}>{t('workbook.moreHistory')}</Button>}
        </aside><section className="workbook-history-preview" aria-label={t('workbook.preview')}>
          {snapshot ? <WorkbookEngine key={selected} snapshot={snapshot} revision={selected ?? 0} canWrite={false} onDirty={noop} onToolbarHost={noop} onRibbon={noop} />
            : <p role="status">{t(selected ? 'workbook.loading' : 'workbook.chooseVersion')}</p>}
        </section></div>
        <DialogFooter>
          <Button variant="outline" disabled={!props.canRestore || !snapshot || busy || !items.find(item => item.revision === selected)?.canUndo}
            onClick={() => setConfirm('undo')}>{t('workbook.undoVersion')}</Button>
          <Button disabled={!props.canRestore || !snapshot || busy || String(selected) === props.revision}
            onClick={() => setConfirm('restore')}>{t('workbook.restore')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirm !== null} onOpenChange={open => { if (!open && !busy) setConfirm(null) }}><AlertDialogContent><AlertDialogHeader>
      <AlertDialogTitle>{t(confirm === 'undo' ? 'workbook.undoConfirm' : 'workbook.restoreConfirm', { revision: selected ?? '' })}</AlertDialogTitle>
      <AlertDialogDescription>{t(confirm === 'undo' ? 'workbook.undoDescription' : 'workbook.restoreDescription')}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel>
        <AlertDialogAction disabled={busy || !props.canRestore} onClick={event => { event.preventDefault(); void restore() }}>{t(confirm === 'undo' ? 'workbook.undoVersion' : 'workbook.restore')}</AlertDialogAction>
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>
}
