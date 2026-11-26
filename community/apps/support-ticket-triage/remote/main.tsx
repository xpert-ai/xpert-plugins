import { ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, type XpertViewQuery } from '@xpert-ai/contracts'
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod/v3'
import { categories, draftSchema, intakeSchema, priorities, reviewSchema, type Review } from '../src/domain'
import { object, request, startBridge } from './bridge'
import { i18n, type MessageKey } from './i18n'
import './layout.css'

const ticketSummary = z.object({
  id: z.string().uuid(), title: z.string(), status: z.enum(['new', 'draft', 'reviewed']),
  priority: z.enum(priorities).nullable(), createdAt: z.string()
})
const detail = ticketSummary.extend({
  description: z.string(), revision: z.number().int(),
  draft: draftSchema.nullable(),
  review: reviewSchema.omit({ id: true, draftRevision: true }).nullable()
})
const list = z.object({ items: z.array(ticketSummary), total: z.number() })
type Detail = z.infer<typeof detail>
const t = i18n.t

function Workbench({ initial, refreshTick }: { initial: XpertViewQuery; refreshTick: number }) {
  useRemoteLocale(i18n)
  const [page, setPage] = useState(initial.page ?? 1)
  const [selected, setSelected] = useState(initial.selectionId ?? '')
  const [rows, setRows] = useState<z.infer<typeof list> | null>(null)
  const [ticket, setTicket] = useState<Detail | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [create, setCreate] = useState(false)
  const [notice, setNotice] = useState<MessageKey | null>(null)
  const reload = () => setRefresh((x) => x + 1)

  useEffect(() => {
    let active = true
    void request('requestData', { query: { page } }).then((raw) => {
      if (active) setRows(list.parse(raw))
    }).catch(() => {
      if (active) setNotice('error')
    })
    return () => { active = false }
  }, [page, refresh, refreshTick])

  useEffect(() => {
    if (!selected) return
    let active = true
    void request('requestData', { query: { selectionId: selected } }).then((raw) => {
      if (active) setTicket(detail.parse(object(raw).item))
    }).catch(() => {
      if (active) setNotice('error')
    })
    return () => { active = false }
  }, [selected, refresh, refreshTick])

  function open(id: string) {
    setSelected(id)
    setCreate(false)
    setNotice(null)
  }

  return <main className="triage-layout">
    <aside className="triage-queue">
      <header className="triage-header">
        <h1>{t('queue')}</h1>
        <Button size="sm" onClick={() => { setCreate(true); setNotice(null) }}>{t('create')}</Button>
      </header>
      <div className="triage-rows">
        {rows === null ? <p>{t('loading')}</p> : rows.items.length === 0 ? <p>{t('empty')}</p> :
          rows.items.map((row) => <Button key={row.id} variant={selected === row.id && !create ? 'secondary' : 'ghost'}
            className="triage-row" onClick={() => open(row.id)} aria-pressed={selected === row.id && !create}>
            <span>{row.title}</span><small>{t(`status.${row.status}`)} {row.priority}</small>
          </Button>)}
      </div>
      {rows && rows.total > 15 && <footer className="triage-pagination">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('previous')}</Button>
        <span>{t('page', { page })}</span>
        <Button size="sm" variant="outline" disabled={page * 15 >= rows.total} onClick={() => setPage(page + 1)}>{t('next')}</Button>
      </footer>}
    </aside>
    <section className="triage-work">
      <header className="triage-header">
        <h2>{create ? t('create') : ticket?.id === selected ? ticket.title : t('description')}</h2>
        <Button size="sm" variant="outline" onClick={() => { setNotice(null); reload() }}>{t('refresh')}</Button>
      </header>
      <div className="triage-body">
        {notice && <p role="alert" className="triage-error">{t(notice)}</p>}
        {create ? <Intake onCancel={() => setCreate(false)} onSaved={(id) => { setPage(1); open(id); reload() }} /> :
          ticket?.id === selected ? <TicketPanel key={`${ticket.id}/${ticket.revision}`} ticket={ticket} onChanged={reload} /> :
            <p>{t(selected ? 'loading' : 'choose')}</p>}
      </div>
    </section>
  </main>
}

async function action(actionKey: string, input: object) {
  const result = object(await request('executeAction', { actionKey, input }))
  if (result.success === true) return true
  if (object(result.failure).code === 'state_conflict') throw new Error('conflict')
  throw new Error('error')
}

