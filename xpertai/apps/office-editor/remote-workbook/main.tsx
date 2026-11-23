import { createWorkbookDrafts, type DraftSummary, type PendingSave } from './local-drafts'
import { DraftRecovery } from './draft-recovery'
import { workbookChanges } from '../src/lib/workbooks/changes-schema'
import { useWorkbookCollaboration } from './collaboration'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { LocaleType } from '@univerjs/core'
import { z } from 'zod/v3'
import { Button, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { connect, action, command, notify, onEditorEvent, closePrepared, viewIdentity } from '../remote-file/bridge'
import { t, i18n, useLocale, useMessage } from '../remote-file/i18n'
import { WorkbookEngine, type WorkbookHandle } from './engine'
import { WorkbookToolbar } from './toolbar'
import { WorkbookHistory } from './history'
import { WorkbookFiles } from './files'
import { WorkbookStructure } from './structure'
import type { WorkbookSelection } from '../src/lib/workbooks/selection'
import type { StructuralOperation } from '../src/lib/workbooks/structure/model'
import type { WorkbookRibbon } from '../src/lib/remote-components/office-editor-workbench/src/workbook-ribbon'

import { xpertWorkbook, diffWorkbook, applyWorkbookOperations, mergeWorkbookOperations } from '../src/lib/workbooks/core'
import { fromUniver, toUniver } from '../src/lib/workbooks/univer-adapter'
import { calculatedSelectionContext, assertSelectionBasis } from '../src/lib/workbooks/calculated-selection'

const selection = z.object({ selectionId: z.string().uuid(), parameters: z.object({ contentId: z.string().uuid().optional() }).passthrough().optional() })
const response = z.object({ documentId: z.string().uuid(), title: z.string(), revision: z.string(), canWrite: z.boolean(), sourcePath: z.string(),
  workbook: xpertWorkbook, snapshot: z.object({ id: z.string(), name: z.string(), appVersion: z.string(), locale: z.nativeEnum(LocaleType), styles: z.record(z.object({}).passthrough().nullable()), sheetOrder: z.array(z.string()), sheets: z.record(z.object({}).passthrough()) }).passthrough(), catalogPending: z.boolean().optional() })
type State = z.infer<typeof response>
function workbookMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/local_draft/.test(message)) return i18n.message('workbook.localDraftFailed')
  if (/workbook_busy/.test(message)) return i18n.message('workbook.busyRetry')
  if (/version_conflict|409/.test(message)) return i18n.message('workbook.conflict')
  if (/access_denied|Forbidden|403/.test(message)) return i18n.message('workbook.accessDenied')
  return i18n.message('workbook.failed')
}
function App() {
  useLocale(); const [selected, setSelected] = useState<(z.infer<typeof selection> & { viewIdentity: string }) | null>(null)
  useEffect(() => connect(query => { const parsed = selection.safeParse(query); setSelected(parsed.success ? { ...parsed.data, viewIdentity: viewIdentity() } : null) }), [])
  return selected ? <Editor key={`${selected.selectionId}:${selected.viewIdentity}`} documentId={selected.selectionId} contentId={selected.parameters?.contentId} /> : <p role="status">{t('workbook.choose')}</p>
}
function Editor({ documentId, contentId }: { documentId: string; contentId?: string }) {
  useLocale()
  const [state, setState] = useState<State | null>(null), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false)
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null)
  const [ribbon, setRibbon] = useState<WorkbookRibbon | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [draftsOpen, setDraftsOpen] = useState(false), [draftList, setDraftList] = useState<DraftSummary[]>([])
  const [localSaved, setLocalSaved] = useState(false), [editGeneration, setEditGeneration] = useState(0)
  const drafts = useMemo(() => createWorkbookDrafts(documentId), [documentId])
  const [filesOpen, setFilesOpen] = useState(false), [exportSheet, setExportSheet] = useState<string>()
  const [structureOpen, setStructureOpen] = useState(false), [structureSelection, setStructureSelection] = useState<WorkbookSelection | null>(null)
  const [highlights, setHighlights] = useState<Array<{ sheetId: string; row: number; column: number }>>([])
  const [error, setError] = useMessage(''), [reloadOpen, setReloadOpen] = useState(false), [remoteChanged, setRemoteChanged] = useState(false)
  const editor = useRef<WorkbookHandle>(null), dirtyRef = useRef(false), busyRef = useRef(false), changes = useRef(0)
  const attempt = useRef<PendingSave>()
  const retryBlocked = useRef(false), mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])
  const latestState = useRef(state); latestState.current = state
  const collaboration = useWorkbookCollaboration(documentId, () => {
    const cells = editor.current?.selection(), baseRevision = Number(latestState.current?.revision)
    // Imported/native structural drafts have no canonical coordinate basis until saved.
    return cells && !dirtyRef.current && !busyRef.current && Number.isSafeInteger(baseRevision) && baseRevision > 0
      ? { ...cells, baseRevision } : null
  })
  const connected = useRef(collaboration.connection); connected.current = collaboration.connection
  const checkRemote = useRef<() => void>(() => {})
  const contextKey = useRef(`workbook:${documentId}:${viewIdentity()}`).current
  const contextPublished = useRef(false)
  const clearContext = async () => {
    if (!contextPublished.current) return
    await command('assistant.context.set', { key: contextKey, clear: true })
    contextPublished.current = false
  }
  useEffect(() => () => { void clearContext().catch(() => undefined) }, [contextKey])
  dirtyRef.current = dirty; busyRef.current = busy
  // Repeated polling failures keep one persistent status, without repeating toasts.
  // The host owns toast placement so messages cannot resize the spreadsheet iframe.
  useEffect(() => { if (error) notify('error', error) }, [error])
  const changed = () => { changes.current++; dirtyRef.current = true; setDirty(true); setLocalSaved(false); setEditGeneration(value => value + 1) }
  const load = async () => {
    const value = response.parse(await action('workbook.read', { documentId }))
    await drafts.clear()
    setLocalSaved(false); setState(value); setDirty(false); dirtyRef.current = false; attempt.current = undefined; setRemoteChanged(false); setError('')
  }
  useEffect(() => { let active = true
    void drafts.list().then(items => { if (active) setDraftList(items) }).catch(() => { if (active) setError(i18n.message('workbook.localDraftFailed')) })
    void action('workbook.read', { documentId }).then(raw => { if (active) setState(response.parse(raw)) }).catch(error => { if (active) setError(workbookMessage(error)) })
    return () => { active = false }
  }, [documentId])
  useEffect(() => {
    let active = true, checking = false, pending = false, lastCheck = 0
    const check = async () => {
      if (!active || !latestState.current || document.hidden || busyRef.current) return
      if (checking) { pending = true; return }
      checking = true; lastCheck = Date.now()
      try {
        const head = z.object({ revision: z.string(), canWrite: z.boolean() }).parse(await action('workbook.head', { documentId }))
        if (!active) return
        setState(current => current && current.canWrite !== head.canWrite ? { ...current, canWrite: head.canWrite } : current)
        const before = latestState.current
        if (!before || Number(head.revision) <= Number(before.revision)) return
        if (dirtyRef.current || busyRef.current) { setRemoteChanged(true); return }
        let workbook = before.workbook, cursor = Number(before.revision), latest: State | undefined
        for (let page = 0; page < 2; page++) {
          const delta = workbookChanges.parse(await action('workbook.changes', { documentId, after: cursor }))
          if (!active) return
          if (delta.reset) { latest = response.parse(await action('workbook.read', { documentId })); break }
          for (const change of delta.items) {
            if (change.revision !== cursor + 1) throw new Error('office.version_conflict')
            workbook = applyWorkbookOperations(workbook, change.operations); cursor = change.revision
          }
          if (!delta.more) {
            latest = { ...before, title: delta.title, sourcePath: delta.sourcePath, canWrite: delta.canWrite,
              revision: String(cursor), workbook, snapshot: response.shape.snapshot.parse(toUniver(workbook)) }
            break
          }
        }
        if (!latest) { pending = true; return }
        if (!active) return
        if (dirtyRef.current || busyRef.current) { setRemoteChanged(true); return }
        if (Number(latest.revision) > Number(latestState.current?.revision ?? 0)) {
          setHighlights(diffWorkbook(before.workbook, latest.workbook).flatMap(op => op.kind === 'set_cell' ? [op] : []).slice(0, 200))
          latestState.current = latest; setState(latest); setRemoteChanged(false)
        }
      } catch (error) { if (active && error instanceof Error && error.name !== 'AbortError') setError(workbookMessage(error)) }
      finally { checking = false; if (active && pending) { pending = false; void check() } }
    }
    checkRemote.current = () => void check()
    const timer = setInterval(() => {
      if (connected.current !== 'connected' || Date.now() - lastCheck >= 15000) void check()
    }, 2000)
    return () => { active = false; checkRemote.current = () => {}; clearInterval(timer) }
  }, [documentId])
  useEffect(() => {
    if (collaboration.revision > Number(state?.revision ?? 0)) checkRemote.current()
  }, [collaboration.revision, state?.revision, busy])
  useEffect(() => { void command('workbench.content.status', { resourceId: documentId, ...(contentId ? { contentId } : {}),
    title: state?.title, dirty: dirty || busy, label: t(dirty ? 'workbook.unsaved' : 'workbook.saved') }).catch(() => undefined) }, [documentId, contentId, dirty, busy, state?.title])
  useEffect(() => onEditorEvent(event => {
    if (event.kind !== 'prepareClose' || (event.resourceId !== documentId && event.resourceId !== contentId)) return
    if (dirtyRef.current || busyRef.current) { closePrepared(event.requestId, false); return }
    void clearContext().catch(() => undefined).finally(() => closePrepared(event.requestId, true))
  }), [documentId, contentId, contextKey])
  const persist = async () => {
    const base = latestState.current
    if (!base || !editor.current || !dirtyRef.current) return
    const generation = changes.current
    await drafts.persist({ format: 'xpert.workbook.local-draft@1', documentId,
      baseRevision: Number(base.revision), base: base.workbook,
      draft: fromUniver(editor.current.snapshot()), pending: attempt.current })
    if (mounted.current && generation === changes.current) setLocalSaved(true)
  }
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => { if (busyRef.current) return; void persist().catch(() => setError(i18n.message('workbook.localDraftFailed'))) }, 300)
    return () => clearTimeout(timer)
  }, [editGeneration, dirty, state?.revision])
  const save = async () => {
    if (!state || !editor.current || busyRef.current) return
    setBusy(true); busyRef.current = true; setError('')
    try {
      const workbook = fromUniver(editor.current.snapshot())
      if (!attempt.current) {
        const operations = diffWorkbook(state.workbook, workbook)
        if (!operations.length) { await drafts.clear(); setDirty(false); dirtyRef.current = false; return }
        attempt.current = { submission: { protocol: state.workbook.axes ? 'xpert.workbook.operations@2' : 'xpert.workbook.operations@1', requestId: crypto.randomUUID(),
          baseRevision: Number(state.revision), operations }, workbook }
      }
      // Durable intent precedes HTTP. A lost response must retry this exact request,
      // including when the user edits again before clicking Save a second time.
      await persist()
      if (!navigator.onLine) return
      const pending = attempt.current
      const saved = response.parse(await action('workbook.submit', { documentId, submission: pending.submission }))
      if (!mounted.current) return
      const after = fromUniver(editor.current.snapshot())
      const remainder = diffWorkbook(pending.workbook, after)
      const rebased = remainder.length ? mergeWorkbookOperations(pending.workbook, [saved.workbook], remainder) : saved.workbook
      if (remainder.length) {
        await drafts.persist({ format: 'xpert.workbook.local-draft@1', documentId, baseRevision: Number(saved.revision),
          base: saved.workbook, draft: rebased })
      } else await drafts.clear()
      attempt.current = undefined; retryBlocked.current = false
      latestState.current = saved
      const nextSnapshot = remainder.length ? response.shape.snapshot.parse(toUniver(rebased)) : saved.snapshot
      const retained = editor.current.acceptSavedSnapshot(nextSnapshot)
      setState({ ...saved, snapshot: retained ? state.snapshot : nextSnapshot })
      setDirty(Boolean(remainder.length)); dirtyRef.current = Boolean(remainder.length)
      setLocalSaved(Boolean(remainder.length)); setRemoteChanged(false)
      if (saved.catalogPending) notify('success', t('workbook.indexPending'))
    } catch (e) {
      retryBlocked.current = e instanceof Error && /version_conflict|request_conflict|403|409|access_denied/.test(e.message)
      if (mounted.current) setError(workbookMessage(e))
    } finally { if (mounted.current) setBusy(false); busyRef.current = false }
  }
  const saveRef = useRef(save); saveRef.current = save
  const applyStructure = async (operation: StructuralOperation) => {
    const base = latestState.current
    if (!base || !base.canWrite || dirtyRef.current || busyRef.current) throw new Error('office.version_conflict')
    const requestId = crypto.randomUUID()
    const submission = { protocol: 'xpert.workbook.operations@2' as const, requestId, baseRevision: Number(base.revision),
      operations: [{ kind: 'transform_structure' as const, operation, identitySeed: requestId }] }
    // The pure reducer validates dependencies and data-loss rules before staging.
    const workbook = applyWorkbookOperations(base.workbook, submission.operations)
    setBusy(true); busyRef.current = true
    try {
      await drafts.persist({ format: 'xpert.workbook.local-draft@1', documentId, baseRevision: Number(base.revision),
        base: base.workbook, draft: workbook, pending: { submission, workbook } })
      attempt.current = { submission, workbook }; retryBlocked.current = false
      setState({ ...base, snapshot: response.shape.snapshot.parse(toUniver(workbook)) }); changed(); setLocalSaved(true)
      if (!navigator.onLine) return
      try {
        const saved = response.parse(await action('workbook.submit', { documentId, submission }))
        if (!mounted.current) return
        await drafts.clear(); attempt.current = undefined; latestState.current = saved
        setState(saved); setDirty(false); dirtyRef.current = false; setLocalSaved(false); setRemoteChanged(false); setError('')
      } catch (error) {
        retryBlocked.current = error instanceof Error && /version_conflict|request_conflict|403|409|access_denied|unsupported|workbook_invalid/.test(error.message)
        setError(workbookMessage(error))
      }
    } finally { if (mounted.current) setBusy(false); busyRef.current = false }
  }
  useEffect(() => {
    const timer = setInterval(() => {
      if (attempt.current && !retryBlocked.current && dirtyRef.current && !busyRef.current && connected.current === 'connected')
        void saveRef.current()
    }, 15000)
    return () => clearInterval(timer)
  }, [])
  const recoverDraft = async (id: string) => {
    if (dirtyRef.current || busyRef.current || !state) return
    setBusy(true); busyRef.current = true
    try {
      const head = response.parse(await action('workbook.read', { documentId }))
      const recovered = await drafts.read(id)
      if (!mounted.current) return
      const restored = { ...head, revision: String(recovered.baseRevision), workbook: recovered.base,
        snapshot: response.shape.snapshot.parse(toUniver(recovered.draft)) }
      attempt.current = recovered.pending; retryBlocked.current = false
      latestState.current = restored; setState(restored); changed(); setLocalSaved(true)
      setRemoteChanged(head.revision !== restored.revision); setDraftsOpen(false)
      setDraftList(await drafts.list())
    } catch (error) { setError(workbookMessage(error)) }
    finally { if (mounted.current) setBusy(false); busyRef.current = false }
  }
  const downloadLocal = () => {
    if (!editor.current) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(editor.current.snapshot(), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `${state?.title ?? documentId}.univer.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const referenceSelection = async () => {
    if (!state || !editor.current) return
    try {
      const basis = { documentId, revision: state.revision, generation: changes.current }
      const range = editor.current.selection()
      if (!range) { notify('error', t('workbook.selectCells')); return }
      const snapshot = await editor.current.calculatedSnapshot()
      if (!mounted.current || !latestState.current) return
      assertSelectionBasis(basis, { documentId: latestState.current.documentId, revision: latestState.current.revision, generation: changes.current })
      const context = calculatedSelectionContext(snapshot, range, state.revision, dirtyRef.current, basis.generation)
      await command('assistant.context.set', { key: contextKey, context })
      contextPublished.current = true
      notify('success', t(context.truncated ? 'workbook.selectionLimited' : 'workbook.selectionReferenced'))
    } catch { notify('error', t('workbook.selectionCalculationFailed')) }
  }
  const toolbar = <WorkbookToolbar title={state?.title ?? t(error ? 'workbook.titleFallback' : 'workbook.loading')}
      ribbon={ribbon} connection={collaboration.connection} collaborators={collaboration.peers.map(peer => peer.displayName)}
      revision={state?.revision} canWrite={state?.canWrite} catalogPending={state?.catalogPending}
      queued={Boolean(attempt.current)} localSaved={localSaved} localDraftCount={draftList.length}
      onLocalDrafts={() => { void drafts.list().then(items => { setDraftList(items); setDraftsOpen(true) }).catch(error => setError(workbookMessage(error))) }}
      dirty={dirty} busy={busy} error={error} remoteChanged={remoteChanged}
      onSave={() => void save()} onDownload={downloadLocal}
      onHistory={() => setHistoryOpen(true)}
      onReference={() => void referenceSelection()} changedCells={highlights.length}
      onFiles={() => { setExportSheet(editor.current?.selection()?.sheetId); setFilesOpen(true) }}
      onStructure={() => { setStructureSelection(editor.current?.selection() ?? null); setStructureOpen(true) }}
      onReload={() => { if (dirty) setReloadOpen(true); else void load().catch(error => setError(workbookMessage(error))) }} />
  return <main className="workbook-shell">
    {state && <WorkbookStructure key={`${structureSelection?.sheetId}:${structureOpen}`} open={structureOpen} onOpenChange={setStructureOpen}
      selection={structureSelection} sheetTitle={state.workbook.sheets[structureSelection?.sheetId ?? '']?.title ?? ''} onApply={applyStructure} />}
    <DraftRecovery open={draftsOpen} onOpenChange={setDraftsOpen} drafts={draftList} disabled={dirty || busy}
      onRestore={recoverDraft} onRemove={async item => {
        try { await drafts.remove(item); setDraftList(await drafts.list()) } catch (error) { setError(workbookMessage(error)) }
      }} />
    {state && <WorkbookFiles open={filesOpen} onOpenChange={setFilesOpen} documentId={documentId} revision={state.revision}
      canWrite={state.canWrite && !busy} dirty={dirty || busy} sheetId={exportSheet}
      onImported={snapshot => { setState({ ...state, snapshot: response.shape.snapshot.parse(snapshot) }); setHighlights([]); changed() }} />}
    {state && <WorkbookHistory open={historyOpen} onOpenChange={setHistoryOpen} documentId={documentId}
      revision={state.revision} canRestore={state.canWrite && !dirty && !busy} dirty={dirty}
      onRestored={async () => { await load(); setHistoryOpen(false) }} />}
    {toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar}
    {state ? <WorkbookEngine ref={editor} snapshot={state.snapshot} canWrite={state.canWrite && !busy} onDirty={changed} onToolbarHost={setToolbarHost} onRibbon={setRibbon} highlights={highlights} peers={collaboration.peers} revision={dirty || busy ? 0 : Number(state.revision)} />
      : error ? <div className="workbook-empty"><Button variant="outline" onClick={() => void load().catch(error => setError(workbookMessage(error)))}>{t('workbook.reload')}</Button></div>
      : <p role="status">{t('workbook.loading')}</p>}
    <AlertDialog open={reloadOpen} onOpenChange={setReloadOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('workbook.reloadTitle')}</AlertDialogTitle><AlertDialogDescription>{t('workbook.reloadDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => void load().catch(error => setError(workbookMessage(error)))}>{t('workbook.reload')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>
}
createRoot(document.getElementById('root')!).render(<RemoteI18nProvider i18n={i18n}><App /></RemoteI18nProvider>)
