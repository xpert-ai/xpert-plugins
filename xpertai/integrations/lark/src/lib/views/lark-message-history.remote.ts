export const LARK_MESSAGE_HISTORY_REMOTE_ENTRY = 'lark-message-history'

const REMOTE_COMPONENT_CHANNEL = 'xpertai.remote_component'
const REMOTE_COMPONENT_PROTOCOL_VERSION = 1

export function renderLarkMessageHistoryRemoteHtml(): string {
  const script = buildRemoteScript()
  return `<!doctype html>
<html lang="zh-Hans">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lark Message History</title>
    <style>${REMOTE_STYLES}</style>
  </head>
  <body>
    <main id="app" class="app-shell" aria-busy="false">
      <form id="toolbar" class="toolbar">
        <input id="search" class="search-input" type="search" autocomplete="off" />
        <button id="refresh" class="button button-secondary" type="button">
          <span aria-hidden="true">↻</span><span id="refresh-label"></span>
        </button>
        <button id="submit" class="button button-primary" type="submit"></button>
      </form>
      <div id="notice" class="notice" role="status" aria-live="polite"></div>
      <section class="table-frame" aria-label="Lark message history">
        <table>
          <colgroup id="columns"></colgroup>
          <thead><tr id="headers"></tr></thead>
          <tbody id="rows"></tbody>
        </table>
        <div id="empty" class="empty" hidden></div>
      </section>
      <footer class="pagination">
        <span id="total" class="total"></span>
        <div class="page-actions">
          <button id="previous" class="button button-secondary" type="button"></button>
          <span id="page" class="page-number"></span>
          <button id="next" class="button button-secondary" type="button"></button>
        </div>
      </footer>
    </main>
    <script>${escapeInlineScript(script)}</script>
  </body>
</html>`
}

