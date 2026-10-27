import { SourceDialog } from './source-dialog'
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod/v3'
import { ASSISTANT_CONTEXT_SET_COMMAND, ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, WORKBENCH_NAVIGATION_OPEN_COMMAND, WORKBENCH_EXTENSION_VIEW_TARGET } from '@xpert-ai/contracts'
import { ArrowLeft, ArrowUpRight, Globe, Plus, Search, RefreshCw, Monitor, Smartphone, History, Settings, Rocket, MessageSquare, LoaderCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Input, Textarea, Badge, Card, CardContent, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@xpert-ai/plugin-shadcn-ui'
import { connect, command, data, action, type Host } from './bridge'
import { detailSchema, projectSchema, accessSchema, tabSchema, isolatedHtml, type Project, type Detail, type Access, type Tab } from './model'
import { i18n } from './i18n'

function Preview({ projectId, versionId, title, thumbnail = false, refresh = 0 }: {projectId: string; versionId?: string | null; title: string; thumbnail?: boolean; refresh?: number}) {
  const [html, setHtml] = useState(''), [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true; setHtml(''); setFailed(false)
    if (versionId) void data({ selectionId: projectId, parameters: { preview: true, versionId } }).then(value => {
      const parsed = z.object({ meta: z.object({ previewHtml: z.string() }) }).parse(value)
      if (live) setHtml(parsed.meta.previewHtml)
    }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [projectId, versionId, refresh])
  if (!versionId || failed) return <div className="flex h-full min-h-40 items-center justify-center bg-muted/50 text-muted-foreground"><Globe className="size-10"/></div>
  if (!html) return <div className="flex h-full min-h-40 items-center justify-center bg-muted/50"><LoaderCircle className="size-5 animate-spin"/></div>
  return <iframe title={title} sandbox={thumbnail ? '' : 'allow-scripts'} referrerPolicy="no-referrer" srcDoc={isolatedHtml(html)} className={thumbnail ? 'pointer-events-none h-[650px] w-[1200px] origin-top-left scale-[0.3] border-0 bg-white' : 'h-full min-h-[28rem] w-full border-0 bg-white'}/>
}
function App() {
  const [host, setHost] = useState<Host | null>(null), [items, setItems] = useState<Project[]>([]), [total, setTotal] = useState(0)
  const [page, setPage] = useState(1), [search, setSearch] = useState(''), [detail, setDetail] = useState<Detail | null>(null)
  const [tab, setTab] = useState<Tab>('preview'), [versionId, setVersionId] = useState(''), [mobile, setMobile] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [refresh, setRefresh] = useState(0)
  const [editingSource, setEditingSource] = useState(false)
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [prompt, setPrompt] = useState('')
  const [confirm, setConfirm] = useState<'publish' | 'restore' | 'archive' | 'revoke' | null>(null), [access, setAccess] = useState<Access>('admins_only'), [users, setUsers] = useState('')
  const hostRef = useRef<Host | null>(null), selectionRef = useRef<string | undefined>(), epoch = useRef(0), listSeq = useRef(0), detailSeq = useRef(0), refreshRef = useRef(() => {}), latestVersionRef = useRef<string | undefined>()
  const { t, locale } = i18n(host?.locale)
  const fail = () => setError(t('error'))
  async function context(id: string, selected?: string) { await command(ASSISTANT_CONTEXT_SET_COMMAND, { key: 'sites', context: { projectId: id, ...(selected ? { versionId: selected } : {}) } }) }
  async function navigate(id?: string, nextTab: Tab = 'preview') {
    // Preserve the catalog instance for in-document tabs. A different resource must
    // be resolved by the host; the view never invents a stable content identity.
    const query = hostRef.current?.initialQuery
    let parameters: Record<string, unknown> = query?.selectionId === id && query?.parameters?.contentId ? { ...query.parameters } : {}
    if (id && hostRef.current?.runtimeScope?.projectId && !parameters.contentId) {
      const resolved = await command('workbench.content.resolve', { providerKey: 'sites.content', resourceId: id })
      const nav = z.object({ navigation: z.object({ parameters: z.record(z.unknown()).optional() }) }).parse(resolved)
      parameters = nav.navigation.parameters ?? {}
    }
    await command(WORKBENCH_NAVIGATION_OPEN_COMMAND, { target: WORKBENCH_EXTENSION_VIEW_TARGET, viewKey: hostRef.current?.manifest.key, ...(id ? { selectionId: id } : {}), parameters: { ...parameters, tab: nextTab, listPage: page, listSearch: search } })
  }
  async function loadList() {
    const revision = epoch.current, seq = ++listSeq.current
    try { const value = z.object({ items: z.array(projectSchema), total: z.number() }).parse(await data({ page, pageSize: 6, search })); if (revision === epoch.current && seq === listSeq.current) { setItems(value.items); setTotal(value.total) } }
    catch { if (revision === epoch.current) fail() }
  }
  async function loadDetail(id: string) {
    const revision = epoch.current, seq = ++detailSeq.current
    try {
      const result = z.object({ meta: detailSchema }).parse(await data({ selectionId: id })).meta
      if (revision !== epoch.current || seq !== detailSeq.current) return
      const previousLatest = latestVersionRef.current
      selectionRef.current = id; latestVersionRef.current = result.versions[0]?.id; setDetail(result)
      setVersionId(current => !current || current === previousLatest ? result.versions[0]?.id ?? '' : result.versions.some(v => v.id === current) ? current : result.versions[0]?.id ?? '')
    } catch { if (revision === epoch.current) fail() }
  }
  useEffect(() => connect(h => {
    hostRef.current = h; setHost(h); epoch.current++; setBusy(false)
    // Context-only events retain initialQuery in the bridge. An init without a
    // selection is an explicit list navigation, never a fallback to local state.
    const id = h.initialQuery?.selectionId
    const parameters = h.initialQuery?.parameters
    if (parameters) { const parsed = tabSchema.safeParse(parameters.tab); if (parsed.success) setTab(parsed.data); setPage(parameters.listPage); setSearch(parameters.listSearch) }
    if (id) void loadDetail(id)
    else {
      detailSeq.current++; selectionRef.current = undefined; latestVersionRef.current = undefined
      setDetail(null); setVersionId(''); setConfirm(null)
      void command(ASSISTANT_CONTEXT_SET_COMMAND, { key: 'sites', clear: true }).catch(fail)
    }
  }, () => refreshRef.current()), [])
  refreshRef.current = () => { setRefresh(v => v + 1); void loadList(); if (selectionRef.current) void loadDetail(selectionRef.current) }
  useEffect(() => { if (host) void loadList() }, [host, page, search])
  // Background Agent saves can finish while this retained view misses a stream event.
  // Refresh metadata only; do not reload an unchanged preview or its local UI state.
  useEffect(() => {
    if (!host || !detail?.project.id) return
    const timer = setInterval(() => { if (!document.hidden && !busy && selectionRef.current) void loadDetail(selectionRef.current) }, 5000)
    return () => clearInterval(timer)
  }, [host?.instanceId, detail?.project.id, busy])
  useEffect(() => { if (detail) void context(detail.project.id, versionId).catch(fail) }, [detail?.project.id, versionId, host?.scopeRevision])
  async function select(id: string) { setError(''); setVersionId(''); await loadDetail(id); await navigate(id).catch(fail) }
  async function back() { detailSeq.current++; selectionRef.current = undefined; setDetail(null); setVersionId(''); await command(ASSISTANT_CONTEXT_SET_COMMAND, { key: 'sites', clear: true }).catch(fail); await navigate().catch(fail); await loadList() }
  async function changeTab(next: Tab) { setTab(next); if (detail) await navigate(detail.project.id, next).catch(fail) }
  async function send(text: string, id: string) { await context(id, versionId); await command(ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, { text }); setNotice(t('sent')) }
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { const result = z.object({ projectId: z.string() }).parse(await action('create_site', { name, prompt })); setCreating(false); await select(result.projectId); await send(t('createPrompt', { name, id: result.projectId, prompt }), result.projectId); setName(''); setPrompt('') }
    catch { fail() } finally { setBusy(false) }
  }
  async function executeConfirmation() {
    if (!detail || !confirm) return
    setBusy(true); setError('')
    const projectId = detail.project.id
    try {
      if (confirm === 'publish') await action('deploy_version', { projectId, versionId, accessMode: access, confirmed: true, ...(access === 'public_link' ? { userConfirmedPublicLink: true } : {}), ...(access === 'custom' ? { customAudience: users.split(',').map(s => s.trim()).filter(Boolean) } : {}) })
      if (confirm === 'restore') { const saved = z.object({ id: z.string() }).parse(await action('restore_version', { projectId, versionId, expectedVersionId: detail.versions[0]?.id ?? null })); setVersionId(saved.id) }
      if (confirm === 'revoke') await action('revoke_artifact_link', { deploymentId: detail.project.currentDeploymentId, confirmed: true })
      if (confirm === 'archive') { await action('archive_project', { projectId }); await back() } else await loadDetail(projectId)
      setConfirm(null); setNotice(t('saved')); await loadList()
    } catch { fail() } finally { setBusy(false) }
  }
  const project = detail?.project, selectedVersion = detail?.versions.find(v => v.id === versionId)
  const deployment = detail?.deployments.find(d => d.id === project?.currentDeploymentId)
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  return <div className="flex h-full min-h-0 min-w-0 flex-col bg-background text-foreground">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-5">
      <div className="flex min-w-0 items-center gap-3">{project ? <Button variant="ghost" size="icon" aria-label={t('back')} onClick={() => void back()}><ArrowLeft className="size-4"/></Button> : <Globe className="size-6"/>}<div className="min-w-0"><h1 className="truncate text-lg font-semibold">{project?.name ?? t('sites')}</h1><p className="mt-1 text-xs text-muted-foreground">{project ? `${project.slug} · ${project.currentDeploymentId ? t('live') : t('draft')}` : t('subtitle')}</p></div></div>
      <div className="flex items-center gap-2">{project?.hostProjectId && <Button variant="outline" onClick={() => setEditingSource(true)}>{t('source')}</Button>}<Button variant="ghost" size="icon" aria-label={t('reload')} disabled={!host || busy} onClick={() => refreshRef.current()}><RefreshCw className="size-4"/></Button>{project ? <Button disabled={!versionId || busy} onClick={() => { setAccess(project.audience); setConfirm('publish') }}><Rocket className="size-4"/>{t('publish')}</Button> : <Button disabled={!host} onClick={() => setCreating(true)}><Plus className="size-4"/>{t('create')}</Button>}</div>
    </header>
    {error && <div role="alert" className="border-b bg-destructive/10 px-6 py-3 text-sm">{error}</div>}{notice && <div role="status" className="border-b bg-muted px-6 py-2 text-xs">{notice}</div>}
    {!detail ? <main className="flex min-h-0 flex-1 flex-col overflow-auto px-6 py-5">
      <div className="relative mb-6 max-w-sm"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><Input className="pl-9" aria-label={t('search')} placeholder={t('search')} value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}/></div>
      {items.length ? <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">{items.map(item => <Card key={item.id} className="overflow-hidden p-0 transition-shadow hover:shadow-md"><button className="w-full text-left focus-visible:outline-2 focus-visible:outline-ring" onClick={() => void select(item.id)}><div className="h-48 overflow-hidden border-b"><Preview projectId={item.id} versionId={item.latestVersionId} title={item.name} thumbnail refresh={refresh}/></div><CardContent className="p-4"><div className="mb-2 flex items-center justify-between gap-2"><h2 className="truncate font-semibold">{item.name}</h2><ArrowUpRight className="size-4 shrink-0 text-muted-foreground"/></div><p className="mb-3 truncate text-xs text-muted-foreground">{item.description || item.slug}</p><div className="flex items-center justify-between gap-2"><Badge variant="secondary">{item.currentDeploymentId ? t('live') : t('draft')}</Badge><span className="text-xs text-muted-foreground">{item.latestVersionNumber ? `v${item.latestVersionNumber}` : t('noVersion')}</span></div><p className="mt-3 text-xs text-muted-foreground">{date(item.updatedAt)}</p></CardContent></button></Card>)}</div> : <section className="m-auto max-w-md py-20 text-center"><Globe className="mx-auto mb-5 size-12 text-muted-foreground"/><h2 className="mb-3 text-xl font-semibold">{search ? t('emptySearch') : t('empty')}</h2><p className="text-sm leading-6 text-muted-foreground">{t('emptyDescription')}</p><Button className="mt-6" disabled={!host} onClick={() => setCreating(true)}><Plus className="size-4"/>{t('create')}</Button></section>}
      {total > 6 && <div className="mt-6 flex items-center justify-center gap-3"><Button variant="outline" size="icon" aria-label={t('previous')} disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="size-4"/></Button><span className="text-sm">{page} / {Math.ceil(total / 6)}</span><Button variant="outline" size="icon" aria-label={t('next')} disabled={page * 6 >= total} onClick={() => setPage(p => p + 1)}><ChevronRight className="size-4"/></Button></div>}
    </main> : <>
      <nav aria-label={t('sites')} className="flex items-center gap-1 border-b px-6 py-2">{(['preview', 'versions', 'settings'] as const).map((key, index) => { const Icon = [Monitor, History, Settings][index]; return <Button key={key} variant={tab === key ? 'secondary' : 'ghost'} size="sm" aria-pressed={tab === key} onClick={() => void changeTab(key)}><Icon className="size-4"/>{t(key)}</Button> })}</nav>
      <main className="min-h-0 flex-1 overflow-auto">
        {tab === 'preview' && <section className="flex h-full min-h-0 flex-col"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3"><div className="flex items-center gap-2"><Select value={versionId} onValueChange={setVersionId}><SelectTrigger aria-label={t('version')} className="w-44"><SelectValue placeholder={t('noVersion')}/></SelectTrigger><SelectContent>{detail.versions.map(v => <SelectItem key={v.id} value={v.id}>v{v.versionNumber} {v.id === detail.versions[0]?.id ? `· ${t('latest')}` : ''}</SelectItem>)}</SelectContent></Select>{deployment?.versionId === versionId && <Badge variant="secondary">{t('deployed')}</Badge>}</div><div className="flex items-center gap-1"><Button variant={mobile ? 'ghost' : 'secondary'} size="icon" aria-label={t('desktop')} onClick={() => setMobile(false)}><Monitor className="size-4"/></Button><Button variant={mobile ? 'secondary' : 'ghost'} size="icon" aria-label={t('mobile')} onClick={() => setMobile(true)}><Smartphone className="size-4"/></Button>{project?.currentDeploymentUrl && <Button asChild variant="ghost" size="icon"><a href={project.currentDeploymentUrl} target="_blank" rel="noreferrer" aria-label={t('open')}><ArrowUpRight className="size-4"/></a></Button>}</div></div>
          {versionId ? <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4"><div className={'mx-auto h-full min-h-[28rem] overflow-hidden rounded-lg border shadow-sm ' + (mobile ? 'max-w-[390px]' : 'w-full')}><Preview projectId={detail.project.id} versionId={versionId} title={detail.project.name} refresh={refresh}/></div></div> : <div className="m-auto max-w-sm px-6 py-20 text-center"><Globe className="mx-auto mb-4 size-10 text-muted-foreground"/><h2 className="font-semibold">{t('noVersion')}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{t('saveHint')}</p></div>}
          <footer className="flex items-center justify-between gap-3 border-t px-6 py-3"><span className="text-xs text-muted-foreground">{deployment ? `${t('deployed')}: v${detail.versions.find(v => v.id === deployment.versionId)?.versionNumber ?? '—'}` : t('draft')}</span><Button variant="outline" size="sm" onClick={() => void send(t('improvePrompt', { name: detail.project.name, id: detail.project.id, version: selectedVersion?.versionNumber ?? '—' }), detail.project.id).catch(fail)}><MessageSquare className="size-4"/>{t('improve')}</Button></footer>
        </section>}
        {tab === 'versions' && <section className="space-y-3 p-6">{detail.versions.length === 0 && <p className="text-sm text-muted-foreground">{t('emptyVersions')}</p>}{detail.versions.map(v => <Card key={v.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-medium">v{v.versionNumber} · {v.title || detail.project.name}</h2>{deployment?.versionId === v.id && <Badge variant="secondary">{t('deployed')}</Badge>}</div><p className="mt-2 text-xs text-muted-foreground">{date(v.createdAt)}</p>{v.description && <p className="mt-3 text-sm text-muted-foreground">{v.description}</p>}</div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { setVersionId(v.id); void changeTab('preview') }}>{t('preview')}</Button><Button variant="ghost" size="sm" onClick={() => { setVersionId(v.id); setConfirm('restore') }}>{t('restore')}</Button></div></div></Card>)}</section>}
        {tab === 'settings' && <section className="max-w-3xl space-y-6 p-6"><Card className="p-5"><h2 className="mb-2 font-semibold">{t('access')}</h2><p className="mb-4 text-sm text-muted-foreground">{t(project?.audience ?? 'admins_only')}</p>{deployment?.artifactLinkId && <Button variant="destructive" onClick={() => setConfirm('revoke')}>{t('revoke')}</Button>}</Card><Card className="p-5"><h2 className="mb-2 font-semibold">{t('hosting')}</h2><p className="text-sm leading-6 text-muted-foreground">{t('hostingDescription')}</p></Card><Button variant="destructive" onClick={() => setConfirm('archive')}>{t('archive')}</Button></section>}
      </main></>}
    {editingSource && project && <SourceDialog projectId={project.id} versionId={detail?.versions[0]?.id ?? null} locale={host?.locale} onClose={() => setEditingSource(false)} onSaved={() => void loadDetail(project.id)} />}
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent><DialogHeader><DialogTitle>{t('create')}</DialogTitle><DialogDescription>{t('createDescription')}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e => void create(e)}><label className="block text-sm font-medium">{t('name')}<Input className="mt-2" placeholder={t('nameHint')} value={name} onChange={e => setName(e.target.value)} maxLength={100} required/></label><label className="block text-sm font-medium">{t('prompt')}<Textarea className="mt-2 min-h-28" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={8000} required/></label><DialogFooter><Button type="button" variant="outline" onClick={() => setCreating(false)}>{t('cancel')}</Button><Button disabled={busy || !name.trim() || !prompt.trim()} type="submit">{busy && <LoaderCircle className="size-4 animate-spin"/>}{t('build')}</Button></DialogFooter></form></DialogContent></Dialog>
    <AlertDialog open={!!confirm} onOpenChange={open => { if (!open && !busy) setConfirm(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm ? t(confirm) : ''}{confirm === 'publish' && selectedVersion ? ` · v${selectedVersion.versionNumber}` : ''}</AlertDialogTitle><AlertDialogDescription>{confirm ? t(({ publish: 'publishDescription', restore: 'restoreDescription', archive: 'archiveDescription', revoke: 'revokeDescription' } as const)[confirm]) : ''}</AlertDialogDescription></AlertDialogHeader>{confirm === 'publish' && <div className="space-y-4"><p className="text-sm font-medium">{project?.name}</p><label className="block text-sm font-medium">{t('access')}<Select value={access} onValueChange={value => setAccess(accessSchema.parse(value))}><SelectTrigger className="mt-2"><SelectValue/></SelectTrigger><SelectContent>{accessSchema.options.map(key => <SelectItem key={key} value={key}>{t(key)}</SelectItem>)}</SelectContent></Select></label>{access === 'public_link' && <p className="rounded-lg bg-muted p-3 text-sm">{t('publicWarning')}</p>}{access === 'custom' && <Input aria-label={t('users')} placeholder={t('users')} value={users} onChange={e => setUsers(e.target.value)}/>}</div>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel><Button variant={confirm === 'archive' || confirm === 'revoke' ? 'destructive' : 'default'} disabled={busy || (confirm === 'publish' && (!versionId || (access === 'custom' && !users.trim())))} onClick={() => void executeConfirmation()}>{busy && <LoaderCircle className="size-4 animate-spin"/>}{t('confirm')}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}
createRoot(document.getElementById('root')!).render(<App/> )
