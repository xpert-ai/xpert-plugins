import * as React from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Badge, Button, Check, HoverCard, HoverCardContent, HoverCardTrigger,
  Play, Progress, RotateCcw, Send,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Toggle
} from '../../../ui/index'
import { createRoot } from 'react-dom/client'
import { TEXT, resolveLocale, type SupportedLocale } from './i18n'
import {
  executeAction, invokeClientCommand, isObject, notify, reportResize,
  requestData, requireSuccess, startBridge, unwrap
} from './runtime'
import type {
  Evidence, ExecutionRecord, FactoryCase, FactoryPipelineProjection, FactoryWorkbenchData,
  HostContext, PipelineLane, PipelineNode, RemoteObject, RemoteValue
} from './types'
import { installShadcnThemeVars } from './theme'
import { ExecutionMarkers } from './execution-markers'
import { AssistantAvatar } from './assistant-avatar'
import './styles.css'

const h: typeof React.createElement = React.createElement
const WORKBENCH_NAVIGATION_OPEN_COMMAND = 'workbench.navigation.open'
const WORKBENCH_ASSISTANT_CONVERSATION_TARGET = 'assistant.conversation'
const WORKBENCH_ASSISTANT_PROJECT_TARGET = 'assistant.project'
const WORKBENCH_VIEW_TARGET = 'workbench.view'
const { useCallback, useEffect, useMemo, useRef, useState } = React

installShadcnThemeVars({ density: 'compact' })

type EdgeLine = { key: string; state: string; label: string | null; x1: number; y1: number; x2: number; y2: number }

