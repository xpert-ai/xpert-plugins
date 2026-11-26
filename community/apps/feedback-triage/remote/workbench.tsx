import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Button,
  ChevronLeft,
  ChevronRight,
  Label,
  Plus,
  RefreshCw,
  Sparkles,
  Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import { useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { MAX_SOURCE_LENGTH, MIN_SOURCE_LENGTH, type Analysis, type Ticket } from '../src/domain'
import type { WorkbenchBridge } from './bridge'
import { i18n, t, type MessageKey } from './i18n'
import { TicketPanel, TicketStatus } from './ticket-panel'

type Operation = 'create' | 'analyze' | 'confirm'
type Page = { tickets: Ticket[]; page: number; hasMore: boolean }

function errorKey(value: unknown): MessageKey {
  switch (value instanceof Error ? value.message : null) {
    case 'timeout':
      return 'errorTimeout'
    case 'invalid_response':
      return 'errorInvalidResponse'
    case 'not_found':
      return 'errorMissing'
    case 'invalid_input':
      return 'invalidSource'
    case 'request_id_reused':
    case 'conflict':
      return 'errorConflict'
    default:
      return 'errorConnection'
  }
}

export function Workbench({ bridge }: { bridge: WorkbenchBridge }) {
  useRemoteLocale(i18n)
  const [data, setData] = useState<Page | null>(null)
  const [selection, setSelection] = useState<string | null>(null)
  const [source, setSource] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState<Operation | null>(null)
  const [reading, setReading] = useState(false)
  const currentPage = useRef(1)
  const readSequence = useRef(0)
  const active = useRef(true)
  const writing = useRef(false)
  const request = useRef<{ source: string; id: string } | null>(null)
  const ticket = selection === 'new' ? null : data?.tickets.find((item) => item.id === selection) ?? data?.tickets[0]

  const refresh = useCallback(
    async (page = currentPage.current) => {
      const sequence = ++readSequence.current
      setReading(true)
      try {
        const response = await bridge.list(page)
        if (active.current && sequence === readSequence.current) {
          if (page !== currentPage.current) setSelection(null)
          currentPage.current = page
          setData({ ...response, page })
          setError(null)
        }
      } catch (err) {
        if (active.current && sequence === readSequence.current) setError(errorKey(err))
      } finally {
        if (active.current && sequence === readSequence.current) setReading(false)
      }
    },
    [bridge]
  )

  useEffect(() => {
    active.current = true
    void refresh()
    const unsubscribe = bridge.onRefresh(() => {
      if (!writing.current) void refresh()
    })
    return () => {
      unsubscribe()
      active.current = false
    }
  }, [bridge, refresh])

  // A different browser or a chat tool can own the in-flight model request.
  useEffect(() => {
    if (busy || reading || !data?.tickets.some((item) => item.status === 'processing')) return
    const timer = window.setTimeout(() => void refresh(), 5000)
    return () => window.clearTimeout(timer)
  }, [busy, reading, data, refresh])

  function reflect(item: Ticket) {
    if (!active.current) return
    ++readSequence.current
    setReading(false)
    setSelection(item.id)
    const targetPage = currentPage.current
    setData((previous) => {
      const page = previous?.page === targetPage ? previous : null
      return {
        page: targetPage,
        hasMore: page?.hasMore ?? false,
        tickets: [item, ...(page?.tickets.filter((row) => row.id !== item.id) ?? [])].slice(0, 30)
      }
    })
  }
  async function run(operation: Operation, text?: string, category?: Analysis['category']) {
    if (writing.current) return
    writing.current = true
    setError(null)
    setBusy(operation)
    try {
      let id = ticket?.id
      if (operation === 'create' && text) {
        // The reply may be lost after a successful insert. Reuse the same key for this text.
        if (request.current?.source !== text) request.current = { source: text, id: crypto.randomUUID() }
        const created = await bridge.act({
          key: 'create_ticket',
          input: { source: text, requestId: request.current.id }
        })
        if (!active.current) return
        id = created.id
        currentPage.current = 1
        reflect(created)
        setSource('')
        setInvalid(false)
        request.current = null
        if (created.status !== 'draft') {
          await refresh()
          return
        }
        setBusy('analyze')
      }
      if (!id) return
      const item = await bridge.act(
        operation === 'confirm'
          ? { key: 'confirm_ticket', input: { id, category } }
          : { key: 'analyze_ticket', input: { id } }
      )
      if (!active.current) return
      reflect(item)
      await refresh()
    } catch (err) {
      if (active.current) setError(errorKey(err))
    } finally {
      if (active.current) setBusy(null)
      writing.current = false
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = source.trim()
    if (trimmed.length < MIN_SOURCE_LENGTH || trimmed.length > MAX_SOURCE_LENGTH) {
      setInvalid(true)
      const field = event.currentTarget.elements.namedItem('feedback-source')
      if (field instanceof HTMLTextAreaElement) field.focus()
      return
    }
    void run('create', trimmed)
  }

  return (
    <main className="workspace">
      <header className="toolbar">
        <h1>{t('title')}</h1>
        <div className="controls">
          <Button variant="outline" disabled={reading || !!busy} onClick={() => void refresh()}>
            <RefreshCw aria-hidden />
            {t('refresh')}
          </Button>
          {ticket && (
            <Button
              disabled={!!busy}
              onClick={() => {
                setSelection('new')
                setError(null)
              }}
            >
              <Plus aria-hidden />
              {t('newTicket')}
            </Button>
          )}
        </div>
      </header>
      {error && (
        <p className="request-error" role="alert">
          {t(error)}
        </p>
      )}
      {!data ? (
        !error && (
          <p className="helper" role="status">
            {t('loading')}
          </p>
        )
      ) : (
        <div className="columns">
          <aside className="history" aria-label={t('recent')}>
            <div className="history-heading">
              <h2>{t('recent')}</h2>
              {(data.page > 1 || data.hasMore) && (
                <nav className="controls pagination" aria-label={t('recent')}>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={!!busy || reading || data.page === 1}
                    aria-label={t('previous')}
                    onClick={() => void refresh(data.page - 1)}
                  >
                    <ChevronLeft aria-hidden />
                  </Button>
                  <span className="metadata">{t('page', { page: data.page })}</span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={!!busy || reading || !data.hasMore}
                    aria-label={t('next')}
                    onClick={() => void refresh(data.page + 1)}
                  >
                    <ChevronRight aria-hidden />
                  </Button>
                </nav>
              )}
            </div>
            {!data.tickets.length && <p className="helper">{t('emptyList')}</p>}
            <ul className="history-list">
              {data.tickets.map((row) => (
                <li className="history-row" key={row.id}>
                  <div className="history-meta">
                    <Button
                      size="sm"
                      variant={ticket?.id === row.id ? 'secondary' : 'ghost'}
                      aria-pressed={ticket?.id === row.id}
                      aria-label={t('openTicket', { id: row.id.slice(0, 8) })}
                      disabled={!!busy}
                      onClick={() => {
                        setSelection(row.id)
                        setError(null)
                      }}
                    >
                      {row.id.slice(0, 8)}
                    </Button>
                    <TicketStatus status={row.status} />
                  </div>
                  <p className="history-summary">{row.analysis?.summary ?? row.source}</p>
                </li>
              ))}
            </ul>
          </aside>
          {ticket ? (
            <TicketPanel
              key={ticket.id + '/' + ticket.attempts}
              ticket={ticket}
              busy={!!busy}
              analyzing={busy === 'analyze'}
              onAnalyze={() => void run('analyze')}
              onConfirm={(category) => void run('confirm', undefined, category)}
            />
          ) : (
            <section className="composer">
              <div>
                <h2>{t('composeTitle')}</h2>
                <p className="helper">{t('composeHelp')}</p>
              </div>
              <form className="compose-form" onSubmit={submit}>
                <div className="compose-field">
                  <Label htmlFor="feedback-source">{t('sourceLabel')}</Label>
                  <Textarea
                    name="feedback-source"
                    id="feedback-source"
                    rows={7}
                    value={source}
                    disabled={!!busy}
                    maxLength={MAX_SOURCE_LENGTH}
                    placeholder={t('sourcePlaceholder')}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? 'source-invalid source-count' : 'source-count'}
                    onChange={(event) => {
                      setSource(event.target.value)
                      setInvalid(false)
                    }}
                  />
                  {invalid && (
                    <p className="request-error" id="source-invalid" role="alert">
                      {t('invalidSource')}
                    </p>
                  )}
                </div>
                <div className="compose-footer">
                  <Button type="submit" disabled={!!busy}>
                    <Sparkles aria-hidden />
                    {t(busy ? 'working' : 'submit')}
                  </Button>
                  <span className="field-count" id="source-count">
                    {t('sourceLength', { length: source.length, max: MAX_SOURCE_LENGTH })}
                  </span>
                </div>
              </form>
            </section>
          )}
        </div>
      )}
    </main>
  )
}
