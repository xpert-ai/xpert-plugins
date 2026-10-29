import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Check, ChevronLeft, ChevronRight, ClipboardList, Input, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Search, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/plugin-shadcn-ui'
import type { CreateTicketInput, TicketDetail, TicketList, TicketStatus } from '../../src/domain/contracts'
import { analyzeTicket, debug, listTickets, mutate, readTicket, startBridge, type ViewQuery } from './bridge'
import { CreateTicket, EmptyState, ErrorNotice, Status, statusKeys } from './components'
import { createI18n, I18nContext, normalizeLocale, type Locale, type MessageKey } from './i18n'
import { draftFrom, Review, type Draft } from './Review'

const emptyList: TicketList = { items: [], page: 1, pageSize: 20, total: 0 }
const emptyDraft: Draft = { category: 'other', priority: 'normal', reply: '' }
const draftEqual = (left: Draft, right: Draft) => left.category === right.category && left.priority === right.priority && left.reply === right.reply
const failureCode = (error: Error | object) => error instanceof Error ? error.message : 'request_failed'

function App() {
  const [locale, setLocale] = React.useState<Locale>('en-US')
  const i18n = React.useMemo(() => createI18n(locale), [locale])
  const { t, date } = i18n
  const [connected, setConnected] = React.useState(false)
  const [connectionFailed, setConnectionFailed] = React.useState(false)
  const [list, setList] = React.useState(emptyList)
  const [selected, setSelected] = React.useState<TicketDetail | null>(null)
  const [draft, setDraft] = React.useState(emptyDraft)
  const [query, setQuery] = React.useState<ViewQuery>({ page: 1, pageSize: 20, search: '', parameters: {} })
  const [search, setSearch] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState<MessageKey | null>(null)
  const [changed, setChanged] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [abortOpen, setAbortOpen] = React.useState(false)
  const [queueOpen, setQueueOpen] = React.useState(true)
  const [pendingNavigation, setPendingNavigation] = React.useState<(() => void) | null>(null)
  const dirty = selected !== null && !draftEqual(draft, draftFrom(selected))
  const latest = React.useRef({ selected, dirty, query })
  latest.current = { selected, dirty, query }
  const dataSequence = React.useRef(0)
  const selectSequence = React.useRef(0)
  const initQueryKey = React.useRef('')
  const reloadRef = React.useRef<(force?: boolean, ticketId?: string) => Promise<void>>(async () => {})

  function applyTicket(ticket: TicketDetail, force = false) {
    const current = latest.current
    if (!force && current.selected?.id === ticket.id && current.dirty) {
      if (ticket.revision !== current.selected.revision) setChanged(true)
      debug('state.skipped', { dirty: true, applied: false })
      return
    }
    setSelected(ticket)
    setDraft(draftFrom(ticket))
    setChanged(false)
    debug('state.applied', { applied: true })
  }
  async function reload(force = false, preferredId?: string) {
    const token = ++dataSequence.current
    setLoading(true)
    try {
      const data = await listTickets(latest.current.query)
      if (token !== dataSequence.current) return
      setList(data)
      const id = preferredId ?? latest.current.selected?.id ?? latest.current.query.parameters?.ticketId ?? latest.current.query.selectionId ?? data.items[0]?.id
      if (id) {
        const detail = await readTicket(id)
        if (token !== dataSequence.current) return
        // Avoid overriding a ticket selected while a background list refresh was pending.
        if (!preferredId && latest.current.selected && latest.current.selected.id !== id) return
        applyTicket(detail, force)
      }
      if (force) setError('')
    } catch (reason) { if (token === dataSequence.current) setError(failureCode(reason as Error)) }
    finally { if (token === dataSequence.current) setLoading(false) }
  }
  reloadRef.current = reload
  React.useEffect(() => {
    const timer = setTimeout(() => setConnectionFailed(true), 12000)
    const cleanup = startBridge(init => {
      clearTimeout(timer)
      setConnectionFailed(false)
      setConnected(true)
      setLocale(normalizeLocale(init.locale))
      const key = JSON.stringify(init.initialQuery ?? {})
      if (key !== initQueryKey.current) {
        initQueryKey.current = key
        const next: ViewQuery = { page: 1, pageSize: 20, ...init.initialQuery }
        setSearch(next.search ?? '')
        setQuery(next)
      }
    }, event => {
      debug('host-event.refresh', { targeted: event.ticketId === latest.current.selected?.id })
      void reloadRef.current()
    })
    return () => { clearTimeout(timer); cleanup() }
  }, [])
  React.useEffect(() => { document.documentElement.lang = locale }, [locale])
  React.useEffect(() => { if (connected) void reloadRef.current() }, [connected, query])
  React.useEffect(() => {
    const timer = setTimeout(() => setQuery(current => current.search === search ? current : { ...current, search, page: 1 }), 250)
    return () => clearTimeout(timer)
  }, [search])
  React.useEffect(() => {
    if (selected?.status !== 'processing') return
    const timer = setInterval(() => void reloadRef.current(), 4000)
    return () => clearInterval(timer)
  }, [selected?.id, selected?.status])
  function guard(action: () => void) {
    if (dirty) setPendingNavigation(() => action)
    else action()
  }
  async function selectTicket(id: string) {
    const token = ++selectSequence.current
    ++dataSequence.current
    setLoading(true)
    setError('')
    setNotice(null)
    try {
      const ticket = await readTicket(id)
      if (token === selectSequence.current) { applyTicket(ticket, true); setQueueOpen(false) }
    } catch (reason) { setError(failureCode(reason as Error)) }
    finally { if (token === selectSequence.current) setLoading(false) }
  }
  async function create(input: CreateTicketInput) {
    setBusy(true); setError(''); setNotice(null)
    try {
      const receipt = await mutate('create_ticket', input)
      const ticket = await readTicket(receipt.ticketId)
      applyTicket(ticket, true)
      latest.current = { ...latest.current, selected: ticket, dirty: false }
      setCreateOpen(false)
      setQuery({ page: 1, pageSize: 20, search: '', parameters: {} })
      setSearch('')
      await reload(true, receipt.ticketId)
      setNotice('newTicket')
      setQueueOpen(false)
      return true
    } catch (reason) { setError(failureCode(reason as Error)); return false }
    finally { setBusy(false) }
  }
  async function analyze() {
    if (!selected || busy) return
    setBusy(true); setError(''); setNotice(null)
    try { await analyzeTicket({ ticketId: selected.id, expectedRevision: selected.revision }) }
    catch (reason) { setError(failureCode(reason as Error)) }
    finally { await reload(); setBusy(false) }
  }
  async function confirm() {
    if (!selected || busy || !draft.reply.trim()) return
    setBusy(true); setError(''); setNotice(null)
    try {
      await mutate('confirm_ticket', { ticketId: selected.id, expectedRevision: selected.revision, confirmationId: crypto.randomUUID(), ...draft, reply: draft.reply.trim() })
      await reload(true, selected.id)
      setNotice('saved')
    } catch (reason) { setError(failureCode(reason as Error)) }
    finally { setBusy(false) }
  }
  async function abort() {
    if (!selected?.attemptId || busy) return
    setBusy(true); setError('')
    try { await mutate('abort_analysis', { ticketId: selected.id, expectedRevision: selected.revision, attemptId: selected.attemptId, reason: 'user_cancelled' }); await reload(true, selected.id) }
    catch (reason) { setError(failureCode(reason as Error)) }
    finally { setBusy(false); setAbortOpen(false) }
  }
  function refresh() { guard(() => void reload(true)) }
  const setStatus = (status: string) => setQuery(current => ({ ...current, page: 1, parameters: status === 'all' ? {} : { status: status as TicketStatus } }))
  return <I18nContext.Provider value={i18n}><div className="app-shell" data-testid="app-shell">
    <header className="app-header"><div className="app-identity"><span className="app-mark"><ClipboardList className="size-5" /></span><div><h1>{t('app')}</h1><p>{t('subtitle')}</p></div></div><div className="header-actions"><Button variant="ghost" size="icon" onClick={() => setQueueOpen(!queueOpen)} aria-label={t(queueOpen ? 'hideQueue' : 'showQueue')} className="queue-toggle">{queueOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</Button><Button variant="outline" onClick={refresh} disabled={!connected || busy || loading} aria-label={t('refresh')}><RefreshCw className={loading ? 'animate-spin' : ''} /><span className="refresh-label">{t('refresh')}</span></Button><Button onClick={() => guard(() => setCreateOpen(true))} disabled={!connected || busy}><Plus />{t('create')}</Button></div></header>
    {error && <ErrorNotice code={error} onRefresh={refresh} />}
    {notice && <div className="notice notice-success" role="status"><Check className="size-4" /><p>{t(notice)}</p></div>}
    <div className="workbench-layout" data-queue-open={queueOpen} data-selected={Boolean(selected)}>
      <aside className="queue-pane" aria-label={t('queue')}><div className="queue-heading"><h2>{t('queue')}</h2><span className="queue-count">{list.total}</span></div><div className="queue-filters"><div className="search-field"><Search className="size-4" /><Input aria-label={t('search')} placeholder={t('search')} value={search} onChange={event => setSearch(event.target.value)} maxLength={120} /></div><Select value={query.parameters?.status ?? 'all'} onValueChange={setStatus}><SelectTrigger className="w-full" aria-label={t('all')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{(Object.keys(statusKeys) as TicketStatus[]).map(status => <SelectItem value={status} key={status}>{t(statusKeys[status])}</SelectItem>)}</SelectContent></Select></div>
        <div className="ticket-list" aria-busy={loading}>{!connected ? <div className="queue-loading" role="status">{t(connectionFailed ? 'disconnected' : 'connecting')}</div> : list.items.length ? list.items.map(ticket => <button className="ticket-row" key={ticket.id} data-active={selected?.id === ticket.id} aria-current={selected?.id === ticket.id ? 'true' : undefined} onClick={() => guard(() => void selectTicket(ticket.id))} disabled={busy}><div className="ticket-row-top"><span>{ticket.customerAlias}</span><time>{date(ticket.updatedAt)}</time></div><h3>{ticket.title}</h3><p>{ticket.summary ?? ticket.title}</p><div className="ticket-row-bottom"><Status status={ticket.status} /><span className="ticket-short-id">{ticket.id.slice(0, 6).toUpperCase()}</span></div></button>) : loading ? <div className="queue-loading" role="status">{t('loading')}</div> : <EmptyState title={search || query.parameters?.status ? 'noMatches' : 'emptyTitle'} action={(search || query.parameters?.status) && <Button size="sm" variant="outline" onClick={() => { setSearch(''); setStatus('all') }}>{t('clearFilters')}</Button>} />}</div>
        <div className="queue-pagination"><span>{t('pagination', { page: list.page, total: list.total })}</span><div><Button size="icon-sm" variant="ghost" aria-label={t('previous')} disabled={list.page <= 1 || loading} onClick={() => setQuery(current => ({ ...current, page: list.page - 1 }))}><ChevronLeft /></Button><Button size="icon-sm" variant="ghost" aria-label={t('next')} disabled={list.page * list.pageSize >= list.total || loading} onClick={() => setQuery(current => ({ ...current, page: list.page + 1 }))}><ChevronRight /></Button></div></div>
      </aside>
      <main className="main-pane">{selected ? <Review ticket={selected} draft={draft} dirty={dirty} changed={changed} busy={busy} setDraft={setDraft} onAnalyze={() => void analyze()} onAbort={() => setAbortOpen(true)} onSave={() => void confirm()} onReload={refresh} /> : <EmptyState title={list.total ? 'selectTitle' : 'emptyTitle'} hint={list.total ? 'selectHint' : 'emptyHint'} action={<Button onClick={() => setCreateOpen(true)} disabled={!connected}><Plus />{t('create')}</Button>} />}</main>
    </div>
    <footer className="app-footer"><span><span className={`connection-dot ${connected ? 'is-connected' : ''}`} />{t(connected ? 'connected' : 'connecting')}</span><span>{selected ? t('revision', { revision: selected.revision }) : t('noSelection')}{dirty && <strong>{t('dirty')}</strong>}</span></footer>
    <CreateTicket open={createOpen} busy={busy} onClose={() => setCreateOpen(false)} onCreate={create} />
    <AlertDialog open={Boolean(pendingNavigation)} onOpenChange={open => { if (!open) setPendingNavigation(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsavedTitle')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedHint')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction onClick={() => { const action = pendingNavigation; setPendingNavigation(null); action?.() }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={abortOpen} onOpenChange={setAbortOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('abortTitle')}</AlertDialogTitle><AlertDialogDescription>{t('abortHint')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => void abort()}>{t('abort')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div></I18nContext.Provider>
}
createRoot(document.getElementById('root')!).render(<App />)
