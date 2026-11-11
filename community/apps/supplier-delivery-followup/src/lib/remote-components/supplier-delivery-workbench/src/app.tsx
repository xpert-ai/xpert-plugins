import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@xpert-ai/plugin-shadcn-ui'
import {
  CircleCheck,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  TriangleAlert,
  Truck
} from 'lucide-react'
import { React } from './vendor'
import type {
  EvidenceField,
  OrderLineDetailDto,
  OrderLineSummaryDto,
  OverviewDto,
  ProposalDecision,
  ProposalDto,
  ReplyDetailDto,
  ReplyStatus,
  ReplySummaryDto,
  WorkbenchActionResult,
  WorkbenchActionKey,
  WorkbenchClientCommand
} from '../../../workbench-contract'
import { subscribeHostEvents } from './bridge'
import { gateway } from './gateway'
import { i18n, t, useLocale, type MessageKey } from './i18n'
import { OrderList, ReplyQueue } from './queue'
import { ReplyReview, type Busy } from './review'
import { OrderInspector } from './inspector'
import { EditProposalDialog, NewReplyDialog } from './dialogs'
import { Notice } from './states'
import type { EvidenceTarget } from './evidence'

const { useCallback, useEffect, useMemo, useRef, useState } = React

const POLL_INTERVAL_MS = 4000
// Below these widths the side panels float over the review instead of squeezing it.
const QUEUE_INLINE_MIN = 680
const INSPECTOR_INLINE_MIN = 1000

function useViewportWidth() {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}
// Domain error codes the buyer can hit from this view; anything else falls back to a generic message with the code.
const KNOWN_ERRORS = new Set([
  'reply_locked',
  'confirmation_in_progress',
  'order_line_changed',
  'parse_not_retryable',
  'concurrent_change',
  'invalid_date',
  'invalid_quantity',
  'invalid_decision',
  'invalid_reply_state',
  'invalid_actor',
  'review_incomplete',
  'no_proposals',
  'proposal_not_found',
  'order_line_not_found',
  'reply_not_found'
])

type Flash = { tone: 'success' | 'warning' | 'danger' | 'neutral'; text: string } | null

function errorText(code: string) {
  if (code === 'reply_empty') return t('newReply.empty')
  if (code === 'reply_too_long') return t('newReply.tooLong', { max: 5000 })
  if (code === 'order_line_changed_confirming') return t('error.order_line_changed_confirming')
  return KNOWN_ERRORS.has(code) ? t(`error.${code}` as MessageKey) : t('error.generic', { code })
}

function loadErrorText(error: unknown) {
  return error instanceof Error && error.message ? `${t('error.load')} ${error.message}` : t('error.load')
}

