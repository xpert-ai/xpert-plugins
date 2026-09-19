const CHANNEL = 'xpertai.remote_component'
const VERSION = 1

let instanceId = null
let requestSequence = 0
let pollTimer = null
const pending = new Map()
const state = {
  locale: 'en',
  data: null,
  selectedId: null,
  busy: null,
  error: null,
  createOpen: false
}

const TEXT = {
  en: {
    title: 'Complaint Triage Workbench',
    newCase: 'New complaint',
    refresh: 'Refresh',
    search: 'Search complaints',
    empty: 'No complaint cases',
    emptyDetail: 'Create a complaint to begin.',
    customerName: 'Customer name',
    customerReference: 'Customer reference',
    complaintContent: 'Complaint content',
    create: 'Create complaint',
    cancel: 'Cancel',
    analyze: 'Analyze with AI',
    check: 'Check status',
    retry: 'Retry analysis',
    save: 'Save review',
    confirm: 'Confirm result',
    aiOriginal: 'AI original result',
    humanReview: 'Human review',
    confirmedResult: 'Confirmed result',
    summary: 'Summary',
    category: 'Category',
    urgency: 'Urgency',
    customerIntent: 'Customer intent',
    riskFlags: 'Risk flags',
    suggestedAction: 'Suggested action',
    replyDraft: 'Reply draft',
    attempt: 'Attempt',
    processing: 'AI analysis is processing.',
    confirmed: 'Confirmed',
    updated: 'Updated',
    requestFailed: 'The request failed.',
    required: 'Complete all required fields.'
  },
  zh: {
    title: '客诉分诊工作台',
    newCase: '新建投诉',
    refresh: '刷新',
    search: '搜索投诉',
    empty: '暂无投诉工单',
    emptyDetail: '创建投诉后开始处理。',
    customerName: '客户名称',
    customerReference: '客户参考号',
    complaintContent: '投诉内容',
    create: '创建投诉',
    cancel: '取消',
    analyze: '使用 AI 分析',
    check: '查询状态',
    retry: '重试分析',
    save: '保存审核',
    confirm: '确认结果',
    aiOriginal: 'AI 原始结果',
    humanReview: '人工审核',
    confirmedResult: '人工确认结果',
    summary: '摘要',
    category: '分类',
    urgency: '紧急程度',
    customerIntent: '客户诉求',
    riskFlags: '风险标记',
    suggestedAction: '建议措施',
    replyDraft: '回复草稿',
    attempt: '分析次数',
    processing: 'AI 正在分析投诉。',
    confirmed: '已确认',
    updated: '更新时间',
    requestFailed: '请求失败。',
    required: '请完整填写必填字段。'
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window.parent || !isObject(event.data)) return
  const message = event.data
  if (message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
  if (message.type === 'init') {
    instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
    state.locale = String(message.locale || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
    document.documentElement.lang = state.locale === 'zh' ? 'zh-Hans' : 'en'
    void load(readInitialSelection(message.initialQuery))
    return
  }
  if (message.instanceId !== instanceId || message.requestId === undefined) return
  const key = String(message.requestId)
  const request = pending.get(key)
  if (!request) return
  pending.delete(key)
  clearTimeout(request.timer)
  if (message.type === 'error') request.reject(new Error(message.message || text().requestFailed))
  else request.resolve(message)
})

post('ready')
render()

async function load(selectionId, silent = false) {
  if (!silent) setBusy('refresh')
  state.error = null
  try {
    const response = await request('requestData', {
      query: {
        page: 1,
        pageSize: 30,
        ...(selectionId ? { selectionId } : {})
      }
    })
    state.data = unwrap(response)
    state.selectedId = state.data?.selectedCase?.id || null
  } catch (error) {
    state.error = messageOf(error)
  } finally {
    if (!silent) state.busy = null
    render()
    schedulePoll()
  }
}

async function runAction(actionKey, input, nextSelection) {
  setBusy(actionKey)
  state.error = null
  try {
    const response = await request('executeAction', {
      actionKey,
      targetId: state.selectedId,
      input
    })
    const result = unwrap(response)
    if (isObject(result) && result.success === false) {
      throw new Error(localizedMessage(result.message) || text().requestFailed)
    }
    const data = isObject(result) ? result.data : null
    const selection = nextSelection?.(data) || state.selectedId
    notify('success', localizedMessage(result?.message) || text().updated)
    state.createOpen = false
    await load(selection, true)
  } catch (error) {
    state.error = messageOf(error)
    notify('error', state.error)
  } finally {
    state.busy = null
    render()
    schedulePoll()
  }
}

function render() {
  const root = document.getElementById('root')
  if (!root) return
  const t = text()
  const cases = state.data?.table?.items || []
  const current = state.data?.selectedCase || null
  root.innerHTML = `
    <div class="ctw-shell">
      <header class="ctw-header">
        <div>
          <h1>${escapeHtml(t.title)}</h1>
          <span class="ctw-count">${Number(state.data?.table?.total || 0)}</span>
        </div>
        <div class="ctw-header-actions">
          <button class="ctw-button ctw-button-secondary" data-action="refresh" ${disabled('refresh')}>${escapeHtml(t.refresh)}</button>
          <button class="ctw-button ctw-button-primary" data-action="open-create">${escapeHtml(t.newCase)}</button>
        </div>
      </header>
      ${state.error ? `<div class="ctw-alert" role="alert">${escapeHtml(state.error)}</div>` : ''}
      <div class="ctw-layout">
        <aside class="ctw-list" aria-label="${escapeHtml(t.title)}">
          ${cases.length ? cases.map(caseRow).join('') : `<div class="ctw-empty-list">${escapeHtml(t.empty)}</div>`}
        </aside>
        <main class="ctw-main">
          ${state.createOpen ? createForm() : current ? caseDetail(current) : emptyDetail()}
        </main>
      </div>
    </div>`
  bindEvents()
  reportResize()
}

function caseRow(item) {
  const selected = item.id === state.selectedId
  return `
    <button class="ctw-case-row${selected ? ' is-selected' : ''}" data-case-id="${escapeAttr(item.id)}">
      <span class="ctw-case-customer">${escapeHtml(item.customerName)}</span>
      <span class="ctw-case-preview">${escapeHtml(item.complaintContent)}</span>
      <span class="ctw-row-meta">
        <span class="ctw-status ctw-status-${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
        <time>${escapeHtml(formatDate(item.updatedAt))}</time>
      </span>
    </button>`
}

function createForm() {
  const t = text()
  return `
    <section class="ctw-section">
      <div class="ctw-section-heading"><h2>${escapeHtml(t.newCase)}</h2></div>
      <form id="create-case-form" class="ctw-form">
        <label>${escapeHtml(t.customerName)}<input name="customerName" maxlength="160" required /></label>
        <label>${escapeHtml(t.customerReference)}<input name="customerReference" maxlength="160" /></label>
        <label class="ctw-span-full">${escapeHtml(t.complaintContent)}<textarea name="complaintContent" maxlength="10000" rows="8" required></textarea></label>
        <div class="ctw-form-actions ctw-span-full">
          <button type="button" class="ctw-button ctw-button-secondary" data-action="cancel-create">${escapeHtml(t.cancel)}</button>
          <button type="submit" class="ctw-button ctw-button-primary" ${disabled('create_case')}>${escapeHtml(t.create)}</button>
        </div>
      </form>
    </section>`
}

function caseDetail(item) {
  const t = text()
  return `
    <section class="ctw-section ctw-case-header">
      <div class="ctw-section-heading">
        <div>
          <div class="ctw-eyebrow">${escapeHtml(item.customerReference || item.id.slice(0, 8))}</div>
          <h2>${escapeHtml(item.customerName)}</h2>
        </div>
        <span class="ctw-status ctw-status-${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
      </div>
      <p class="ctw-complaint">${escapeHtml(item.complaintContent)}</p>
      <div class="ctw-meta"><span>${escapeHtml(t.attempt)}: ${Number(item.attemptCount || 0)}</span><span>${escapeHtml(t.updated)}: ${escapeHtml(formatDate(item.updatedAt))}</span></div>
      ${caseActions(item)}
    </section>
    ${item.errorMessage ? `<section class="ctw-section ctw-failure"><strong>${escapeHtml(item.errorCode || 'analysis_failed')}</strong><p>${escapeHtml(item.errorMessage)}</p></section>` : ''}
    ${item.status === 'PROCESSING' ? `<section class="ctw-section ctw-processing"><span class="ctw-spinner" aria-hidden="true"></span><p>${escapeHtml(t.processing)}</p></section>` : ''}
    ${item.aiOriginalResult ? resultSection(t.aiOriginal, item.aiOriginalResult, false) : ''}
    ${item.status === 'PENDING_REVIEW' ? reviewForm(item) : ''}
    ${item.humanConfirmedResult ? resultSection(t.confirmedResult, item.humanConfirmedResult, false) : ''}`
}

function caseActions(item) {
  const t = text()
  if (item.status === 'DRAFT') {
    return `<div class="ctw-primary-action"><button class="ctw-button ctw-button-primary" data-action="analyze" ${disabled('analyze_case')}>${escapeHtml(t.analyze)}</button></div>`
  }
  if (item.status === 'PROCESSING') {
    return `<div class="ctw-primary-action"><button class="ctw-button ctw-button-secondary" data-action="check" ${disabled('check_analysis')}>${escapeHtml(t.check)}</button></div>`
  }
  if (item.status === 'FAILED') {
    return `<div class="ctw-primary-action"><button class="ctw-button ctw-button-primary" data-action="retry" ${disabled('retry_case')}>${escapeHtml(t.retry)}</button></div>`
  }
  return ''
}

function reviewForm(item) {
  const t = text()
  const result = item.humanDraftResult || item.aiOriginalResult || {}
  return `
    <section class="ctw-section">
      <div class="ctw-section-heading"><h2>${escapeHtml(t.humanReview)}</h2></div>
      <form id="review-form" class="ctw-form">
        ${field('summary', t.summary, result.summary, 'textarea')}
        ${field('category', t.category, result.category)}
        <label>${escapeHtml(t.urgency)}
          <select name="urgency" required>
            ${['low', 'medium', 'high', 'critical'].map((value) => `<option value="${value}"${result.urgency === value ? ' selected' : ''}>${escapeHtml(urgencyLabel(value))}</option>`).join('')}
          </select>
        </label>
        ${field('customerIntent', t.customerIntent, result.customerIntent, 'textarea')}
        ${field('riskFlags', t.riskFlags, (result.riskFlags || []).join(', '), 'textarea')}
        ${field('suggestedAction', t.suggestedAction, result.suggestedAction, 'textarea')}
        ${field('replyDraft', t.replyDraft, result.replyDraft, 'textarea')}
        <div class="ctw-form-actions ctw-span-full">
          <button type="button" class="ctw-button ctw-button-secondary" data-action="save-review" ${disabled('save_review')}>${escapeHtml(t.save)}</button>
          <button type="button" class="ctw-button ctw-button-primary" data-action="confirm" ${disabled('confirm_case')}>${escapeHtml(t.confirm)}</button>
        </div>
      </form>
    </section>`
}

function resultSection(title, result) {
  const t = text()
  return `
    <section class="ctw-section">
      <div class="ctw-section-heading"><h2>${escapeHtml(title)}</h2></div>
      <dl class="ctw-result-grid">
        ${resultItem(t.summary, result.summary, true)}
        ${resultItem(t.category, result.category)}
        ${resultItem(t.urgency, urgencyLabel(result.urgency))}
        ${resultItem(t.customerIntent, result.customerIntent, true)}
        ${resultItem(t.riskFlags, (result.riskFlags || []).join(', ') || '-')}
        ${resultItem(t.suggestedAction, result.suggestedAction, true)}
        ${resultItem(t.replyDraft, result.replyDraft, true)}
      </dl>
    </section>`
}

function resultItem(label, value, wide = false) {
  return `<div${wide ? ' class="ctw-result-wide"' : ''}><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || '-')}</dd></div>`
}

function field(name, label, value, kind = 'input') {
  const safe = escapeAttr(value || '')
  if (kind === 'textarea') {
    return `<label class="ctw-span-full">${escapeHtml(label)}<textarea name="${name}" rows="3" required>${escapeHtml(value || '')}</textarea></label>`
  }
  return `<label>${escapeHtml(label)}<input name="${name}" value="${safe}" required /></label>`
}

function emptyDetail() {
  return `<div class="ctw-empty-detail"><strong>${escapeHtml(text().empty)}</strong><p>${escapeHtml(text().emptyDetail)}</p></div>`
}

function bindEvents() {
  document.querySelector('[data-action="refresh"]')?.addEventListener('click', () => void load(state.selectedId))
  document.querySelector('[data-action="open-create"]')?.addEventListener('click', () => {
    state.createOpen = true
    render()
  })
  document.querySelector('[data-action="cancel-create"]')?.addEventListener('click', () => {
    state.createOpen = false
    render()
  })
  document.querySelectorAll('[data-case-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.createOpen = false
      void load(button.dataset.caseId)
    })
  })
  document.getElementById('create-case-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const input = {
      customerName: String(values.customerName || '').trim(),
      complaintContent: String(values.complaintContent || '').trim(),
      ...(String(values.customerReference || '').trim()
        ? { customerReference: String(values.customerReference).trim() }
        : {})
    }
    if (!input.customerName || !input.complaintContent) return showError(text().required)
    void runAction('create_case', input, (data) => data?.id)
  })
  document.querySelector('[data-action="analyze"]')?.addEventListener('click', () => {
    void runAction('analyze_case', { caseId: state.selectedId }, (data) => data?.case?.id)
  })
  document.querySelector('[data-action="check"]')?.addEventListener('click', () => {
    void runAction('check_analysis', { caseId: state.selectedId }, (data) => data?.case?.id)
  })
  document.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
    void runAction('retry_case', { caseId: state.selectedId }, (data) => data?.case?.id)
  })
  document.querySelector('[data-action="save-review"]')?.addEventListener('click', () => submitReview(false))
  document.querySelector('[data-action="confirm"]')?.addEventListener('click', () => submitReview(true))
}

