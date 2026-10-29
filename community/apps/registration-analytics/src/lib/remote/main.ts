import { bridge } from './bridge'

interface RegistrationRecord {
  id?: string
  activityName?: string
  name?: string
  city?: string | null
  channel?: string | null
  registerTime?: string | null
  status?: string | null
  fee?: number | string | null
}

interface SavedQueryItem {
  id: string
  name: string
  question: string
  condition?: Record<string, unknown>
  createdAt?: string
}

interface ViewData {
  summary?: {
    total?: number
    activities?: number
    byStatus?: Record<string, number>
  }
  table?: {
    items: RegistrationRecord[]
    total: number
  }
  savedQueries?: SavedQueryItem[]
  fields?: Array<{ key: string; label: string; type: string }>
  suggestedQuestions?: string[]
}

const CHANNEL_LABELS: Record<string, string> = {
  website: '官网',
  wechat: '微信',
  offline: '线下',
  partner: '合作渠道'
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: '已确认',
  pending: '待确认',
  cancelled: '已取消'
}

const STATUS_CLASSES: Record<string, string> = {
  confirmed: 'confirmed',
  pending: 'pending',
  cancelled: 'cancelled'
}

async function main() {
  const root = document.getElementById('root')
  if (!root) return

  try {
    await bridge.connect()
    const response = await bridge.query()
    const data = normalizeData(response)
    render(root, data)
  } catch (error) {
    renderError(root, error)
  }

  bridge.onHostEvent(() => {
    bridge
      .query()
      .then((response) => {
        const data = normalizeData(response)
        render(root, data)
      })
      .catch(() => {
        // keep current view on refresh failure
      })
  })
}

function normalizeData(raw: unknown): ViewData {
  const value = isObject(raw) ? raw : {}
  const table = isObject(value.table) ? value.table : {}
  const summary = isObject(value.summary) ? value.summary : {}
  return {
    summary: {
      total: Number(summary.total ?? 0),
      activities: Number(summary.activities ?? 0),
      byStatus: isObject(summary.byStatus) ? summary.byStatus : {}
    },
    table: {
      items: Array.isArray(table.items) ? (table.items as RegistrationRecord[]) : [],
      total: Number(table.total ?? 0)
    },
    savedQueries: Array.isArray(value.savedQueries) ? (value.savedQueries as SavedQueryItem[]) : [],
    fields: Array.isArray(value.fields) ? value.fields : [],
    suggestedQuestions: Array.isArray(value.suggestedQuestions) ? (value.suggestedQuestions as string[]) : []
  }
}

function render(root: HTMLElement, data: ViewData) {
  const summary = data.summary ?? {}
  const byStatus = summary.byStatus ?? {}
  const statusChips = Object.entries(byStatus)
    .map(
      ([status, count]) =>
        `<span class="chip">${STATUS_LABELS[status] ?? status} ${count}</span>`
    )
    .join('')

  root.innerHTML = `
    <div class="header">
      <span class="mark">报</span>
      <div>
        <div class="title">报名问数台</div>
        <div class="sub">在右侧聊天框用自然语言提问，AI 帮你查数据、做统计</div>
      </div>
    </div>

    <div class="cards">
      <div class="card">
        <div class="num">${summary.total ?? 0}</div>
        <div class="label">总报名人数</div>
        <div>${statusChips}</div>
      </div>
      <div class="card">
        <div class="num">${summary.activities ?? 0}</div>
        <div class="label">活动数</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <span>试试这样问</span>
        <span class="hint">点击复制问题，粘贴到右侧聊天框</span>
      </div>
      <div class="suggestions">
        ${(data.suggestedQuestions ?? []).map((q) => `<button class="suggestion" data-question="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('')}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <span>报名记录（最近 ${data.table?.total ?? 0} 条）</span>
        <span class="hint">完整统计请在聊天中提问</span>
      </div>
      ${renderTable(data.table?.items ?? [])}
    </div>

    <div class="panel">
      <div class="panel-head">
        <span>常用查询</span>
        <span class="hint">可在聊天中说"保存这个查询"</span>
      </div>
      <div class="saved-list">
        ${(data.savedQueries ?? []).length ? (data.savedQueries ?? []).map(renderSavedItem).join('') : '<div class="q-empty">还没有常用查询，问一个问题后说"保存这个查询"即可。</div>'}
      </div>
    </div>

    <div class="footer-note">数据来自报名系统，AI 负责把问题转成查询并解读结果</div>
  `

  root.querySelectorAll<HTMLButtonElement>('.suggestion').forEach((button) => {
    button.addEventListener('click', async () => {
      const question = button.dataset.question ?? ''
      try {
        await navigator.clipboard.writeText(question)
        bridge.notify('问题已复制，请粘贴到右侧聊天框提问', 'success')
      } catch {
        bridge.notify('请手动复制该问题到聊天框', 'success')
      }
    })
  })
}

function renderTable(items: RegistrationRecord[]) {
  if (!items.length) {
    return '<div class="empty">暂无报名记录</div>'
  }
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>姓名</th>
            <th>活动</th>
            <th>城市</th>
            <th>渠道</th>
            <th>报名时间</th>
            <th>状态</th>
            <th>费用</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(renderRow).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderRow(record: RegistrationRecord) {
  const status = record.status ?? 'pending'
  const statusLabel = STATUS_LABELS[status] ?? status
  const statusClass = STATUS_CLASSES[status] ?? 'pending'
  const channel = record.channel ? CHANNEL_LABELS[record.channel] ?? record.channel : '—'
  const time = record.registerTime ? formatTime(record.registerTime) : '—'
  const fee = record.fee !== null && record.fee !== undefined ? `¥${record.fee}` : '—'
  return `
    <tr>
      <td><strong>${escapeHtml(record.name ?? '—')}</strong></td>
      <td>${escapeHtml(record.activityName ?? '—')}</td>
      <td>${escapeHtml(record.city ?? '—')}</td>
      <td>${escapeHtml(channel)}</td>
      <td>${escapeHtml(time)}</td>
      <td><span class="badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
      <td>${escapeHtml(fee)}</td>
    </tr>
  `
}

function renderSavedItem(item: SavedQueryItem) {
  return `
    <div class="saved-item">
      <div>
        <div class="q-name">${escapeHtml(item.name)}</div>
        <div class="q-text">${escapeHtml(item.question)}</div>
      </div>
    </div>
  `
}

function renderError(root: HTMLElement, error: unknown) {
  const message = error instanceof Error ? error.message : '加载失败'
  root.innerHTML = `
    <div class="panel">
      <div class="notice error">加载失败：${escapeHtml(message)}。请刷新重试。</div>
    </div>
  `
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

main()
