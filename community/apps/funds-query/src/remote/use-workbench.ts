import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { z } from 'zod/v3'
import { BridgeError, RemoteBridge, actionMessage, preparedSchema, validationSchema } from './bridge.js'
import { conversationSchema } from '../shared/result-schema.js'
import { t } from './i18n.js'
import type { Context, Conversation, ChatTurn, Dataset, Page, Transfer, QueryResult, RuntimeStatus } from '../shared/contracts.js'

export function useWorkbench() {
  const bridge = new RemoteBridge()
  const runtime = ref<RuntimeStatus | null>(null)
  const context = ref<Context | null>(null), dataset = ref<Dataset | null>(null)
  const session = ref<Conversation | null>(null), sessions = ref<Conversation[]>([]), sessionsTotal = ref(0)
  const turns = ref<ChatTurn[]>([]), turnsTotal = ref(0)
  const drafts = ref<Record<string, string>>({})
  const question = computed({ get: () => session.value ? drafts.value[session.value.id] ?? '' : '',
    set: value => { if (session.value) drafts.value[session.value.id] = value } })
  const tab = ref('chat'), loading = ref(false), mutation = ref<'import' | 'dataset' | 'session' | null>(null)
  const preview = ref<Page<Transfer> | null>(null), previewLoading = ref(false), olderLoading = ref(false), sessionsLoading = ref(false)
  const datasetsLoading = ref(false)
  const error = ref(''), notice = ref(''), issues = ref<{row: number; message: string}[]>([])
  const input = ref<HTMLInputElement | null>(null), timeline = ref<HTMLElement | null>(null)
  const nearBottom = ref(true), evidenceOpen = ref(false), evidenceResult = ref<QueryResult | null>(null), evidenceLoading = ref(false)
  const dispatch = ref<{sessionId: string; queryId?: string; phase: 'preparing' | 'restoring' | 'sending'} | null>(null)
  const current = computed(() => dataset.value ?? context.value?.currentDataset)
  const datasets = computed(() => {
    const items = context.value?.datasets.items ?? []
    return current.value && !items.some(d => d.id === current.value?.id) ? [current.value, ...items] : items
  })
  function isRunning(turn: ChatTurn) {
    return turn.status === 'pending' || turn.replyStatus === 'pending'
  }
  const currentRunning = computed(() => turns.value.some(isRunning))
  const canSend = computed(() => Boolean(runtime.value?.status === 'ready' && session.value && question.value.trim() && !mutation.value && !dispatch.value && !currentRunning.value))
  const otherReplying = computed(() => Boolean(dispatch.value && dispatch.value.sessionId !== session.value?.id))
  const hasOlder = computed(() => turns.value.length < turnsTotal.value)
  const suggestions = ['suggestion1', 'suggestion2', 'suggestion3'] as const
  let alive = true, epoch = 0, homeVersion = 0, previewVersion = 0, evidenceVersion = 0
  let olderPage = 1, sessionsPage = 1, datasetsPage = 1, homeInFlight = false, homeQueued = false
  let poll: ReturnType<typeof setInterval> | undefined, refreshTimer: ReturnType<typeof setTimeout> | undefined
  let retryPrepare: {text: string; sessionId: string; operationId: string} | null = null
  let errorOwner = ''

  function clearError() { error.value = ''; issues.value = []; errorOwner = '' }
  function showError(e: unknown, owner = 'action') {
    if (owner === 'refresh' && errorOwner === 'import') return
    errorOwner = owner
    error.value = e instanceof z.ZodError ? t('invalidResponse') : e instanceof Error ? e.message : t('unknownError')
  }
  function recovered(owner: string) { if (errorOwner === owner) clearError() }
  function invalidate() {
    epoch++; homeVersion++; previewVersion++; evidenceVersion++
    loading.value = previewLoading.value = evidenceLoading.value = olderLoading.value = sessionsLoading.value = datasetsLoading.value = false
    homeInFlight = homeQueued = false
  }
  function resetView() {
    invalidate(); session.value = null; turns.value = []; turnsTotal.value = 0
    sessions.value = []; sessionsTotal.value = 0; olderPage = sessionsPage = datasetsPage = 1
    preview.value = null; evidenceOpen.value = false; evidenceResult.value = null
    tab.value = 'chat'; nearBottom.value = true; notice.value = ''; clearError()
  }
  function mergeTurns(items: ChatTurn[], older = false) {
    const records = new Map<string, ChatTurn>()
    for (const item of older ? [...items, ...turns.value] : [...turns.value, ...items]) records.set(item.queryId, item)
    turns.value = [...records.values()].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
  }
  function mergeSessions(items: Conversation[]) {
    const records = new Map([...sessions.value, ...items].map(item => [item.id, item]))
    sessions.value = [...records.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
  }
  async function refresh() {
    if (mutation.value) return
    if (homeInFlight) { homeQueued = true; return }
    homeInFlight = true
    const version = ++homeVersion, captured = epoch, id = current.value?.id, sessionId = session.value?.id
    loading.value = true
    try {
      if (runtime.value?.status !== 'ready') {
        const status = await bridge.checkRuntime()
        if (!alive || captured !== epoch || version !== homeVersion) return
        runtime.value = status
        if (status.status !== 'ready') throw new Error(status.message)
      }
      const data = await bridge.data({operation: 'chat', datasetId: id, sessionId})
      if (!alive || captured !== epoch || version !== homeVersion) return
      const previous = context.value?.datasets.items ?? []
      context.value = data.context
      context.value.datasets.items = [...new Map([...previous, ...data.context.datasets.items].map(item => [item.id, item])).values()]
      dataset.value = data.dataset ?? data.context.currentDataset
      if (data.session && data.turns) {
        if (session.value?.id !== data.session.id) { turns.value = []; olderPage = 1 }
        session.value = data.session; mergeTurns(data.turns.items); turnsTotal.value = data.turns.total
        mergeSessions(data.sessions?.items ?? []); sessionsTotal.value = data.sessions?.total ?? 0
      }
      recovered('refresh')
    } catch (e) {
      if (e instanceof BridgeError && e.code === 'context_changed') return
      if (alive && captured === epoch && version === homeVersion) showError(e, 'refresh')
    }
    finally {
      if (alive && captured === epoch && version === homeVersion) {
        loading.value = false; homeInFlight = false
        if (homeQueued) { homeQueued = false; void refresh() }
      }
    }
  }
  async function selectDataset(id: string) {
    if (mutation.value || id === current.value?.id) return
    mutation.value = 'dataset'; invalidate(); clearError()
    try {
      const r = await bridge.action('select', {datasetId: id})
      if (!r.success) throw new Error(actionMessage(r.message))
      if (!alive) return
      resetView(); dataset.value = null; context.value = null
    } catch (e) { if (alive) showError(e) }
    finally { mutation.value = null }
    if (alive) await refresh()
  }
  async function upload(event: Event) {
    const el = event.target
    if (!(el instanceof HTMLInputElement)) return
    const file = el.files?.[0]; el.value = ''
    if (!file || mutation.value) return
    if (runtime.value?.status !== 'ready') { showError(new Error(t('runtimeRequired'))); return }
    clearError()
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 10 * 1024 * 1024) {
      showError(new Error(t('fileError'))); return
    }
    mutation.value = 'import'; invalidate()
    try {
      const r = await bridge.upload(file)
      if (!alive) return
      if (!r.success) {
        const parsed = validationSchema.safeParse(r.data)
        issues.value = parsed.success ? parsed.data.details?.issues ?? [] : []
        showError(new Error(actionMessage(r.message)), 'import')
        return
      }
      resetView(); dataset.value = null; context.value = null; notice.value = actionMessage(r.message)
    } catch (e) {
      if (alive) {
        let message = t('importReadFailed')
        if (e instanceof BridgeError) message = t('importRequestFailed')
        if (e instanceof z.ZodError || (e instanceof BridgeError && e.code === 'invalid_response'))
          message = t('invalidResponse')
        showError(new Error(message), 'import')
      }
      return
    }
    finally { mutation.value = null }
    if (alive) await refresh()
  }
  async function newSession() {
    const id = current.value?.id
    if (!id || mutation.value) return
    mutation.value = 'session'; clearError()
    try {
      const r = await bridge.action('create_session', {datasetId: id, operationId: crypto.randomUUID()})
      if (!r.success) throw new Error(actionMessage(r.message))
      const created = conversationSchema.parse(r.data)
      if (!alive) return
      invalidate(); session.value = created; turns.value = []; turnsTotal.value = 0
      olderPage = 1; tab.value = 'chat'; nearBottom.value = true; notice.value = ''
      mergeSessions([created]); evidenceOpen.value = false
    } catch (e) { if (alive) showError(e) }
    finally { mutation.value = null }
    if (alive) await refresh()
  }
  async function selectSession(id: string) {
    const datasetId = current.value?.id
    if (!datasetId || id === session.value?.id || mutation.value) return
    mutation.value = 'session'; clearError()
    try {
      const r = await bridge.action('select_session', {datasetId, sessionId: id})
      if (!r.success) throw new Error(actionMessage(r.message))
      if (!alive) return
      invalidate(); session.value = conversationSchema.parse(r.data); turns.value = []; turnsTotal.value = 0
      olderPage = 1; tab.value = 'chat'; nearBottom.value = true; notice.value = ''; evidenceOpen.value = false
    } catch (e) { if (alive) showError(e) }
    finally { mutation.value = null }
    if (alive) await refresh()
  }
  async function ask(text = question.value) {
    const origin = session.value, datasetId = current.value?.id, submitted = text.trim()
    if (!origin || !datasetId || mutation.value || dispatch.value || currentRunning.value) return
    if (!submitted) { showError(new Error(t('questionRequired'))); return }
    const operationId = retryPrepare?.sessionId === origin.id && retryPrepare.text === submitted ? retryPrepare.operationId : crypto.randomUUID()
    dispatch.value = {sessionId: origin.id, phase: 'preparing'}
    clearError(); notice.value = ''; tab.value = 'chat'
    let queryId: string | undefined
    let deliveryStarted = false
    try {
      if (origin.conversationId && origin.threadId) {
        dispatch.value.phase = 'restoring'
        await bridge.openConversation(origin.conversationId, origin.threadId)
      }
      dispatch.value.phase = 'preparing'
      const r = await bridge.action('prepare', {datasetId, sessionId: origin.id, question: submitted, operationId})
      if (!r.success) throw new Error(actionMessage(r.message))
      const prepared = preparedSchema.parse(r.data)
      queryId = prepared.queryId
      if (!alive) return
      dispatch.value.queryId = queryId
      if ((drafts.value[origin.id] ?? '').trim() === submitted) drafts.value[origin.id] = ''
      retryPrepare = null
      if (session.value?.id === origin.id) {
        nearBottom.value = true
        const now = new Date().toISOString()
        mergeTurns([{queryId, sessionId: origin.id, question: submitted, createdAt: now, updatedAt: now,
          status: 'pending', stage: 'submitted', reply: '', replyStatus: 'pending',
          baseQueryId: prepared.baseQueryId ?? null, result: {queryId, status: 'pending', question: submitted}}])
        turnsTotal.value++
      }
      dispatch.value.phase = 'restoring'
      const conversationId = prepared.conversationId !== undefined ? prepared.conversationId : origin.conversationId
      const threadId = prepared.threadId !== undefined ? prepared.threadId : origin.threadId
      if (conversationId && threadId) await bridge.openConversation(conversationId, threadId)
      dispatch.value.phase = 'sending'
      deliveryStarted = true
      const send = bridge.ask(prepared.prompt, {newThread: !conversationId, queryId,
        ...(conversationId && threadId ? {conversationId, threadId} : {})})
      void refresh()
      await send
      if (alive) await refresh()
    } catch (e) {
      if (!alive) return
      if (!queryId) {
        retryPrepare = {text: submitted, sessionId: origin.id, operationId}
        if (session.value?.id === origin.id) showError(e)
      } else {
        const rejected = !deliveryStarted || (e instanceof BridgeError && ['dispatch_rejected', 'not_sent', 'context_changed'].includes(e.code))
        try {
          await bridge.action('delivery_state', {datasetId, queryId, state: rejected ? 'rejected' : 'unconfirmed'})
          if (rejected) await bridge.action('dispatch_failed', {datasetId, queryId})
        } catch { /* Preserve the query if delivery observation itself fails. */ }
        if (rejected && !drafts.value[origin.id]) drafts.value[origin.id] = submitted
        if (session.value?.id === origin.id) {
          if (rejected) showError(e)
          await refresh()
        }
      }
    } finally { if (alive) dispatch.value = null }
  }
  async function loadOlder() {
    const selected = session.value, id = current.value?.id
    if (!selected || !id || olderLoading.value || !hasOlder.value) return
    const captured = epoch, page = olderPage + 1, oldHeight = timeline.value?.scrollHeight ?? 0
    olderLoading.value = true
    try {
      const data = await bridge.data({operation: 'chat', datasetId: id, sessionId: selected.id}, page)
      if (!alive || captured !== epoch) return
      mergeTurns(data.turns?.items ?? [], true); olderPage = page
      await nextTick()
      if (timeline.value) timeline.value.scrollTop += timeline.value.scrollHeight - oldHeight
      recovered('older')
    } catch (e) { if (alive && captured === epoch) showError(e, 'older') }
    finally { if (captured === epoch) olderLoading.value = false }
  }
  async function loadMoreSessions() {
    const id = current.value?.id, captured = epoch
    if (!id || sessionsLoading.value) return
    sessionsLoading.value = true
    try {
      const data = await bridge.data({operation: 'sessions', datasetId: id}, sessionsPage + 1)
      if (!alive || captured !== epoch) return
      mergeSessions(data.sessions?.items ?? []); sessionsPage++
      recovered('sessions')
    } catch (e) { if (alive && captured === epoch) showError(e, 'sessions') }
    finally { if (captured === epoch) sessionsLoading.value = false }
  }
  async function loadMoreDatasets() {
    if (!context.value || datasetsLoading.value || mutation.value) return
    const captured = epoch
    datasetsLoading.value = true
    try {
      const data = await bridge.data({operation: 'datasets'}, datasetsPage + 1)
      if (!alive || captured !== epoch || !context.value) return
      context.value.datasets = {...data.context.datasets, items: [...new Map([
        ...context.value.datasets.items, ...data.context.datasets.items
      ].map(item => [item.id, item])).values()]}
      datasetsPage++; recovered('datasets')
    } catch (e) { if (alive && captured === epoch) showError(e, 'datasets') }
    finally { if (captured === epoch) datasetsLoading.value = false }
  }
  async function loadPreview(page = 1) {
    const id = current.value?.id, captured = epoch, version = ++previewVersion
    if (!id) return
    previewLoading.value = true
    try {
      const data = await bridge.data({operation: 'preview', datasetId: id}, page)
      if (!alive || captured !== epoch || version !== previewVersion) return
      preview.value = data.preview ?? null; recovered('preview')
    } catch (e) { if (alive && captured === epoch && version === previewVersion) showError(e, 'preview') }
    finally { if (captured === epoch && version === previewVersion) previewLoading.value = false }
  }
  async function loadEvidence(result: QueryResult, page = 1) {
    const id = result.dataset?.id, captured = epoch, version = ++evidenceVersion
    if (!id) return
    evidenceOpen.value = true; evidenceResult.value = result; evidenceLoading.value = true
    try {
      const data = await bridge.data({operation: 'result', datasetId: id, queryId: result.queryId}, page)
      if (!alive || captured !== epoch || version !== evidenceVersion || !evidenceOpen.value) return
      evidenceResult.value = data.result ?? result; recovered('evidence')
    } catch (e) { if (alive && captured === epoch && version === evidenceVersion) showError(e, 'evidence') }
    finally { if (captured === epoch && version === evidenceVersion) evidenceLoading.value = false }
  }
  function stageText(turn: ChatTurn) {
    if (turn.status === 'waiting_timeout') return turn.result.error ?? t('waitingTimeoutHint')
    if (turn.status === 'failed' && turn.replyStatus !== 'pending') return turn.result.error ?? t('analysisFailed')
    if (turn.replyStatus === 'rejected') return t('dispatchFailed')
    if (turn.replyStatus === 'unconfirmed') return t(turn.status === 'completed' ? 'resultReadyUnconfirmed' : 'deliveryUnconfirmed')
    if (turn.status === 'completed' || turn.status === 'needs_clarification' || turn.status === 'failed') return t('replying')
    return t(turn.stage === 'thinking' ? 'understandingQuestion' : turn.stage === 'reading_context' ? 'readingContext' : turn.stage === 'finding_accounts' ? 'findingAccounts' :
      turn.stage === 'analyzing' ? 'calculating' : turn.stage === 'replying' ? 'replying' : 'analyzingHint')
  }
  function onScroll() {
    const el = timeline.value
    if (el) nearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }
  async function scrollBottom() { await nextTick(); timeline.value?.scrollTo({top: timeline.value.scrollHeight}); nearBottom.value = true }
  watch(turns, async () => { if (nearBottom.value) await scrollBottom() }, {deep: true})
  watch(tab, value => { if (value === 'rows') void loadPreview(preview.value?.page ?? 1) })
  watch(evidenceOpen, open => { if (!open) { evidenceVersion++; evidenceLoading.value = false } })
  onMounted(() => {
    bridge.onRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void refresh(), 150) }
    void refresh()
    poll = setInterval(() => {
      const recoverable = turns.value.some(turn => turn.replyStatus === 'unconfirmed' && Date.now() - Date.parse(turn.updatedAt) < 300000)
      if (!mutation.value && (currentRunning.value || dispatch.value || recoverable || sessions.value.some(item => item.running))) void refresh()
    }, 1500)
  })
  onBeforeUnmount(() => { alive = false; invalidate(); clearInterval(poll); clearTimeout(refreshTimer); bridge.onRefresh = undefined; bridge.close() })
  return {runtime, context, current, datasets, session, sessions, sessionsTotal, turns, turnsTotal, question, tab,
    loading, mutation, preview, previewLoading, olderLoading, sessionsLoading, datasetsLoading, error, notice, issues, input, timeline,
    nearBottom, evidenceOpen, evidenceResult, evidenceLoading, dispatch, canSend, otherReplying, hasOlder, suggestions,
    isRunning, stageText, clearError, refresh, selectDataset, upload, newSession, selectSession, ask, loadOlder,
    loadMoreSessions, loadMoreDatasets, loadPreview, loadEvidence, onScroll, scrollBottom}
}