function App() {
  const [context, setContext] = useState<HostContext | null>(null)
  const [data, setData] = useState<FactoryWorkbenchData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [chooserOpen, setChooserOpen] = useState(false)
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [selectedLaneKey, setSelectedLaneKey] = useState<string | null>(null)
  const [caseDetailsOpen, setCaseDetailsOpen] = useState(false)
  const currentRef = useRef<FactoryCase | null>(null)

  const locale = resolveLocale(context?.locale)
  const t = TEXT[locale]
  const current = data?.selectedCase ?? null
  const projection = data?.projection ?? null
  const selectedNode = projection?.nodes.find((node) => node.key === selectedNodeKey) ?? null

  useEffect(() => { currentRef.current = current }, [current])

  const load = useCallback(async (caseId?: string, nodeKey?: string, silent = false) => {
    if (!silent) setBusy('refresh')
    setError(null)
    try {
      const response = await requestData({
        page: 1,
        pageSize: 30,
        selectionId: caseId,
        parameters: { ...(caseId ? { caseId } : {}), ...(nodeKey ? { nodeKey } : {}) }
      })
      const next = parseWorkbenchData(unwrap(response))
      setData(next)
      setSelectedNodeKey(nodeKey ?? next.selectedNodeKey)
    } catch (reason) {
      setError(messageOf(reason, t.requestFailed))
    } finally {
      if (!silent) setBusy(null)
    }
  }, [t.requestFailed])

  useEffect(() => startBridge(
    (next) => {
      document.documentElement.lang = resolveLocale(next.locale)
      setContext(next)
    },
    () => void load(currentRef.current?.id, undefined, true)
  ), [load])

  useEffect(() => {
    if (context) void load(readInitial(context, 'caseId'), readInitial(context, 'nodeKey'))
  }, [context, load])

  useEffect(() => {
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => setTimeout(reportResize, 0))
    const root = document.getElementById('root')
    if (root) observer?.observe(root)
    return () => observer?.disconnect()
  }, [])

  async function runAction(actionKey: string, input: RemoteObject) {
    setBusy(actionKey)
    setError(null)
    try {
      requireSuccess(await executeAction(actionKey, current?.id ?? null, input))
      notify('success', t.actionCompleted)
      await load(current?.id, selectedNodeKey ?? undefined, true)
    } catch (reason) {
      const message = messageOf(reason, t.requestFailed)
      setError(message)
      notify('error', message)
    } finally {
      setBusy(null)
    }
  }

  async function createIncident() {
    await runAction('create_demo_incident', {
      operationId: operation('incident'),
      changeSummary: 'Loaded bounded M-07 anomaly event'
    })
  }

  async function selectCase(caseId: string) {
    const selected = data?.table.items.find((item) => item.id === caseId)
    setBusy('case-project')
    setError(null)
    try {
      requireSuccess(await invokeClientCommand(WORKBENCH_NAVIGATION_OPEN_COMMAND, {
        target: WORKBENCH_VIEW_TARGET,
        viewKey: 'factory-operations-center',
        selectionId: caseId,
        parameters: { caseId }
      }))
      if (
        selected?.workspace.status === 'ready' &&
        data?.runtimeProjectId !== selected.workspace.projectId
      ) {
        requireSuccess(await invokeClientCommand(WORKBENCH_NAVIGATION_OPEN_COMMAND, {
          target: WORKBENCH_ASSISTANT_PROJECT_TARGET,
          projectId: selected.workspace.projectId
        }))
      }
      await load(caseId, undefined, true)
    } catch (reason) {
      const message = messageOf(reason, t.requestFailed)
      setError(message)
      notify('error', message)
    } finally {
      setBusy(null)
    }
  }

  async function dispatchNode(node: PipelineNode) {
    if (!current) return
    setBusy(`dispatch:${node.key}`)
    setError(null)
    try {
      requireSuccess(await executeAction('dispatch_assistant_task', current.id, {
        caseId: current.id,
        nodeKey: node.key,
        baseRevision: current.revision,
        operationId: operation(`assistant-task:${node.key}:r${current.revision}`)
      }))
      notify('success', t.assistantSent)
      setChooserOpen(false)
      await load(current.id, undefined, true)
    } catch (reason) {
      const message = messageOf(reason, t.requestFailed)
      setError(message)
      notify('error', message)
    } finally {
      setBusy(null)
    }
  }

  function processNext() {
    if (!projection) return
    const candidates = projection.nodes.filter((node) => projection.executableNodeKeys.includes(node.key))
    if (candidates.length === 1 && candidates[0]) processCandidate(candidates[0])
    else if (candidates.length > 1) setChooserOpen(true)
  }

  function processCandidate(node: PipelineNode) {
    setChooserOpen(false)
    if (node.executionMode === 'assistant_task') void dispatchNode(node)
    else setSelectedNodeKey(node.key)
  }

  async function openNode(node: PipelineNode) {
    if (!current) return
    if (node.openMode === 'view' && node.workspaceKey) {
      setBusy(`view:${node.key}`)
      setError(null)
      try {
        requireSuccess(await invokeClientCommand(WORKBENCH_NAVIGATION_OPEN_COMMAND, {
          target: WORKBENCH_VIEW_TARGET,
          viewKey: node.workspaceKey,
          selectionId: current.id,
          parameters: { caseId: current.id, nodeKey: node.key }
        }))
        if (
          current.workspace.status === 'ready' &&
          data?.runtimeProjectId !== current.workspace.projectId
        ) {
          requireSuccess(await invokeClientCommand(WORKBENCH_NAVIGATION_OPEN_COMMAND, {
            target: WORKBENCH_ASSISTANT_PROJECT_TARGET,
            projectId: current.workspace.projectId
          }))
        }
      } catch (reason) {
        const message = messageOf(reason, t.requestFailed)
        setError(message)
        notify('error', message)
      } finally {
        setBusy(null)
      }
      return
    }
    setSelectedNodeKey(node.key)
  }

  async function openExecution(record: ExecutionRecord) {
    if (!record.conversationId) return
    setBusy(`execution:${record.recordId}`)
    setError(null)
    try {
      requireSuccess(await invokeClientCommand(WORKBENCH_NAVIGATION_OPEN_COMMAND, {
        target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
        conversationId: record.conversationId,
        ...(record.threadId ? { threadId: record.threadId } : {}),
        ...(record.executionId ? { executionId: record.executionId } : {}),
        ...(record.executorXpertId ? { xpertId: record.executorXpertId } : {})
      }))
    } catch (reason) {
      const message = messageOf(reason, t.requestFailed)
      setError(message)
      notify('error', message)
    } finally {
      setBusy(null)
    }
  }

  async function approve() {
    if (!current) return
    setApprovalOpen(false)
    await runAction('approve_recovery_plan', {
      ...mutationInput(current, 'approve-plan-b', 'Human approved revision-bound recovery plan B'),
      reason: '批准方案 B：停机维修 M-07，并切换 B 线保障当天紧急订单交付。'
    })
  }

  if (!context) return <main className="foc-shell foc-loading"><span className="foc-spinner" />{t.loading}</main>

  const executableCount = projection?.executableNodeKeys.length ?? 0
  return (
    <main className="foc-shell">
      <header className="foc-header">
        <div className="foc-brand">
          <span className="foc-brand-mark" aria-hidden="true">F</span>
          <div><h1>{t.pipelineTitle}</h1><p>{t.pipelineSubtitle}</p></div>
        </div>
        <div className="foc-header-actions">
          <Badge variant={data?.simulation ? 'secondary' : 'outline'} className="foc-mode">
            <span className={data?.simulation ? 'foc-dot foc-dot-sim' : 'foc-dot foc-dot-live'} />
            {data?.simulation ? t.simulation : t.external}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => void load(current?.id, selectedNodeKey ?? undefined)} disabled={Boolean(busy)}>
            <RotateCcw aria-hidden="true" /> {t.refresh}
          </Button>
          {current && <Button size="sm" onClick={() => void createIncident()} disabled={Boolean(busy)}>{t.loadIncident}</Button>}
        </div>
      </header>

      {error && <div className="foc-error" role="alert">{error}</div>}

      {!current || !projection ? (
        <section className="foc-empty">
          <span className="foc-empty-mark">M-07</span>
          <h2>{t.noCase}</h2><p>{t.noCaseHelp}</p>
          <Button onClick={() => void createIncident()} disabled={Boolean(busy)}>{t.loadIncident}</Button>
        </section>
      ) : (
        <>
          <section className="foc-casebar">
            <div className="foc-case-select">
              <span>{t.caseList}</span>
              <Select value={current.id} onValueChange={(value) => void selectCase(value)}>
                <SelectTrigger className="foc-case-trigger"><SelectValue /></SelectTrigger>
                <SelectContent>{(data?.table.items ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.caseKey} · {item.event.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="foc-case-state">
              <Badge variant="outline">{statusLabel(current.status, locale)}</Badge>
              <Badge variant={current.workspace.status === 'ready' ? 'secondary' : 'outline'}>
                Project {current.workspace.status}
              </Badge>
              {current.workspace.status === 'failed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void runAction('retry_case_project', { caseId: current.id })}
                  disabled={Boolean(busy)}
                >
                  <RotateCcw aria-hidden="true" /> Retry
                </Button>
              )}
              <HoverCard open={caseDetailsOpen} onOpenChange={setCaseDetailsOpen} openDelay={180} closeDelay={120}>
                <HoverCardTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="foc-case-details"
                    aria-label={t.caseContext}
                    aria-expanded={caseDetailsOpen}
                    onClick={() => setCaseDetailsOpen((open) => !open)}
                  >
                    {t.caseDetails}
                  </Button>
                </HoverCardTrigger>
                <HoverCardContent className="foc-case-hover" align="start" side="bottom">
                  <div className="foc-case-hover-heading">
                    <strong>{t.caseContext}</strong>
                    <span>{current.caseKey}</span>
                  </div>
                  <div className="foc-case-hover-grid">
                    {projection.case.context.map((item) => (
                      <div key={item.key}><span>{item.label}</span><strong>{item.value}</strong></div>
                    ))}
                    <div><span>{t.revision}</span><strong>{current.revision}</strong></div>
                    <div><span>Flow</span><strong>v{projection.case.templateVersion}</strong></div>
                  </div>
                </HoverCardContent>
              </HoverCard>
            </div>
            <div className="foc-next-action">
              <span>{t.nextAction}</span>
              <strong title={current.nextAction}>{current.nextAction}</strong>
            </div>
            <div className="foc-progress-copy">
              <div><span>{t.progress}</span><strong>{current.progress.percent}%</strong></div>
              <Progress value={current.progress.percent} />
            </div>
            <Button onClick={processNext} disabled={Boolean(busy) || executableCount === 0 || !current.workspace.canLaunchTasks}>
              <Send aria-hidden="true" /> {t.processNext}{executableCount > 1 ? ` (${executableCount})` : ''}
            </Button>
          </section>

          <section className="foc-toolbar" aria-label={t.pipelineControls}>
            <div className="foc-summary-pills">
              <span><i className="is-completed" />{t.completed} {projection.summary.completed}</span>
              <span><i className="is-active" />{t.active} {projection.summary.active}</span>
              <span><i className="is-blocked" />{t.blocked} {projection.summary.blocked}</span>
              <span><i className="is-pending" />{t.pending} {projection.summary.pending}</span>
            </div>
            <div className="foc-toolbar-actions">
              <Button variant={blockedOnly ? 'default' : 'outline'} size="sm" onClick={() => setBlockedOnly((value) => !value)}>{t.blockedOnly}</Button>
              <div className="foc-zoom-control"><span>{t.zoom}</span><Select value={String(zoom)} onValueChange={(value) => setZoom(Number(value))}><SelectTrigger className="foc-zoom-trigger"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="80">80%</SelectItem><SelectItem value="100">100%</SelectItem><SelectItem value="120">120%</SelectItem></SelectContent></Select></div>
            </div>
          </section>

          <PipelineBoard projection={projection} locale={locale} blockedOnly={blockedOnly} zoom={zoom}
            selectedLaneKey={selectedLaneKey} onSelectLane={setSelectedLaneKey}
            onSelectNode={(node) => void openNode(node)} onOpenExecution={(record) => void openExecution(record)} />
        </>
      )}

      <NodeWorkspace node={selectedNode} current={current} locale={locale} busy={Boolean(busy)} open={Boolean(selectedNode)}
        onOpenChange={(open) => { if (!open) setSelectedNodeKey(null) }}
        onDispatch={(node) => void dispatchNode(node)} onOpenExecution={(record) => void openExecution(record)}
        onApprove={() => setApprovalOpen(true)}
        onReject={() => current && void runAction('reject_recovery_plan', {
          ...mutationInput(current, 'reject-plan', 'Human rejected recovery plan'),
          reason: '当前方案未满足生产运营负责人的审批条件，转人工处置。'
        })}
        onExecute={() => current && void runAction('execute_recovery_plan', mutationInput(current, 'execute-plan', 'Executed approved recovery plan B'))}
        onVerify={() => current && void runAction('verify_recovery', mutationInput(current, 'verify-recovery', 'Verified equipment quality and production recovery'))} />

      <AlertDialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t.approveTitle}</AlertDialogTitle><AlertDialogDescription>{t.approveBody}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t.cancel}</AlertDialogCancel><AlertDialogAction onClick={() => void approve()}>{t.approveConfirm}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t.chooseNextTitle}</AlertDialogTitle><AlertDialogDescription>{t.chooseNextBody}</AlertDialogDescription></AlertDialogHeader>
          <div className="foc-chooser">
            {projection?.nodes.filter((node) => projection.executableNodeKeys.includes(node.key)).map((node) => (
              <Button key={node.key} variant="outline" onClick={() => processCandidate(node)}><span>{node.title}</span><small>{roleLabel(node.accountableRoleKey)}</small></Button>
            ))}
          </div>
          <AlertDialogFooter><AlertDialogCancel>{t.cancel}</AlertDialogCancel></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {busy && <div className="foc-busy" role="status"><span className="foc-spinner" />{busy}</div>}
    </main>
  )
}

