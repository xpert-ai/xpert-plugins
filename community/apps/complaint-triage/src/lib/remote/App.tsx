import { useCallback, useEffect, useRef, useState } from 'react'
import type { Resolution, TicketDetail, TicketStatus } from '../domain/contracts.js'
import type { ListQuery, TicketPage } from './api.js'
import { CreateTicketDialog } from './components/CreateTicketDialog.js'
import { TicketDetailView } from './components/TicketDetailView.js'
import { TicketList } from './components/TicketList.js'
import { useServices } from './context.js'
import { isMessageKey } from './i18n.js'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300
// Fallback for a missed host event: while a ticket is analyzing, ask the server every few seconds.
// The server also expires timed-out analyses on read, so polling is what surfaces a timeout.
const ANALYZING_POLL_MS = 4000

const EMPTY_PAGE: TicketPage = { items: [], total: 0, counts: { draft: 0, analyzing: 0, pending_review: 0, analysis_failed: 0, confirmed: 0 } }

export function App() {
  const { api, t, subscribeHostEvents } = useServices()
  const [query, setQuery] = useState<ListQuery>({ page: 1, pageSize: PAGE_SIZE, search: '', status: null })
  const [searchText, setSearchText] = useState('')
  const [page, setPage] = useState<TicketPage>(EMPTY_PAGE)
  const [listLoading, setListLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Host-event and timer callbacks outlive renders; they must read the latest query and selection.
  const queryRef = useRef(query)
  queryRef.current = query
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId
  const listRequest = useRef(0)
  const ticketRequest = useRef(0)

  const loadList = useCallback(async () => {
    const request = ++listRequest.current
    setListLoading(true)
    try {
      const next = await api.listTickets(queryRef.current)
      if (request !== listRequest.current) return
      setPage(next)
      setLoadFailed(false)
    } catch {
      if (request === listRequest.current) setLoadFailed(true)
    } finally {
      if (request === listRequest.current) setListLoading(false)
    }
  }, [api])

  const loadTicket = useCallback(
    async (ticketId: string) => {
      const request = ++ticketRequest.current
      try {
        const next = await api.getTicket(ticketId)
        if (request !== ticketRequest.current || selectedRef.current !== ticketId) return
        setTicket(next)
      } catch {
        if (request === ticketRequest.current) setNotice(t('common.loadFailed'))
      }
    },
    [api, t]
  )

  const refresh = useCallback(() => {
    void loadList()
    if (selectedRef.current) void loadTicket(selectedRef.current)
  }, [loadList, loadTicket])

  useEffect(() => {
    void loadList()
  }, [query, loadList])

  useEffect(() => {
    const timer = setTimeout(() => setQuery((current) => (current.search === searchText.trim() ? current : { ...current, search: searchText.trim(), page: 1 })), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchText])

  useEffect(() => {
    setTicket(null)
    if (selectedId) void loadTicket(selectedId)
  }, [selectedId, loadTicket])

  // The Assistant finished one of our tools: the ticket the user is looking at may have changed.
  useEffect(() => subscribeHostEvents(() => refresh()), [subscribeHostEvents, refresh])

  const analyzing = ticket?.status === 'analyzing'
  useEffect(() => {
    if (!analyzing) return undefined
    const timer = setInterval(refresh, ANALYZING_POLL_MS)
    return () => clearInterval(timer)
  }, [analyzing, refresh])

  function explain(code: string) {
    const key = `error.${code}`
    setNotice(t(isMessageKey(key) ? key : 'error.action_failed'))
  }

  async function analyze() {
    if (!ticket || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const outcome = await api.requestAnalysis(ticket.id)
      if (!outcome.ok) {
        explain(outcome.code)
        return
      }
      setTicket(outcome.data.ticket)
      // `started` is false when an attempt was already running (double click, second tab): the
      // request must not be sent to the Assistant twice.
      if (outcome.data.started) {
        const sent = await api.askAssistant(t('prompt.analyze', { ticketNo: outcome.data.ticket.ticketNo }))
        if (!sent.ok) {
          const failed = await api.reportDispatchFailure(ticket.id, outcome.data.attemptNo, sent.message)
          if (failed.ok) setTicket(failed.data)
        }
      }
    } catch {
      explain('action_failed')
    } finally {
      setBusy(false)
      refresh()
    }
  }

  async function confirm(resolution: Resolution) {
    if (!ticket || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const outcome = await api.confirmTicket(ticket.id, ticket.attemptCount, resolution)
      if (outcome.ok) setTicket(outcome.data)
      else explain(outcome.code)
    } catch {
      explain('action_failed')
    } finally {
      setBusy(false)
      refresh()
    }
  }

  function handleCreated(created: TicketDetail) {
    setCreating(false)
    setSearchText('')
    setQuery({ page: 1, pageSize: PAGE_SIZE, search: '', status: null })
    setSelectedId(created.id)
    setTicket(created)
  }

  return (
    <div className="ct-shell">
      <TicketList
        items={page.items}
        total={page.total}
        counts={page.counts}
        page={query.page}
        pageSize={query.pageSize}
        search={searchText}
        status={query.status}
        selectedId={selectedId}
        loading={listLoading}
        onSearch={setSearchText}
        onStatus={(status: TicketStatus | null) => setQuery((current) => ({ ...current, status, page: 1 }))}
        onPage={(next) => setQuery((current) => ({ ...current, page: next }))}
        onSelect={setSelectedId}
        onCreate={() => setCreating(true)}
      />

      <main className="ct-main">
        {loadFailed ? (
          <div className="xui-notice xui-notice-error ct-notice-row" role="alert">
            {t('common.loadFailed')}
            <button type="button" className="xui-button xui-button-sm" onClick={refresh}>
              {t('common.retryLoad')}
            </button>
          </div>
        ) : null}
        {notice ? (
          <div className="xui-notice xui-notice-error" role="alert">
            {notice}
          </div>
        ) : null}
        {ticket ? <TicketDetailView ticket={ticket} busy={busy} onAnalyze={analyze} onConfirm={confirm} /> : <div className="xui-empty">{selectedId ? t('app.loading') : t('detail.pick')}</div>}
      </main>

      {creating ? <CreateTicketDialog onClose={() => setCreating(false)} onCreated={handleCreated} /> : null}
    </div>
  )
}
