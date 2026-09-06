import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Badge, Input, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import { RefreshCw, ChevronLeft, ChevronRight, ArrowLeft, ExternalLink, Check, X, Info } from 'lucide-react'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import '../../governance-workbench/src/styles.css'
import './styles.css'
import { I18nContext, createI18n, normalizeLocale, useI18n, type Locale } from '../../governance-workbench/src/i18n'
import { Status } from '../../governance-workbench/src/ui'
import type { ViewQuery } from '../../../contracts'
import type { MaterialProfileData, ProfileDecision } from '../../../profile-contracts'
import { command, decide, loadProfile, startProfileBridge } from './bridge'

function Profile() {
  const [locale, setLocale] = React.useState<Locale>('zh-Hans')
  const [active, setActive] = React.useState(true)
  const [data, setData] = React.useState<MaterialProfileData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState<ViewQuery>({ page: 1 })
  const queryRef = React.useRef(query), initialized = React.useRef(''), sequence = React.useRef(0), mounted = React.useRef(true)
  queryRef.current = query
  const load = React.useCallback(async (next: ViewQuery, quiet = false) => {
    const seq = ++sequence.current
    if (!quiet) setLoading(true)
    setError(null)
    try { const result = await loadProfile(next); if (mounted.current && seq === sequence.current) { setData(result); setQuery(next) } }
    catch (error) { if (mounted.current && seq === sequence.current) setError(error instanceof Error ? error.message : 'request_failed') }
    finally { if (mounted.current && seq === sequence.current) setLoading(false) }
  }, [])
  React.useEffect(() => {
    mounted.current = true
    const dispose = startProfileBridge(init => {
      setLocale(normalizeLocale(init.locale)); setActive(init.active !== false)
      if (initialized.current !== init.manifest?.key) { initialized.current = init.manifest?.key ?? 'profile'; void load(init.initialQuery ?? { page: 1 }) }
    }, setActive)
    return () => { mounted.current = false; sequence.current++; dispose() }
  }, [load])
  const [decision, setDecision] = React.useState<ProfileDecision['decision'] | null>(null)
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const attempt = React.useRef<ProfileDecision | null>(null)
  const [receipt, setReceipt] = React.useState(false)
  React.useEffect(() => {
    if (!active || decision) return
    const timer = setInterval(() => void load(queryRef.current, true), 30000)
    return () => clearInterval(timer)
  }, [active, decision, load])
  React.useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || decision || pending) return
      event.preventDefault(); void command('assistant.profile.close').catch(() => undefined)
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [decision, pending])
  const openDecision = async (value: ProfileDecision['decision']) => {
    try { await command('assistant.profile.interaction', { busy: true }); setReason(''); attempt.current = null; setDecision(value); setError(null) }
    catch { setError('command_failed') }
  }
  const cancel = async () => {
    if (pending) return
    setDecision(null); attempt.current = null; setError(null)
    await command('assistant.profile.interaction', { busy: false }).catch(() => undefined)
  }
  const submit = async () => {
    if (!data?.selected || !decision || pending) return
    const input = attempt.current ?? { caseId: data.selected.case.id, expectedRevision: data.selected.case.revision, operationId: crypto.randomUUID(), decision, reason: reason.trim() }
    attempt.current = input; setPending(true); setError(null)
    try {
      await decide(input); setReceipt(true); setDecision(null); attempt.current = null
      await command('assistant.profile.interaction', { busy: false })
      await load(queryRef.current)
    } catch (error) { setError(error instanceof Error ? error.message : 'action_failed') }
    finally { setPending(false) }
  }
  return <I18nContext.Provider value={createI18n(locale)}><ProfileContent data={data} loading={loading} error={error} query={query} load={load} receipt={receipt} decision={decision} reason={reason} pending={pending} attempted={!!attempt.current} setReason={setReason} onDecision={openDecision} onCancel={cancel} onSubmit={submit} /></I18nContext.Provider>
}
function ProfileContent({ data, loading, error, query, load, receipt, decision, reason, pending, attempted, setReason, onDecision, onCancel, onSubmit }: {
  data: MaterialProfileData | null; loading: boolean; error: string | null; query: ViewQuery; load: (query: ViewQuery) => Promise<void>; receipt: boolean;
  decision: ProfileDecision['decision'] | null; reason: string; pending: boolean; attempted: boolean; setReason: (value: string) => void;
  onDecision: (value: ProfileDecision['decision']) => Promise<void>; onCancel: () => Promise<void>; onSubmit: () => Promise<void>
}) {
  const { t, date, currency } = useI18n()
  const selected = data?.selected
  const [search, setSearch] = React.useState('')
  const navigate = () => data && selected && command('workbench.navigation.open', { target: 'workbench.view', viewKey: data.workspaceViewKey, selectionId: selected.case.id })
  return <main className="material-profile">
    <div className="profile-controls">
      {selected ? <Button variant="ghost" size="sm" onClick={() => void load({ ...query, selectionId: undefined })}><ArrowLeft size={14} />{t('profileBack')}</Button> : <form className="flex min-w-0 flex-1 gap-1" onSubmit={event => { event.preventDefault(); void load({ page: 1, search }) }}><Input aria-label={t('search')} placeholder={t('search')} value={search} onChange={event => setSearch(event.target.value)} /><Button variant="outline" size="sm" type="submit">{t('profileFind')}</Button></form>}
      <Button variant="ghost" size="icon" disabled={loading} aria-label={t('refresh')} onClick={() => void load(query)}><RefreshCw size={14} /></Button>
    </div>
    <div className="profile-body" aria-busy={loading}>
      {error && <div role="alert" className="profile-error">{t('profileError')} <code>{error}</code></div>}
      {receipt && !decision && <p role="status" className="profile-notice">{t('profileDecisionSaved')}</p>}
      {loading && !data && <p role="status">{t('loading')}</p>}
      {selected ? <>
        <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{selected.case.caseKey}</span><Status value={selected.case.status} /></div>
        <h2 className="mt-2 text-sm font-semibold">{selected.case.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('revision')} {selected.case.revision} · {t('mock')}</p>
        <h3 className="profile-section-title">{t('materials')}</h3>
        {selected.materials.map((material, index) => <div className="profile-source" key={index}><strong>{material.code}</strong><span>{material.name} · {material.plant}</span><span>{material.drawing} / {material.revision}</span></div>)}
        {selected.proposal && <><h3 className="profile-section-title">{t('decision')} · {t('revision')} {selected.proposal.revision}</h3><p className="text-xs leading-relaxed">{selected.proposal.summary}</p>
          <div className="my-2 space-y-2">{selected.proposal.mappings.map((mapping, index) => <div key={index} className="profile-mapping"><span>{mapping.plant} · {mapping.localCode}</span><span>→ {mapping.goldenId}</span></div>)}</div>
          {selected.proposal.safeguards.map((rule, index) => <p key={index} className="mb-1 text-xs text-muted-foreground">{rule}</p>)}
        </>}
        <h3 className="profile-section-title">{t('evidence')}</h3>
        {selected.evidence.map(evidence => <div key={evidence.id} className="profile-evidence"><span>{evidence.system} · {evidence.reference}</span><p>{evidence.field}: {evidence.value}</p></div>)}
        <Button variant="outline" className="mt-3 w-full" onClick={() => void navigate()?.catch(() => undefined)}><ExternalLink size={14} />{t('fullWorkspace')}</Button>
      </> : <>
        {data && <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>{t(data.role)} · {t('profileCases')} {data.total}</span><Badge variant="outline">{t('mock')}</Badge></div>}
        {data?.items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('profileEmpty')}</p>}
        {data?.items.map(item => <button className="profile-case" key={item.id} onClick={() => void load({ ...query, selectionId: item.id })}>
          <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">{item.caseKey}</span><Status value={item.status} /></div>
          <h3 className="mt-1 text-sm font-semibold">{item.title}</h3>
          <div className="mt-2 flex items-center justify-between text-xs"><span>{t('profileRoleTasks')} {item.completedTasks}/{item.totalTasks}</span><span className="text-muted-foreground">{date(item.updatedAt)}</span></div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {(data.role === 'coordinator' || data.role === 'intake') && <span>{t('materials')} {item.facts.sources}</span>}
            {data.role === 'engineering' && <span>{t('profileDrawings')} {item.facts.drawings}</span>}
            {data.role === 'quality' && <span>{t('conflicts')} {item.facts.conflicts}</span>}
            {data.role === 'impact' && <span>{t('exposure')} {currency(item.facts.exposure)}</span>}
            {data.role === 'publisher' && <span>{t('profileReceipts')} {item.facts.publications}</span>}
            {data.role === 'governance' && <span>{t('revision')} {item.revision}</span>}
          </div>
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.latestActivity?.summary || t('profileNoActivity')}</p>
        </button>)}
      </>}
    </div>
    {selected ? <div className="profile-footer">{selected.case.allowedActions.length > 0 ? <><Button variant="outline" disabled={loading} onClick={() => void onDecision('rejected')}><X size={14} />{t('reject')}</Button><Button disabled={loading} onClick={() => void onDecision('approved')}><Check size={14} />{t('approve')}</Button></> : <p className="text-xs text-muted-foreground">{t('profileReadOnly')}</p>}</div> : data && <div className="profile-footer"><span className="mr-auto text-xs text-muted-foreground">{data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><Button variant="ghost" size="icon" aria-label={t('profilePrevious')} disabled={loading || data.page <= 1} onClick={() => void load({ ...query, page: data.page - 1 })}><ChevronLeft size={16} /></Button><Button variant="ghost" size="icon" aria-label={t('profileNext')} disabled={loading || data.page * data.pageSize >= data.total} onClick={() => void load({ ...query, page: data.page + 1 })}><ChevronRight size={16} /></Button></div>}
    <AlertDialog open={!!decision} onOpenChange={open => { if (!open) void onCancel() }}><AlertDialogContent className="max-h-[calc(100dvh-24px)] max-w-[calc(100vw-24px)] overflow-y-auto p-4"><AlertDialogHeader><AlertDialogTitle>{decision === 'approved' ? t('profileApproveTitle') : t('profileRejectTitle')}</AlertDialogTitle><AlertDialogDescription>{decision === 'approved' ? t('profileApproveDescription') : t('profileRejectDescription')}</AlertDialogDescription></AlertDialogHeader>
      <p className="text-xs">{selected?.case.caseKey} · {t('revision')} {selected?.case.revision} / {t('decision')} {selected?.proposal?.revision}</p>
      <p className="text-xs leading-relaxed">{selected?.proposal?.summary}</p><p className="flex gap-1 text-xs text-muted-foreground"><Info size={14} />{t('mock')}</p>
      <label className="space-y-1 text-xs">{t('profileReason')}<Textarea aria-label={t('profileReason')} value={reason} disabled={pending || attempted} onChange={event => setReason(event.target.value)} /></label>
      {error && <p role="alert" className="text-xs text-destructive">{t('profileError')} {error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={pending}>{t('cancel')}</AlertDialogCancel><Button disabled={pending || reason.trim().length < 3} onClick={() => void onSubmit()}>{pending ? t('profileSubmitting') : t('profileConfirm')}</Button></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </main>
}
createRoot(document.getElementById('root')!).render(<Profile />)