/** Loads one resource and keeps the last good value while refreshing. */
function useResource<T>() {
  const [value, setValue] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const load = useCallback(async (fetcher: () => Promise<T>, options: { keep?: boolean } = {}) => {
    const current = ++generation.current
    setLoading(true)
    if (!options.keep) setError(null)
    try {
      const next = await fetcher()
      if (current !== generation.current) return
      setValue(next)
      setError(null)
    } catch (cause) {
      if (current !== generation.current) return
      setError(loadErrorText(cause))
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [])
  const reset = useCallback(() => {
    generation.current += 1
    setValue(null)
    setError(null)
    setLoading(false)
  }, [])
  return { value, loading, error, load, reset }
}

export function Workbench() {
  useLocale()
  const overview = useResource<OverviewDto>()
  const replies = useResource<{ items: ReplySummaryDto[] }>()
  const orders = useResource<{ items: OrderLineSummaryDto[] }>()
  const reply = useResource<ReplyDetailDto>()
  const order = useResource<OrderLineDetailDto>()

  const [tab, setTab] = useState<'replies' | 'orders'>('replies')
  const [selectedReplyId, setSelectedReplyId] = useState<string | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null)
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null)
  const [orderSearch, setOrderSearch] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  // Last assistant tool call the host reported; the parsing notice uses it to tell progress from a stalled chat.
  const [activityAt, setActivityAt] = useState(0)
  const [importing, setImporting] = useState(false)
  const [flash, setFlash] = useState<Flash>(null)
  const [newReplyOpen, setNewReplyOpen] = useState(false)
  const [newReplyError, setNewReplyError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ProposalDto | null>(null)
  const width = useViewportWidth()
  const queueInline = width >= QUEUE_INLINE_MIN
  const inspectorInline = width >= INSPECTOR_INLINE_MIN
  const [queueOpen, setQueueOpen] = useState(queueInline)
  const [inspectorOpen, setInspectorOpen] = useState(inspectorInline)
  // Follow the layout when the host panel crosses a breakpoint; manual toggles hold until then.
  useEffect(() => setQueueOpen(queueInline), [queueInline])
  useEffect(() => setInspectorOpen(inspectorInline), [inspectorInline])

  const refreshLists = useCallback(() => {
    void overview.load(gateway.overview, { keep: true })
    void replies.load(gateway.replies, { keep: true })
    void orders.load(() => gateway.orderLines(), { keep: true })
  }, [overview.load, replies.load, orders.load])

  const refreshReply = useCallback(
    (id: string | null) => {
      // Only the reply on screen: an action that finishes after the buyer moved on must not swap the detail back.
      if (id && id === latest.current.selectedReplyId) void reply.load(() => gateway.reply(id), { keep: true })
    },
    [reply.load]
  )

  // The order shown in the inspector follows the active proposal, otherwise the order picked in the list.
  const activeProposal = reply.value?.proposals.find((proposal) => proposal.id === activeProposalId) ?? null
  const inspectorOrderId = activeProposal?.orderLineId ?? selectedOrderId

  const latest = useRef({ selectedReplyId, inspectorOrderId, refreshLists, refreshReply })
  latest.current = { selectedReplyId, inspectorOrderId, refreshLists, refreshReply }

  const refreshInspector = useCallback(() => {
    const id = latest.current.inspectorOrderId
    if (id) void order.load(() => gateway.orderLine(id), { keep: true })
  }, [order.load])

  useEffect(() => {
    refreshLists()
  }, [refreshLists])

  // Open the reply that most needs the buyer the first time the queue loads.
  const autoSelected = useRef(false)
  useEffect(() => {
    const items = replies.value?.items
    if (autoSelected.current || !items?.length) return
    autoSelected.current = true
    const next =
      items.find((item) => item.status === 'pending_review') ??
      items.find((item) => item.status !== 'confirmed') ??
      items[0]
    setSelectedReplyId((current) => current ?? next.id)
  }, [replies.value])

  useEffect(() => {
    setActiveProposalId(null)
    setEvidenceTarget(null)
    if (!selectedReplyId) {
      reply.reset()
      return
    }
    void reply.load(() => gateway.reply(selectedReplyId))
  }, [selectedReplyId, reply.load, reply.reset])

  // Default to the first proposal so the evidence and the inspector have something to show.
  useEffect(() => {
    const proposals = reply.value?.proposals ?? []
    if (!proposals.length) return
    setActiveProposalId((current) =>
      current && proposals.some((proposal) => proposal.id === current) ? current : proposals[0].id
    )
  }, [reply.value])

  useEffect(() => {
    if (!inspectorOrderId) {
      order.reset()
      return
    }
    void order.load(() => gateway.orderLine(inspectorOrderId))
  }, [inspectorOrderId, order.load, order.reset])

  // Assistant tool completions refresh the selected reply and the lists, using the latest selection.
  useEffect(() => {
    let timer = 0
    const unsubscribe = subscribeHostEvents(() => {
      setActivityAt(Date.now())
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        latest.current.refreshReply(latest.current.selectedReplyId)
        latest.current.refreshLists()
      }, 300)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  // While a parse is running, also poll: host events are best-effort and the model may fail silently.
  const parsing = reply.value?.status === 'parsing' && !reply.value.parseTimedOut
  useEffect(() => {
    if (!parsing || !selectedReplyId) return
    const timer = window.setInterval(() => {
      refreshReply(selectedReplyId)
      refreshLists()
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [parsing, selectedReplyId, refreshReply, refreshLists])

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), 6000)
    return () => window.clearTimeout(timer)
  }, [flash])

  async function run<K extends WorkbenchActionKey>(
    key: K,
    targetId: string,
    input: Parameters<typeof gateway.action<K>>[2]
  ): Promise<WorkbenchActionResult<K> | null> {
    try {
      return await gateway.action(key, targetId, input)
    } catch (cause) {
      setFlash({
        tone: 'danger',
        text: cause instanceof Error ? cause.message : t('error.generic', { code: 'host_error' })
      })
      return null
    }
  }

  async function importDemo() {
    setImporting(true)
    const result = await run('import_demo_data', 'demo', {})
    setImporting(false)
    if (!result) return
    if (!result.success) return setFlash({ tone: 'danger', text: errorText(result.code) })
    setFlash({
      tone: 'success',
      text: t('action.importDone', { created: result.data.created, skipped: result.data.skipped })
    })
    refreshLists()
  }

  async function createReply(rawText: string, parseAfter: boolean) {
    setCreating(true)
    setNewReplyError(null)
    const result = await run('create_reply', 'new', { rawText })
    setCreating(false)
    if (!result) return
    if (!result.success) return setNewReplyError(errorText(result.code))
    setNewReplyOpen(false)
    setTab('replies')
    setSelectedReplyId(result.data.replyId)
    refreshReply(result.data.replyId)
    refreshLists()
    // A duplicate opens the existing record as it is; only a new reply goes straight to the assistant.
    if (!result.data.created) setFlash({ tone: 'neutral', text: t('newReply.duplicate') })
    else if (parseAfter) await startParse(result.data.replyId, 'received')
  }

  async function sendCommand(command: WorkbenchClientCommand | undefined) {
    if (!command) return true
    try {
      await gateway.invokeCommand(command)
      return true
    } catch (cause) {
      setFlash({
        tone: 'warning',
        text: t('banner.commandFailed', { reason: cause instanceof Error ? cause.message : String(cause) })
      })
      return false
    }
  }

  async function startParse(id: string, status: ReplyStatus) {
    setBusy('parse')
    // A fresh or reviewed reply starts a new parse; failed, follow-up and timed-out ones are retries.
    const key = status === 'received' || status === 'pending_review' ? 'request_parse' : 'retry_parse'
    const result = await run(key, id, { locale: i18n.getLocale() })
    setBusy(null)
    if (!result) return
    if (!result.success) setFlash({ tone: 'danger', text: errorText(result.code) })
    else await sendCommand(result.command)
    refreshReply(id)
    refreshLists()
  }

  const parse = (target: ReplyDetailDto) => startParse(target.id, target.status)

  async function resend(target: ReplyDetailDto) {
    setBusy('resend')
    const result = await run('resend_parse', target.id, { locale: i18n.getLocale() })
    setBusy(null)
    if (!result) return
    if (!result.success) setFlash({ tone: 'danger', text: errorText(result.code) })
    else if (await sendCommand(result.command)) setFlash({ tone: 'neutral', text: t('action.resendDone') })
    refreshReply(target.id)
  }

  async function decide(
    proposal: ProposalDto,
    decision: Exclude<ProposalDecision, 'pending'>,
    values?: { finalDate: string; finalQuantity?: number }
  ) {
    setBusy(`decide:${proposal.id}`)
    const result = await run('decide_proposal', proposal.id, { decision, ...values })
    setBusy(null)
    if (!result) return false
    if (!result.success) {
      setFlash({ tone: 'danger', text: errorText(result.code) })
      return false
    }
    refreshReply(selectedReplyId)
    return true
  }

  // Accepts the untouched, current proposals one by one; stale ones need a new parse and are left for the buyer.
  async function acceptAll(target: ReplyDetailDto) {
    setBusy('acceptAll')
    // Build the queue from the server, not the last render: a decision made a moment ago may not be on screen yet.
    let current: ReplyDetailDto
    try {
      current = await gateway.reply(target.id)
    } catch (cause) {
      setBusy(null)
      setFlash({ tone: 'danger', text: loadErrorText(cause) })
      return
    }
    const queue = current.proposals.filter((proposal) => proposal.decision === 'pending' && !proposal.stale)
    let accepted = 0
    for (const proposal of queue) {
      const result = await run('decide_proposal', proposal.id, { decision: 'accepted' })
      if (!result) break
      if (!result.success) {
        setFlash({ tone: 'danger', text: errorText(result.code) })
        break
      }
      accepted += 1
    }
    setBusy(null)
    if (accepted === queue.length) setFlash({ tone: 'success', text: t('action.acceptAllDone', { count: accepted }) })
    refreshReply(target.id)
  }

  async function confirm(target: ReplyDetailDto) {
    setBusy('confirm')
    const result = await run('confirm_reply', target.id, { expectedRevision: target.revision })
    let code = result && !result.success ? result.code : null
    if (code === 'order_line_changed') {
      // Once the confirmation has started a new parse is no longer possible; the fix is to reject the moved proposals.
      const latest = await gateway.reply(target.id).catch(() => null)
      if (latest?.confirmationInProgress) code = 'order_line_changed_confirming'
    }
    setBusy(null)
    if (!result) return
    if (!result.success) setFlash({ tone: 'danger', text: errorText(code ?? result.code) })
    // appliedCount is also 0 when a started confirmation is resumed after its writes, so go by the decisions.
    else if (target.proposals.every((proposal) => proposal.decision === 'rejected'))
      setFlash({ tone: 'success', text: t('action.confirmDoneNone') })
    else setFlash({ tone: 'success', text: t('action.confirmDone', { count: result.data.appliedCount }) })
    refreshReply(target.id)
    refreshLists()
    refreshInspector()
  }

  function showEvidence(proposal: ProposalDto, field: EvidenceField) {
    setActiveProposalId(proposal.id)
    setEvidenceTarget({ proposalId: proposal.id, field, nonce: Date.now() })
  }

  const summary = useMemo(() => {
    const value = overview.value
    if (!value) return null
    return t('toolbar.summary', { pending: value.replyCounts.pending_review, delayed: value.delayedLineCount })
  }, [overview.value])

  const flashIcon = flash?.tone === 'success' ? CircleCheck : flash?.tone === 'neutral' ? Info : TriangleAlert

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('toolbar.toggleQueue')}
              aria-pressed={queueOpen}
              onClick={() => setQueueOpen((open) => !open)}
            >
              {queueOpen ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.toggleQueue')}</TooltipContent>
        </Tooltip>
        <Truck aria-hidden className="size-4 text-muted-foreground" />
        <h1 className="truncate text-sm font-semibold">{t('app.title')}</h1>
        {summary ? <span className="hidden truncate text-xs text-muted-foreground md:inline">· {summary}</span> : null}
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('toolbar.refresh')}
                onClick={() => {
                  refreshLists()
                  refreshReply(selectedReplyId)
                  refreshInspector()
                }}
              >
                <RefreshCw aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('toolbar.refresh')}</TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" disabled={importing} onClick={importDemo}>
            {t('toolbar.importDemo')}
          </Button>
          <Button
            size="sm"
            variant={reply.value?.status === 'pending_review' ? 'outline' : 'default'}
            onClick={() => {
              setNewReplyError(null)
              setNewReplyOpen(true)
            }}
          >
            <Plus aria-hidden />
            {t('toolbar.newReply')}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('toolbar.toggleInspector')}
                aria-pressed={inspectorOpen}
                onClick={() => setInspectorOpen((open) => !open)}
              >
                {inspectorOpen ? <PanelRightClose aria-hidden /> : <PanelRightOpen aria-hidden />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('toolbar.toggleInspector')}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {flash ? (
        <div className="shrink-0 px-3 pt-2" aria-live="polite">
          <Notice tone={flash.tone} icon={flashIcon} title={flash.text} />
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        {queueOpen ? (
          <aside
            className={`flex w-72 shrink-0 flex-col border-r bg-background max-lg:w-64 ${queueInline ? '' : 'absolute inset-y-0 left-0 z-20 shadow-lg'}`}
          >
            <Tabs
              value={tab}
              onValueChange={(value: string) => setTab(value === 'orders' ? 'orders' : 'replies')}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="px-2 pt-2">
                <TabsList className="w-full">
                  <TabsTrigger value="replies">
                    {t('tabs.replies')}
                    {replies.value ? (
                      <span className="text-xs text-muted-foreground tabular-nums">{replies.value.items.length}</span>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="orders">
                    {t('tabs.orders')}
                    {orders.value ? (
                      <span className="text-xs text-muted-foreground tabular-nums">{orders.value.items.length}</span>
                    ) : null}
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="replies" className="min-h-0 flex-1">
                <ReplyQueue
                  replies={replies.value?.items ?? null}
                  loading={replies.loading}
                  error={replies.error}
                  selectedId={selectedReplyId}
                  onSelect={(id) => {
                    setSelectedReplyId(id)
                    if (!queueInline) setQueueOpen(false)
                  }}
                  onCreate={() => setNewReplyOpen(true)}
                  onRetry={() => void replies.load(gateway.replies)}
                />
              </TabsContent>
              <TabsContent value="orders" className="min-h-0 flex-1">
                <OrderList
                  orders={orders.value?.items ?? null}
                  loading={orders.loading}
                  error={orders.error}
                  search={orderSearch}
                  onSearch={setOrderSearch}
                  selectedId={inspectorOrderId}
                  onSelect={(id) => {
                    setActiveProposalId(null)
                    setSelectedOrderId(id)
                    if (!queueInline) setQueueOpen(false)
                    setInspectorOpen(true)
                  }}
                  onImport={importDemo}
                  importing={importing}
                  onRetry={() => void orders.load(() => gateway.orderLines())}
                />
              </TabsContent>
            </Tabs>
          </aside>
        ) : null}

        <main
          className="min-h-0 min-w-0 flex-1"
          // Floating side panels close as soon as the buyer works in the review again, so they never hide its buttons.
          onPointerDownCapture={() => {
            if (!queueInline) setQueueOpen(false)
            if (!inspectorInline) setInspectorOpen(false)
          }}
        >
          <ReplyReview
            reply={reply.value}
            loading={reply.loading}
            error={reply.error}
            timeoutMinutes={overview.value?.parseTimeoutMinutes ?? 5}
            activityAt={activityAt}
            activeProposalId={activeProposalId}
            evidenceTarget={evidenceTarget}
            busy={busy}
            onRetryLoad={() => refreshReply(selectedReplyId)}
            onParse={parse}
            onResend={resend}
            onConfirm={confirm}
            onAcceptAll={(target) => void acceptAll(target)}
            onActivate={(proposal) => setActiveProposalId(proposal.id)}
            onShowEvidence={showEvidence}
            onDecide={(proposal, decision) => void decide(proposal, decision)}
            onEdit={setEditing}
          />
        </main>

        {inspectorOpen ? (
          <aside
            className={`flex w-80 shrink-0 flex-col border-l bg-background max-xl:w-72 ${inspectorInline ? '' : 'absolute inset-y-0 right-0 z-20 shadow-lg'}`}
            aria-label={t('inspector.title')}
          >
            <div className="flex h-11 shrink-0 items-center border-b px-4">
              <h2 className="text-sm font-medium">{t('inspector.title')}</h2>
            </div>
            <div className="min-h-0 flex-1">
              <OrderInspector
                order={inspectorOrderId ? order.value : null}
                loading={order.loading}
                error={order.error}
                onRetry={refreshInspector}
              />
            </div>
          </aside>
        ) : null}
      </div>

      <NewReplyDialog
        open={newReplyOpen}
        busy={creating}
        serverError={newReplyError}
        onOpenChange={setNewReplyOpen}
        onSubmit={createReply}
      />
      <EditProposalDialog
        proposal={editing}
        busy={editing ? busy === `decide:${editing.id}` : false}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={async (values) => {
          if (!editing) return
          if (await decide(editing, 'edited', values)) setEditing(null)
        }}
      />
    </div>
  )
}