function Intake({ onCancel, onSaved }: { onCancel: () => void; onSaved: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const savedAttempt = useRef<{ id: string; title: string; description: string }>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<MessageKey | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const prior = savedAttempt.current
    const id = prior?.title === title && prior.description === description ? prior.id : crypto.randomUUID()
    const parsed = intakeSchema.safeParse({ id, title, description })
    if (!parsed.success) { setNotice('invalid'); return }
    savedAttempt.current = { id, title, description }
    setBusy(true)
    setNotice(null)
    try { await action('create', parsed.data); onSaved(id) }
    catch { setNotice('error') }
    finally { setBusy(false) }
  }

  return <form onSubmit={submit} className="triage-fields">
    <label htmlFor="subject">{t('title')}</label>
    <Input id="subject" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={160} />
    <label htmlFor="report">{t('description')}</label>
    <Textarea id="report" rows={7} value={description} onChange={(e) => setDescription(e.target.value)} required minLength={5} maxLength={4000} />
    {notice && <p role="alert" className="triage-error">{t(notice)}</p>}
    <div className="triage-actions"><Button disabled={busy} type="submit">{t('save')}</Button><Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>{t('cancel')}</Button></div>
  </form>
}

function TicketPanel({ ticket, onChanged }: { ticket: Detail; onChanged: () => void }) {
  const [requested, setRequested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<MessageKey | null>(null)
  const [review, setReview] = useState<Review | null>(() => {
    const draft = ticket.draft
    return draft && { category: draft.category, priority: draft.priority, reply: draft.reply }
  })
  async function analyse() {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const result = object(await request('invokeClientCommand', {
        commandKey: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
        payload: { text: t('prompt', { id: ticket.id }), clientMessageId: crypto.randomUUID() }
      }))
      if (result.success !== true) throw new Error('chat_error')
      setRequested(true)
    } catch { setNotice('chatError'); setRequested(true) }
    finally { setBusy(false) }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const parsed = reviewSchema.safeParse({ ...review, id: ticket.id, draftRevision: ticket.revision })
    if (!parsed.success) { setNotice('invalid'); return }
    setBusy(true)
    setNotice(null)
    try { await action('review', parsed.data); onChanged() }
    catch (error) { setNotice(error instanceof Error && error.message === 'conflict' ? 'conflict' : 'error') }
    finally { setBusy(false) }
  }

  return <>
    <p className="triage-muted">{t(`status.${ticket.status}`)} · {i18n.date(ticket.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
    <h3>{t('description')}</h3><p className="triage-copy">{ticket.description}</p>
    {notice && <p role="alert" className="triage-error">{t(notice)}</p>}
    {ticket.status === 'new' && <>
      {requested && !notice && <p role="status">{t('analysing')}</p>}
      <Button disabled={busy} onClick={() => void analyse()}>{t(requested ? 'retry' : 'analyse')}</Button>
    </>}
    {ticket.draft && <section className="triage-result">
      <h3>{t('summary')}</h3><p className="triage-copy">{ticket.draft.summary}</p>
      <h3>{t('rationale')}</h3><p className="triage-copy">{ticket.draft.rationale}</p>
      {ticket.draft.needsClarification && <p role="status">{t('clarification')}</p>}
    </section>}
    {ticket.status === 'draft' && review && <form onSubmit={save} className="triage-fields">
      <label htmlFor="category">{t('category')}</label>
      <Select value={review.category} onValueChange={(value) => {
        const category = categories.find((item) => item === value)
        if (category) setReview({ ...review, category })
      }}><SelectTrigger id="category"><SelectValue /></SelectTrigger>
        <SelectContent>{categories.map((item) => <SelectItem key={item} value={item}>{t(`category.${item}`)}</SelectItem>)}</SelectContent>
      </Select>
      <label htmlFor="priority">{t('priority')}</label>
      <Select value={review.priority} onValueChange={(value) => {
        const priority = priorities.find((item) => item === value)
        if (priority) setReview({ ...review, priority })
      }}><SelectTrigger id="priority"><SelectValue /></SelectTrigger>
        <SelectContent>{priorities.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
      </Select>
      <label htmlFor="reply">{t('reply')}</label>
      <Textarea id="reply" rows={6} value={review.reply} onChange={(e) => setReview({ ...review, reply: e.target.value })} maxLength={1800} required />
      <div className="triage-actions"><Button type="submit" disabled={busy}>{t('review')}</Button></div>
    </form>}
    {ticket.review && <section className="triage-result">
      <p role="status">{t('saved')}</p>
      <p>{t(`category.${ticket.review.category}`)} · {ticket.review.priority}</p>
      <h3>{t('reviewedReply')}</h3><p className="triage-copy">{ticket.review.reply}</p>
    </section>}
  </>
}

const mount = document.getElementById('root')
if (!mount) throw new Error('Missing view root')
const root = createRoot(mount)
let initial: XpertViewQuery = {}
let refreshTick = 0
let session = 0
function render() {
  root.render(<RemoteI18nProvider i18n={i18n}><Workbench key={session} initial={initial} refreshTick={refreshTick} /></RemoteI18nProvider>)
}
startBridge((query) => { initial = query; session++; render() }, () => { refreshTick++; render() })
