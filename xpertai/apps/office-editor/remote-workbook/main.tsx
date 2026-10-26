import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { LocaleType, type IWorkbookData } from '@univerjs/core'
import { z } from 'zod/v3'
import { Button, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { connect, action, command, notify, onEditorEvent, closePrepared } from '../remote-file/bridge'
import { t, i18n, useLocale, useMessage } from '../remote-file/i18n'
import { WorkbookEngine, type WorkbookHandle } from './engine'
import { WorkbookToolbar } from './toolbar'
import type { WorkbookRibbon } from '../src/lib/remote-components/office-editor-workbench/src/workbook-ribbon'

const selection = z.object({ selectionId: z.string().uuid(), parameters: z.object({ contentId: z.string().uuid().optional() }).passthrough().optional() })
const response = z.object({ documentId: z.string().uuid(), title: z.string(), revision: z.string(), canWrite: z.boolean(), sourcePath: z.string(),
  snapshot: z.object({ id: z.string(), name: z.string(), appVersion: z.string(), locale: z.nativeEnum(LocaleType), styles: z.record(z.object({}).passthrough().nullable()), sheetOrder: z.array(z.string()), sheets: z.record(z.object({}).passthrough()) }).passthrough(), catalogPending: z.boolean().optional() })
type State = z.infer<typeof response>
function workbookMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/version_conflict|409/.test(message)) return i18n.message('workbook.conflict')
  if (/access_denied|Forbidden|403/.test(message)) return i18n.message('workbook.accessDenied')
  return i18n.message('workbook.failed')
}
function App() {
  useLocale(); const [selected, setSelected] = useState<z.infer<typeof selection> | null>(null)
  useEffect(() => connect(query => { const parsed = selection.safeParse(query); if (parsed.success) setSelected(parsed.data) }), [])
  return selected ? <Editor key={selected.selectionId} documentId={selected.selectionId} contentId={selected.parameters?.contentId} /> : <p role="status">{t('workbook.choose')}</p>
}
function Editor({ documentId, contentId }: { documentId: string; contentId?: string }) {
  useLocale()
  const [state, setState] = useState<State | null>(null), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false)
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null)
  const [ribbon, setRibbon] = useState<WorkbookRibbon | null>(null)
  const [error, setError] = useMessage(''), [reloadOpen, setReloadOpen] = useState(false), [remoteChanged, setRemoteChanged] = useState(false)
  const editor = useRef<WorkbookHandle>(null), dirtyRef = useRef(false), busyRef = useRef(false), changes = useRef(0)
  const attempt = useRef<{ requestId: string; expectedRevision: string; snapshot: IWorkbookData; fingerprint: string }>()
  dirtyRef.current = dirty; busyRef.current = busy
  // Repeated polling failures keep one persistent status, without repeating toasts.
  // The host owns toast placement so messages cannot resize the spreadsheet iframe.
  useEffect(() => { if (error) notify('error', error) }, [error])
  const changed = () => { changes.current++; dirtyRef.current = true; setDirty(true) }
  const load = async () => {
    const value = response.parse(await action('workbook.read', { documentId }))
    setState(value); setDirty(false); dirtyRef.current = false; attempt.current = undefined; setRemoteChanged(false); setError('')
  }
  useEffect(() => { let active = true
    void action('workbook.read', { documentId }).then(raw => { if (active) setState(response.parse(raw)) }).catch(error => { if (active) setError(workbookMessage(error)) })
    return () => { active = false }
  }, [documentId])
  useEffect(() => {
    if (!state) return
    // Refresh clean clients after another member/Assistant saves. Never discard a
    // local draft, even when the host conversation or locale changes.
    let active = true, checking = false
    const timer = setInterval(async () => {
      if (document.hidden || busyRef.current || checking) return
      checking = true
      try {
        const latest = response.parse(await action('workbook.read', { documentId }))
        if (active && latest.canWrite !== state.canWrite) setState(current => current ? { ...current, canWrite: latest.canWrite } : current)
        if (active && latest.revision !== state.revision) {
          if (dirtyRef.current) setRemoteChanged(true)
          else { setState(latest); setRemoteChanged(false) }
        }
      } catch (e) { if (active && e instanceof Error && e.name !== 'AbortError') setError(workbookMessage(e)) }
      finally { checking = false }
    }, 10000)
    return () => { active = false; clearInterval(timer) }
  }, [documentId, state?.revision, state?.canWrite])
  useEffect(() => { void command('workbench.content.status', { resourceId: documentId, ...(contentId ? { contentId } : {}),
    title: state?.title, dirty: dirty || busy, label: t(dirty ? 'workbook.unsaved' : 'workbook.saved') }).catch(() => undefined) }, [documentId, contentId, dirty, busy, state?.title])
  useEffect(() => onEditorEvent(event => { if (event.kind === 'prepareClose' && (event.resourceId === documentId || event.resourceId === contentId)) closePrepared(event.requestId, !dirtyRef.current && !busyRef.current) }), [documentId, contentId])
  const save = async () => {
    if (!state || !editor.current || busyRef.current) return
    setBusy(true); busyRef.current = true; setError('')
    const generation = changes.current
    try {
      const snapshot = editor.current.snapshot(), fingerprint = JSON.stringify(snapshot)
      if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = { requestId: crypto.randomUUID(), expectedRevision: state.revision, snapshot, fingerprint }
      const { fingerprint: _fingerprint, ...input } = attempt.current
      const saved = response.parse(await action('workbook.save', { documentId, ...input }))
      attempt.current = undefined
      if (generation === changes.current) { setState(saved); setDirty(false); dirtyRef.current = false }
      else setState(current => current ? { ...current, revision: saved.revision } : saved)
      setRemoteChanged(false)
      if (saved.catalogPending) notify('success', t('workbook.indexPending'))
    } catch (e) { setError(workbookMessage(e)) }
    finally { setBusy(false); busyRef.current = false }
  }
  const downloadLocal = () => {
    if (!editor.current) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(editor.current.snapshot(), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `${state?.title ?? documentId}.univer.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const toolbar = <WorkbookToolbar title={state?.title ?? t(error ? 'workbook.titleFallback' : 'workbook.loading')}
      ribbon={ribbon}
      revision={state?.revision} canWrite={state?.canWrite} catalogPending={state?.catalogPending}
      dirty={dirty} busy={busy} error={error} remoteChanged={remoteChanged}
      onSave={() => void save()} onDownload={downloadLocal}
      onReload={() => { if (dirty) setReloadOpen(true); else void load().catch(error => setError(workbookMessage(error))) }} />
  return <main className="workbook-shell">
    {toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar}
    {state ? <WorkbookEngine ref={editor} snapshot={state.snapshot} canWrite={state.canWrite} onDirty={changed} onToolbarHost={setToolbarHost} onRibbon={setRibbon} />
      : error ? <div className="workbook-empty"><Button variant="outline" onClick={() => void load().catch(error => setError(workbookMessage(error)))}>{t('workbook.reload')}</Button></div>
      : <p role="status">{t('workbook.loading')}</p>}
    <AlertDialog open={reloadOpen} onOpenChange={setReloadOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('workbook.reloadTitle')}</AlertDialogTitle><AlertDialogDescription>{t('workbook.reloadDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => void load().catch(error => setError(workbookMessage(error)))}>{t('workbook.reload')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>
}
createRoot(document.getElementById('root')!).render(<RemoteI18nProvider i18n={i18n}><App /></RemoteI18nProvider>)
