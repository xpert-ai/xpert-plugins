import * as React from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Badge, Button, Check, Play, Progress, RotateCcw, Send
} from '../../../ui/index'
import { createRoot } from 'react-dom/client'
import { AssistantAvatar } from '../../factory-operations-center/src/assistant-avatar'
import { resolveLocale, type SupportedLocale } from '../../factory-operations-center/src/i18n'
import {
  executeAction, invokeClientCommand, isObject, notify, reportResize,
  requestData, requireSuccess, startBridge, unwrap
} from '../../factory-operations-center/src/runtime'
import { installShadcnThemeVars } from '../../factory-operations-center/src/theme'
import type {
  Evidence, ExecutionRecord, FactoryCase, FactoryPipelineProjection, FactoryWorkbenchData,
  HostContext, PipelineNode, RemoteObject, RemoteValue
} from '../../factory-operations-center/src/types'
import './styles.css'

const h: typeof React.createElement = React.createElement
const { useCallback, useEffect, useMemo, useRef, useState } = React
const WORKBENCH_NAVIGATION_OPEN_COMMAND = 'workbench.navigation.open'
const WORKBENCH_ASSISTANT_CONVERSATION_TARGET = 'assistant.conversation'
const WORKBENCH_ASSISTANT_PROJECT_TARGET = 'assistant.project'
const WORKBENCH_VIEW_TARGET = 'workbench.view'
const PIPELINE_VIEW_KEY = 'factory-operations-center'

installShadcnThemeVars({ density: 'compact' })

const COPY = {
  'zh-Hans': {
    title: 'Factory Case 任务工作区', subtitle: '聚焦当前节点的证据、授权动作与执行记录', back: '返回流水线',
    refresh: '刷新', case: 'CASE', device: 'DEVICE', line: 'LINE', progress: '恢复进度', revision: '修订',
    currentTask: '当前任务', accountableAssistant: '责任 Assistant', blockers: '阻塞项', noBlockers: '当前没有阻塞项。',
    actions: '授权动作', noActions: '当前节点没有可执行的授权动作。', dispatch: '派发给责任 Assistant',
    approve: '批准方案 B', reject: '拒绝方案', execute: '执行已批准方案', verify: '验证恢复',
    evidence: '节点证据', noEvidence: '该节点尚未形成可展示的持久化证据。', executions: '执行记录', noExecutions: '尚无执行尝试。',
    attempts: '次尝试', retryable: '可重试', manual: '需人工处理', nextAction: '下一项受控动作',
    planOptions: '恢复方案比较', recommended: '推荐', delay: '交付延迟', cost: '增量成本', safety: '安全风险',
    approveTitle: '授权方案 B？', approveBody: '该决定将绑定当前 Case 修订号并写入审计记录；执行动作仍需单独确认。',
    cancel: '取消', approveConfirm: '批准当前修订', requestFailed: '任务工作区请求失败。', actionCompleted: '操作已完成。',
    assistantSent: '任务已发送给责任 Assistant。', unavailable: '未找到指定任务', unavailableHelp: '请返回流水线重新选择一个任务。',
    loading: '正在载入任务工作区…', simulation: '仿真模式', external: '真实环境'
  },
  'en-US': {
    title: 'Factory Case Workspace', subtitle: 'Focused evidence, authorized actions, and execution records for one task', back: 'Back to pipeline',
    refresh: 'Refresh', case: 'CASE', device: 'DEVICE', line: 'LINE', progress: 'Recovery progress', revision: 'Revision',
    currentTask: 'Current task', accountableAssistant: 'Accountable Assistant', blockers: 'Blockers', noBlockers: 'No active blockers.',
    actions: 'Authorized actions', noActions: 'No authorized action is currently available.', dispatch: 'Dispatch to accountable Assistant',
    approve: 'Approve plan B', reject: 'Reject plan', execute: 'Execute approved plan', verify: 'Verify recovery',
    evidence: 'Task evidence', noEvidence: 'No persisted evidence is available for this task yet.', executions: 'Execution records', noExecutions: 'No execution attempts yet.',
    attempts: 'attempts', retryable: 'Retryable', manual: 'Manual intervention', nextAction: 'Next governed action',
    planOptions: 'Recovery option comparison', recommended: 'Recommended', delay: 'Delivery delay', cost: 'Incremental cost', safety: 'Safety risk',
    approveTitle: 'Authorize plan B?', approveBody: 'This decision is bound to the current Case revision and audited. Execution still requires a separate confirmation.',
    cancel: 'Cancel', approveConfirm: 'Approve current revision', requestFailed: 'The task workspace request failed.', actionCompleted: 'Action completed.',
    assistantSent: 'Task sent to the accountable Assistant.', unavailable: 'The requested task was not found', unavailableHelp: 'Return to the pipeline and select a task again.',
    loading: 'Loading task workspace…', simulation: 'Simulation', external: 'Live environment'
  }
} as const

