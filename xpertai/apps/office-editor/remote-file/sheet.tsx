import React, { useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import type { IWorkbookData } from '@univerjs/core'
import { Button, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@xpert-ai/plugin-shadcn-ui'
import { workbookSchema } from '../src/lib/workbooks/native-schema'
import { fileFormatSchema, type FileTarget } from '../src/lib/spreadsheets/file-contract'
import { action, command, onEditorEvent, closePrepared } from './bridge'
import { FileEngine, type FileEngineHandle } from './engine'
import { DownloadButton } from './download'
import { t, useLocale, i18n, useMessage } from './i18n'

const response = z.object({ limitation: z.literal('xls-formulas').optional(), format: fileFormatSchema, revision: z.string(), title: z.string(), canWrite: z.boolean(),
  snapshot: z.custom<IWorkbookData>(value => workbookSchema.safeParse(value).success) })
export function SheetEditor({ resourceId, target }: { resourceId: string; target: FileTarget }) {
  useLocale()
  const [state, setState] = useState<z.infer<typeof response> | null>(null)
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false)
  const [confirmReload, setConfirmReload] = useState(false), [error, setError] = useMessage('')
  const engine = useRef<FileEngineHandle>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    void action('file.read', target).then(raw => { if (alive.current) setState(response.parse(raw)) })
      .catch(error => { if (alive.current) setError(error instanceof Error ? error : i18n.message('bridge.requestFailed')) })
    return () => { alive.current = false }
  }, [target])
  useEffect(() => {
    void command('workbench.content.status', { resourceId, dirty: dirty || busy, title: state?.title,
      label: t(dirty ? 'sheet.unsaved' : 'sheet.saved') }).catch(() => undefined)
  }, [resourceId, dirty, busy, state?.title])
  useEffect(() => onEditorEvent(event => {
    if (event.kind === 'prepareClose' && event.resourceId === resourceId) closePrepared(event.requestId, !dirty && !busy)
  }), [resourceId, dirty, busy])
  async function load() {
    setBusy(true)
    try {
      const next = response.parse(await action('file.read', target))
      if (alive.current) { setState(next); setDirty(false); setError('') }
    } catch (error) { if (alive.current) setError(error instanceof Error ? error : i18n.message('bridge.requestFailed')) }
    finally { if (alive.current) setBusy(false) }
  }
  async function save() {
    if (!state || !engine.current || busy) return
    setBusy(true); setError('')
    try {
      const changes = await engine.current.changes()
      const saved = !('edits' in changes) || changes.edits.length
        ? z.object({ revision: z.string() }).parse(await action('file.save', { target, expectedRevision: state.revision, changes }))
        : { revision: state.revision }
      if (alive.current) {
        engine.current?.acceptSaved()
        setState({ ...state, revision: saved.revision }); setDirty(false)
      }
    } catch (error) {
      // An unacknowledged save must retain its original revision and edit state.
      // Never reload a new revision and silently reapply an uncertain request.
      if (alive.current) setError(error instanceof Error ? error : i18n.message('error.save'))
    } finally { if (alive.current) setBusy(false) }
  }
  if (!state) return <p role={error ? 'alert' : 'status'}>{error || t('sheet.loading')}</p>
  return <section className="file-editor" aria-label={t('sheet.label')}>
    <div className="toolbar"><h1>{state.title}</h1>
      {state.canWrite && <Button disabled={!dirty || busy} onClick={() => void save()}>{t('sheet.save')}</Button>}
      <DownloadButton fileKey={JSON.stringify(target)} disabled={busy} onError={error => setError(error instanceof Error ? error : i18n.message('error.download'))}>{t('sheet.download')}</DownloadButton>
      <Button disabled={busy} onClick={() => { if (dirty) setConfirmReload(true); else void load() }}>{t('sheet.reload')}</Button>
    </div>
    {state.limitation && <p role="status">{t('sheet.xlsFormulasReadOnly')}</p>}
    {error && <p role="alert">{error.includes('conflict') ? t('sheet.conflict') : error}</p>}
    <FileEngine key={state.snapshot.id} ref={engine} snapshot={state.snapshot} format={state.format} canWrite={state.canWrite} busy={busy} onDirty={() => setDirty(true)} onError={setError} />
    <AlertDialog open={confirmReload} onOpenChange={setConfirmReload}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('sheet.reloadTitle')}</AlertDialogTitle><AlertDialogDescription>{t('sheet.reloadDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => void load()}>{t('common.reload')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
}