function buildRemoteScript(): string {
  return `(() => {
  const CHANNEL = ${JSON.stringify(REMOTE_COMPONENT_CHANNEL)}
  const VERSION = ${REMOTE_COMPONENT_PROTOCOL_VERSION}
  const PAGE_SIZE = 10
  const VIEWPORT_HEIGHT = 720
  const pending = new Map()
  let instanceId = null
  let requestSequence = 0
  let readyTimer = null
  const state = {
    locale: 'zh-Hans',
    page: 1,
    pageSize: PAGE_SIZE,
    search: '',
    sortBy: 'createdAt',
    sortDirection: 'desc',
    cursors: [null],
    nextCursor: null,
    total: 0,
    items: [],
    loading: false,
    error: ''
  }

  const definitions = [
    { key: 'createdAt', labels: ['Time', '时间'], width: '12rem', sortBy: 'createdAt' },
    { key: 'direction', labels: ['Direction', '方向'], width: '7rem', sortBy: 'direction' },
    { key: 'status', labels: ['Status', '状态'], width: '8rem', sortBy: 'status' },
    { key: 'conversation', labels: ['Conversation', '会话'], width: '18rem' },
    { key: 'sender', labels: ['Sender', '发送者'], width: '18rem', sortBy: 'senderName' },
    { key: 'messageType', labels: ['Type', '类型'], width: '7rem' },
    { key: 'content', labels: ['Content', '正文'], width: '24rem' },
    { key: 'attachmentStatus', labels: ['Attachments', '附件状态'], width: '10rem' },
    { key: 'botMentioned', labels: ['Mentioned', '是否 @'], width: '8rem', sortBy: 'botMentioned' },
    { key: 'xpertId', labels: ['Xpert', 'Xpert'], width: '18rem' },
    { key: 'error', labels: ['Error', '错误'], width: '18rem' }
  ]

  const copy = {
    en: {
      searchPlaceholder: 'Search messages', refresh: 'Refresh', search: 'Search', loading: 'Loading…',
      empty: 'No messages', failed: 'Unable to load messages', previous: 'Previous', next: 'Next',
      page: (page, pages) => 'Page ' + page + ' / ' + pages,
      total: (total) => total + ' message' + (total === 1 ? '' : 's')
    },
    zh: {
      searchPlaceholder: '搜索消息', refresh: '刷新', search: '搜索', loading: '正在加载…',
      empty: '暂无消息', failed: '消息加载失败', previous: '上一页', next: '下一页',
      page: (page, pages) => '第 ' + page + ' / ' + pages + ' 页',
      total: (total) => '共 ' + total + ' 条消息'
    }
  }

  const elements = {
    app: document.getElementById('app'), toolbar: document.getElementById('toolbar'),
    search: document.getElementById('search'), refresh: document.getElementById('refresh'),
    refreshLabel: document.getElementById('refresh-label'), submit: document.getElementById('submit'),
    notice: document.getElementById('notice'), columns: document.getElementById('columns'),
    headers: document.getElementById('headers'), rows: document.getElementById('rows'),
    empty: document.getElementById('empty'), total: document.getElementById('total'),
    previous: document.getElementById('previous'), next: document.getElementById('next'),
    page: document.getElementById('page')
  }

  function language() {
    return String(state.locale || '').toLowerCase().startsWith('en') ? copy.en : copy.zh
  }

  function label(pair) {
    return language() === copy.en ? pair[0] : pair[1]
  }

  function post(type, body) {
    if (!instanceId && type !== 'ready') return false
    parent.postMessage(Object.assign({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type }, body || {}), '*')
    return true
  }

  function announceReady() {
    post('ready')
    if (readyTimer !== null) return
    readyTimer = window.setInterval(() => {
      if (instanceId) {
        window.clearInterval(readyTimer)
        readyTimer = null
      } else {
        post('ready')
      }
    }, 500)
    window.setTimeout(() => {
      if (readyTimer !== null) window.clearInterval(readyTimer)
      readyTimer = null
    }, 10000)
  }

  function requestData(query) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      if (!post('requestData', { requestId, query })) {
        pending.delete(requestId)
        reject(new Error('Remote bridge is not initialized'))
        return
      }
      window.setTimeout(() => {
        if (!pending.has(requestId)) return
        pending.delete(requestId)
        reject(new Error('Request timed out'))
      }, 30000)
    })
  }

  function responsePayload(response) {
    if (!response || typeof response !== 'object') return response || null
    if (response.payload !== undefined) return response.payload
    if (response.data !== undefined) return response.data
    if (response.result !== undefined) return response.result
    return response
  }

  function normalizePayload(response) {
    let payload = responsePayload(response)
    if (payload && typeof payload === 'object' && payload.data && !Array.isArray(payload.items)) payload = payload.data
    if (payload && typeof payload === 'object' && payload.table && !Array.isArray(payload.items)) payload = payload.table
    return payload && typeof payload === 'object' ? payload : {}
  }

  function applyTheme(theme) {
    if (!theme || typeof theme !== 'object') return
    const root = document.documentElement
    const values = theme.variables && typeof theme.variables === 'object' ? theme.variables : theme
    for (const [key, value] of Object.entries(values)) {
      if (typeof value !== 'string' && typeof value !== 'number') continue
      const cssKey = String(key).startsWith('--') ? String(key) : '--xpert-' + String(key).replace(/[A-Z]/g, (part) => '-' + part.toLowerCase())
      root.style.setProperty(cssKey, String(value))
    }
  }

  function reportResize() {
    post('resize', { height: VIEWPORT_HEIGHT, viewportBound: true })
  }

  function formatDate(value) {
    if (!value) return '–'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    try {
      return new Intl.DateTimeFormat(state.locale || undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(date)
    } catch {
      return date.toISOString()
    }
  }

  function cellText(item, key) {
    const value = item ? item[key] : null
    if (key === 'createdAt') return formatDate(value)
    if (key === 'botMentioned') return value === true ? 'true' : value === false ? 'false' : '–'
    if (value === null || value === undefined || value === '') return '–'
    return typeof value === 'string' ? value : JSON.stringify(value)
  }

  function renderHeaders() {
    elements.columns.replaceChildren()
    elements.headers.replaceChildren()
    for (const definition of definitions) {
      const column = document.createElement('col')
      column.style.width = definition.width
      elements.columns.appendChild(column)
      const header = document.createElement('th')
      header.scope = 'col'
      if (definition.sortBy) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'sort-button'
        const active = state.sortBy === definition.sortBy
        button.textContent = label(definition.labels) + (active ? (state.sortDirection === 'asc' ? ' ↑' : ' ↓') : '')
        button.addEventListener('click', () => {
          if (state.sortBy === definition.sortBy) state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc'
          else {
            state.sortBy = definition.sortBy
            state.sortDirection = definition.sortBy === 'senderName' ? 'asc' : 'desc'
          }
          state.page = 1
          state.cursors = [null]
          state.nextCursor = null
          void load()
        })
        header.appendChild(button)
      } else {
        header.textContent = label(definition.labels)
      }
      elements.headers.appendChild(header)
    }
  }

  function renderRows() {
    elements.rows.replaceChildren()
    for (const item of state.items) {
      const row = document.createElement('tr')
      for (const definition of definitions) {
        const cell = document.createElement('td')
        const value = cellText(item, definition.key)
        cell.textContent = value
        cell.title = value === '–' ? '' : value
        row.appendChild(cell)
      }
      elements.rows.appendChild(row)
    }
  }

  function render() {
    const t = language()
    const pages = Math.max(1, Math.ceil(state.total / state.pageSize))
    elements.app.setAttribute('aria-busy', String(state.loading))
    elements.search.placeholder = t.searchPlaceholder
    elements.search.setAttribute('aria-label', t.searchPlaceholder)
    elements.refreshLabel.textContent = t.refresh
    elements.refresh.setAttribute('aria-label', t.refresh)
    elements.submit.textContent = t.search
    elements.previous.textContent = t.previous
    elements.next.textContent = t.next
    elements.total.textContent = t.total(state.total)
    elements.page.textContent = t.page(state.page, pages)
    elements.notice.textContent = state.error ? t.failed + ': ' + state.error : state.loading ? t.loading : ''
    elements.notice.classList.toggle('notice-error', Boolean(state.error))
    elements.empty.textContent = state.error ? t.failed : t.empty
    elements.empty.hidden = state.loading || state.items.length > 0
    elements.refresh.disabled = state.loading
    elements.submit.disabled = state.loading
    elements.previous.disabled = state.loading || state.page <= 1
    elements.next.disabled = state.loading || !state.nextCursor
    renderHeaders()
    renderRows()
  }

  async function load() {
    if (!instanceId || state.loading) return
    state.loading = true
    state.error = ''
    render()
    try {
      const response = await requestData({
        page: state.page,
        pageSize: state.pageSize,
        search: state.search || undefined,
        cursor: state.cursors[state.page - 1] || undefined,
        sortBy: state.sortBy,
        sortDirection: state.sortDirection
      })
      const payload = normalizePayload(response)
      state.items = Array.isArray(payload.items) ? payload.items : []
      state.total = Number.isFinite(Number(payload.total)) ? Math.max(0, Number(payload.total)) : state.items.length
      state.nextCursor = typeof payload.nextCursor === 'string' && payload.nextCursor ? payload.nextCursor : null
      const pages = Math.max(1, Math.ceil(state.total / state.pageSize))
      if (state.page > pages) {
        state.page = 1
        state.cursors = [null]
        state.nextCursor = null
        state.loading = false
        return void load()
      }
    } catch (error) {
      state.items = []
      state.total = 0
      state.error = error instanceof Error ? error.message : String(error || 'Unknown error')
    } finally {
      state.loading = false
      render()
      reportResize()
    }
  }

  elements.toolbar.addEventListener('submit', (event) => {
    event.preventDefault()
    state.search = elements.search.value.trim()
    state.page = 1
    state.cursors = [null]
    state.nextCursor = null
    void load()
  })
  elements.refresh.addEventListener('click', () => {
    state.page = 1
    state.cursors = [null]
    state.nextCursor = null
    void load()
  })
  elements.previous.addEventListener('click', () => {
    if (state.page <= 1) return
    state.page -= 1
    void load()
  })
  elements.next.addEventListener('click', () => {
    if (!state.nextCursor) return
    state.cursors[state.page] = state.nextCursor
    state.page += 1
    void load()
  })

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!message || typeof message !== 'object' || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
    if (message.type === 'init') {
      instanceId = typeof message.instanceId === 'string' ? message.instanceId : null
      state.locale = typeof message.locale === 'string' ? message.locale : state.locale
      const initialQuery = message.initialQuery && typeof message.initialQuery === 'object' ? message.initialQuery : {}
      state.page = 1
      state.cursors = [typeof initialQuery.cursor === 'string' && initialQuery.cursor ? initialQuery.cursor : null]
      state.search = typeof initialQuery.search === 'string' ? initialQuery.search.trim() : ''
      state.sortBy = definitions.some((definition) => definition.sortBy === initialQuery.sortBy)
        ? initialQuery.sortBy
        : state.sortBy
      state.sortDirection = initialQuery.sortDirection === 'asc' ? 'asc' : 'desc'
      elements.search.value = state.search
      applyTheme(message.theme)
      if (readyTimer !== null) window.clearInterval(readyTimer)
      readyTimer = null
      render()
      reportResize()
      void load()
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'theme' || message.type === 'themeChanged' || message.type === 'theme-change') {
      applyTheme(message.theme || (message.payload && message.payload.theme) || message.payload)
      return
    }
    if (message.requestId !== undefined) {
      const key = String(message.requestId)
      const item = pending.get(key)
      if (!item) return
      pending.delete(key)
      if (message.type === 'error') item.reject(new Error(String(message.message || 'Remote request failed')))
      else item.resolve(message)
    }
  })

  render()
  announceReady()
})()`
}