function App() {
  const [context, setContext] = useState<HostContext | null>(null)
  const [data, setData] = useState<FactoryWorkbenchData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const queryRef = useRef<{ caseId?: string; nodeKey?: string }>({})
  const locale = resolveLocale(context?.locale)
  const t = locale === 'en-US' ? COPY['en-US'] : COPY['zh-Hans']
  const current = data?.selectedCase ?? null
  const projection = data?.projection ?? null
  const nodeKey = data?.selectedNodeKey ?? queryRef.current.nodeKey
  const node = projection?.nodes.find((item) => item.key === nodeKey) ?? null
  const lane = projection?.lanes.find((item) => item.key === node?.laneKey) ?? null
  const evidence = useMemo(() => node ? collectNodeEvidence(node, current) : [], [current, node])

  const load = useCallback(async (caseId?: string, selectedNodeKey?: string, silent = false) => {
    if (!silent) setBusy('refresh')
    setError(null)
    try {
      const response = await requestData({
        page: 1,
        pageSize: 20,
        selectionId: caseId,
        parameters: {
          ...(caseId ? { caseId } : {}),
          ...(selectedNodeKey ? { nodeKey: selectedNodeKey } : {})
        }
      })
      const next = parseWorkbenchData(unwrap(response))
      setData(next)
      if (
        next.selectedCase?.workspace.status === 'ready' &&
        next.runtimeProjectId !== next.selectedCase.workspace.projectId
      ) {
        requireSuccess(await invokeClientCommand(WORKBENCH_NAVIGATION_OPEN_COMMAND, {
          target: WORKBENCH_ASSISTANT_PROJECT_TARGET,
          projectId: next.selectedCase.workspace.projectId
        }))
      }
    } catch (reason) {
      setError(messageOf(reason, t.requestFailed))
    } finally {
      if (!silent) setBusy(null)
    }
  }, [t.requestFailed])

  useEffect(() => startBridge(
    (next) => {
      document.documentElement.lang = resolveLocale(next.locale)
      queryRef.current = {
        caseId: readInitial(next, 'caseId') ?? readSelectionId(next),
        nodeKey: readInitial(next, 'nodeKey')
      }
      setContext(next)
    },
    () => void load(queryRef.current.caseId, queryRef.current.nodeKey, true)
  ), [load])

  useEffect(() => {
    if (context) void load(queryRef.current.caseId, queryRef.current.nodeKey)
  }, [context, load])

  useEffect(() => {
    const root = document.getElementById('root')
    const observer = root && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => setTimeout(reportResize, 0))
      : null
    if (root) observer?.observe(root)
    return () => observer?.disconnect()
  }, [])

  async function runAction(actionKey: string, input: RemoteObject) {
    if (!current) return
    setBusy(actionKey)
    setError(null)
    try {
      requireSuccess(await executeAction(actionKey, current.id, input))
      notify('success', t.actionCompleted)
      await load(current.id, node?.key, true)
    } catch (reason) {
      const message = messageOf(reason, t.requestFailed)
      setError(message)
      notify('error', message)
    } finally {
      setBusy(null)
    }
  }

  async function dispatch() {
    if (!current || !node) return
    setBusy('dispatch')
    setError(null)
    try {
      requireSuccess(await executeAction('dispatch_assistant_task', current.id, {
        caseId: current.id,
        nodeKey: node.key,
        baseRevision: current.revision,
        operationId: `factory-workspace-assistant-task-${node.key}-r${current.revision}-${crypto.randomUUID()}`
      }))
      notify('success', t.assistantSent)
      await load(current.id, node.key, true)
    } catch (reason) {
      const message = messageOf(reason, t.requestFailed)
      setError(message)
      notify('error', message)
    } finally {
      setBusy(null)
    }
  }

  async function navigate(payload: RemoteObject) {
    try {
      requireSuccess(await invokeClientCommand(WORKBENCH_NAVIGATION_OPEN_COMMAND, payload))
    } catch (reason) {
      const message = messageOf(reason, t.requestFailed)
      setError(message)
      notify('error', message)
    }
  }

  if (!context) return <main className="fcw-shell fcw-loading"><span className="fcw-spinner" />{t.loading}</main>

  const allow = new Set(current?.allowedActions ?? [])
  return (
    <main className="fcw-shell">
      <header className="fcw-header">
        <div className="fcw-title-group">
          <Button variant="outline" size="sm" onClick={() => void navigate({
            target: WORKBENCH_VIEW_TARGET,
            viewKey: PIPELINE_VIEW_KEY,
            selectionId: current?.id ?? queryRef.current.caseId,
            parameters: { ...(current?.id ? { caseId: current.id } : {}) }
          })}>← {t.back}</Button>
          <div><h1>{t.title}</h1><p>{t.subtitle}</p></div>
        </div>
        <div className="fcw-header-actions">
          <Badge variant={data?.simulation ? 'secondary' : 'outline'}>
            <i className={data?.simulation ? 'is-sim' : 'is-live'} />
            {data?.simulation ? t.simulation : t.external}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => void load(current?.id, node?.key)} disabled={Boolean(busy)}>
            <RotateCcw aria-hidden="true" />{t.refresh}
          </Button>
        </div>
      </header>

      {error && <div className="fcw-error" role="alert">{error}</div>}

      {!current || !projection || !node ? (
        <section className="fcw-empty">
          <span>404</span><h2>{t.unavailable}</h2><p>{t.unavailableHelp}</p>
          <Button onClick={() => void navigate({ target: WORKBENCH_VIEW_TARGET, viewKey: PIPELINE_VIEW_KEY })}>{t.back}</Button>
        </section>
      ) : (
        <>
          <section className="fcw-case-strip">
            <div><span>{t.case}</span><strong>{current.caseKey}</strong></div>
            <div><span>{t.device}</span><strong>{current.event.deviceName}</strong></div>
            <div><span>{t.line}</span><strong>{current.event.lineId}</strong></div>
            <div className="fcw-progress"><span>{t.progress}</span><strong>{current.progress.percent}%</strong><Progress value={current.progress.percent} /></div>
            <div><span>{t.revision}</span><strong>r{current.revision}</strong></div>
          </section>

          <section className="fcw-task-hero">
            <div className="fcw-task-copy">
              <span>{t.currentTask}</span>
              <div className="fcw-task-title"><h2>{node.title}</h2><Badge variant="outline">{nodeStatusLabel(node.status, locale)}</Badge></div>
              <p>{node.key} · {executionModeLabel(node.executionMode, locale)} · {node.executionSummary.attemptCount} {t.attempts}</p>
            </div>
            {lane && <div className="fcw-owner">
              <AssistantAvatar assistant={lane.assistant} className="fcw-owner-avatar" />
              <div><span>{t.accountableAssistant}</span><strong>{lane.assistant.displayName}</strong><small>{lane.assistant.primaryAgentKey} · {assistantStatusLabel(lane.assistant.status, locale)}</small></div>
            </div>}
            <div className="fcw-next"><span>{t.nextAction}</span><strong>{current.nextAction}</strong></div>
          </section>

          <div className="fcw-grid">
            <div className="fcw-primary">
              <WorkspaceSection title={t.blockers} tone={node.blockers.length ? 'danger' : 'default'}>
                {node.blockers.length === 0
                  ? <p className="fcw-muted">{t.noBlockers}</p>
                  : <div className="fcw-blockers">{node.blockers.map((blocker) => <article key={blocker.code}><strong>{blocker.title}</strong><small>{blocker.ownerRoleKey} · {blocker.retryable ? t.retryable : t.manual}</small></article>)}</div>}
              </WorkspaceSection>

              {current.plan && (node.key === 'generate-recovery-plan' || node.key === 'approve-recovery-plan') && <WorkspaceSection title={t.planOptions}>
                <div className="fcw-options">{current.plan.options.map((option) => <article className={option.recommended ? 'is-recommended' : ''} key={option.id}>
                  <div><Badge variant={option.recommended ? 'default' : 'outline'}>{option.id}</Badge>{option.recommended && <span>{t.recommended}</span>}</div>
                  <h3>{option.title}</h3><p>{option.description}</p>
                  <dl><div><dt>{t.delay}</dt><dd>{option.deliveryDelayMinutes} min</dd></div><div><dt>{t.cost}</dt><dd>¥{option.incrementalCostCny.toLocaleString()}</dd></div><div><dt>{t.safety}</dt><dd>{option.safetyRisk}</dd></div></dl>
                </article>)}</div>
              </WorkspaceSection>}

              <WorkspaceSection title={t.actions}>
                <div className="fcw-actions">
                  {node.executionMode === 'assistant_task' && node.status !== 'completed' && <Button onClick={() => void dispatch()} disabled={Boolean(busy) || !current.workspace.canLaunchTasks}><Send aria-hidden="true" />{t.dispatch}</Button>}
                  {allow.has('approve_recovery_plan') && node.key === 'approve-recovery-plan' && <Button onClick={() => setApprovalOpen(true)} disabled={Boolean(busy)}>{t.approve}</Button>}
                  {allow.has('reject_recovery_plan') && node.key === 'approve-recovery-plan' && <Button variant="outline" onClick={() => void runAction('reject_recovery_plan', { ...mutationInput(current, 'reject-plan', 'Human rejected recovery plan'), reason: '当前方案未满足审批条件，转人工处置。' })} disabled={Boolean(busy)}>{t.reject}</Button>}
                  {allow.has('execute_recovery_plan') && node.key === 'execute-recovery-plan' && <Button onClick={() => void runAction('execute_recovery_plan', mutationInput(current, 'execute-plan', 'Executed approved recovery plan B'))} disabled={Boolean(busy)}><Play aria-hidden="true" />{t.execute}</Button>}
                  {allow.has('verify_recovery') && node.key === 'verify-recovery' && <Button onClick={() => void runAction('verify_recovery', mutationInput(current, 'verify-recovery', 'Verified equipment quality and production recovery'))} disabled={Boolean(busy)}><Check aria-hidden="true" />{t.verify}</Button>}
                  {node.authorizedActions.length === 0 && !(node.executionMode === 'assistant_task' && node.status !== 'completed') && <p className="fcw-muted">{t.noActions}</p>}
                </div>
              </WorkspaceSection>

              <WorkspaceSection title={t.evidence}>
                {evidence.length === 0
                  ? <p className="fcw-muted">{t.noEvidence}</p>
                  : <div className="fcw-evidence">{evidence.map((item) => <article key={`${item.source}:${item.reference}`}><Badge variant="outline">{item.source.toUpperCase()}</Badge><div><strong>{item.summary}</strong><small>{item.reference}</small></div></article>)}</div>}
              </WorkspaceSection>
            </div>

            <aside className="fcw-aside">
              <WorkspaceSection title={t.executions}>
                {node.executionSummary.attempts.length === 0
                  ? <p className="fcw-muted">{t.noExecutions}</p>
                  : <div className="fcw-history">{node.executionSummary.attempts.map((record) => <Button variant="outline" key={record.recordId} disabled={!record.conversationId} onClick={() => void navigate({
                    target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
                    conversationId: record.conversationId,
                    ...(record.threadId ? { threadId: record.threadId } : {}),
                    ...(record.executionId ? { executionId: record.executionId } : {}),
                    ...(record.executorXpertId ? { xpertId: record.executorXpertId } : {})
                  })}><span className={`is-${record.status}`}>{executionStatusLabel(record.status, locale)}</span><strong>#{record.attemptNumber} · {record.roleLabel}</strong><p>{record.safeSummary}</p><small>{formatTime(record.startedAt, locale)} · r{record.inputRevision}{record.outputRevision ? ` → r${record.outputRevision}` : ''}</small></Button>)}</div>}
              </WorkspaceSection>
              <WorkspaceSection title="Case Timeline">
                <ol className="fcw-timeline">{current.timeline.slice().reverse().slice(0, 8).map((item) => <li key={item.key}><i className={`is-${item.status}`} /><div><strong>{item.title}</strong><small>{item.actor} · {formatTime(item.occurredAt, locale)}</small></div></li>)}</ol>
              </WorkspaceSection>
            </aside>
          </div>
        </>
      )}

      <AlertDialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t.approveTitle}</AlertDialogTitle><AlertDialogDescription>{t.approveBody}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t.cancel}</AlertDialogCancel><AlertDialogAction onClick={() => {
            setApprovalOpen(false)
            if (current) void runAction('approve_recovery_plan', {
              ...mutationInput(current, 'approve-plan-b', 'Human approved revision-bound recovery plan B'),
              reason: '批准方案 B：停机维修 M-07，并切换 B 线保障紧急订单交付。'
            })
          }}>{t.approveConfirm}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {busy && <div className="fcw-busy" role="status"><span className="fcw-spinner" />{busy}</div>}
    </main>
  )
}

