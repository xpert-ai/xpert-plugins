import { HostBridge } from './bridge.js'
import { configureLocale, formatTime, t } from './i18n.js'

interface SyncRun {
  id: string
  status: string
  mirrorVersion?: string
  sourceDigest?: string
  assertionCount?: number
  attempts?: number
  errorMessage?: string
  createdAt?: string
}
interface OverviewData {
  mirrorVersion?: string
  assertionCount?: number
  manifest?: {
    sourceDigest?: string
    stale?: boolean
    lastError?: string
    assertionCount?: number
    excluded?: unknown[]
    unsupported?: unknown[]
  } | null
  items?: SyncRun[]
}
interface TermItem { id: string; label: string; aliases: string[]; status: string; assertionCount: number }
interface AnswerItem {
  id: string
  question: string
  answer: string
  status: 'proposed' | 'confirmed' | 'rejected'
  mirrorVersion?: string
  sourceDigest?: string
  stale?: boolean
  retrieval?: { arm?: string; hits?: number; candidates?: number; reason?: string; stage?: string; degraded?: boolean }
  reviewComment?: string
  createdAt?: string
}
interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

type Tab = 'overview' | 'terms' | 'answers'

const bridge = new HostBridge()
const root = document.querySelector<HTMLDivElement>('#app')!
const state = {
  tab: 'overview' as Tab,
  page: 1,
  pageSize: 10,
  search: '',
  status: '',
  comment: '',
  data: null as OverviewData | Page<TermItem> | Page<AnswerItem> | null,
  loading: false,
  busy: '',
  notice: null as null | { type: 'success' | 'error'; message: string },
  expanded: new Set<string>()
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, onClick: () => void, options: { kind?: string; disabled?: boolean } = {}) {
  const node = el('button', `oa-btn ${options.kind ?? ''}`, label)
  node.type = 'button'
  node.disabled = options.disabled === true
  node.addEventListener('click', onClick)
  return node
}

async function load() {
  state.loading = true
  render()
  try {
    const parameters: Record<string, unknown> = { viewTab: state.tab }
    if (state.tab === 'answers' && state.status) parameters['status'] = state.status
    const response = await bridge.requestData({
      page: state.tab === 'overview' ? 1 : state.page,
      pageSize: state.pageSize,
      search: state.search.trim() || undefined,
      parameters
    })
    state.data = (response.data ?? null) as typeof state.data
    state.notice = null
  } catch (error) {
    state.notice = { type: 'error', message: (error as Error).message }
  }
  state.loading = false
  render()
  bridge.resize(Math.max(document.body.scrollHeight, 480))
}

async function run(actionKey: string, targetId?: string) {
  state.busy = actionKey
  state.notice = null
  render()
  try {
    const input = actionKey === 'confirm_answer' || actionKey === 'reject_answer' ? { reviewComment: state.comment } : {}
    const response = await bridge.executeAction(actionKey, input, targetId, { viewTab: state.tab })
    const result = response.result as { success?: boolean; message?: unknown } | undefined
    if (result?.success === false) throw new Error(localizeMessage(result.message) || t('actionFailed'))
    state.notice = { type: 'success', message: localizeMessage(result?.message) || t('actionDone') }
    state.comment = ''
    await load()
  } catch (error) {
    state.notice = { type: 'error', message: (error as Error).message }
    render()
  } finally {
    state.busy = ''
    render()
  }
}

function localizeMessage(message: unknown): string {
  if (typeof message === 'string') return message
  if (message && typeof message === 'object') {
    const record = message as Record<string, string>
    return record['zh_Hans'] ?? record['en_US'] ?? ''
  }
  return ''
}

function switchTab(tab: Tab) {
  state.tab = tab
  state.page = 1
  state.search = ''
  void load()
}

function changePage(delta: number) {
  state.page = Math.max(1, state.page + delta)
  void load()
}

function render() {
  const view = el('div', 'oa-shell')
  view.append(renderHeader(), renderTabs())
  if (state.notice) view.append(el('div', `oa-notice ${state.notice.type}`, state.notice.message))
  if (state.loading && !state.data) {
    view.append(el('p', 'oa-muted', t('loading')))
  } else if (state.tab === 'overview') {
    view.append(renderOverview(state.data as OverviewData | null))
  } else if (state.tab === 'terms') {
    view.append(renderTerms(state.data as Page<TermItem> | null))
  } else {
    view.append(renderAnswers(state.data as Page<AnswerItem> | null))
  }
  root.replaceChildren(view)
}

