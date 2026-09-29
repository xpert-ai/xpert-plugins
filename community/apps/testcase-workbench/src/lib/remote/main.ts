// Remote component UI for the AI test-case workbench. Runs inside an iframe and talks to
// the Xpert host over the documented `xpertai.remote_component` postMessage protocol:
//   iframe -> host : { type: 'ready' | 'requestData' | 'executeAction' | 'invokeClientCommand' | 'resize' }
//   host -> iframe : { type: 'init' | 'data' | 'actionResult' | 'clientCommandResult' | 'hostEvent' | 'error' }
// Only the host supplies the trusted scope; this UI never invents tenant/user identifiers.

const CHANNEL = 'xpertai.remote_component'
const PROTOCOL = 1

type Envelope = {
  type: string; instanceId?: string; requestId?: string; locale?: string
  data?: unknown; result?: unknown; message?: string
}

type State = {
  revision: number
  requirements: Array<{ id: string; title: string; description: string; module?: string }>
  cases: Array<{
    id: string; requirementId: string; title: string; precondition: string
    steps: string[]; expected: string; priority: string; status: 'draft' | 'confirmed'; requestId: string
  }>
}

const messages: Record<string, [string, string]> = {
  loading: ['Loading your workbench…', '正在加载工作台…'],
  loadFailed: ['Could not reach the platform.', '无法连接平台。'],
  reload: ['Retry', '重试'],
  emptyTitle: ['No requirement yet', '还没有需求'],
  emptyHint: ['Save a requirement, then let the assistant draft cases from it.', '先保存一条需求，再让助手据此生成用例。'],
  reqTitle: ['Requirement title', '需求标题'],
  reqDesc: ['What should the system do? (expected behaviour, boundary, exception)', '描述系统应有的行为（正常/边界/异常）'],
  reqModule: ['Module (optional)', '所属模块（选填）'],
  saveReq: ['Save requirement', '保存需求'],
  generating: ['Generate with AI', 'AI 生成用例'],
  generateHint: ['Puts the requirement into the chat box; add detail then send.', '把需求引用到聊天框，补充说明后发送。'],
  drafts: ['Draft cases', '用例草稿'],
  confirmed: ['Confirmed', '已确认'],
  noCases: ['No cases yet for this requirement.', '该需求暂无用例。'],
  steps: ['Steps', '步骤'],
  expected: ['Expected', '预期'],
  precondition: ['Precondition', '前置条件'],
  none: ['none', '无'],
  confirm: ['Confirm selected', '确认选中'],
  discard: ['Discard selected', '丢弃选中'],
  saved: ['Saved', '已保存'],
  saving: ['Saving…', '保存中…'],
  dirty: ['Unsaved', '未保存'],
  saveError: ['Save failed', '保存失败'],
  conflict: ['Someone else changed this data. Reload to keep their edits.', '数据已被其它端修改，请刷新后重试，避免覆盖。'],
  needRequirement: ['Save the requirement first.', '请先保存需求。'],
  needSelection: ['Select at least one draft.', '请至少勾选一条草稿。'],
  retry: ['Retry', '重试']
}

class HostBridge {
  private instanceId: string | null = null
  private pending = new Map<string, { resolve: (m: Envelope) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private listeners = new Set<() => void>()
  private connected: Promise<{ locale: string }> | null = null
  private initResolve: ((v: { locale: string }) => void) | null = null
  private initReject: ((e: Error) => void) | null = null
  private initTimer: ReturnType<typeof setTimeout> | null = null

  private readonly handle = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    const message = event.data as Envelope
    if (!message || typeof message !== 'object' || (message as { channel?: string }).channel !== CHANNEL) return
    if (message.type === 'init' && message.instanceId) {
      this.instanceId = message.instanceId
      this.initResolve?.({ locale: message.locale ?? 'en-US' })
      this.initResolve = null
      return
    }
    if (!this.instanceId || message.instanceId !== this.instanceId) return
    if (message.type === 'hostEvent') { this.listeners.forEach(l => l()); return }
    const waiting = message.requestId ? this.pending.get(message.requestId) : null
    if (!waiting) return
    clearTimeout(waiting.timer); this.pending.delete(message.requestId!)
    if (message.type === 'error') waiting.reject(new Error(message.message ?? 'host_request_failed'))
    else waiting.resolve(message)
  }

  connect() {
    if (this.connected) return this.connected
    this.connected = new Promise<{ locale: string }>((resolve, reject) => {
      this.initResolve = resolve; this.initReject = reject
      window.addEventListener('message', this.handle)
      this.initTimer = setTimeout(() => reject(new Error('host_timeout')), 15000)
      window.parent.postMessage({ channel: CHANNEL, protocolVersion: PROTOCOL, type: 'ready' }, '*')
    })
    return this.connected
  }