function WorkspaceSection({ title, tone = 'default', children }: {
  title: string
  tone?: 'default' | 'danger'
  children: React.ReactNode
}) {
  return <section className={`fcw-section is-${tone}`}><h2>{title}</h2>{children}</section>
}

function parseWorkbenchData(value: RemoteValue): FactoryWorkbenchData {
  if (!isObject(value) || !isObject(value.table) || !Array.isArray(value.table.items)) throw new Error('Factory Workspace returned an invalid data contract.')
  const items: FactoryCase[] = []
  for (const item of value.table.items) if (isFactoryCase(item)) items.push(item)
  return {
    tableKey: 'cases',
    table: {
      key: 'cases', items,
      total: finiteNumber(value.table.total, items.length),
      page: finiteNumber(value.table.page, 1),
      pageSize: finiteNumber(value.table.pageSize, 20)
    },
    selectedCase: isFactoryCase(value.selectedCase) ? value.selectedCase : null,
    projection: isProjection(value.projection) ? value.projection : null,
    selectedNodeKey: typeof value.selectedNodeKey === 'string' ? value.selectedNodeKey : null,
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
  const findingKey: Record<string, keyof FactoryCase['findings']> = {
    'diagnose-equipment': 'equipment', 'assess-quality-impact': 'quality',
    'assess-production-impact': 'production', 'check-resource-readiness': 'resources'
  }
  const key = findingKey[node.key]
  if (key) return current.findings[key]?.evidence ?? []
  if (node.key === 'verify-recovery') return current.verification?.evidence ?? []
  return [
    ...(current.triage?.evidence ?? []),
    ...Object.values(current.findings).flatMap((finding) => finding?.evidence ?? [])
  ].slice(0, 8)
}
function readInitial(context: HostContext, key: string) {
  if (!isObject(context.initialQuery) || !isObject(context.initialQuery.parameters)) return undefined
  return typeof context.initialQuery.parameters[key] === 'string' ? context.initialQuery.parameters[key] as string : undefined
}
function readSelectionId(context: HostContext) {
  return isObject(context.initialQuery) && typeof context.initialQuery.selectionId === 'string' ? context.initialQuery.selectionId : undefined
}
function mutationInput(current: FactoryCase, action: string, changeSummary: string): RemoteObject {
  return { caseId: current.id, baseRevision: current.revision, operationId: `factory-workspace-${action}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, changeSummary }
}
function finiteNumber(value: RemoteValue, fallback: number) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
function messageOf(reason: unknown, fallback: string) { return reason instanceof Error && reason.message ? reason.message : fallback }
function formatTime(value: string, locale: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date) }
function nodeStatusLabel(status: PipelineNode['status'], locale: SupportedLocale) {
  const labels: Record<PipelineNode['status'], [string, string]> = { not_started: ['Not started', '未开始'], ready: ['Ready', '可执行'], active: ['Active', '进行中'], blocked: ['Blocked', '受阻'], completed: ['Completed', '已完成'], not_applicable: ['Not applicable', '不适用'], satisfied_externally: ['Satisfied externally', '外部已满足'] }
  return locale === 'en-US' ? labels[status][0] : labels[status][1]
}
function executionModeLabel(mode: PipelineNode['executionMode'], locale: SupportedLocale) {
  const labels = { assistant_task: ['Assistant task', 'Assistant 任务'], human: ['Human decision', '人工决策'], system: ['System action', '系统动作'] } as const
  if (!mode) return locale === 'en-US' ? 'Route' : '路由'
  return locale === 'en-US' ? labels[mode][0] : labels[mode][1]
}
function executionStatusLabel(status: ExecutionRecord['status'], locale: SupportedLocale) {
  const labels: Record<ExecutionRecord['status'], [string, string]> = { queued: ['Queued', '排队中'], running: ['Running', '执行中'], succeeded: ['Succeeded', '成功'], failed: ['Failed', '失败'], interrupted: ['Interrupted', '已中断'], cancelled: ['Cancelled', '已取消'], superseded: ['Superseded', '已替代'] }
  return locale === 'en-US' ? labels[status][0] : labels[status][1]
}
function assistantStatusLabel(status: FactoryPipelineProjection['lanes'][number]['assistant']['status'], locale: SupportedLocale) {
  const labels = { available: ['Published', '已发布'], incompatible: ['Incompatible', '不兼容'], unpublished: ['Unpublished', '未发布'], cross_organization: ['Cross-organization', '跨组织'], unbound: ['Unbound', '未绑定'] } as const
  return locale === 'en-US' ? labels[status][0] : labels[status][1]
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Factory Case Workspace root element is missing.')
createRoot(rootElement).render(<App />)
