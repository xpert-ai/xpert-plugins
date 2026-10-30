import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Badge, Button, Input, Label, Textarea, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, Separator } from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'
import { i18n } from './i18n'
import { HostBridge } from './bridge'
import { intakeSchema, snapshotSchema, ticketSchema, type Ticket, type Analysis } from '../domain'

const bridge = new HostBridge()
type Key = keyof typeof en
const t = i18n.t
const categories: Analysis['category'][] = ['account', 'billing', 'technical', 'other']
const priorities: Analysis['priority'][] = ['low', 'normal', 'urgent']
function errorText(code: string) { const key = `error.${code}`; return t(key in en ? key as Key : 'error.generic') }

function App() {
  useRemoteLocale(i18n)
  const [connected, setConnected] = React.useState(false)
  const [items, setItems] = React.useState<Ticket[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [selected, setSelected] = React.useState<Ticket | null>(null)
  const [draft, setDraft] = React.useState<Analysis | null>(null)
  const [dirty, setDirty] = React.useState(false)
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [createMode, setCreateMode] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState(false)
  const [showDetails, setShowDetails] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const requestId = React.useRef(crypto.randomUUID())
  const latest = React.useRef({ selected, dirty, page })
  latest.current = { selected, dirty, page }
  const loadSequence = React.useRef(0)

  const load = async (currentPage = latest.current.page) => {
    const seq = ++loadSequence.current
    const result = await bridge.query(snapshotSchema, { page: String(currentPage) })
    if (seq !== loadSequence.current) return
    setItems(result.items); setTotal(result.total)
    const active = latest.current.selected
    if (active) {
      const fresh = result.items.find(item => item.id === active.id) ?? await bridge.query(ticketSchema, { id: active.id })
      if (seq !== loadSequence.current) return
      if (!latest.current.dirty) { setSelected(fresh); setDraft(fresh.confirmed ?? fresh.analysis) }
      else if (fresh.revision !== active.revision) setError('conflict')
    }
  }
  React.useEffect(() => {
    let alive = true
    bridge.connect().then(init => { if (alive) { i18n.setLocale(init.locale); installShadcnThemeVars(); setConnected(true); bridge.resize(); void load().catch(() => setError('generic')) } })
      .catch(() => { if (alive) setError('host_timeout') })
    const stop = bridge.onHostEvent(() => { void load().catch(() => setError('generic')) })
    const poll = setInterval(() => { if (latest.current.selected?.status === 'processing') void load().catch(() => setError('generic')) }, 4000)
    return () => { alive = false; stop(); clearInterval(poll); bridge.dispose() }
  }, [])
  React.useEffect(() => { if (connected) void load(page).catch(() => setError('generic')) }, [page])
  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await task() } catch (e) { setError(e instanceof Error ? e.message : 'generic') }
    finally { setBusy(false) }
  }
  const choose = (ticket: Ticket) => { latest.current.selected = ticket; latest.current.dirty = false; setSelected(ticket); setDraft(ticket.confirmed ?? ticket.analysis); setDirty(false); setCreateMode(false); setError('') }
  const act = async (action: string) => {
    if (!selected) return
    let result: Ticket
    try {
      result = await bridge.action(action, { id: selected.id, revision: selected.revision }, ticketSchema)
    } catch (error) {
      if (action !== 'analyze') throw error
      // A host request can expire before the bounded model call finishes. Read the
      // persisted lease/result and let the existing processing poll recover it.
      result = await bridge.query(ticketSchema, { id: selected.id })
      if (result.revision === selected.revision) throw error
    }
    setSelected(result); setDraft(result.confirmed ?? result.analysis); setDirty(false)
    await load()
  }
  const edit = <K extends keyof Analysis>(field: K, value: Analysis[K]) => { if (draft) { setDraft({ ...draft, [field]: value }); setDirty(true) } }
  const display = selected?.confirmed ?? draft
  const saveTicket = async () => {
    const input = intakeSchema.safeParse({ requestId: requestId.current, subject, body })
    if (!input.success) throw new Error('invalid_input')
    const result = await bridge.action('create', input.data, ticketSchema)
    requestId.current = crypto.randomUUID(); setSubject(''); setBody(''); choose(result); await load()
  }
  return <main className="shell font-sans bg-background text-foreground">
    <header className="flex items-center justify-between gap-3 border-b p-4">
      <div><h1 className="font-semibold">{t('title')}</h1><p className="text-sm text-muted-foreground">{t('subtitle')}</p></div>
      <div className="flex gap-2"><Button variant="outline" disabled={!connected || busy} onClick={() => run(() => load())}>{t('refresh')}</Button>
        <Button disabled={!connected || busy || dirty} onClick={() => { setCreateMode(true); setError('') }}>{t('new')}</Button></div>
    </header>
    {error && <div role="alert" className="border-b p-3 text-destructive">{errorText(error)}</div>}
    <div className={`workspace ${collapsed ? 'collapsed' : ''}`}>
      <aside className="border-r flex min-h-0 flex-col">
        <div className="flex items-center justify-between gap-2 p-3"><span className={collapsed ? 'sr-only' : 'font-medium'}>{t('history')}</span>
          <Button variant="ghost" aria-label={t('collapse')} onClick={() => setCollapsed(!collapsed)}>{collapsed ? '›' : '‹'}</Button></div>
        {!collapsed && <><Separator/><div className="ticket-list">
          {!items.length && <p className="p-4 text-sm text-muted-foreground">{connected ? t('empty') : t('loading')}</p>}
          {items.map(ticket => <Button key={ticket.id} variant={ticket.id === selected?.id && !createMode ? 'secondary' : 'ghost'}
            className="ticket-row" disabled={busy || dirty} onClick={() => choose(ticket)}>
            <span className="truncate">{ticket.subject}</span><Badge variant="outline">{t(`status.${ticket.status}`)}</Badge>
          </Button>)}
        </div><div className="border-t p-3 space-y-2"><p className="text-xs text-muted-foreground">{t('page', { page, total })}</p>
          <div className="flex gap-2"><Button variant="outline" disabled={page === 1 || busy || dirty} onClick={() => setPage(page - 1)}>{t('back')}</Button>
          <Button variant="outline" disabled={page * 30 >= total || busy || dirty} onClick={() => setPage(page + 1)}>{t('next')}</Button></div></div></>}
      </aside>
      <section className="content">
        {createMode ? <section className="max-w-3xl space-y-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">{t('new')}</h2><Button type="button" variant="ghost" onClick={() => { setSubject(t('sample.subject')); setBody(t('sample.body')); requestId.current = crypto.randomUUID() }}>{t('sample')}</Button></div>
          <Separator/><div className="space-y-2"><Label htmlFor="subject">{t('subject')}</Label><Input id="subject" required minLength={3} maxLength={160} value={subject} onChange={e => { setSubject(e.target.value); requestId.current = crypto.randomUUID() }}/></div>
          <div className="space-y-2"><Label htmlFor="body">{t('body')}</Label><Textarea id="body" className="min-h-48" required minLength={10} maxLength={12000} value={body} onChange={e => { setBody(e.target.value); requestId.current = crypto.randomUUID() }}/></div>
          <div className="flex gap-2"><Button type="button" disabled={busy} onClick={() => run(saveTicket)}>{busy ? t('creating') : t('create')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setCreateMode(false)}>{t('cancel')}</Button></div>
        </section> : !selected ? <div className="empty text-muted-foreground">{connected ? t('select') : t('loading')}</div> : <div className="space-y-5 max-w-4xl">
          <div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{selected.subject}</h2><Badge variant="outline">{t(`status.${selected.status}`)}</Badge></div><Separator/>
          <section className="space-y-2"><h3 className="font-medium">{t('original')}</h3><p className="whitespace-pre-wrap text-sm leading-relaxed">{selected.body}</p></section>
          {(selected.status === 'new' || selected.status === 'failed') && <div className="space-y-3">
            {selected.failureCode && <p role="status" className="text-destructive">{errorText(selected.failureCode)}</p>}
            <Button disabled={busy} onClick={() => run(() => act('analyze'))}>{busy ? t('working') : t(selected.status === 'failed' ? 'retry' : 'analyze')}</Button>
            <div><Button variant="ghost" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>{t('details')}</Button>{showDetails && <div className="space-y-2 pt-3"><p className="text-sm">{t('attempts', { count: selected.attempts })}</p><Button variant="outline" disabled={busy} onClick={() => run(() => act('simulate_failure'))}>{t('demo')}</Button></div>}</div>
          </div>}
          {selected.status === 'processing' && <p role="status">{t('working')}</p>}
          {display && <section className="space-y-4">
            <h3 className="font-medium">{t(selected.status === 'confirmed' ? 'confirmed' : 'review')}</h3><Separator/>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="category">{t('category')}</Label><Select value={display.category} disabled={busy || selected.status === 'confirmed'} onValueChange={v => { if (categories.includes(v as Analysis['category'])) edit('category', v as Analysis['category']) }}><SelectTrigger id="category"><SelectValue/></SelectTrigger><SelectContent>{categories.map(v => <SelectItem key={v} value={v}>{t(`category.${v}`)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="priority">{t('priority')}</Label><Select value={display.priority} disabled={busy || selected.status === 'confirmed'} onValueChange={v => { if (priorities.includes(v as Analysis['priority'])) edit('priority', v as Analysis['priority']) }}><SelectTrigger id="priority"><SelectValue/></SelectTrigger><SelectContent>{priorities.map(v => <SelectItem key={v} value={v}>{t(`priority.${v}`)}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {(['summary', 'evidence', 'reply'] as const).map(field => <div key={field} className="space-y-2"><Label htmlFor={field}>{t(field)}</Label><Textarea id={field} readOnly={selected.status === 'confirmed'} disabled={busy} className={field === 'reply' ? 'min-h-40' : ''} value={display[field]} onChange={e => edit(field, e.target.value)}/></div>)}
            <p className="text-sm text-muted-foreground">{t('note')}</p>
            {selected.status === 'review' && <Button disabled={busy || !draft} onClick={() => run(async () => {
              if (!draft) return
              const result = await bridge.action('confirm', { id: selected.id, revision: selected.revision, result: draft }, ticketSchema)
              latest.current.dirty = false; setDirty(false); setSelected(result); setDraft(result.confirmed); await load()
            })}>{t('confirm')}</Button>}
            {selected.confirmedAt && <p role="status" className="text-sm text-muted-foreground">{t('saved')} · {i18n.date(selected.confirmedAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>}
          </section>}
        </div>}
      </section>
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<RemoteI18nProvider i18n={i18n}><App/></RemoteI18nProvider>)