  private request(type: string, body: Record<string, unknown>) {
    if (!this.instanceId) return Promise.reject(new Error('not_connected'))
    const requestId = crypto.randomUUID()
    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('host_timeout')) }, 30000)
      this.pending.set(requestId, { resolve, reject, timer })
      window.parent.postMessage({ channel: CHANNEL, protocolVersion: PROTOCOL, instanceId: this.instanceId, requestId, type, ...body }, '*')
    })
  }

  async query(): Promise<State> {
    const result = await this.request('requestData', { query: { parameters: {} } })
    if (result.type !== 'data') throw new Error('unexpected_response')
    return ((result.data as { item: State }).item)
  }

  async action<T>(actionKey: string, input: unknown): Promise<T> {
    const response = await this.request('executeAction', { actionKey, input })
    if (response.type !== 'actionResult') throw new Error('unexpected_response')
    const result = response.result as { success: boolean; data: unknown }
    if (!result.success) {
      const failure = result.data as { code?: string }
      throw new Error(failure?.code ?? 'action_failed')
    }
    return result.data as T
  }

  async appendReferences(references: Array<{ type: 'text'; label: string; text: string }>) {
    const response = this.request('invokeClientCommand', { commandKey: 'assistant.composer.append_references', payload: { references } })
    ;(await response)
  }

  onHostEvent(cb: () => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb) } }
  resize() {
    if (this.instanceId) window.parent.postMessage({ channel: CHANNEL, protocolVersion: PROTOCOL, instanceId: this.instanceId, type: 'resize', height: 720, viewportBound: true }, '*')
  }
}

const bridge = new HostBridge()
let locale: 'zh' | 'en' = 'en'
function t(key: string) { const pair = messages[key]; return (locale === 'zh' ? pair[1] : pair[0]) }
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => { const n = document.createElement(tag); if (cls) n.className = cls; return n }

let state: State = { revision: 0, requirements: [], cases: [] }
let draftRevision = 0
const selected = new Set<string>()
let lastRequestId = ''

function root(): HTMLElement { return document.getElementById('testcase-root')! }

function setStatus(kind: 'idle' | 'saving' | 'saved' | 'error', text?: string) {
  const bar = document.querySelector<HTMLElement>('#status-line')!
  bar.dataset.state = kind
  bar.textContent = text ?? (kind === 'saving' ? t('saving') : kind === 'saved' ? t('saved') : kind === 'error' ? t('saveError') : '')
}

function activeRequirement() {
  const id = (document.querySelector<HTMLSelectElement>('#req-select')!.value)
  return state.requirements.find(r => r.id === id) ?? null
}

async function reload() {
  state = await bridge.query()
  draftRevision = state.revision
  render()
}

function render() {
  const container = root()
  container.replaceChildren()
  container.append(renderRequirementPanel(), renderCaseList())
  bridge.resize()
}

function renderRequirementPanel() {
  const panel = el('section', 'panel requirement-panel')
  const header = el('h2'); header.textContent = t('reqTitle'); panel.append(header)

  const select = el('select'); select.id = 'req-select'
  for (const req of state.requirements) {
    const opt = el('option'); opt.value = req.id
    opt.textContent = req.title + (req.module ? ` · ${req.module}` : '')
    select.append(opt)
  }
  select.addEventListener('change', render)
  panel.append(select)

  const title = el('input'); title.id = 'req-title'; title.placeholder = t('reqTitle')
  const desc = el('textarea'); desc.id = 'req-desc'; desc.placeholder = t('reqDesc'); desc.rows = 4
  const module = el('input'); module.id = 'req-module'; module.placeholder = t('reqModule')
  const current = activeRequirement()
  if (current) { title.value = current.title; desc.value = current.description; module.value = current.module ?? '' }
  panel.append(title, desc, module)

  const actions = el('div', 'actions')
  const save = el('button'); save.id = 'save-req'; save.type = 'button'; save.textContent = t('saveReq')
  save.addEventListener('click', () => void onSaveRequirement())
  const generate = el('button'); generate.id = 'generate'; generate.type = 'button'; generate.className = 'primary'
  generate.textContent = t('generating'); generate.title = t('generateHint')
  generate.disabled = !state.requirements.length
  generate.addEventListener('click', () => void onGenerate())
  actions.append(save, generate)
  panel.append(actions)

  const status = el('div'); status.id = 'status-line'; status.className = 'status'; status.dataset.state = 'idle'
  panel.append(status)
  return panel
}

