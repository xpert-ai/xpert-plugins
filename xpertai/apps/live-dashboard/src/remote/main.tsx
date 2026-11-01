import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod/v3'
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, Button, Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, RefreshCw, Save, Badge } from '@xpert-ai/plugin-shadcn-ui'
import { dashboardSchema, type DashboardManifest } from '../lib/dashboard.schema'
import { dashboardSummarySchema as summarySchema, dashboardSavedSchema as savedSchema, dashboardViewDataSchema as listSchema } from '../lib/dashboard-view.schema'
import { startBridge, requestHost, selectDashboard, navigateDashboard, onPrepareClose, isViewVisible } from './bridge'
import { messages, i18n } from './i18n'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { dashboardNavigationSchema, dashboardNavigationKey } from '../lib/dashboard-navigation'
import type { DashboardMode } from '../lib/project'
import './style.css'
import { HtmlDashboard, type HtmlDashboardHandle } from './html-dashboard'
import { ToolbarMenu } from './toolbar-menu'
import { DashboardPicker } from './dashboard-picker'
import { ShareDialog } from './share-dialog'
import { ViewerControls } from './viewer-controls'
import { installArtifactDocumentFramePolicy } from '@xpert-ai/plugin-sdk/artifact-document'

installArtifactDocumentFramePolicy(document)

declare global { interface Window { __ANALYTICS_RENDERER_HTML__: string; __DASHBOARD_READ_ONLY__?: boolean } }
const readOnly = window.__DASHBOARD_READ_ONLY__ === true
const actionSchema = z.object({ success: z.literal(true), data: z.unknown() })
const queryResultSchema = z.object({ payload: z.unknown(), failures: z.array(z.object({ bindingId: z.string(), datasetId: z.string(), reason: z.literal('unavailable') })).default([]), datasets: z.array(z.object({ completeness: z.object({ truncated: z.boolean() }), freshness: z.object({ sourceFetchedAt: z.string() }) })) })
type Summary = z.infer<typeof summarySchema>
type Saved = z.infer<typeof savedSchema>
type ControlValue = string | number | boolean | null