function submitReview(confirm) {
  const form = document.getElementById('review-form')
  if (!form) return
  const values = Object.fromEntries(new FormData(form))
  const result = {
    summary: String(values.summary || '').trim(),
    category: String(values.category || '').trim(),
    urgency: String(values.urgency || ''),
    customerIntent: String(values.customerIntent || '').trim(),
    riskFlags: String(values.riskFlags || '').split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
    suggestedAction: String(values.suggestedAction || '').trim(),
    replyDraft: String(values.replyDraft || '').trim()
  }
  if (!result.summary || !result.category || !result.customerIntent || !result.suggestedAction || !result.replyDraft) {
    return showError(text().required)
  }
  void runAction(confirm ? 'confirm_case' : 'save_review', { caseId: state.selectedId, result })
}

function schedulePoll() {
  clearTimeout(pollTimer)
  if (state.data?.selectedCase?.status !== 'PROCESSING' || state.busy) return
  pollTimer = setTimeout(() => {
    if (!state.selectedId) return
    void runAction('check_analysis', { caseId: state.selectedId }, (data) => data?.case?.id)
  }, 3000)
}

function request(type, body = {}, timeoutMs = 30000) {
  const requestId = String(++requestSequence)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error(text().requestFailed))
    }, timeoutMs)
    pending.set(requestId, { resolve, reject, timer })
    post(type, { requestId, ...body })
  })
}