function PipelineBoard({ projection, locale, blockedOnly, zoom, selectedLaneKey, onSelectLane, onSelectNode, onOpenExecution }: {
  projection: FactoryPipelineProjection; locale: SupportedLocale; blockedOnly: boolean; zoom: number
  selectedLaneKey: string | null; onSelectLane: (key: string | null) => void
  onSelectNode: (node: PipelineNode) => void; onOpenExecution: (record: ExecutionRecord) => void
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null)
  const [edges, setEdges] = useState<EdgeLine[]>([])
  const visibleNodes = useMemo(() => blockedOnly ? projection.nodes.filter((node) => node.status === 'blocked') : projection.nodes, [blockedOnly, projection.nodes])
  const laneIndex = useMemo(() => new Map(projection.lanes.map((lane, index) => [lane.key, index])), [projection.lanes])
  const stageIndex = useMemo(() => new Map(projection.stages.map((stage, index) => [stage.key, index])), [projection.stages])
  const layout = useMemo(() => {
    const positions = new Map<string, { laneKey: string; offset: number }>()
    const counts = new Map<string, number>()
    const stageWidths = new Map(projection.stages.map((stage) => [stage.key, 1]))
    for (const node of projection.nodes) {
      const laneKey = resolvedLaneKey(node, projection)
      const group = `${laneKey}:${node.stageKey}`
      const offset = counts.get(group) ?? 0
      counts.set(group, offset + 1)
      positions.set(node.key, { laneKey, offset })
      stageWidths.set(node.stageKey, Math.max(stageWidths.get(node.stageKey) ?? 1, offset + 1))
    }
    return { positions, stageWidths }
  }, [projection])

  const measure = useCallback(() => {
    const board = boardRef.current
    if (!board) return
    const boardRect = board.getBoundingClientRect()
    const lines: EdgeLine[] = []
    for (const edge of projection.edges) {
      const from = board.querySelector<HTMLElement>(`[data-node-key="${edge.from}"]`)
      const to = board.querySelector<HTMLElement>(`[data-node-key="${edge.to}"]`)
      if (!from || !to) continue
      const a = from.getBoundingClientRect(); const b = to.getBoundingClientRect()
      lines.push({ key: `${edge.from}:${edge.to}`, state: edge.state, label: edge.label,
        x1: a.right - boardRect.left, y1: a.top + a.height / 2 - boardRect.top,
        x2: b.left - boardRect.left, y2: b.top + b.height / 2 - boardRect.top })
    }
    setEdges(lines)
  }, [projection.edges])

  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(board)
    board.querySelectorAll('[data-node-key]').forEach((node) => observer?.observe(node))
    const viewport = viewportRef.current
    viewport?.addEventListener('scroll', measure, { passive: true })
    const timer = setTimeout(measure, 0)
    return () => { clearTimeout(timer); viewport?.removeEventListener('scroll', measure); observer?.disconnect() }
  }, [measure, visibleNodes, zoom])

  useEffect(() => {
    const clear = (event: KeyboardEvent) => { if (event.key === 'Escape') onSelectLane(null) }
    window.addEventListener('keydown', clear)
    return () => window.removeEventListener('keydown', clear)
  }, [onSelectLane])

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current
    if (!viewport || event.button !== 0 || (event.target as HTMLElement).closest('button,[data-interactive]')) return
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop }
    viewport.setPointerCapture(event.pointerId)
    viewport.classList.add('is-panning')
  }
  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current; const pan = panRef.current
    if (!viewport || !pan || pan.pointerId !== event.pointerId) return
    viewport.scrollLeft = pan.left - (event.clientX - pan.x)
    viewport.scrollTop = pan.top - (event.clientY - pan.y)
  }
  function endPan(event: React.PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return
    viewportRef.current?.classList.remove('is-panning')
    panRef.current = null
  }

  const laneLabelWidth = 236
  const columns = `${laneLabelWidth}px ${projection.stages.map((stage) => `${(layout.stageWidths.get(stage.key) ?? 1) * 220}px`).join(' ')}`
  const rows = `54px repeat(${projection.lanes.length}, minmax(126px, auto))`
  const boardWidth = laneLabelWidth + projection.stages.reduce((total, stage) => total + (layout.stageWidths.get(stage.key) ?? 1) * 220, 0)
  return (
    <section className="foc-pipeline" aria-label={TEXT[locale].pipelineTitle}>
      <div className="foc-board-viewport" ref={viewportRef} onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
        <div className="foc-board" ref={boardRef} style={{ gridTemplateColumns: columns, gridTemplateRows: rows, width: `${Math.max(1420, boardWidth) * zoom / 100}px` }}>
          <div className="foc-corner"><strong>{TEXT[locale].lanes}</strong><span>{projection.lanes.length} roles</span></div>
          {projection.stages.map((stage, index) => <div className="foc-stage-head" key={stage.key} style={{ gridColumn: index + 2, gridRow: 1 }}><span>{String(index + 1).padStart(2, '0')}</span><strong>{stage.title}</strong></div>)}
          {projection.lanes.map((lane, index) => (
            <React.Fragment key={lane.key}>
              <div
                className={`foc-lane-bg ${selectedLaneKey === lane.key ? 'is-selected' : ''}`}
                style={{ gridColumn: `1 / ${projection.stages.length + 2}`, gridRow: index + 2 }}
                data-lane-row={lane.key}
                data-selected={selectedLaneKey === lane.key ? 'true' : 'false'}
              />
              <div className={`foc-lane-label ${selectedLaneKey === lane.key ? 'is-selected' : ''}`} style={{ gridColumn: 1, gridRow: index + 2 }} data-interactive>
                <Toggle pressed={selectedLaneKey === lane.key} onPressedChange={(pressed) => onSelectLane(pressed ? lane.key : null)} aria-label={`${lane.assistant.displayName} · ${lane.assistant.status}`}>
                  <AssistantAvatar assistant={lane.assistant} />
                  <div><strong>{lane.assistant.displayName}</strong><small>{lane.assistant.primaryAgentKey}</small><span className={`foc-assistant-state is-${lane.assistant.status}`}>{assistantStatusLabel(lane.assistant.status, locale)}</span></div>
                </Toggle>
                <ExecutionMarkers records={lane.recentExecutions} locale={locale} onOpenExecution={onOpenExecution} className="foc-lane-executions" />
              </div>
            </React.Fragment>
          ))}
          <svg className="foc-edges" aria-hidden="true">
            <defs><marker id="foc-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" /></marker></defs>
            {edges.map((edge) => {
              const mid = Math.max(24, Math.abs(edge.x2 - edge.x1) * 0.45)
              const centerX = (edge.x1 + edge.x2) / 2; const centerY = (edge.y1 + edge.y2) / 2
              return <g key={edge.key}><path className={`is-${edge.state}`} d={`M ${edge.x1} ${edge.y1} C ${edge.x1 + mid} ${edge.y1}, ${edge.x2 - mid} ${edge.y2}, ${edge.x2} ${edge.y2}`} markerEnd="url(#foc-arrow)" />{edge.label && <text className={`is-${edge.state}`} x={centerX} y={centerY - 6}>{edge.label}</text>}</g>
            })}
          </svg>
          {visibleNodes.map((node) => {
            const position = layout.positions.get(node.key)
            const row = (laneIndex.get(position?.laneKey ?? projection.lanes[0]?.key ?? '') ?? 0) + 2
            const column = (stageIndex.get(node.stageKey) ?? 0) + 2
            return <TaskCard key={node.key} node={node} locale={locale} style={{ gridColumn: column, gridRow: row, left: `${(position?.offset ?? 0) * 220}px`, width: '192px' }} onSelect={() => onSelectNode(node)} onOpenExecution={onOpenExecution} />
          })}
        </div>
      </div>
      <footer className="foc-route-footer"><span>{TEXT[locale].routeRevision} {projection.routeRevision}</span><span>{TEXT[locale].refreshedAt} {formatTime(projection.refreshedAt, locale)}</span><span>{TEXT[locale].modeNotice}</span></footer>
    </section>
  )
}