function renderHeader() {
  const header = el('header', 'oa-header')
  const titleWrap = el('div')
  titleWrap.append(el('h1', 'oa-title', t('title')), el('p', 'oa-subtitle', t('subtitle')))
  const actions = el('div', 'oa-actions')
  actions.append(
    button(state.busy === 'sync_now' ? t('syncing') : t('sync'), () => void run('sync_now'), {
      kind: 'primary',
      disabled: state.busy !== ''
    }),
    button(t('refresh'), () => void load(), { disabled: state.busy !== '' })
  )
  header.append(titleWrap, actions)
  return header
}

function renderTabs() {
  const tabs = el('nav', 'oa-tabs')
  for (const tab of ['overview', 'terms', 'answers'] as Tab[]) {
    tabs.append(button(t(tab), () => switchTab(tab), { kind: state.tab === tab ? 'tab active' : 'tab' }))
  }
  return tabs
}

function renderOverview(data: OverviewData | null) {
  const section = el('section')
  const manifest = data?.manifest
  const statusLine = el('div', 'oa-statusline')
  statusLine.append(
    badge(manifest?.stale ? t('stale') : t('upToDate'), manifest?.stale ? 'warn' : 'ok'),
    el('code', 'oa-version', `${t('mirrorVersion')}: ${data?.mirrorVersion ?? '-'}`)
  )
  section.append(statusLine)

  const facts = el('dl', 'oa-facts')
  facts.append(
    fact(t('sourceDigest'), manifest?.sourceDigest ?? '-'),
    fact(t('assertionCount'), String(data?.assertionCount ?? manifest?.assertionCount ?? 0)),
    fact(t('excluded'), String(manifest?.excluded?.length ?? 0)),
    fact(t('unsupported'), String(manifest?.unsupported?.length ?? 0))
  )
  section.append(facts)

  if (!manifest) section.append(el('p', 'oa-muted', t('missingSnapshot')))
  if (manifest?.lastError) section.append(el('p', 'oa-error', `${t('lastError')}: ${manifest.lastError}`))
  for (const [label, items] of [[t('excluded'), manifest?.excluded], [t('unsupported'), manifest?.unsupported]] as const) {
    if (items && items.length > 0) {
      const list = el('ul', 'oa-exclusions')
      list.append(el('strong', undefined, `${label} (${items.length})`))
      for (const item of items.slice(0, 8)) list.append(el('li', undefined, JSON.stringify(item).slice(0, 180)))
      section.append(list)
    }
  }

  section.append(el('h2', 'oa-section-title', t('recentRuns')))
  const runs = data?.items ?? []
  if (runs.length === 0) {
    section.append(el('p', 'oa-muted', t('noRuns')))
  } else {
    const table = el('table', 'oa-table')
    const head = el('tr')
    for (const label of [t('createdAt'), t('status'), t('mirrorVersion'), t('assertionCount'), t('attempts'), t('lastError')]) {
      head.append(el('th', undefined, label))
    }
    table.append(head)
    for (const run of runs) {
      const row = el('tr')
      row.append(
        el('td', undefined, formatTime(run.createdAt)),
        el('td', undefined, run.status),
        el('td', undefined, run.mirrorVersion ?? '-'),
        el('td', undefined, String(run.assertionCount ?? '-')),
        el('td', undefined, String(run.attempts ?? '-')),
        el('td', undefined, run.errorMessage ?? '-')
      )
      table.append(row)
    }
    section.append(table)
  }
  return section
}

function renderTerms(data: Page<TermItem> | null) {
  const section = el('section')
  const bar = el('div', 'oa-toolbar')
  const input = el('input', 'oa-input') as HTMLInputElement
  input.placeholder = t('searchPlaceholder')
  input.value = state.search
  input.addEventListener('input', () => { state.search = input.value })
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { state.page = 1; void load() } })
  bar.append(input, button(t('search'), () => { state.page = 1; void load() }))
  section.append(bar)

  const items = data?.items ?? []
  if (items.length === 0) {
    section.append(el('p', 'oa-muted', t('noTerms')))
  } else {
    const table = el('table', 'oa-table')
    const head = el('tr')
    for (const label of [t('term'), 'ID', t('aliases'), t('assertionCount'), t('status')]) head.append(el('th', undefined, label))
    table.append(head)
    for (const term of items) {
      const row = el('tr')
      row.append(
        el('td', undefined, term.label),
        el('td', undefined, term.id),
        el('td', undefined, term.aliases.join(', ') || '-'),
        el('td', undefined, String(term.assertionCount)),
        el('td', undefined, term.status)
      )
      table.append(row)
    }
    section.append(table)
  }
  section.append(renderPagination(data))
  return section
}

