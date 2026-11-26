import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea,
} from '@xpert-ai/plugin-shadcn-ui'
import { createRemoteI18n, RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import type { AttemptRef, ErrorCode, Ticket, TicketDecision } from '../src/contracts'
import { action, categoryCodes, priorityCodes } from '../src/contracts'
import { BridgeError, connect, listTickets, runAction, sendTriage } from './bridge'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import './layout.css'

const i18n = createRemoteI18n({ en, 'zh-Hans': zh })
const t = i18n.t
const errorCode = (error: unknown): ErrorCode => error instanceof BridgeError ? error.code : 'unavailable'

function Review({ ticket, busy, confirm }: {
  ticket: Ticket
  busy: boolean
  confirm: (value: TicketDecision) => Promise<void>
}) {
  const [value, setValue] = useState<TicketDecision | null>(ticket.ai)
  if (!ticket.ai || !value) return null
  return (
    <section className="section">
      <h3>{t('reviewTitle')}</h3>
      <dl className="section">
        <div><dt>{t('evidence')}</dt><dd><q>{ticket.ai.evidence}</q></dd></div>
        <div><dt>{t('rationale')}</dt><dd>{ticket.ai.rationale}</dd></div>
      </dl>
      {ticket.final ? (
        <div className="section">
          <h3>{t('savedDecision')}</h3>
          <p>{ticket.final.summary}</p>
          <div className="controls">
            <Badge variant="secondary">{t(ticket.final.category)}</Badge>
            <Badge variant="secondary">{t(ticket.final.priority)}</Badge>
          </div>
        </div>
      ) : (
        <form className="section" onSubmit={(event) => { event.preventDefault(); void confirm(value) }}>
          <label htmlFor="triage-summary">{t('summary')}</label>
          <Textarea id="triage-summary" rows={3} value={value.summary} maxLength={300} required
            disabled={busy} onChange={(event) => setValue({ ...value, summary: event.currentTarget.value })} />
          <div className="choice-grid">
            <div className="section">
              <label id="triage-category-label">{t('category')}</label>
              <Select value={value.category} disabled={busy} onValueChange={(selected) => {
                const category = categoryCodes.find((option) => option === selected)
                if (category) setValue({ ...value, category })
              }}>
                <SelectTrigger aria-labelledby="triage-category-label"><SelectValue /></SelectTrigger>
                <SelectContent>{categoryCodes.map((option) => <SelectItem key={option} value={option}>{t(option)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="section">
              <label id="triage-priority-label">{t('priority')}</label>
              <Select value={value.priority} disabled={busy} onValueChange={(selected) => {
                const priority = priorityCodes.find((option) => option === selected)
                if (priority) setValue({ ...value, priority })
              }}>
                <SelectTrigger aria-labelledby="triage-priority-label"><SelectValue /></SelectTrigger>
                <SelectContent>{priorityCodes.map((option) => <SelectItem key={option} value={option}>{t(option)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Button type="submit" disabled={busy || !value.summary.trim()}>{t('confirm')}</Button></div>
        </form>
      )}
    </section>
  )
}

function App() {
  useRemoteLocale(i18n)
  const [ready, setReady] = useState(false)
  const [tickets, setTickets] = useState<Ticket[]>()
  const [selected, setSelected] = useState<string>()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorCode>()
  const createId = useRef(crypto.randomUUID())
  const actionPending = useRef(false)
  const latestRead = useRef(0)
  const refresh = useCallback(async () => {
    const sequence = ++latestRead.current
    try {
      const items = await listTickets()
      if (sequence === latestRead.current) {
        setTickets(items)
        setSelected((id) => items.some((item) => item.id === id) ? id : items[0]?.id)
      }
    } catch (failure) {
      if (sequence === latestRead.current) setError(errorCode(failure))
    }
  }, [])

  useEffect(() => connect((locale) => {
    i18n.setLocale(locale)
    setReady(true)
  }), [])
  useEffect(() => {
    if (ready) void refresh()
  }, [ready, refresh])
  const hasProcessing = tickets?.some((item) => item.status === 'processing')
  useEffect(() => {
    if (!hasProcessing) return
    const timer = setInterval(() => void refresh(), 2500)
    return () => clearInterval(timer)
  }, [hasProcessing, refresh])

  async function mutate(operation: () => Promise<void>) {
    if (actionPending.current) return
    actionPending.current = true
    setBusy(true)
    setError(undefined)
    try {
      await operation()
    } catch (failure) {
      setError(errorCode(failure))
    } finally {
      await refresh()
      actionPending.current = false
      setBusy(false)
    }
  }

  function saveTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void mutate(async () => {
      const result = await runAction<Ticket>(action.create, { id: createId.current, subject, body })
      if (!result) throw new BridgeError('unavailable')
      createId.current = crypto.randomUUID()
      setSubject('')
      setBody('')
      setSelected(result.id)
    })
  }

  function start(ticket: Ticket) {
    void mutate(async () => {
      const attempt = await runAction<AttemptRef>(action.begin, { id: ticket.id, revision: ticket.revision })
      if (!attempt) throw new BridgeError('unavailable')
      try {
        await sendTriage(attempt)
      } catch (failure) {
        // A lost acknowledgement does not tell us whether ChatKit started the run.
        if (failure instanceof BridgeError && failure.code === 'timed_out') throw failure
        await runAction(action.dispatchFailed, attempt)
        throw new BridgeError('dispatch_failed')
      }
    })
  }

  const ticket = tickets?.find(({ id }) => id === selected)
  return (
    <main className="triage">
      <header className="heading">
        <h1>{t('title')}</h1>
        <Button type="button" variant="outline" disabled={!ready || busy} onClick={() => {
          setError(undefined)
          void refresh()
        }}>{t('refresh')}</Button>
      </header>
      {error && <p role="alert">{t(error)}</p>}
      <div className="workspace">
        <aside className="section">
          <form className="section" onSubmit={saveTicket}>
            <h2>{t('newTicket')}</h2>
            <label htmlFor="ticket-subject">{t('subject')}</label>
            <Input id="ticket-subject" maxLength={120} value={subject} disabled={busy}
              required onChange={(event) => setSubject(event.currentTarget.value)} />
            <label htmlFor="ticket-body">{t('body')}</label>
            <Textarea id="ticket-body" rows={4} minLength={10} maxLength={6000} value={body} disabled={busy}
              placeholder={t('bodyPlaceholder')} required onChange={(event) => setBody(event.currentTarget.value)} />
            <div><Button type="submit" disabled={!ready || busy || !subject.trim() || body.trim().length < 10}>{t('saveTicket')}</Button></div>
          </form>
          <section className="section ticket-list">
            <h2>{t('queue')}</h2>
            {!tickets && !error && <p role="status">{t('loading')}</p>}
            {tickets?.length === 0 && <p>{t('empty')}</p>}
            {!!tickets?.length && <p>{t('queueHint')}</p>}
            <ul>
              {tickets?.map((item) => (
                <li key={item.id}>
                  <Button type="button" variant={item.id === selected ? 'secondary' : 'ghost'} disabled={busy}
                    aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}>
                    <span className="ticket-subject">{item.subject}</span>
                    <Badge variant="outline">{t(item.status)}</Badge>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
        <section className="section detail">
          {!ticket && !!tickets?.length && <p>{t('selectTicket')}</p>}
          {ticket && (
            <>
              <div className="heading">
                <h2>{ticket.subject}</h2>
                <Badge variant="outline">{t(ticket.status)}</Badge>
              </div>
              <div className="section">
                <h3>{t('body')}</h3>
                <p className="message">{ticket.body}</p>
              </div>
              {ticket.failure && <p role="alert">{t(ticket.failure)}</p>}
              {(ticket.status === 'new' || ticket.status === 'failed') && (
                <div><Button onClick={() => start(ticket)} disabled={busy}>
                  {t(ticket.status === 'failed' ? 'retry' : 'run')}
                </Button></div>
              )}
              {ticket.status === 'processing' && <p role="status">{t('processingHelp')}</p>}
              {ticket.ai && <Review key={ticket.id + ':' + ticket.revision} ticket={ticket} busy={busy} confirm={
                (value) => mutate(async () => {
                  await runAction(action.confirm, { id: ticket.id, revision: ticket.revision, ...value })
                })
              } />}
            </>
          )}
        </section>
      </div>
    </main>
  )
}

const mount = document.getElementById('root')
if (mount) createRoot(mount).render(<RemoteI18nProvider i18n={i18n}><App /></RemoteI18nProvider>)