function TaskCard({ node, locale, style, onSelect, onOpenExecution }: {
  node: PipelineNode; locale: SupportedLocale; style: React.CSSProperties
  onSelect: () => void; onOpenExecution: (record: ExecutionRecord) => void
}) {
  if (node.kind === 'router') return <div className={`foc-router is-${node.status}`} style={style} data-node-key={node.key}><span aria-hidden="true" /><strong>{node.title}</strong></div>
  if (node.kind === 'terminal') return <div className={`foc-terminal is-${node.status}`} style={style} data-node-key={node.key}><span aria-hidden="true" /><div><strong>{node.title}</strong><small>{nodeStatusLabel(node.status, locale)}</small></div></div>
  return (
    <article className={`foc-task is-${node.status} is-${node.kind}`} style={style} data-node-key={node.key}>
      <Button variant="ghost" className="foc-task-main" onClick={onSelect}>
        <span className="foc-task-meta"><Badge variant="outline">{executionModeLabel(node.executionMode, locale)}</Badge><span>{node.key}</span></span>
        <strong>{node.title}</strong><span className="foc-task-status"><i />{nodeStatusLabel(node.status, locale)}</span>
        {node.blockers[0] && <small className="foc-blocker">{node.blockers[0].title}</small>}
      </Button>
      <ExecutionMarkers records={node.executionSummary.attempts} locale={locale} onOpenExecution={onOpenExecution} className="foc-node-executions" />
    </article>
  )
}

