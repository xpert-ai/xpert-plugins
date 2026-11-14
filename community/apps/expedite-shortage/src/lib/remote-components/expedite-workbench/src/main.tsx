/**
 * 工作台界面入口：顶部工具条 + 主工作区（左：请求列表，右：详情）。
 *
 * 数据流：所有数据都通过 bridge 向宿主要（requestData → 视图提供者 getViewData），
 * 所有按钮都通过 bridge 执行视图动作（executeAction → executeViewAction），做完再刷新一次。
 * 刷新时机：①动作完成后；②宿主转发“写工具完成”事件；③分析中每 5 秒轮询兜底；④宿主切换上下文后重新 init。
 *
 * 界面状态全部放在 React state / ref 里，不使用浏览器的 Web 存储（iframe 是沙箱，访问会抛 SecurityError）。
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Badge, Button, Plus, RefreshCw } from '@xpert-ai/plugin-shadcn-ui'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import './styles.css'
import { ActionError, executeAction, invokeClientCommand, requestData, startBridge } from './bridge'
import type { HostInit } from './bridge'
import { createTranslator, describeCode, normalizeLocale } from './i18n'
import { NewRequestDialog } from './new-request-dialog'
import { RequestDetailView } from './request-detail'
import type { DetailActions } from './request-detail'
import { ALL_STATUSES, ListFilters, RequestTable } from './request-list'
import type { ViewData, ViewQuery } from './types'
import { Notice, Section } from './ui'

const POLL_MS = 5000
const SEARCH_DEBOUNCE_MS = 300

type NoticeState = { kind: 'info' | 'error'; text: string } | null

function App() {
  const [host, setHost] = React.useState<HostInit | null>(null)
  const [data, setData] = React.useState<ViewData | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState<NoticeState>(null)
  const [now, setNow] = React.useState(() => Date.now())
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState(ALL_STATUSES)
  const [createOpen, setCreateOpen] = React.useState(false)
  // 用 ref 保存当前查询，宿主事件回调里总能拿到最新的选中项（避免闭包拿到旧值）
  const query = React.useRef<ViewQuery>({ page: 1, pageSize: 20 })
  const loadSeq = React.useRef(0)
  const t = React.useMemo(() => createTranslator(normalizeLocale(host?.locale)), [host?.locale])
  const tRef = React.useRef(t)
  tRef.current = t

  const describeError = (error: unknown) =>
    describeCode(tRef.current, error instanceof ActionError ? error.code : error instanceof Error ? error.message : 'unknown')

  /** 读取列表 + 详情；只采用最后一次请求的结果，防止慢的旧响应覆盖新数据 */
  const load = React.useCallback(async () => {
    const seq = ++loadSeq.current
    try {
      const next = await requestData({ ...query.current })
      if (seq === loadSeq.current) setData(next)
    } catch (error) {
      if (seq === loadSeq.current) setNotice({ kind: 'error', text: describeError(error) })
    }
  }, [])
  const loadRef = React.useRef(load)
  loadRef.current = load

  React.useEffect(
    () =>
      startBridge(
        (init) => {
          setHost(init)
          if (init.initialQuery) query.current = { page: 1, pageSize: 20, ...init.initialQuery }
          void loadRef.current()
        },
        () => void loadRef.current()
      ),
    []
  )

  const detail = data?.item.detail ?? null
  const analyzing = detail?.request.status === 'analyzing'

  // 兜底：分析中时每 5 秒刷新一次（工具完成事件不一定会送达），同时每秒更新“已用时间”
  React.useEffect(() => {
    if (!analyzing) return
    const poll = setInterval(() => void loadRef.current(), POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [analyzing])

  // 搜索框输入防抖：停止输入 300ms 后再查询，并回到第 1 页
  React.useEffect(() => {
    const keyword = search.trim()
    if ((query.current.search ?? '') === keyword) return
    const timer = setTimeout(() => {
      query.current = { ...query.current, page: 1, search: keyword || undefined }
      void loadRef.current()
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const changeStatus = (value: string) => {
    setStatus(value)
    const { parameters: _old, ...rest } = query.current
    query.current = { ...rest, page: 1, ...(value === ALL_STATUSES ? {} : { parameters: { status: value } }) }
    void load()
  }

  const select = (id: string) => {
    query.current = { ...query.current, selectionId: id }
    void load()
  }

  /** 执行一个会改数据的动作：期间禁用按钮，失败显示可理解的提示，最后总是刷新 */
  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setNotice(null)
    try {
      await task()
    } catch (error) {
      setNotice({ kind: 'error', text: describeError(error) })
    } finally {
      setBusy(false)
      await load()
    }
  }

  const seedDemo = () =>
    run(async () => {
      const result = await executeAction('seed_demo_requests', {})
      setNotice({ kind: 'info', text: t('notice.seeded', { count: Number(result['inserted'] ?? 0) }) })
    })

  /** 新建：错误交给对话框自己显示在字段下，所以这里不走 run() */
  const create = async (input: Record<string, unknown>) => {
    const result = await executeAction('create_request', input)
    setNotice({ kind: 'info', text: t('notice.created', { orderNo: String(result['orderNo'] ?? '') }) })
    if (typeof result['id'] === 'string') query.current = { ...query.current, selectionId: result['id'] }
    await load()
  }

  const actions: DetailActions = {
    start: (requestId) =>
      run(async () => {
        const result = await executeAction('start_analysis', { requestId })
        if (result['created'] !== true) {
          setNotice({ kind: 'info', text: t('notice.alreadyRunning') })
          return
        }
        try {
          // 把分析指令发进对话（新会话），由智能体接手
          await invokeClientCommand(String(result['commandKey']), result['commandPayload'] as Record<string, unknown>)
          setNotice({ kind: 'info', text: t('notice.sent') })
        } catch (error) {
          const code = error instanceof ActionError ? error.code : 'command_failed'
          setNotice({ kind: 'error', text: t('notice.sendFailed', { code }) })
        }
      }),
    abandon: (requestId, jobId) =>
      run(async () => {
        await executeAction('abandon_analysis', { requestId, jobId })
        setNotice({ kind: 'info', text: t('notice.abandoned') })
      }),
    // 逐条决定不禁用整个界面（连续点几条时不打断），失败才提示
    decide: async (findingId, decision, note) => {
      try {
        await executeAction('set_finding_decision', { findingId, decision, ...(note.trim() ? { note: note.trim() } : {}) })
      } catch (error) {
        setNotice({ kind: 'error', text: describeError(error) })
      }
      await load()
    },
    confirm: (requestId, finalDate, note) =>
      run(async () => {
        await executeAction('confirm_request', { requestId, finalDate, ...(note ? { note } : {}) })
        setNotice({ kind: 'info', text: t('notice.confirmed') })
      }),
    reject: (requestId, reason) =>
      run(async () => {
        await executeAction('reject_analysis', { requestId, reason })
        setNotice({ kind: 'info', text: t('notice.rejected') })
      }),
    remove: (requestId) =>
      run(async () => {
        await executeAction('delete_draft', { requestId })
        const { selectionId: _removed, ...rest } = query.current
        query.current = rest
        setNotice({ kind: 'info', text: t('notice.deleted') })
      })
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col gap-3 bg-background p-4 text-foreground">
        {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : <p className="text-sm text-muted-foreground">{t('app.loading')}</p>}
        {notice && (
          <div>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              {t('app.refresh')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  const list = data.item.list
  const filtered = Boolean(query.current.search) || status !== ALL_STATUSES

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* 顶部工具条 */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold">{t('app.title')}</h1>
          <Badge variant="outline">{t('app.mockBadge')}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>
            <RefreshCw />
            {t('app.refresh')}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void seedDemo()}>
            {t('app.loadDemo')}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => setCreateOpen(true)}>
            <Plus />
            {t('app.newRequest')}
          </Button>
        </div>
      </header>

      {notice && (
        <div className="px-4 pt-3">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      {/* 主工作区：宽屏左右两栏，窄屏上下堆叠 */}
      <main className="grid flex-1 gap-6 p-4 min-[860px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Section label={t('list.title')} title={`${t('list.title')} · ${list.total}`}>
          <ListFilters t={t} search={search} status={status} onSearch={setSearch} onStatus={changeStatus} />
          {list.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{filtered ? t('list.noMatch') : t('list.empty')}</p>
          ) : (
            <RequestTable items={list.items} selectedId={detail?.request.id} onSelect={select} t={t} />
          )}
        </Section>
        <div className="min-w-0">
          {detail ? (
            <RequestDetailView detail={detail} t={t} busy={busy} now={now} actions={actions} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('detail.empty')}</p>
          )}
        </div>
      </main>

      <NewRequestDialog open={createOpen} onOpenChange={setCreateOpen} options={data.item.form} t={t} onSubmit={create} />
    </div>
  )
}

const container = document.getElementById('root') ?? document.body.appendChild(document.createElement('div'))
createRoot(container).render(<App />)