function post(type, body = {}) {
  if (!instanceId && type !== 'ready') return
  window.parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type, ...body }, '*')
}

function notify(level, message) {
  post('notify', { level, message })
}

function reportResize() {
  const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 720)
  post('resize', { height, viewportBound: true })
}

function setBusy(value) {
  state.busy = value
  render()
}

function disabled(action) {
  return state.busy ? `disabled aria-busy="${state.busy === action}"` : ''
}

function showError(message) {
  state.error = message
  render()
}

function statusLabel(status) {
  const labels = state.locale === 'zh'
    ? { DRAFT: '草稿', PROCESSING: '分析中', PENDING_REVIEW: '待审核', CONFIRMED: '已确认', FAILED: '失败' }
    : { DRAFT: 'Draft', PROCESSING: 'Processing', PENDING_REVIEW: 'Pending review', CONFIRMED: 'Confirmed', FAILED: 'Failed' }
  return labels[status] || status || '-'
}

function urgencyLabel(value) {
  const labels = state.locale === 'zh'
    ? { low: '低', medium: '中', high: '高', critical: '紧急' }
    : { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }
  return labels[value] || value || '-'
}

function statusClass(status) {
  return String(status || 'unknown').toLowerCase().replace(/_/g, '-')
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(state.locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(date)
}

function unwrap(value) {
  if (!isObject(value)) return value
  if (value.payload !== undefined) return value.payload
  if (value.data !== undefined) return value.data
  if (value.result !== undefined) return value.result
  return value
}

function localizedMessage(value) {
  if (typeof value === 'string') return value
  if (!isObject(value)) return null
  const keys = state.locale === 'zh' ? ['zh_Hans', 'zh_Hant', 'en_US'] : ['en_US', 'zh_Hans']
  for (const key of keys) if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim()
  return null
}

function messageOf(error) {
  return error instanceof Error && error.message ? error.message : text().requestFailed
}

function readInitialSelection(query) {
  return isObject(query) && typeof query.selectionId === 'string' ? query.selectionId : null
}

function text() {
  return TEXT[state.locale] || TEXT.en
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value) {
  return escapeHtml(value)
}