function NodeWorkspace({ node, current, locale, busy, open, onOpenChange, onDispatch, onOpenExecution, onApprove, onReject, onExecute, onVerify }: {
  node: PipelineNode | null; current: FactoryCase | null; locale: SupportedLocale; busy: boolean; open: boolean
  onOpenChange: (open: boolean) => void; onDispatch: (node: PipelineNode) => void
  onOpenExecution: (record: ExecutionRecord) => void; onApprove: () => void; onReject: () => void
  onExecute: () => void; onVerify: () => void
}) {
  const t = TEXT[locale]
  const allow = new Set(current?.allowedActions ?? [])
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="foc-sheet">
        {node && <>
          <SheetHeader><SheetTitle>{node.title}</SheetTitle><SheetDescription>{roleLabel(node.accountableRoleKey)} · {node.key}</SheetDescription></SheetHeader>
          <div className="foc-sheet-status"><Badge variant="outline">{nodeStatusLabel(node.status, locale)}</Badge><span>{executionModeLabel(node.executionMode, locale)}</span><span>{node.executionSummary.attemptCount} {t.attempts}</span></div>
          {node.blockers.length > 0 && <section className="foc-sheet-section"><h3>{t.blockers}</h3>{node.blockers.map((blocker) => <article className="foc-work-blocker" key={blocker.code}><strong>{blocker.title}</strong><small>{blocker.ownerRoleKey} · {blocker.retryable ? t.retryable : t.manualIntervention}</small></article>)}</section>}
          <section className="foc-sheet-section"><h3>{t.authorizedActions}</h3><div className="foc-action-list">
            {node.executionMode === 'assistant_task' && node.status !== 'completed' && <Button onClick={() => onDispatch(node)} disabled={busy}><Send aria-hidden="true" />{t.dispatchAgent}</Button>}
            {allow.has('approve_recovery_plan') && node.key === 'approve-recovery-plan' && <Button onClick={onApprove} disabled={busy}>{t.approve}</Button>}
            {allow.has('reject_recovery_plan') && node.key === 'approve-recovery-plan' && <Button variant="outline" onClick={onReject} disabled={busy}>{t.reject}</Button>}
            {allow.has('execute_recovery_plan') && node.key === 'execute-recovery-plan' && <Button onClick={onExecute} disabled={busy}><Play aria-hidden="true" />{t.execute}</Button>}
            {allow.has('verify_recovery') && node.key === 'verify-recovery' && <Button onClick={onVerify} disabled={busy}><Check aria-hidden="true" />{t.verify}</Button>}
            {node.authorizedActions.length === 0 && <p>{t.noAuthorizedActions}</p>}
          </div></section>
          <section className="foc-sheet-section"><h3>{t.executionHistory}</h3><div className="foc-history">
            {node.executionSummary.attempts.length === 0 ? <p>{t.noExecutions}</p> : node.executionSummary.attempts.map((record) => (
              <Button variant="outline" key={record.recordId} onClick={() => onOpenExecution(record)} disabled={!record.conversationId}>
                <span className={`foc-history-status is-${record.status}`}>{executionStatusLabel(record.status, locale)}</span>
                <strong>#{record.attemptNumber} · {record.roleLabel}</strong><p>{record.safeSummary}</p>
                <small>{formatTime(record.startedAt, locale)} · r{record.inputRevision}{record.outputRevision ? ` → r${record.outputRevision}` : ''}</small>
              </Button>
            ))}
          </div></section>
          <section className="foc-sheet-section"><h3>{t.caseEvidence}</h3><div className="foc-evidence-list">{collectNodeEvidence(node, current).map((item) => <article key={`${item.source}:${item.reference}`}><Badge variant="outline">{item.source.toUpperCase()}</Badge><div><strong>{item.summary}</strong><small>{item.reference}</small></div></article>)}</div></section>
        </>}
      </SheetContent>
    </Sheet>
  )
}