function App() {
  const [t, setMessages] = React.useState(() => messages('en-US'))
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const pickerNavigation = React.useRef(false)
  const [list, setList] = React.useState<Summary[]>([])
  const [access, setAccess] = React.useState({ project: false, archived: false, canReadDraft: false, canEdit: false, canManage: false })
  const [currentProject, setCurrentProject] = React.useState<z.infer<typeof listSchema>['meta']['currentProject']>(null)
  const [mode, setMode] = React.useState<DashboardMode>('published')
  const modeRef = React.useRef<DashboardMode>()
  const [notice, setNotice] = React.useState('')
  const [pagination, setPagination] = React.useState({ page: 1, pageSize: 50, hasMore: false })
  const canEdit = !readOnly && access.canEdit
  const canManage = !readOnly && access.canManage
  const [sources, setSources] = React.useState<z.infer<typeof listSchema>['meta']['sources']>([])
  const [saved, setSaved] = React.useState<Saved | null>(null)
  const [versions, setVersions] = React.useState<Summary[]>([])
  const [controls, setControls] = React.useState<Record<string, ControlValue>>({})
  const [html, setHtml] = React.useState('')
  const [busy, setBusy] = React.useState(true)
  const [error, setError] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [refreshSeconds, setRefreshSeconds] = React.useState('off')
  const [editor, setEditor] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<Summary | null>(null)
  const [deleteError, setDeleteError] = React.useState('')
  const [deleting, setDeleting] = React.useState(false)
  const [confirmPublish, setConfirmPublish] = React.useState<Saved | null>(null)
  const [partial, setPartial] = React.useState(false)
  const [unavailableDatasets, setUnavailableDatasets] = React.useState<string[]>([])
  const [sharing, setSharing] = React.useState(false)
  const requestSequence = React.useRef(0), operationSequence = React.useRef(0)
  const listSequence = React.useRef(0)
  const activeArtifactId = React.useRef<string>()
  const navigationTarget = React.useRef<z.infer<typeof listSchema>['meta']['navigationTarget']>()
  const navigationKey = React.useRef<string>()
  const htmlDashboard = React.useRef<HtmlDashboardHandle>(null)

  const editRef = React.useRef({ dirty: false, resourceId: '' })
  const isDirty = editor !== null && editor !== JSON.stringify(saved?.manifest, null, 2)
  editRef.current = { dirty: isDirty || busy && editor !== null, resourceId: saved?.artifactId ?? '' }
  const reportDirty = (dirty: boolean) => { if (saved) void requestHost('invokeClientCommand', { commandKey: 'workbench.content.status', payload: { resourceId: saved.artifactId, title: saved.title, dirty } }).catch(() => undefined) }
  React.useEffect(() => { reportDirty(isDirty || busy && editor !== null) }, [isDirty, busy, editor === null, saved?.artifactId, saved?.title])
  React.useEffect(() => onPrepareClose(id => id !== editRef.current.resourceId || !editRef.current.dirty), [])
  function clearDocument() {
    activeArtifactId.current = undefined
    setNotice(''); setHtml(''); setUnavailableDatasets([]); setSaved(null); setEditor(null); setVersions([])
    setSharing(false); setConfirmPublish(null); setConfirmDelete(null); setDeleteError('')
    setControls({}); setStatus(''); setPartial(false)
  }
  function selectEditorTarget(target: Parameters<typeof selectDashboard>[0]) {
    return selectDashboard(target)
  }
  async function load(artifactId?: string, versionId?: string, requestedMode = modeRef.current, page = 1, draftRevision?: number) {
    const sequence = requestSequence.current
    const listRequest = ++listSequence.current
    const result = listSchema.parse(await requestHost('requestData', { query: { page, pageSize: 50, parameters: { ...(draftRevision ? { draftRevision } : {}), ...(artifactId ? { artifactId } : {}), ...(versionId ? { versionId } : {}), ...(requestedMode ? { mode: requestedMode } : {}) } } })).meta
    if (sequence === requestSequence.current && listRequest === listSequence.current) { setList(previous => page === 1 ? result.dashboards : [...previous, ...result.dashboards.filter(item => !previous.some(old => old.artifactId === item.artifactId))]); setSources(result.sources); navigationTarget.current = result.navigationTarget; setCurrentProject(result.currentProject ?? null); if (result.access) setAccess(result.access); if (result.pagination) setPagination(result.pagination); if (result.mode) { modeRef.current = result.mode; setMode(result.mode) } }
    return result
  }
  async function query(target: Saved, values: Record<string, ControlValue>) {
    const sequence = ++requestSequence.current
    if (!target.versionId && !target.draftRevision) throw new Error('Missing saved definition')
    setHtml(''); setUnavailableDatasets([]); setStatus(''); setPartial(false)
    if (!target.manifest.bindings.length) return
    const result = queryResultSchema.parse(actionSchema.parse(await requestHost('executeAction', { actionKey: 'query', input: { artifactId: target.artifactId, versionId: target.versionId ?? undefined, ...(target.isDraft ? { draftRevision: target.draftRevision } : {}), controls: values } })).data)
    if (sequence !== requestSequence.current) return
    setUnavailableDatasets(result.failures.map(failure => failure.datasetId));
    setHtml(result.datasets.length ? rendererHtml(result.payload) : ''); setPartial(result.datasets.some((dataset) => dataset.completeness.truncated))
    setStatus(result.datasets.map((dataset) => dataset.freshness.sourceFetchedAt).sort()[0] ?? '')
  }
  async function open(artifactId: string, versionId?: string, reflectNavigation = true, requestedMode = modeRef.current, draftRevision?: number) {
    const sequence = ++requestSequence.current
    clearDocument()
    activeArtifactId.current = artifactId
    const result = await load(artifactId, versionId, requestedMode, 1, draftRevision), target = result.saved
    if (sequence !== requestSequence.current) return
    if (result.notice === 'not_published') {
      setNotice(t.notPublished)
      if (!readOnly) { await selectEditorTarget(null); if (reflectNavigation) await navigateDashboard(result.navigationTarget, artifactId, undefined, result.mode) }
      return
    }
    if (!target || !target.versionId && !target.draftRevision) throw new Error('Dashboard is unavailable')
    const defaults = Object.fromEntries(target.manifest.controls.filter((control) => control.defaultValue !== undefined).map((control) => [control.controlId, control.defaultValue ?? null]))
    setSaved(target); setVersions(result.versions ?? []); setControls(defaults); setStatus(''); setPartial(false)
    if (!readOnly && reflectNavigation) {
      navigationKey.current = dashboardNavigationKey({ artifactId, versionId, mode: result.mode })
      await navigateDashboard(result.navigationTarget, artifactId, versionId, result.mode)
      if (sequence !== requestSequence.current) return
    }
    if (!readOnly) await selectEditorTarget({ artifactId: target.artifactId,
      ...(result.mode === 'published' ? { versionId: target.versionId ?? undefined } : { draftRevision: target.draftRevision }) })
    if (sequence !== requestSequence.current) return
    if (!target.manifest.presentation && target.manifest.bindings.length) await query(target, defaults)
  }
  async function run(work: () => Promise<void>) {
    const operation = ++operationSequence.current
    setBusy(true); setError('')
    try { await work() } catch (error) { if (operation === operationSequence.current) setError(error instanceof Error && error.message === 'DASHBOARD_DRAFT_ACCESS_DENIED' ? t.draftAccessDenied : error instanceof Error ? error.message : t.error) } finally { if (operation === operationSequence.current) setBusy(false) }
  }
  const autoRefresh = React.useRef({ saved, controls, busy, editor, confirmDelete })
  autoRefresh.current = { saved, controls, busy, editor, confirmDelete }
  React.useEffect(() => {
    if (refreshSeconds === 'off') return
    let stopped = false, pending = false
    const refresh = async () => {
      const current = autoRefresh.current
      if (stopped || !isViewVisible() || pending || current.busy || current.confirmDelete || current.editor !== null || !current.saved?.manifest.bindings.length) return
      pending = true
      try {
        if (current.saved.manifest.presentation) htmlDashboard.current?.refresh()
        else await query(current.saved, current.controls)
      } catch { if (!stopped) setError(t.error) }
      finally { pending = false }
    }
    const timer = window.setInterval(() => void refresh(), Number(refreshSeconds) * 1000)
    document.addEventListener('visibilitychange', refresh)
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [refreshSeconds, saved?.artifactId, t.error])
  async function openPicker(explicitNew = false) {
    const sequence = ++requestSequence.current
    clearDocument()
    const result = await load(undefined, undefined, explicitNew ? 'draft' : undefined)
    if (sequence !== requestSequence.current) return
    // A share response already resolves one authorized immutable target; it is not a picker fallback.
    if (readOnly && result.saved) {
      await open(result.saved.artifactId, result.saved.versionId ?? undefined, false)
      return
    }
    if (explicitNew && !readOnly) await selectEditorTarget(null)
  }
  React.useEffect(() => startBridge((locale, query) => {
    setMessages(messages(locale))
    const parsed = dashboardNavigationSchema.safeParse(query ?? {})
    if (!parsed.success) {
      ++requestSequence.current; navigationKey.current = undefined; clearDocument()
      void run(async () => { throw new Error('DASHBOARD_NAVIGATION_INVALID') })
      return
    }
    const target = parsed.data, key = dashboardNavigationKey(target)
    if (key === navigationKey.current) return
    navigationKey.current = key
    pickerNavigation.current = !!target.picker
    setPickerOpen(!!target.picker)
    void run(() => target.artifactId ? open(target.artifactId, target.versionId, false, target.mode, target.draftRevision) : openPicker(target.newDashboard))
  },
    (artifactId) => {
      if (editRef.current.dirty || activeArtifactId.current !== artifactId) { void load(); return }
      void run(() => open(artifactId, undefined, true, 'draft'))
    }, () => { ++requestSequence.current; ++operationSequence.current; ++listSequence.current; setBusy(false); setList([]); setCurrentProject(null); modeRef.current = undefined; navigationKey.current = undefined; clearDocument() }), [])

  async function save() {
    const manifest = dashboardSchema.parse(JSON.parse(editor ?? ''))
    const expectedVersionId = saved?.manifest.id === manifest.id ? saved.versionId ?? null : null
    const result = summarySchema.parse(actionSchema.parse(await requestHost('executeAction', { actionKey: 'save', input: { manifest, expectedVersionId, expectedRevision: saved?.manifest.id === manifest.id ? saved.draftRevision ?? 0 : 0 } })).data)
    await open(result.artifactId, undefined, true, 'draft')
  }
  async function publish() {
    if (!confirmPublish?.draftRevision) return
    const result = summarySchema.parse(actionSchema.parse(await requestHost('executeAction', { actionKey: 'publish', input: {
      artifactId: confirmPublish.artifactId, expectedRevision: confirmPublish.draftRevision, expectedCurrentVersionId: confirmPublish.baseVersionId ?? confirmPublish.versionId ?? null, confirmed: true
    } }).catch(error => {
      if (error instanceof Error && error.message === 'DASHBOARD_PUBLISH_SHARE_BLOCKED') {
        setConfirmPublish(null)
        throw new Error(t.publishShareBlocked)
      }
      throw error
    })).data)
    setConfirmPublish(null)
    await open(result.artifactId, result.versionId ?? undefined, true, 'published')
  }
  async function deleteDashboard() {
    const target = confirmDelete
    if (deleting || !target?.canDelete || !target.draftRevision) return
    setDeleteError(''); setDeleting(true)
    try {
      const receipt = z.object({ artifactId: z.literal(target.artifactId) }).parse(actionSchema.parse(await requestHost('executeAction', {
        actionKey: 'delete', input: { artifactId: target.artifactId, expectedRevision: target.draftRevision, confirmed: true }
      })).data)
      setConfirmDelete(null)
      setList(items => items.filter(item => item.artifactId !== receipt.artifactId))
      // Include a pending reopen of this dashboard, but preserve navigation to another one.
      if (activeArtifactId.current === receipt.artifactId) {
        ++requestSequence.current
        clearDocument()
        navigationKey.current = dashboardNavigationKey({ artifactId: undefined, versionId: undefined })
        await Promise.all([selectEditorTarget(null), navigateDashboard(navigationTarget.current)])
      }
      await load()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : t.error)
      throw error
    } finally { setDeleting(false) }
  }
  async function switchProject(projectId: string) {
    if (projectId === currentProject?.id) return
    const result = await requestHost('invokeClientCommand', { commandKey: 'workbench.navigation.open', payload: {
      target: 'assistant.project', projectId, viewKey: 'live-dashboard__live-dashboard', parameters: { picker: 'dashboards' }
    } })
    if (!z.object({ success: z.literal(true) }).safeParse(result).success) throw new Error(t.projectSwitchFailed)
  }
  function togglePicker(open: boolean) {
    setPickerOpen(open)
    if (!open && pickerNavigation.current) {
      pickerNavigation.current = false
      navigationKey.current = dashboardNavigationKey({ artifactId: undefined, versionId: undefined })
      void requestHost('invokeClientCommand', { commandKey: 'workbench.navigation.open', payload: { ...navigationTarget.current, parameters: {} } }).catch(() => undefined)
    }
  }
  const toolbar = <header className="dashboard-toolbar border-b">
      <h1 className={readOnly ? 'toolbar-title text-base font-semibold' : 'sr-only'}>{readOnly ? saved?.title ?? t.title : t.title}</h1>
      {!readOnly && <DashboardPicker value={saved?.artifactId ?? ''} selectedTitle={saved?.title} project={currentProject ?? null} disabled={busy || deleting || editor !== null}
        open={pickerOpen} onOpenChange={togglePicker} t={t} onProjectChange={id => void run(() => switchProject(id))}
        onChange={id => { setPickerOpen(false); pickerNavigation.current = false; void run(() => open(id)) }} onNew={canEdit ? () => { setPickerOpen(false); pickerNavigation.current = false; void run(async () => { await openPicker(true); navigationKey.current = dashboardNavigationKey({ artifactId: undefined, versionId: undefined, newDashboard: true }); await navigateDashboard(navigationTarget.current) }) } : undefined}/ >}
      {saved && <Badge variant="secondary" className="toolbar-version" role="status">{saved.isDraft ? i18n.t('draftRevision', { revision: saved.draftRevision ?? '—' }) : i18n.t('publishedVersion', { version: saved.versionNumber ?? '—' })}</Badge>}
      <div className="toolbar-actions">
        {canManage && saved?.isDraft && <Button disabled={busy || editor !== null || !saved.manifest.bindings.length} onClick={() => setConfirmPublish(saved)} aria-label={t.publish} title={t.publish}><Save/><span>{t.publish}</span></Button>}
        <Button variant="ghost" size="icon" disabled={busy || editor !== null} aria-label={t.refresh} title={t.refresh} onClick={() => { if (saved?.manifest.presentation) { setError(''); htmlDashboard.current?.refresh() } else void run(async () => { if (saved) { await load(); await query(saved, controls) } else await openPicker() }) }}>
          <RefreshCw className={busy ? 'motion-safe:animate-spin' : undefined}/>
        </Button>
        <ToolbarMenu t={t} disabled={busy || deleting || editor !== null} canEdit={canEdit} hasDashboard={!!saved} canShare={canManage && !!saved}
          canDelete={canManage && !!saved && !!list.find(item => item.artifactId === saved.artifactId)?.canDelete} versions={versions} version={saved?.isDraft ? 'draft' : saved?.versionId ?? undefined}
          onVersion={!readOnly && access.canReadDraft && saved ? id => void run(() => open(saved.artifactId, id === 'draft' ? undefined : id, true, id === 'draft' ? 'draft' : 'published')) : undefined}
          onEdit={() => void run(async () => {
            if (!saved) return
            const result = await load(saved.artifactId, undefined, 'draft')
            if (!result.saved) throw new Error(t.error)
            await selectEditorTarget({ artifactId: result.saved.artifactId, draftRevision: result.saved.draftRevision }); setSaved(result.saved); setVersions(result.versions ?? []); setEditor(JSON.stringify(result.saved.manifest, null, 2))
          })}
          onImport={() => setEditor('')} onShare={() => setSharing(true)}
          onDelete={() => { setDeleteError(''); setConfirmDelete(list.find(item => item.artifactId === saved?.artifactId) ?? null) }}
          refreshSeconds={refreshSeconds} onRefreshSeconds={setRefreshSeconds} updatedAt={status}/>
      </div>
    </header>
  const filters = saved && !saved.manifest.presentation && !!saved.manifest.controls.length && <section className="flex flex-wrap items-end gap-3 border-b px-4 py-3">
    {saved.manifest.controls.map((control) => <Filter key={control.controlId} control={control} value={controls[control.controlId] ?? null} disabled={busy} onChange={(value) => setControls((current) => ({ ...current, [control.controlId]: value }))}/>)}
    <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => query(saved, controls))}>{t.apply}</Button>
  </section>
  return <main className="dashboard-shell" data-read-only={readOnly || undefined}>
    {readOnly ? <ViewerControls busy={busy} t={t}>{toolbar}{filters}</ViewerControls> : toolbar}
    {canManage && sharing && saved && <ShareDialog artifactId={saved.artifactId} versionId={saved.versionId ?? undefined} versions={versions} t={t} onClose={() => setSharing(false)}/>}
    <AlertDialog open={!!confirmDelete} onOpenChange={open => { if (!open && !busy && !deleting) setConfirmDelete(null) }}>
      <AlertDialogContent><AlertDialogTitle>{t.deleteDashboard}</AlertDialogTitle>
        <AlertDialogDescription>{i18n.t('confirmDeleteDashboard', { title: confirmDelete?.title ?? confirmDelete?.artifactId ?? '' })}</AlertDialogDescription>
        <p className="break-all text-xs text-muted-foreground">{confirmDelete?.artifactId}</p>
        {deleteError && <p role="alert" className="text-destructive">{deleteError}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy || deleting}>{t.cancel}</AlertDialogCancel>
          <Button variant="destructive" disabled={busy || deleting} onClick={() => void run(deleteDashboard)}>{deleting ? t.deleting : t.deleteDashboard}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!confirmPublish} onOpenChange={open => { if (!open && !busy) setConfirmPublish(null) }}>
      <AlertDialogContent><AlertDialogTitle>{t.publish}</AlertDialogTitle>
        <AlertDialogDescription>{t.confirmPublish} {confirmPublish?.manifest.title} · r{confirmPublish?.draftRevision}</AlertDialogDescription>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t.cancel}</AlertDialogCancel>
          <Button disabled={busy} onClick={() => void run(publish)}>{t.confirm}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {notice && <p role="status" className="border-b px-4 py-3 text-muted-foreground">{notice}</p>}
    {error && <div role="alert" className="border-b px-4 py-3 text-destructive">{error}</div>}
    {editor !== null ? <section className="editor-panel p-4">
      <label className="text-sm font-medium" htmlFor="definition">{t.definition}</label>
      <Textarea id="definition" className="min-h-0 flex-1 font-mono text-xs" value={editor} onChange={(event) => { editRef.current.dirty = true; reportDirty(true); setEditor(event.target.value) }} disabled={busy}/>
      <details className="text-xs"><summary>{t.sources}</summary><pre className="max-h-32 overflow-auto">{JSON.stringify(sources, null, 2)}</pre></details>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditor(null)} disabled={busy}>{t.cancel}</Button><Button onClick={() => void run(save)} disabled={busy || !editor.trim()}><Save/>{t.save}</Button></div>
    </section> : <>
      {!readOnly && filters}
      {unavailableDatasets.length > 0 && <div role="alert" className="px-4 py-2 text-sm"><p>{t.bindingUnavailable}</p><ul>{unavailableDatasets.map(id => <li key={id}>{[...(saved?.manifest.charts ?? []), ...(saved?.manifest.tables ?? [])].filter(view => view.datasetId === id).map(view => view.title).join(' · ') || id}</li>)}</ul></div>}
      {partial && <p role="status" className="px-4 py-2 text-sm">{t.partial}</p>}
      <section className="canvas-panel" aria-busy={busy}>
        {!busy && !html && !saved?.manifest.presentation && !error && !unavailableDatasets.length && <p className="p-6 text-muted-foreground">{t.empty}</p>}
        {saved?.manifest.presentation && <HtmlDashboard ref={htmlDashboard} artifactId={saved.artifactId} versionId={saved.versionId ?? undefined} draftRevision={saved.isDraft ? saved.draftRevision : undefined}
          manifest={saved.manifest} dependencies={saved.dependencies ?? []} onBusy={setBusy} onError={setError} onResult={result => { setError(''); setPartial(result.partial); setStatus(result.fetchedAt) }}/ >}
        {html && <iframe title={saved?.manifest.title ?? t.title} sandbox="allow-scripts" srcDoc={html} className="h-full w-full border-0"/>}
      </section>
    </>}
  </main>
}
function Filter({ control, value, onChange, disabled }: { control: DashboardManifest['controls'][number]; value: ControlValue; onChange: (value: ControlValue) => void; disabled: boolean }) {
  return <div className="grid gap-1.5"><label htmlFor={control.controlId} className="text-xs text-muted-foreground">{control.label}</label>
    {control.allowedValues ? <Select value={JSON.stringify(value)} onValueChange={(value) => onChange(z.union([z.string(), z.number(), z.boolean(), z.null()]).parse(JSON.parse(value)))} disabled={disabled}>
      <SelectTrigger id={control.controlId} className="w-44"><SelectValue/></SelectTrigger><SelectContent>{control.allowedValues.map((value) => <SelectItem key={JSON.stringify(value)} value={JSON.stringify(value)}>{String(value ?? '—')}</SelectItem>)}</SelectContent>
    </Select> : control.type === 'boolean' ? <Select value={String(value)} onValueChange={(value) => onChange(value === 'true')} disabled={disabled}>
      <SelectTrigger id={control.controlId} className="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true">true</SelectItem><SelectItem value="false">false</SelectItem></SelectContent>
    </Select> : <Input id={control.controlId} className="w-44" disabled={disabled} type={control.type === 'date' ? 'date' : control.type === 'number' ? 'number' : 'text'} value={value === null ? '' : String(value)} onChange={(event) => onChange(event.target.value === '' ? null : control.type === 'number' ? Number(event.target.value) : event.target.value)}/>}
  </div>
}
function rendererHtml(payload: unknown) {
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  // The renderer's default fetch shim assumes an HTTP origin. srcDoc is opaque, so provide its
  // three read-only in-memory endpoints before the unchanged renderer bundle initializes.
  const setup = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><script>window.__DATASCIENCE_ARTIFACT_HOSTING__={mode:'site_creator',readOnly:true,controls:{edit:false,exportHostedLink:false,hostedLink:false}};window.xpertai={toolOutput:${json(payload)},toolResponseMetadata:${json(payload)},availableDisplayModes:['inline','fullscreen'],displayMode:'fullscreen',hostContext:{availableDisplayModes:['inline','fullscreen'],displayMode:'fullscreen'}};
  window.__datascienceArtifactFetchShimInstalled=true;
  window.fetch=async function(input,init){const path=new URL(typeof input==='string'?input:input.url,'https://renderer.invalid').pathname;const payload=window.xpertai.toolOutput;const data={'/api/manifest':payload.manifest,'/api/snapshot':payload.snapshot,'/api/package':{manifestPath:'live dashboard',snapshotPath:'live query'}};const ok=(!init||!init.method||init.method==='GET')&&Object.prototype.hasOwnProperty.call(data,path);return new Response(JSON.stringify(ok?data[path]:{error:'Unavailable in live read-only view'}),{status:ok?200:404,headers:{'Content-Type':'application/json'}})};<\/script>`
  return window.__ANALYTICS_RENDERER_HTML__.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${setup}`)
}
createRoot(document.getElementById('root')!).render(<RemoteI18nProvider i18n={i18n}><App/></RemoteI18nProvider>)
