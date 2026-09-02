import * as React from 'react'
import { Badge, Button, ChevronRight, RotateCcw, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../ui/index'
import type { EChartsCoreOption } from 'echarts/core'
import { createRoot } from 'react-dom/client'
import { resolveLocale, type SupportedLocale } from '../../factory-operations-center/src/i18n'
import { invokeClientCommand, isObject, notify, reportResize, requestData, requireSuccess, startBridge, unwrap } from '../../factory-operations-center/src/runtime'
import type { ExecutionRecord, FactoryCase, FactoryDashboardData, HostContext, RemoteObject, RemoteValue } from '../../factory-operations-center/src/types'
import { installShadcnThemeVars } from '../../factory-operations-center/src/theme'
import { EChart } from './echart'
import './styles.css'

const h: typeof React.createElement = React.createElement
const WORKBENCH_NAVIGATION_OPEN_COMMAND = 'workbench.navigation.open'
const WORKBENCH_ASSISTANT_CONVERSATION_TARGET = 'assistant.conversation'
const WORKBENCH_VIEW_TARGET = 'workbench.view'
const OPERATIONS_VIEW_KEY = 'factory-operations-center'
const { useCallback, useEffect, useMemo, useState } = React

installShadcnThemeVars({ density: 'compact' })

const TEXT = {
  'en-US': {
    title: 'Factory Operations Management', subtitle: 'Organization-level recovery throughput, blockers and exact Assistant execution health',
    simulation: 'SIMULATION', external: 'EXTERNAL', refresh: 'Refresh', trend: 'Seven-day recovery throughput', trendHelp: 'Persisted cases opened, recovered, and failed Assistant executions.',
    bottleneck: 'Lane bottlenecks', bottleneckHelp: 'Ready, active and blocked work by accountable Assistant lane.', cases: 'Factory Cases',
    executions: 'Recent Assistant executions', executionHelp: 'Open the exact conversation, thread and run when a handle is available.', case: 'Case', asset: 'Asset / line',
    status: 'Status', stage: 'Current stage', progress: 'Progress', recovery: 'Recovery', task: 'Task / Assistant', attempt: 'Attempt',
    summary: 'Safe summary', started: 'Started', open: 'Open', noData: 'No records', loading: 'Loading management dashboard…',
    requestFailed: 'Management dashboard request failed.', refreshed: 'Refreshed', truncated: 'Authorized results are capped for dashboard responsiveness.',
    minutes: 'min', simulationNotice: 'Simulation metrics do not represent live PLC or production-system control.'
  },
  'zh-Hans': {
    title: '工厂运营管理监控 Dashboard', subtitle: '组织级恢复吞吐、瓶颈与精确 Assistant 执行健康度',
    simulation: '仿真模式', external: '外部系统模式', refresh: '刷新', trend: '七日恢复吞吐趋势', trendHelp: '按持久化数据统计事件创建、恢复和 Assistant 失败执行。',
    bottleneck: '泳道瓶颈', bottleneckHelp: '按责任 Assistant 泳道统计可执行、进行中和受阻工作。', cases: 'Factory Case',
    executions: '近期 Assistant 执行', executionHelp: '存在句柄时精确打开对应会话、线程和运行。', case: '事件', asset: '设备 / 产线',
    status: '状态', stage: '当前阶段', progress: '进度', recovery: '恢复用时', task: '任务 / Assistant', attempt: '尝试',
    summary: '安全摘要', started: '开始时间', open: '打开', noData: '暂无记录', loading: '正在加载管理监控面板…',
    requestFailed: '管理监控请求失败。', refreshed: '刷新时间', truncated: '为保证面板响应速度，已截取授权范围内的结果。',
    minutes: '分钟', simulationNotice: '仿真指标不代表已控制真实 PLC 或生产系统。'
  }
} as const

function App() {
  const [context, setContext] = useState<HostContext | null>(null)
  const [data, setData] = useState<FactoryDashboardData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locale = resolveLocale(context?.locale)
  const t = locale === 'en-US' ? TEXT['en-US'] : TEXT['zh-Hans']

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true)
    setError(null)
    try { setData(parseDashboard(unwrap(await requestData({})))) }
    catch (reason) { setError(reason instanceof Error ? reason.message : t.requestFailed) }
    finally { if (!silent) setBusy(false) }
  }, [t.requestFailed])

  useEffect(() => startBridge((next) => { document.documentElement.lang = resolveLocale(next.locale); setContext(next) }, () => void load(true)), [load])
  useEffect(() => { if (context) void load() }, [context, load])
  useEffect(() => {
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => setTimeout(reportResize, 0))
    const root = document.getElementById('root'); if (root) observer?.observe(root)
    return () => observer?.disconnect()
  }, [])

  async function navigate(payload: RemoteObject) {
    setBusy(true)
    try { requireSuccess(await invokeClientCommand(WORKBENCH_NAVIGATION_OPEN_COMMAND, payload)) }
    catch (reason) { const message = reason instanceof Error ? reason.message : t.requestFailed; setError(message); notify('error', message) }
    finally { setBusy(false) }
  }
  function openCase(item: FactoryCase) {
    return navigate({ target: WORKBENCH_VIEW_TARGET, viewKey: OPERATIONS_VIEW_KEY, selectionId: item.id, parameters: { caseId: item.id } })
  }
  function openExecution(record: ExecutionRecord) {
    if (!record.conversationId) return Promise.resolve()
    return navigate({ target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET, conversationId: record.conversationId,
      ...(record.threadId ? { threadId: record.threadId } : {}), ...(record.executionId ? { executionId: record.executionId } : {}),
      ...(record.executorXpertId ? { xpertId: record.executorXpertId } : {}) })
  }

  const trendOption = useMemo(() => data ? buildTrendOption(data, locale) : {}, [data, locale])
  const bottleneckOption = useMemo(() => data ? buildBottleneckOption(data, locale) : {}, [data, locale])
  if (!context || !data) return <main className="fod-shell fod-loading"><span className="fod-spinner" />{t.loading}</main>

  return <main className="fod-shell">
    <header className="fod-header"><div><p>FACTORY OPS / MANAGEMENT</p><h1>{t.title}</h1><span>{t.subtitle}</span></div><div className="fod-actions"><Badge variant={data.simulation ? 'secondary' : 'outline'}><i className={data.simulation ? 'is-simulation' : 'is-live'} />{data.simulation ? t.simulation : t.external}</Badge><Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}><RotateCcw aria-hidden="true" />{t.refresh}</Button></div></header>
    {error && <div className="fod-error" role="alert">{error}</div>}
    <section className="fod-kpis" aria-label="KPI">{data.kpis.map((item) => <Metric key={item.key} label={item.label} value={formatKpi(item.value, item.unit)} tone={item.status} definition={item.definition} />)}</section>
    <section className="fod-chart-layout">
      <article className="fod-section fod-trend"><SectionTitle title={t.trend} help={t.trendHelp} /><EChart option={trendOption} ariaLabel={t.trend} /></article>
      <article className="fod-section fod-bottleneck"><SectionTitle title={t.bottleneck} help={t.bottleneckHelp} /><EChart option={bottleneckOption} ariaLabel={t.bottleneck} /></article>
    </section>
    <section className="fod-layout">
      <div className="fod-section"><SectionTitle title={t.cases} />
        <div className="fod-table-wrap"><Table><TableHeader><TableRow><TableHead>{t.case}</TableHead><TableHead>{t.asset}</TableHead><TableHead>{t.status}</TableHead><TableHead>{t.stage}</TableHead><TableHead>{t.progress}</TableHead><TableHead>{t.recovery}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
          {data.cases.length === 0 ? <TableRow><TableCell colSpan={7}>{t.noData}</TableCell></TableRow> : data.cases.map((item) => <TableRow key={item.id}><TableCell><strong>{item.caseKey}</strong><small>{item.event.title}</small></TableCell><TableCell>{item.event.deviceName} / {item.event.lineId}</TableCell><TableCell><Badge variant="outline">{statusLabel(item.status, locale)}</Badge></TableCell><TableCell>{item.currentStage}</TableCell><TableCell>{item.progress.percent}%</TableCell><TableCell>{item.metrics.recoveryMinutes == null ? '—' : `${item.metrics.recoveryMinutes} ${t.minutes}`}</TableCell><TableCell><Button variant="ghost" size="sm" onClick={() => void openCase(item)}>{t.open}<ChevronRight aria-hidden="true" /></Button></TableCell></TableRow>)}
        </TableBody></Table></div>
      </div>
      <div className="fod-section"><SectionTitle title={t.executions} help={t.executionHelp} />
        <div className="fod-table-wrap"><Table><TableHeader><TableRow><TableHead>{t.task}</TableHead><TableHead>{t.attempt}</TableHead><TableHead>{t.status}</TableHead><TableHead>{t.summary}</TableHead><TableHead>{t.started}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
          {data.recentExecutions.length === 0 ? <TableRow><TableCell colSpan={6}>{t.noData}</TableCell></TableRow> : data.recentExecutions.map((record) => <TableRow key={record.recordId}><TableCell><strong>{record.nodeKey}</strong><small>{record.roleLabel}</small></TableCell><TableCell>#{record.attemptNumber}</TableCell><TableCell><span className={`fod-execution is-${record.status}`}><i />{executionLabel(record.status, locale)}</span></TableCell><TableCell>{record.safeSummary}</TableCell><TableCell>{formatTime(record.startedAt, locale)}</TableCell><TableCell><Button variant="ghost" size="sm" disabled={!record.conversationId} onClick={() => void openExecution(record)}>{t.open}<ChevronRight aria-hidden="true" /></Button></TableCell></TableRow>)}
        </TableBody></Table></div>
      </div>
    </section>
    <footer className="fod-footer"><span>{t.refreshed}: {formatTime(data.refreshedAt, locale)} · revision {data.revision}</span>{data.truncated && <span>{t.truncated}</span>}<span>{t.simulationNotice}</span></footer>
    {busy && <div className="fod-busy"><span className="fod-spinner" />{t.refresh}</div>}
  </main>
}

function Metric({ label, value, tone, definition }: { label: string; value: string; tone: string; definition: string }) { return <article className={`fod-metric is-${tone}`} title={definition}><span>{label}</span><strong>{value}</strong><small>{definition}</small></article> }
function SectionTitle({ title, help }: { title: string; help?: string }) { return <header className="fod-section-title"><div><h2>{title}</h2>{help && <p>{help}</p>}</div></header> }
function parseDashboard(value: RemoteValue): FactoryDashboardData {
  if (!isObject(value) || !isObject(value.summary) || !Array.isArray(value.kpis) || !Array.isArray(value.series) || !Array.isArray(value.cases) || !Array.isArray(value.recentExecutions)) throw new Error('Factory dashboard returned an invalid data contract.')
  return value as unknown as FactoryDashboardData
}
function chartRows(data: FactoryDashboardData, key: string) { return data.series.find((item) => item.key === key)?.rows ?? [] }
function buildTrendOption(data: FactoryDashboardData, locale: SupportedLocale): EChartsCoreOption {
  const rows = chartRows(data, 'recovery-throughput-trend'); const zh = locale !== 'en-US'
  return { backgroundColor: 'transparent', aria: { enabled: true }, tooltip: { trigger: 'axis' }, legend: { bottom: 0 }, grid: { left: 42, right: 18, top: 24, bottom: 46 }, dataset: { source: rows }, xAxis: { type: 'category' }, yAxis: { type: 'value', minInterval: 1 }, series: [
    { type: 'line', name: zh ? '创建' : 'Opened', encode: { x: 'date', y: 'opened' }, smooth: true, symbolSize: 6 },
    { type: 'line', name: zh ? '恢复' : 'Recovered', encode: { x: 'date', y: 'recovered' }, smooth: true, symbolSize: 6 },
    { type: 'bar', name: zh ? '失败执行' : 'Failed executions', encode: { x: 'date', y: 'failedExecutions' }, barMaxWidth: 18 }
  ] }
}
function buildBottleneckOption(data: FactoryDashboardData, locale: SupportedLocale): EChartsCoreOption {
  const rows = chartRows(data, 'lane-bottlenecks'); const zh = locale !== 'en-US'
  return { backgroundColor: 'transparent', aria: { enabled: true }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, legend: { bottom: 0 }, grid: { left: 116, right: 18, top: 18, bottom: 46 }, dataset: { source: rows }, xAxis: { type: 'value', minInterval: 1 }, yAxis: { type: 'category' }, series: [
    { type: 'bar', stack: 'work', name: zh ? '可执行' : 'Ready', encode: { x: 'ready', y: 'lane' } },
    { type: 'bar', stack: 'work', name: zh ? '进行中' : 'Active', encode: { x: 'active', y: 'lane' } },
    { type: 'bar', stack: 'work', name: zh ? '受阻' : 'Blocked', encode: { x: 'blocked', y: 'lane' } }
  ] }
}
function formatKpi(value: number | null, unit: string | null) { if (value == null) return '—'; const formatted = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value); return unit === 'CNY' ? `¥${formatted}` : unit ? `${formatted} ${unit}` : formatted }
function formatTime(value: string, locale: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date) }
function statusLabel(status: FactoryCase['status'], locale: SupportedLocale) { const labels: Record<FactoryCase['status'], [string, string]> = { investigating: ['Investigating', '研判中'], planning: ['Planning', '规划中'], awaiting_approval: ['Awaiting approval', '等待审批'], approved: ['Approved', '已批准'], executing: ['Executing', '执行中'], verifying: ['Verifying', '验证中'], recovered: ['Recovered', '已恢复'], escalated: ['Escalated', '已升级'], rejected: ['Rejected', '已拒绝'] }; return locale === 'en-US' ? labels[status][0] : labels[status][1] }
function executionLabel(status: ExecutionRecord['status'], locale: SupportedLocale) { const labels: Record<ExecutionRecord['status'], [string, string]> = { queued: ['Queued', '排队中'], running: ['Running', '执行中'], succeeded: ['Succeeded', '成功'], failed: ['Failed', '失败'], interrupted: ['Interrupted', '已中断'], cancelled: ['Cancelled', '已取消'], superseded: ['Superseded', '已替代'] }; return locale === 'en-US' ? labels[status][0] : labels[status][1] }

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Factory dashboard root element is missing.')
createRoot(rootElement).render(<App />)