function parseWorkbenchData(value: RemoteValue): FactoryWorkbenchData {
  if (!isObject(value) || !isObject(value.table) || !Array.isArray(value.table.items)) throw new Error('Factory Workbench returned an invalid data contract.')
  const items: FactoryCase[] = []
  for (const item of value.table.items) if (isFactoryCase(item)) items.push(item)
  const selected = isFactoryCase(value.selectedCase) ? value.selectedCase : null
  const projection = isProjection(value.projection) ? value.projection : null
  return {
    tableKey: 'cases', table: { key: 'cases', items, total: finiteNumber(value.table.total, items.length), page: finiteNumber(value.table.page, 1), pageSize: finiteNumber(value.table.pageSize, 30) },
    selectedCase: selected, projection, selectedNodeKey: typeof value.selectedNodeKey === 'string' ? value.selectedNodeKey : null,
    runtimeProjectId: typeof value.runtimeProjectId === 'string' ? value.runtimeProjectId : null,
    simulation: value.simulation === true
  }
}

function isFactoryCase(value: unknown): value is FactoryCase {
  return isObject(value) && typeof value.id === 'string' && typeof value.caseKey === 'string' && typeof value.revision === 'number' && isObject(value.workspace) && typeof value.workspace.projectId === 'string' && isObject(value.event) && isObject(value.findings) && isObject(value.progress) && Array.isArray(value.timeline) && Array.isArray(value.allowedActions)
}
function isProjection(value: unknown): value is FactoryPipelineProjection {
  return isObject(value) && isObject(value.case) && Array.isArray(value.lanes) && Array.isArray(value.stages) && Array.isArray(value.nodes) && Array.isArray(value.edges) && Array.isArray(value.executableNodeKeys)
}
function collectNodeEvidence(node: PipelineNode, current: FactoryCase | null): Evidence[] {
  if (!current) return []
  if (node.key === 'triage-event') return current.triage?.evidence ?? []
  const findingKey: Record<string, keyof FactoryCase['findings']> = { 'diagnose-equipment': 'equipment', 'assess-quality-impact': 'quality', 'assess-production-impact': 'production', 'check-resource-readiness': 'resources' }
  const key = findingKey[node.key]
  if (key) return current.findings[key]?.evidence ?? []
  if (node.key === 'verify-recovery') return current.verification?.evidence ?? []
  return []
}
function resolvedLaneKey(node: PipelineNode, projection: FactoryPipelineProjection) {
  if (node.laneKey) return node.laneKey
  const nodes = new Map(projection.nodes.map((item) => [item.key, item]))
  const visited = new Set([node.key])
  let frontier = [node.key]
  while (frontier.length) {
    const next: string[] = []
    for (const key of frontier) {
      const adjacent = [
        ...projection.edges.filter((edge) => edge.to === key).map((edge) => edge.from),
        ...projection.edges.filter((edge) => edge.from === key).map((edge) => edge.to)
      ]
      for (const adjacentKey of adjacent) {
        if (visited.has(adjacentKey)) continue
        visited.add(adjacentKey)
        const adjacentNode = nodes.get(adjacentKey)
        if (adjacentNode?.laneKey) return adjacentNode.laneKey
        next.push(adjacentKey)
      }
    }
    frontier = next
  }
  return projection.lanes[0]?.key ?? ''
}
function mutationInput(current: FactoryCase, action: string, changeSummary: string): RemoteObject { return { caseId: current.id, baseRevision: current.revision, operationId: operation(action), changeSummary } }
function operation(action: string) { return `factory-ui-${action}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}` }
function finiteNumber(value: RemoteValue, fallback: number) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
function readInitial(context: HostContext, key: string) { const parameters = context.initialQuery?.parameters; return isObject(parameters) && typeof parameters[key] === 'string' ? parameters[key] as string : undefined }
function messageOf(reason: unknown, fallback: string) { return reason instanceof Error && reason.message ? reason.message : fallback }
function formatTime(value: string, locale: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date) }
function roleLabel(value: string | null) { return value?.replace(/^Agent_/, '').replace(/([a-z])([A-Z])/g, '$1 $2') ?? 'System' }
function assistantStatusLabel(status: PipelineLane['assistant']['status'], locale: SupportedLocale) {
  const labels: Record<PipelineLane['assistant']['status'], [string, string]> = {
    available: ['Published', '已发布'], incompatible: ['Incompatible', '不兼容'], unpublished: ['Unpublished', '未发布'],
    cross_organization: ['Cross-organization', '跨组织'], unbound: ['Unbound', '未绑定']
  }
  return locale === 'en-US' ? labels[status][0] : labels[status][1]
}
function statusLabel(status: FactoryCase['status'], locale: SupportedLocale) {
  const labels: Record<FactoryCase['status'], [string, string]> = { investigating: ['Investigating', '研判中'], planning: ['Planning', '规划中'], awaiting_approval: ['Awaiting approval', '等待审批'], approved: ['Approved', '已批准'], executing: ['Executing', '执行中'], verifying: ['Verifying', '验证中'], recovered: ['Recovered', '已恢复'], escalated: ['Escalated', '已升级'], rejected: ['Rejected', '已拒绝'] }
  return locale === 'en-US' ? labels[status][0] : labels[status][1]
}
function nodeStatusLabel(status: PipelineNode['status'], locale: SupportedLocale) {
  const labels: Record<PipelineNode['status'], [string, string]> = { not_started: ['Not started', '未开始'], ready: ['Ready', '可执行'], active: ['Active', '进行中'], blocked: ['Blocked', '受阻'], completed: ['Completed', '已完成'], not_applicable: ['Not applicable', '不适用'], satisfied_externally: ['Satisfied externally', '外部已满足'] }
  return locale === 'en-US' ? labels[status][0] : labels[status][1]
}
function executionStatusLabel(status: ExecutionRecord['status'], locale: SupportedLocale) {
  const labels: Record<ExecutionRecord['status'], [string, string]> = { queued: ['Queued', '排队中'], running: ['Running', '执行中'], succeeded: ['Succeeded', '成功'], failed: ['Failed', '失败'], interrupted: ['Interrupted', '已中断'], cancelled: ['Cancelled', '已取消'], superseded: ['Superseded', '已被重试替代'] }
  return locale === 'en-US' ? labels[status][0] : labels[status][1]
}
function executionModeLabel(mode: PipelineNode['executionMode'], locale: SupportedLocale) {
  const labels = { assistant_task: ['Agent', '智能体'], human: ['Human', '人工'], system: ['System', '系统'] } as const
  if (!mode) return locale === 'en-US' ? 'Route' : '路由'
  return locale === 'en-US' ? labels[mode][0] : labels[mode][1]
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Factory Operations root element is missing.')
createRoot(rootElement).render(<App />)
