import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Button,
  Badge,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { init as chartInit, use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { NodeBook } from './node-book'
import { i18n, tr } from './i18n'
import type { DeskKey } from '../src/node-workbench'
import type { Init } from './bridge'
import { mount, act, navigate, query } from './bridge'
import { views, variants, type Variant } from '../src/process'
import type { ActionInput, WorkbenchData } from '../src/projection'
import type { Plan } from '../src/sample'
import './styles.css'
use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])
type Counts = WorkbenchData['counts']
const statuses = ['active', 'waiting', 'complete', 'rejected'] as const
function Chart({ counts }: { counts: Counts }) {
  const el = useRef<HTMLDivElement>(null),
    locale = useRemoteLocale(i18n)
  useEffect(() => {
    if (!el.current) return
    const chart = chartInit(el.current)
    chart.setOption({
      aria: { enabled: true },
      grid: { left: 40, right: 20, top: 15, bottom: 32 },
      xAxis: { type: 'category', data: statuses.map((s) => tr(s)) },
      yAxis: { type: 'value', minInterval: 1 },
      tooltip: {},
      series: [
        {
          type: 'bar',
          barMaxWidth: 45,
          itemStyle: { color: '#277b72' },
          data: statuses.map((s) => counts[s]),
        },
      ],
    })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(el.current)
    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [counts, locale])
  return (
    <div ref={el} className="chart" aria-label={statuses.map((s) => tr(s) + ' ' + counts[s]).join(', ')} />
  )
}
function App() {
  const [data, setData] = useState<WorkbenchData>(),
    [variant, setVariant] = useState<Variant>('shortage'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState<DeskKey>(),
    [landingError, setLandingError] = useState<'noDesk' | 'unavailableHistory'>(),
    [initialReceipt, setInitialReceipt] = useState<string>(),
    [reason, setReason] = useState(''),
    [plan, setPlan] = useState<Plan>()
  const focus = useRef<NonNullable<Init['initialQuery']>['parameters']>(),
    selected = useRef<string>(),
    requestedRound = useRef<string>(),
    sequence = useRef(0),
    initial = useRef<string>(),
    lock = useRef(false)
  useRemoteLocale(i18n)
  async function load(id = selected.current) {
    if (id !== selected.current) {
      selected.current = id
      setData(undefined)
    }
    const n = ++sequence.current
    try {
      const d = await query(id, requestedRound.current)
      if (n === sequence.current) {
        const f = focus.current
        const pages = d.desks?.pages
        if (pages && f) {
          const matching =
            (!f.pipelineInstanceId || f.pipelineInstanceId === d.instanceId) &&
            (!f.pipelineRoundId || f.pipelineRoundId === d.desks?.roundId)
          const page =
            matching &&
            pages.find((n) =>
              f.pipelineNodeId
                ? n.id === f.pipelineNodeId || n.receipts.some((r) => r.id === f.pipelineNodeId)
                : n.key === f.nodeKey,
            )
          if (page) {
            setOpened(page.key)
            setInitialReceipt(page.receipts.find((r) => r.id && r.id === f.pipelineNodeId)?.key)
          } else if (f.pipelineNodeId || f.nodeKey || !matching)
            setLandingError(matching ? 'noDesk' : 'unavailableHistory')
          focus.current = undefined
        } else setError('')
        if (d.desks && d.selected) {
          const primary =
            d.selected.steps.find((s) => s.state === 'current')?.key ??
            (d.selected.status === 'rejected' ? 'returned' : 'complete')
          setOpened((previous) => previous ?? primary)
        }
        setData(d)
        selected.current = d.selected?.id
      }
    } catch (e) {
      if (n === sequence.current) setError(String(e))
    }
  }
  useEffect(
    () =>
      mount((m) => {
        i18n.setLocale(m.locale)
        const k = JSON.stringify(m.initialQuery ?? {})
        if (initial.current !== k) {
          initial.current = k
          focus.current = m.initialQuery?.parameters
          requestedRound.current = m.initialQuery?.parameters?.pipelineRoundId
          setData(undefined)
          setLandingError(undefined)
          setInitialReceipt(undefined)
          setReason('')
          setPlan(undefined)
          setOpened(undefined)
          void load(m.initialQuery?.selectionId)
        }
      }),
    [],
  )
  const order = data?.selected
  const endKey = order?.status === 'rejected' ? 'returned' : 'complete'
  const finished =
    (order?.status === 'complete' || order?.status === 'rejected') &&
    (data?.surface === 'dashboard' ||
      data?.desks?.pages.find((p) => p.key === endKey)?.nativeState === 'done')
  useEffect(() => {
    if (!data?.instanceId || data.desks?.historical || finished || landingError) return
    const timer = setInterval(() => void load(), 4000)
    return () => clearInterval(timer)
  }, [data?.instanceId, data?.desks?.historical, finished, landingError])
  function openNode(key: DeskKey) {
    const target = data?.desks?.pages.find((page) => page.key === key)
    if (target?.id && data?.projectId && data.instanceId && data.desks?.roundId) {
      nav({
        target: 'project.application',
        projectId: data.projectId,
        pipelineInstanceId: data.instanceId,
        pipelineRoundId: data.desks.roundId,
        pipelineNodeId: target.id,
      })
      return
    }
    setReason('')
    setPlan(undefined)
    setInitialReceipt(undefined)
    setOpened(key)
  }
  function nav(payload: Parameters<typeof navigate>[0]) {
    void navigate(payload).catch((e) => setError(String(e)))
  }
  async function action(key: string, input: Partial<ActionInput> = {}) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const id = await act(key, {
        caseId: key === 'create' ? undefined : order?.id,
        operation: crypto.randomUUID(),
        ...input,
      })
      setReason('')
      setPlan(undefined)
      setOpened(undefined)
      requestedRound.current = undefined
      await load(id)
      if (data?.surface === 'dashboard')
        await navigate({
          target: 'workbench.view',
          viewKey: 'ev_motor_views__' + views.workspace,
          selectionId: id,
        })
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
      lock.current = false
    }
  }
  const current = order?.steps.find((s) => s.state === 'current')
  const book = data?.desks
  const page =
    book?.pages.find((n) => n.key === opened) ??
    book?.pages.find(
      (n) => n.key === (current?.key ?? (order?.status === 'rejected' ? 'returned' : 'complete')),
    ) ??
    book?.pages[0]
  const detail = order?.steps.find((s) => s.key === page?.key)
  const native = (nodeId?: string) =>
    data?.projectId &&
    data.instanceId &&
    nav({
      target: 'assistant.project',
      projectId: data.projectId,
      viewKey: 'platform.project-tasks__timeline',
      parameters: {
        initialTab: 'pipeline',
        pipelineInstanceId: data.instanceId,
        ...(book?.roundId ? { pipelineRoundId: book.roundId } : {}),
        ...(nodeId ? { pipelineNodeId: nodeId } : {}),
      },
    })
  const history = detail?.event,
    attempts =
      data?.attempts?.filter((w) => w.node === detail?.key && w.executionId !== history?.executionId) ?? []
  const createButtons = data?.canCreate && (
    <>
      <Select value={variant} onValueChange={(v) => setVariant(v as Variant)}>
        <SelectTrigger aria-label={tr('scenario')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {variants.map((v) => (
            <SelectItem key={v} value={v}>
              {tr(v)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button disabled={busy} onClick={() => void action('create', { mode: 'rehearsal', variant })}>
        {tr('create')}
      </Button>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => void action('create', { mode: 'pipeline', variant })}
      >
        {tr('createPipeline')}
      </Button>
    </>
  )
  return (
    <main className="page">
      <header className="head">
        <div>
          <small>XpertAI · EM-160</small>
          <h1>{tr(data?.surface === 'dashboard' ? 'portfolio' : 'workspace')}</h1>
        </div>
        <div className="controls">
          {(data?.surface === 'dashboard' || !order) && createButtons}
          <Button variant="outline" onClick={() => void load()}>
            {tr('refresh')}
          </Button>
        </div>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data ? (
        <p>{tr('loading')}</p>
      ) : data.surface === 'dashboard' ? (
        <>
          <h2>{tr('orders')}</h2>
          <Chart counts={data.counts} />
          {data.orders.map((o) => (
            <div className="caseLine" key={o.id}>
              <strong>{o.code}</strong>
              <Badge variant="secondary">{tr(o.status as keyof Counts)}</Badge>
              <Button
                variant="outline"
                onClick={() =>
                  nav({
                    target: 'workbench.view',
                    viewKey: 'ev_motor_views__' + views.workspace,
                    selectionId: o.id,
                  })
                }
              >
                {tr('open')}
              </Button>
            </div>
          ))}
          {!data.orders.length && <p>{tr('empty')}</p>}
        </>
      ) : landingError ? (
        <section>
          <p role="alert">{tr(landingError)}</p>
          <Button onClick={() => {
            requestedRound.current = undefined
            setLandingError(undefined)
            setOpened(undefined)
            void load()
          }}>{tr('latestOrder')}</Button>
        </section>
      ) : book?.historical && order && page ? (
        <>
          <h2>{order.code}</h2>
          <p>{tr('historicalRound')} {book.roundSequence}</p>
          <NodeBook book={book} page={page} order={order} choose={openNode} native={native} initialReceipt={initialReceipt} />
        </>
      ) : order ? (
        <>
          <div className="head panel">
            <div>
              <h2>{order.code}</h2>
              <p>
                {tr(order.mode)} · {tr('rule')} {order.rule}
                {order.parent ? ' ← ' + order.parent : ''}
              </p>
            </div>
            <div className="controls">
              {data.orders.length > 1 && (
                <Select
                  value={order.id}
                  onValueChange={(id) => {
                    requestedRound.current = undefined
                    focus.current = undefined
                    setInitialReceipt(undefined)
                    setOpened(undefined)
                    setReason('')
                    setPlan(undefined)
                    void load(id)
                  }}
                >
                  <SelectTrigger aria-label={tr('switch')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.orders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {order.mode === 'pipeline' &&
                (data.instanceId ? (
                  <Button onClick={() => native()}>{tr('project')}</Button>
                ) : (
                  data.canCreate && (
                    <Button disabled={busy} onClick={() => void action('start')}>
                      {tr('start')}
                    </Button>
                  )
                ))}
              {order.status === 'complete' && data.canCreate && (
                <Button disabled={busy} onClick={() => void action('next')}>
                  {tr('next')}
                </Button>
              )}
            </div>
          </div>
          <p className="notice">
            {current
              ? tr('current') +
                ' · ' +
                order.steps
                  .filter((s) => s.state === 'current')
                  .map((s) => s.title + ' · ' + s.role)
                  .join(' / ')
              : tr(order.status)}
            {order.mode === 'rehearsal' ? ' · ' + tr('roleplay') : ''}
          </p>
          {order.variant && (
            <p>
              {[
                tr(order.variant),
                order.materialRoute &&
                  tr(order.materialRoute === 'stocked' ? 'route_stocked' : 'route_shortage'),
                order.traceRoute && tr(order.traceRoute === 'matched' ? 'route_matched' : 'route_lookup'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {book && page && (
            <NodeBook
              initialReceipt={initialReceipt}
              book={book}
              page={page}
              order={order}
              choose={openNode}
              native={native}
            >
              {!!history?.executionId && (
                <Button
                  variant="outline"
                  onClick={() =>
                    nav({
                      target: 'assistant.conversation',
                      conversationId: history.conversationId,
                      executionId: history.executionId,
                      xpertId: history.assistantId,
                    })
                  }
                >
                  {tr('execution')}
                </Button>
              )}
              {attempts.map((attempt) => (
                <Button
                  key={attempt.executionId}
                  variant="outline"
                  onClick={() =>
                    nav({
                      target: 'assistant.execution',
                      executionId: attempt.executionId,
                      conversationId: attempt.conversationId,
                      xpertId: attempt.assistantId,
                    })
                  }
                >
                  {tr('execution')}
                </Button>
              ))}
              {detail?.key === 'publish' && data?.evolution && (
                <Button
                  variant="outline"
                  onClick={() =>
                    nav({
                      target: 'agent-evolution.change',
                      targetId: 'ev_motor.contract_requirement',
                      changeId: data.evolution!.changeId,
                    })
                  }
                >
                  {tr('evolution')} {data.evolution.version}
                </Button>
              )}
              {detail?.key === 'publish' &&
                detail.state === 'current' &&
                data?.canCreate &&
                order?.mode === 'pipeline' &&
                order.rule === 'R1' &&
                !data.evolution?.version && (
                  <>
                    <label>
                      {tr('reason')}
                      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                    </label>
                    <Button
                      disabled={busy || !reason.trim()}
                      onClick={() => void action('evolve', { reason })}
                    >
                      {tr('publishRule')}
                    </Button>
                  </>
                )}
              {detail?.state === 'queued' && <p>{tr('prerequisite')}</p>}
              {detail?.state === 'current' &&
                data?.canCreate &&
                order?.mode === 'rehearsal' &&
                (detail.kind === 'assistant' ? (
                  <Button disabled={busy} onClick={() => void action('run', { node: detail.key })}>
                    {tr('run')}
                  </Button>
                ) : (
                  <>
                    {detail.key === 'commit' && (
                      <Select value={plan ?? ''} onValueChange={(v) => setPlan(v as Plan)}>
                        <SelectTrigger aria-label={tr('choose')}>
                          <SelectValue placeholder={tr('choose')} />
                        </SelectTrigger>
                        <SelectContent>
                          {order?.plans.map((p) => (
                            <SelectItem key={p.key} value={p.key}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <label>
                      {tr('reason')}
                      <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
                    </label>
                    <div className="controls">
                      <Button
                        disabled={busy || !reason.trim() || (detail.key === 'commit' && !plan)}
                        onClick={() =>
                          void action('review', {
                            node: detail.key,
                            decision: 'approve',
                            reason,
                            ...(detail.key === 'commit' ? { plan } : {}),
                          })
                        }
                      >
                        {tr('approve')}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || !reason.trim()}
                        onClick={() =>
                          void action('review', {
                            node: detail.key,
                            decision: 'reject',
                            reason,
                          })
                        }
                      >
                        {tr('reject')}
                      </Button>
                    </div>
                  </>
                ))}
              {page.key === 'complete' && order.status === 'complete' && data.canCreate && (
                <Button disabled={busy} onClick={() => void action('next')}>
                  {tr('nextAction')}
                </Button>
              )}
            </NodeBook>
          )}
        </>
      ) : (
        <p>{tr('empty')}</p>
      )}
    </main>
  )
}
createRoot(document.getElementById('root')!).render(
  <RemoteI18nProvider i18n={i18n}>
    <App />
  </RemoteI18nProvider>,
)