function escapeInlineScript(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script')
}

const REMOTE_STYLES = `
:root {
  color-scheme: light dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --surface: var(--xpert-background, #ffffff);
  --surface-muted: var(--xpert-muted, #f7f7f8);
  --text: var(--xpert-foreground, #18181b);
  --text-muted: var(--xpert-muted-foreground, #71717a);
  --border: var(--xpert-border, #e4e4e7);
  --primary: var(--xpert-primary, #18181b);
  --primary-text: var(--xpert-primary-foreground, #ffffff);
}
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; min-height: 0; margin: 0; overflow: hidden; background: var(--surface); color: var(--text); }
button, input { font: inherit; }
.app-shell { display: flex; height: min(720px, 100vh); min-height: 0; flex-direction: column; gap: 12px; padding: 16px; overflow: hidden; }
.toolbar { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }
.search-input { min-width: 0; height: 36px; flex: 1 1 auto; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); padding: 0 12px; outline: none; }
.search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 18%, transparent); }
.button { display: inline-flex; height: 36px; flex: 0 0 auto; align-items: center; justify-content: center; gap: 6px; border-radius: 8px; padding: 0 13px; cursor: pointer; white-space: nowrap; }
.button:disabled { cursor: default; opacity: .5; }
.button-primary { border: 1px solid var(--primary); background: var(--primary); color: var(--primary-text); }
.button-secondary { border: 1px solid var(--border); background: var(--surface); color: var(--text); }
.button:not(:disabled):hover { filter: brightness(.97); }
.notice { min-height: 18px; flex: 0 0 auto; color: var(--text-muted); font-size: 12px; }
.notice:empty { display: none; }
.notice-error { color: #dc2626; }
.table-frame { position: relative; min-height: 0; flex: 1 1 auto; overflow: auto; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); overscroll-behavior: contain; }
table { min-width: 158rem; width: max-content; border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 13px; }
thead { position: sticky; top: 0; z-index: 2; }
th { height: 42px; border-bottom: 1px solid var(--border); background: var(--surface-muted); color: var(--text-muted); padding: 0 12px; text-align: left; font-weight: 600; }
td { height: 52px; max-height: 92px; border-bottom: 1px solid var(--border); padding: 10px 12px; overflow: hidden; color: var(--text); text-overflow: ellipsis; vertical-align: top; white-space: normal; word-break: break-word; }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover td { background: color-mix(in srgb, var(--surface-muted) 65%, transparent); }
.sort-button { width: 100%; border: 0; background: transparent; color: inherit; padding: 0; cursor: pointer; text-align: left; font-weight: inherit; }
.empty { position: absolute; inset: 42px 0 0; padding: 48px 16px; color: var(--text-muted); text-align: center; }
.pagination { display: flex; min-height: 36px; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 12px; }
.total, .page-number { color: var(--text-muted); font-size: 13px; }
.page-actions { display: flex; align-items: center; gap: 8px; }
@media (prefers-color-scheme: dark) {
  :root { --surface: var(--xpert-background, #18181b); --surface-muted: var(--xpert-muted, #27272a); --text: var(--xpert-foreground, #fafafa); --text-muted: var(--xpert-muted-foreground, #a1a1aa); --border: var(--xpert-border, #3f3f46); --primary: var(--xpert-primary, #fafafa); --primary-text: var(--xpert-primary-foreground, #18181b); }
}
`