function renderAnswers(data: Page<AnswerItem> | null) {
  const section = el('section')
  const bar = el('div', 'oa-toolbar')
  const select = el('select', 'oa-input') as HTMLSelectElement
  for (const value of ['', 'proposed', 'confirmed', 'rejected']) {
    const option = el('option', undefined, value === '' ? t('all') : t(value as 'proposed' | 'confirmed' | 'rejected'))
    option.value = value
    if (state.status === value) option.selected = true
    select.append(option)
  }
  select.addEventListener('change', () => { state.status = select.value; state.page = 1; void load() })
  bar.append(select)
  section.append(bar)

  const comment = el('input', 'oa-input') as HTMLInputElement
  comment.placeholder = t('reviewCommentPlaceholder')
  comment.value = state.comment
  comment.addEventListener('input', () => { state.comment = comment.value })
  bar.append(comment)

  const items = data?.items ?? []
  if (items.length === 0) {
    section.append(el('p', 'oa-muted', t('noAnswers')))
  }
  for (const item of items) section.append(renderAnswerCard(item))
  section.append(renderPagination(data))
  return section
}

function renderAnswerCard(item: AnswerItem) {
  const card = el('article', 'oa-card')
  const head = el('div', 'oa-card-head')
  head.append(badge(t(item.status), item.status === 'confirmed' ? 'ok' : item.status === 'rejected' ? 'warn' : 'info'))
  if (item.stale) head.append(badge(t('stale'), 'warn'))
  head.append(el('span', 'oa-muted', formatTime(item.createdAt)))
  card.append(head)
  card.append(el('p', 'oa-question', `${t('question')}: ${item.question}`))

  const expanded = state.expanded.has(item.id)
  const answer = el('pre', 'oa-answer', expanded ? item.answer : item.answer.slice(0, 600))
  card.append(answer)
  if (item.answer.length > 600) {
    card.append(button(expanded ? t('showLess') : t('showMore'), () => {
      if (expanded) state.expanded.delete(item.id)
      else state.expanded.add(item.id)
      render()
    }, { kind: 'link' }))
  }

  const retrieval = item.retrieval
  const meta = [
    `${t('mirrorVersion')}: ${item.mirrorVersion ?? '-'}`,
    `${t('sourceDigest')}: ${item.sourceDigest ?? '-'}`
  ]
  if (retrieval) {
    meta.push(`${t('retrieval')}: arm=${retrieval.arm ?? '-'} hits=${retrieval.hits ?? 0}/${retrieval.candidates ?? 0}` +
      (retrieval.stage ? ` stage=${retrieval.stage}` : '') + (retrieval.reason ? ` reason=${retrieval.reason}` : ''))
  }
  card.append(el('p', 'oa-meta', meta.join(' · ')))
  if (item.reviewComment) card.append(el('p', 'oa-muted', `💬 ${item.reviewComment}`))

  if (item.status === 'proposed') {
    const actions = el('div', 'oa-actions')
    actions.append(
      button(t('confirm'), () => void run('confirm_answer', item.id), { kind: 'primary', disabled: state.busy !== '' }),
      button(t('reject'), () => void run('reject_answer', item.id), { kind: 'danger', disabled: state.busy !== '' })
    )
    card.append(actions)
  }
  return card
}

function renderPagination<T>(data: Page<T> | null) {
  const bar = el('div', 'oa-pagination')
  const total = data?.total ?? 0
  const page = data?.page ?? state.page
  const pageSize = data?.pageSize ?? state.pageSize
  bar.append(
    button(t('previous'), () => changePage(-1), { disabled: page <= 1 }),
    el('span', 'oa-muted', t('pageInfo', { page, total })),
    button(t('next'), () => changePage(1), { disabled: page * pageSize >= total })
  )
  return bar
}

function badge(label: string, kind: 'ok' | 'warn' | 'info') {
  return el('span', `oa-badge ${kind}`, label)
}

function fact(label: string, value: string) {
  const wrap = el('div', 'oa-fact')
  wrap.append(el('dt', undefined, label), el('dd', undefined, value))
  return wrap
}

async function start() {
  try {
    await bridge.connect(() => { void load() })
    configureLocale(bridge.locale)
    await load()
  } catch (error) {
    root.replaceChildren(el('p', 'oa-error', (error as Error).message))
  }
}

void start()
