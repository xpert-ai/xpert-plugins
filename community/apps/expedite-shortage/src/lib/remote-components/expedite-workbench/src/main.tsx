/**
 * 工作台界面（阶段 4 最小版）：请求列表 + 载入演示请求 + AI 分析按钮 + 结论展示。
 * 目的是尽早打通“按钮 → 对话 → 工具 → 数据 → 界面刷新”整条链；
 * 逐条采纳/驳回、确认框、新建表单在阶段 5 补齐，并换成 shadcn 组件。
 *
 * 界面状态全部放在 React state / ref 里，不使用浏览器的 Web 存储（iframe 是沙箱，访问会抛 SecurityError）。
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { ActionError, executeAction, invokeClientCommand, requestData, startBridge } from './bridge'
import type { HostInit } from './bridge'
import { createTranslator, hasKey, normalizeLocale } from './i18n'
import type { Translate } from './i18n'
import type { RequestDetail, RequestDto, ViewData, ViewQuery } from './types'

const POLL_MS = 5000

function App() {
  const [host, setHost] = React.useState<HostInit | null>(null)
  const [data, setData] = React.useState<ViewData | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const [now, setNow] = React.useState(() => Date.now())
  // 用 ref 保存当前查询，宿主事件回调里总能拿到最新的选中项（避免闭包拿到旧值）
  const query = React.useRef<ViewQuery>({ page: 1, pageSize: 20 })
  const loadSeq = React.useRef(0)
  const t = React.useMemo(() => createTranslator(normalizeLocale(host?.locale)), [host?.locale])

  const load = React.useCallback(async () => {
    const seq = ++loadSeq.current
    try {
      const next = await requestData({ ...query.current })
      if (seq === loadSeq.current) setData(next)
    } catch (error) {
      if (seq === loadSeq.current) setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'request_failed' })
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

  // 兜底：分析中时每 5 秒刷新一次（以防工具完成事件没有送达）
  React.useEffect(() => {
    if (!analyzing) return
    const poll = setInterval(() => void loadRef.current(), POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [analyzing])

  const select = (id: string) => {
    query.current = { ...query.current, selectionId: id }
    void load()
  }

  const describeError = (error: unknown) => {
    const code = error instanceof ActionError ? error.code : error instanceof Error ? error.message : 'unknown'
    const key = `error.${code}`
    return hasKey(key) ? t(key) : t('error.generic', { code })
  }

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

  const startAnalysis = (requestId: string) =>
    run(async () => {
      const result = await executeAction('start_analysis', { requestId })
      if (result['created'] !== true) {
        setNotice({ kind: 'info', text: t('notice.alreadyRunning') })
        return
      }
      try {
        // 把分析指令发进当前对话，由智能体接手
        await invokeClientCommand(String(result['commandKey']), result['commandPayload'] as Record<string, unknown>)
        setNotice({ kind: 'info', text: t('notice.sent') })
      } catch (error) {
        const code = error instanceof ActionError ? error.code : 'command_failed'
        setNotice({ kind: 'error', text: t('notice.sendFailed', { code }) })
      }
    })

  if (!data) return <div className="es-app es-loading">{t('app.loading')}</div>

  return (
    <div className="es-app">
      <header className="es-toolbar">
        <div className="es-title">
          <h1>{t('app.title')}</h1>
          <span className="es-badge">{t('app.mockBadge')}</span>
        </div>
        <div className="es-actions">
          <button type="button" onClick={() => void load()} disabled={busy}>
            {t('app.refresh')}
          </button>
          <button type="button" className="es-primary" onClick={() => void seedDemo()} disabled={busy}>
            {t('app.loadDemo')}
          </button>
        </div>
      </header>
      {notice && <div className={`es-notice es-notice-${notice.kind}`} role="status">{notice.text}</div>}
      <main className="es-body">
        <section className="es-list" aria-label={t('list.title')}>
          <div className="es-section-head">
            <h2>{t('list.title')}</h2>
            <span>{data.item.list.total}</span>
          </div>
          <hr />
          {data.item.list.items.length === 0 ? (
            <p className="es-empty">{t('list.empty')}</p>
          ) : (
            <RequestTable items={data.item.list.items} selectedId={detail?.request.id} onSelect={select} t={t} />
          )}
        </section>
        <section className="es-detail" aria-label={detail?.request.orderNo ?? t('detail.empty')}>
          {detail ? (
            <Detail detail={detail} t={t} busy={busy} now={now} onStart={startAnalysis} describeError={describeError} />
          ) : (
            <p className="es-empty">{t('detail.empty')}</p>
          )}
        </section>
      </main>
    </div>
  )
}

function RequestTable(props: { items: RequestDto[]; selectedId: string | undefined; onSelect: (id: string) => void; t: Translate }) {
  const { items, selectedId, onSelect, t } = props
  return (
    <table className="es-table">
      <thead>
        <tr>
          <th>{t('list.orderNo')}</th>
          <th>{t('list.customer')}</th>
          <th>{t('list.product')}</th>
          <th>{t('list.dates')}</th>
          <th>{t('list.status')}</th>
          <th className="es-num">{t('list.shortages')}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className={item.id === selectedId ? 'es-selected' : undefined}>
            <td>
              <button type="button" className="es-link" onClick={() => onSelect(item.id)}>
                {item.orderNo}
              </button>
            </td>
            <td>{item.customerName}</td>
            <td>
              {item.productName} × {item.quantity}
            </td>
            <td>
              {item.targetDate}（{item.originalDueDate}）
            </td>
            <td>
              <StatusBadge status={item.status} t={t} />
            </td>
            <td className="es-num">{item.shortageCount ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StatusBadge({ status, t }: { status: RequestDto['status']; t: Translate }) {
  return <span className={`es-status es-status-${status}`}>{t(`status.${status}`)}</span>
}

function Detail(props: {
  detail: RequestDetail
  t: Translate
  busy: boolean
  now: number
  onStart: (requestId: string) => Promise<void>
  describeError: (error: unknown) => string
}) {
  const { detail, t, busy, now, onStart } = props
  const { request, currentJob, findings } = detail
  const startLabel =
    request.status === 'failed' ? t('detail.retry') : request.status === 'rejected' ? t('detail.reanalyse') : t('detail.startAnalysis')
  const canStart = ['draft', 'failed', 'rejected'].includes(request.status)
  // 已用时间按服务器时间校正，避免本机时钟偏差
  const skew = Date.parse(detail.serverTime) - Date.now()
  const elapsedMs = currentJob?.createdAt ? Math.max(0, now + skew - Date.parse(currentJob.createdAt)) : 0
  const failedReason = currentJob?.errorCode ? (hasKey(`error.${currentJob.errorCode}`) ? t(`error.${currentJob.errorCode}` as 'error.OTHER') : currentJob.errorCode) : ''

  return (
    <div className="es-detail-body">
      <div className="es-section-head">
        <div>
          <h2>
            {request.orderNo} · {request.customerName} · {request.productName} × {request.quantity}
          </h2>
          <p className="es-muted">
            {t('list.dates')}：{request.targetDate}（{request.originalDueDate}）
            {currentJob ? ` · ${t('detail.attempt', { seq: currentJob.seq })}` : ''}
          </p>
        </div>
        <div className="es-actions">
          <StatusBadge status={request.status} t={t} />
          {canStart && (
            <button type="button" className="es-primary" disabled={busy} onClick={() => void onStart(request.id)}>
              {startLabel}
            </button>
          )}
        </div>
      </div>
      <hr />
      {request.status === 'analyzing' && <div className="es-notice es-notice-info">{t('detail.analyzing', { elapsed: formatElapsed(elapsedMs) })}</div>}
      {request.status === 'failed' && <div className="es-notice es-notice-error">{t('detail.failed', { reason: failedReason })}</div>}
      {request.status === 'rejected' && request.rejectReason && <p className="es-muted">{t('detail.rejectReason', { reason: request.rejectReason })}</p>}
      {request.status === 'confirmed' && request.finalDate && <p className="es-muted">{t('detail.finalDate', { date: request.finalDate })}</p>}

      {currentJob?.status === 'succeeded' && (
        <>
          <div className="es-summary">
            <strong>
              {t('detail.summary')}：{currentJob.feasibility ? t(`feasibility.${currentJob.feasibility}`) : ''}
              {currentJob.recommendedDate ? ` · ${t('detail.recommendedDate', { date: currentJob.recommendedDate })}` : ''}
            </strong>
            <p>{currentJob.summary}</p>
          </div>
          <h3>{t('detail.findings', { count: findings.length })}</h3>
          {findings.length === 0 ? (
            <p className="es-muted">{t('detail.noShortage')}</p>
          ) : (
            <table className="es-table">
              <thead>
                <tr>
                  <th>{t('detail.material')}</th>
                  <th className="es-num">{t('detail.required')}</th>
                  <th className="es-num">{t('detail.available')}</th>
                  <th className="es-num">{t('detail.shortage')}</th>
                  <th>{t('detail.suggestion')}</th>
                  <th>{t('detail.rationale')}</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((finding) => (
                  <tr key={finding.id}>
                    <td>
                      {finding.materialCode} {finding.materialName}
                    </td>
                    <td className="es-num">{finding.requiredQty}</td>
                    <td className="es-num">{finding.availableQty}</td>
                    <td className="es-num">{finding.shortageQty}</td>
                    <td>
                      {t(`suggestion.${finding.suggestionType}`)}
                      {finding.substituteCode ? ` ${finding.substituteCode}` : ''}
                      {finding.suggestedDate ? ` ${finding.suggestedDate}` : ''}
                    </td>
                    <td>{finding.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <details className="es-raw">
        <summary>{t('detail.rawData')}</summary>
        <pre>{JSON.stringify({ currentJob, findings, jobs: detail.jobs, logs: detail.logs }, null, 2)}</pre>
      </details>
    </div>
  )
}

function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const container = document.getElementById('root') ?? document.body.appendChild(document.createElement('div'))
createRoot(container).render(<App />)
