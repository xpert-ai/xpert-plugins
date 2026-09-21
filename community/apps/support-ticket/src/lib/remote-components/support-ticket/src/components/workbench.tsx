import { React } from '../vendor'
import { executeAction, invokeClientCommand, requestData } from '../bridge'
import { ASSISTANT_SEND_MESSAGE_COMMAND, SUPPORT_TICKET_ACTIONS, SUPPORT_TICKET_CODES } from '../../../../constants'
import { createText, normalizeLocale } from '../i18n'
import { actionOutcome, asObject, asString, cx, viewData } from '../utils'
import { IntakeForm, type IntakePayload } from './intake-form'
import { ReviewPanel, type PanelAlert, type ReviewPayload } from './review-panel'
import { TicketList } from './ticket-list'
import type { HostContext, TicketOption, WorkbenchData } from '../types'
import type { ActionOutcome } from '../utils'

const { useCallback, useEffect, useMemo, useRef, useState } = React

const FALLBACK_META: WorkbenchData['meta'] = {
  statuses: [],
  categories: [],
  priorities: [],
  channels: [],
  maxMessageLength: 2000,
  aiTimeoutSeconds: 90
}

export function SupportTicketWorkbench(props: { context: HostContext; hostEventTick: number }) {
  const { context, hostEventTick } = props
  const locale = normalizeLocale(context.locale)
  const t = useMemo(() => createText(context.locale), [context.locale])

  const [data, setData] = useState<WorkbenchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [alert, setAlert] = useState<PanelAlert | null>(null)
  const [waiting, setWaiting] = useState<{ ticketId: string; startedAt: number } | null>(null)
  const [waitingSeconds, setWaitingSeconds] = useState<number | null>(null)
  /** Latest selection, readable from event-driven effects without re-subscribing on every click. */
  const selectedIdRef = useRef<string | null>(null)

  const meta = data?.meta ?? FALLBACK_META
  const statuses: TicketOption[] = meta.statuses ?? []
  const categories: TicketOption[] = meta.categories ?? []
  const priorities: TicketOption[] = meta.priorities ?? []
  const channels: TicketOption[] = meta.channels ?? []
  const timeoutSeconds = meta.aiTimeoutSeconds ?? 90
  const item = selectedId ? data?.item : undefined

  const fetchData = useCallback(
    async (ticketId?: string | null) => {
      const message = await requestData({
        page: 1,
        pageSize: 50,
        search: appliedSearch || undefined,
        parameters: {
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(ticketId ? { ticketId } : {})
        }
      })
      return viewData(message) as WorkbenchData
    },
    [appliedSearch, statusFilter]
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchData(selectedId)
      .then((next) => {
        if (!cancelled) {
          setData(next)
        }
      })
      .catch((error: unknown) => {
        console.error('support-ticket: load failed', error)
        if (!cancelled) {
          setNotice({ kind: 'error', text: t('loadFailed') })
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [fetchData, selectedId])

  /** Keep the ref in sync so event-driven effects read the current selection. */
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  /** Debounced search keeps list queries from firing on every keystroke. */
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search.trim()), 400)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!notice) {
      return undefined
    }
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  /** The assistant finished a tool call: re-read the persisted ticket instead of trusting the chat text. */
  useEffect(() => {
    if (!hostEventTick) {
      return
    }
    const ticketId = selectedIdRef.current
    setWaiting(null)
    void fetchData(ticketId)
      .then((next) => {
        setData(next)
        if (ticketId && next.item?.id === ticketId && next.item.status === 'pending_review') {
          setNotice({ kind: 'success', text: t('noticeAiDone') })
        }
      })
      .catch((error: unknown) => console.error('support-ticket: refresh after tool event failed', error))
  }, [hostEventTick])

  useEffect(() => {
    if (!waiting) {
      setWaitingSeconds(null)
      return undefined
    }
    const update = () => setWaitingSeconds(Math.floor((Date.now() - waiting.startedAt) / 1000))
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [waiting])

  /** Watchdog: a silent assistant must not leave a ticket stuck in processing forever. */
  useEffect(() => {
    if (!waiting || waitingSeconds === null || waitingSeconds < timeoutSeconds) {
      return
    }
    const ticketId = waiting.ticketId
    setWaiting(null)
    void executeAction(SUPPORT_TICKET_ACTIONS.markTicketFailed, ticketId, {
      reason: t('code_ai_timeout'),
      code: SUPPORT_TICKET_CODES.aiTimeout
    })
      .then((message) => {
        const outcome = actionOutcome(message)
        const code = outcome.code ?? SUPPORT_TICKET_CODES.aiTimeout
        setAlert({ code, message: t(`code_${code}`) })
        return fetchData(ticketId).then(setData)
      })
      .catch((error: unknown) => console.error('support-ticket: watchdog failed', error))
  }, [waiting, waitingSeconds, timeoutSeconds])

  const applyActionAlert = (outcome: ActionOutcome) => {
    if (outcome.code) {
      setAlert({ code: outcome.code, message: t(`code_${outcome.code}`) })
      return true
    }
    return false
  }

  const handToAssistant = async (payloadSource: Record<string, any>, clientMessageId: string) => {
    const clientCommand = asObject(payloadSource.clientCommand)
    const commandKey = asString(clientCommand?.commandKey)
    const payload = asObject(clientCommand?.payload)
    if (commandKey !== ASSISTANT_SEND_MESSAGE_COMMAND || !payload) {
      throw new Error('AGENT_COMMAND_MISSING')
    }
    const response = await invokeClientCommand(commandKey, { ...payload, clientMessageId })
    const commandResult = asObject(response.result)
    if (commandResult?.success === false) {
      throw new Error(asString(commandResult.code) ?? 'AGENT_COMMAND_REJECTED')
    }
  }

  const submit = (payload: IntakePayload) => {
    setBusyAction(SUPPORT_TICKET_ACTIONS.submitTicket)
    setAlert(null)
    void executeAction(SUPPORT_TICKET_ACTIONS.submitTicket, null, { ...payload })
      .then(async (message) => {
        const outcome = actionOutcome(message)
        if (applyActionAlert(outcome)) {
          return
        }
        const ticketId = asString(outcome.data.ticketId)
        if (!ticketId) {
          setAlert({ message: t('agentRequestFailed') })
          return
        }
        setSelectedId(ticketId)
        setWaiting({ ticketId, startedAt: Date.now() })
        setNotice({
          kind: 'success',
          text: outcome.data.duplicated ? t('noticeSubmittedDuplicate') : t('noticeSubmitted')
        })
        await handToAssistant(outcome.data, `support-ticket:${ticketId}:1:${Date.now()}`)
      })
      .catch((error: unknown) => {
        console.error('support-ticket: submit failed', error)
        setAlert({ message: t('agentRequestFailed') })
      })
      .finally(() => setBusyAction(null))
  }

  const retry = () => {
    if (!selectedId) {
      return
    }
    const ticketId = selectedId
    setBusyAction(SUPPORT_TICKET_ACTIONS.retryTicket)
    setAlert(null)
    void executeAction(SUPPORT_TICKET_ACTIONS.retryTicket, ticketId)
      .then(async (message) => {
        const outcome = actionOutcome(message)
        if (applyActionAlert(outcome)) {
          return
        }
        setWaiting({ ticketId, startedAt: Date.now() })
        setNotice({ kind: 'success', text: t('noticeRetried') })
        await handToAssistant(outcome.data, `support-ticket:${ticketId}:retry:${Date.now()}`)
      })
      .catch((error: unknown) => {
        console.error('support-ticket: retry failed', error)
        setAlert({ message: t('agentRequestFailed') })
      })
      .finally(() => setBusyAction(null))
  }

  const runReviewAction = (actionKey: string, payload: ReviewPayload, successText: string) => {
    if (!selectedId) {
      return
    }
    const ticketId = selectedId
    setBusyAction(actionKey)
    setAlert(null)
    void executeAction(actionKey, ticketId, { ...payload })
      .then((message) => {
        const outcome = actionOutcome(message)
        if (applyActionAlert(outcome)) {
          return
        }
        setNotice({ kind: 'success', text: successText })
        return fetchData(ticketId).then(setData)
      })
      .catch((error: unknown) => {
        console.error('support-ticket: review action failed', error)
        setAlert({ message: t('loadFailed') })
      })
      .finally(() => setBusyAction(null))
  }

  const markFailed = () => {
    if (!selectedId) {
      return
    }
    setBusyAction(SUPPORT_TICKET_ACTIONS.markTicketFailed)
    void executeAction(SUPPORT_TICKET_ACTIONS.markTicketFailed, selectedId, {
      reason: t('code_ai_timeout'),
      code: SUPPORT_TICKET_CODES.aiTimeout
    })
      .then((message) => {
        const outcome = actionOutcome(message)
        if (applyActionAlert(outcome)) {
          return
        }
        setWaiting(null)
        return fetchData(selectedId).then(setData)
      })
      .catch((error: unknown) => console.error('support-ticket: mark failed error', error))
      .finally(() => setBusyAction(null))
  }

  const refresh = () => {
    setBusyAction(SUPPORT_TICKET_ACTIONS.refresh)
    void fetchData(selectedId)
      .then((next) => {
        setData(next)
        setNotice({ kind: 'success', text: t('noticeRefreshed') })
      })
      .catch((error: unknown) => console.error('support-ticket: refresh failed', error))
      .finally(() => setBusyAction(null))
  }

  const stats = data?.summary?.stats
  const selectedTitle = asString(asObject(data?.item)?.ticketNo)

  return (
    <main className="st-shell">
      <header className="st-topbar">
        <div className="st-brand">
          <span className="st-brand-mark">ST</span>
          <div className="st-brand-text">
            <div className="st-brand-title">{t('title')}</div>
            <div className="st-brand-sub">{t('subtitle')}</div>
          </div>
        </div>
        <div className="st-topbar-actions">
          <div className="st-stats">
            <span className="st-stat">
              {t('statProcessing')}
              <strong>{stats?.processing ?? 0}</strong>
            </span>
            <span className="st-stat is-warning">
              {t('statPendingReview')}
              <strong>{stats?.pending_review ?? 0}</strong>
            </span>
            <span className="st-stat is-success">
              {t('statConfirmed')}
              <strong>{stats?.confirmed ?? 0}</strong>
            </span>
            <span className="st-stat is-danger">
              {t('statFailed')}
              <strong>{stats?.failed ?? 0}</strong>
            </span>
          </div>
          <button
            type="button"
            className="st-btn st-btn-ghost st-btn-sm"
            disabled={Boolean(busyAction)}
            onClick={refresh}
          >
            {t('refresh')}
          </button>
        </div>
      </header>

      <div className="st-body">
        <aside className="st-sidebar">
          <TicketList
            t={t}
            locale={locale}
            loading={loading}
            items={data?.items ?? []}
            stats={stats}
            statuses={statuses}
            categories={categories}
            priorities={priorities}
            status={statusFilter}
            onStatusChange={(value) => {
              setStatusFilter(value)
              setSelectedId(null)
              setAlert(null)
            }}
            search={search}
            onSearchChange={setSearch}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id)
              setAlert(null)
            }}
          />
        </aside>

        <section className="st-main">
          {selectedId && item ? (
            <>
              <div className="st-panel" style={{ marginBottom: 12 }}>
                <div className="st-actions">
                  <span className="st-section-hint">{t('ticketDetail')}</span>
                  {selectedTitle ? <span className="st-tag st-tag-neutral st-mono">{selectedTitle}</span> : null}
                  <span className="st-spacer" />
                  <button
                    type="button"
                    className="st-btn st-btn-ghost st-btn-sm"
                    onClick={() => {
                      setSelectedId(null)
                      setAlert(null)
                    }}
                  >
                    {t('newTicket')}
                  </button>
                </div>
              </div>
              <ReviewPanel
                t={t}
                locale={locale}
                item={item}
                categories={categories}
                priorities={priorities}
                channels={channels}
                busyAction={busyAction}
                waitingSeconds={waitingSeconds}
                timeoutSeconds={timeoutSeconds}
                alert={alert}
                onSaveDraft={(payload) =>
                  runReviewAction(SUPPORT_TICKET_ACTIONS.saveDraft, payload, t('noticeDraftSaved'))
                }
                onConfirm={(payload) =>
                  runReviewAction(SUPPORT_TICKET_ACTIONS.confirmTicket, payload, t('noticeConfirmed'))
                }
                onRetry={retry}
                onMarkFailed={markFailed}
              />
            </>
          ) : (
            <div className="st-panel">
              {alert ? (
                <div className="st-alert st-alert-error">
                  <div>
                    <strong>{alert.code ? t(`code_${alert.code}`) : t('failureTitle')}</strong>
                    <span>{alert.message}</span>
                  </div>
                </div>
              ) : null}
              <IntakeForm
                t={t}
                locale={locale}
                channels={channels}
                maxMessageLength={meta.maxMessageLength ?? 2000}
                busy={busyAction === SUPPORT_TICKET_ACTIONS.submitTicket}
                onSubmit={submit}
              />
            </div>
          )}
        </section>
      </div>

      {notice ? (
        <div className="st-toast">
          <div className={cx('st-toast-item', notice.kind === 'error' && 'is-error')} role="status">
            {notice.text}
          </div>
        </div>
      ) : null}
    </main>
  )
}