function renderCaseList() {
  const req = activeRequirement()
  const panel = el('section', 'panel case-panel')
  const header = el('h2')
  const drafts = state.cases.filter(c => req && c.requirementId === req.id && c.status === 'draft')
  const confirmed = state.cases.filter(c => req && c.requirementId === req.id && c.status === 'confirmed')
  header.textContent = `${drafts.length} ${t('drafts')} · ${confirmed.length} ${t('confirmed')}`
  panel.append(header)

  if (!state.requirements.length) {
    const empty = el('p', 'empty'); empty.textContent = t('emptyHint'); panel.append(empty); return panel
  }
  if (!req || (!drafts.length && !confirmed.length)) {
    const empty = el('p', 'empty'); empty.textContent = t('noCases'); panel.append(empty); return panel
  }

  const list = el('ul', 'case-list')
  for (const c of [...drafts, ...confirmed]) list.append(renderCase(c))
  panel.append(list)

  if (drafts.length) {
    const footer = el('div', 'actions')
    const confirm = el('button'); confirm.textContent = t('confirm'); confirm.className = 'primary'
    confirm.addEventListener('click', () => void onConfirm('confirm_cases'))
    const discard = el('button'); discard.textContent = t('discard')
    discard.addEventListener('click', () => void onConfirm('discard_cases'))
    footer.append(confirm, discard)
    panel.append(footer)
  }
  return panel
}

function renderCase(c: State['cases'][number]) {
  const li = el('li', `case ${c.status}`)
  if (c.status === 'draft') {
    const box = el('input'); box.type = 'checkbox'; box.checked = selected.has(c.id)
    box.addEventListener('change', () => { box.checked ? selected.add(c.id) : selected.delete(c.id) })
    li.append(box)
  }
  const body = el('div', 'case-body')
  const title = el('div', 'case-title'); title.textContent = `[${c.priority}] ${c.title}`
  const pre = el('div', 'case-meta'); pre.textContent = `${t('precondition')}: ${c.precondition || t('none')}`
  const steps = el('ol', 'case-steps'); for (const s of c.steps) { const li2 = el('li'); li2.textContent = s; steps.append(li2) }
  const exp = el('div', 'case-meta'); exp.textContent = `${t('expected')}: ${c.expected}`
  body.append(title, pre, steps, exp)
  li.append(body)
  return li
}

async function onSaveRequirement() {
  const title = (document.querySelector<HTMLInputElement>('#req-title')!.value).trim()
  const description = (document.querySelector<HTMLTextAreaElement>('#req-desc')!.value).trim()
  const moduleValue = (document.querySelector<HTMLInputElement>('#req-module')!.value).trim()
  if (!title || !description) { setStatus('error', t('needRequirement')); return }
  const current = activeRequirement()
  const id = current ? current.id : (crypto.randomUUID())
  setStatus('saving')
  try {
    await bridge.action('save_requirement', {
      expectedRevision: draftRevision,
      requirement: { id, title, description, module: moduleValue || undefined }
    })
    selected.clear()
    await reload()
    setStatus('saved')
  } catch (error) { showFailure(error) }
}

async function onGenerate() {
  const req = activeRequirement()
  if (!req) { setStatus('error', t('needRequirement')); return }
  lastRequestId = crypto.randomUUID()
  try {
    // The reference carries the requirementId so the assistant can call the persist tool
    // against the right row, plus a fresh requestId for a duplicate-safe generation.
    await bridge.appendReferences([{
      type: 'text',
      label: `requirementId=${req.id} requestId=${lastRequestId}`,
      text: `${req.title}\n${req.description}${req.module ? `\n模块：${req.module}` : ''}`
    }])
  } catch (error) { showFailure(error) }
}

async function onConfirm(actionKey: 'confirm_cases' | 'discard_cases') {
  if (!selected.size) { setStatus('error', t('needSelection')); return }
  setStatus('saving')
  try {
    await bridge.action(actionKey, { expectedRevision: draftRevision, caseIds: [...selected] })
    selected.clear()
    await reload()
    setStatus('saved')
  } catch (error) { showFailure(error) }
}

function showFailure(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  if (code === 'conflict') { setStatus('error', t('conflict')); mountRetry(); return }
  setStatus('error', `${t('saveError')}${code ? ` (${code})` : ''}`)
}

function mountRetry() {
  const bar = document.querySelector<HTMLElement>('#status-line')!
  if (bar.querySelector('button')) return
  const retry = el('button'); retry.type = 'button'; retry.textContent = t('retry')
  retry.addEventListener('click', () => void reload().then(() => setStatus('idle')))
  bar.append(' ', retry)
}

async function start() {
  const loading = document.querySelector<HTMLElement>('#testcase-loading')!
  try {
    const config = await bridge.connect()
    locale = (config.locale ?? 'en-US').toLowerCase().startsWith('zh') ? 'zh' : 'en'
    document.documentElement.lang = locale === 'zh' ? 'zh-Hans' : 'en'
    loading.remove()
    await reload()
    bridge.onHostEvent(() => { if (document.visibilityState !== 'hidden') void reload().catch(() => {}) })
  } catch {
    loading.replaceChildren()
    const p = el('p'); p.textContent = t('loadFailed')
    const b = el('button'); b.textContent = t('reload'); b.addEventListener('click', () => window.location.reload())
    loading.append(p, b)
  }
}

void start()
