import type {
  FactoryCaseState,
  FactoryExecutionRecordSummary,
  FactoryPipelineEdge,
  FactoryPipelineLane,
  FactoryPipelineNode,
  FactoryPipelineNodeStatus,
  FactoryPipelineProjection,
  FactoryPipelineStage,
  FactoryRouteDecision
} from './types.js'
import { FACTORY_ROLE_ASSISTANTS } from '../factory-assistant-definitions.js'

interface PipelineNodeDefinition {
  key: string
  kind: FactoryPipelineNode['kind']
  title: string
  stageKey: string
  laneKey?: string
  accountableRoleKey?: string
  executionMode?: FactoryPipelineNode['executionMode']
  openMode?: NonNullable<FactoryPipelineNode['openMode']>
  workspaceKey?: string
  actions?: string[]
}

interface PipelineEdgeDefinition {
  from: string
  to: string
  condition?: { factKey: string; value: string }
}

const LANES: FactoryPipelineLane[] = [
  lane('event-intake', 'Event Intake', 'anomaly-triage-specialist', 10),
  lane('equipment-engineering', 'Equipment Engineering', 'equipment-diagnostics-specialist', 20),
  lane('quality-management', 'Quality Management', 'quality-risk-specialist', 30),
  lane('production-planning', 'Production Planning', 'production-impact-specialist', 40),
  lane('maintenance-and-logistics', 'Maintenance and Logistics', 'resource-readiness-specialist', 50),
  lane('recovery-planning', 'Recovery Planning', 'recovery-planning-specialist', 60),
  lane('operations-approval', 'Operations Approval', 'operations-approval-advisor', 70),
  lane('recovery-validation', 'Recovery Validation', 'recovery-verification-specialist', 80)
]

const STAGES: FactoryPipelineStage[] = [
  stage('detection', 'Detection', 10),
  stage('triage', 'Triage', 20),
  stage('parallel-analysis', 'Parallel Analysis', 30),
  stage('recovery-planning', 'Recovery Planning', 40),
  stage('human-decision', 'Human Decision', 50),
  stage('governed-execution', 'Governed Execution', 60),
  stage('verification', 'Verification and Outcome', 70)
]

const BASE_NODES: PipelineNodeDefinition[] = [
  task('detect-anomaly', 'Detect Production Anomaly', 'event-intake', 'detection', 'anomaly-triage-specialist', 'system'),
  task('triage-event', 'Triage Anomaly Event', 'event-intake', 'triage', 'anomaly-triage-specialist', 'assistant_task'),
  task('diagnose-equipment', 'Diagnose Equipment', 'equipment-engineering', 'parallel-analysis', 'equipment-diagnostics-specialist', 'assistant_task'),
  task('assess-quality-impact', 'Assess Quality Impact', 'quality-management', 'parallel-analysis', 'quality-risk-specialist', 'assistant_task'),
  task('assess-production-impact', 'Assess Production Impact', 'production-planning', 'parallel-analysis', 'production-impact-specialist', 'assistant_task'),
  task('check-resource-readiness', 'Check Resource Readiness', 'maintenance-and-logistics', 'parallel-analysis', 'resource-readiness-specialist', 'assistant_task'),
  task('generate-recovery-plan', 'Generate Recovery Plan', 'recovery-planning', 'recovery-planning', 'recovery-planning-specialist', 'assistant_task'),
  router('route-execution-authority', 'Route Execution Authority', 'human-decision'),
  task('approve-recovery-plan', 'Decide Recovery Plan', 'operations-approval', 'human-decision', 'operations-approval-advisor', 'human', [
    'approve_recovery_plan',
    'reject_recovery_plan'
  ]),
  task('execute-recovery-plan', 'Execute Approved Recovery Plan', 'operations-approval', 'governed-execution', 'operations-approval-advisor', 'system', [
    'execute_recovery_plan'
  ]),
  router('route-execution-outcome', 'Route Execution Outcome', 'governed-execution'),
  task('verify-recovery', 'Verify Production Recovery', 'recovery-validation', 'verification', 'recovery-verification-specialist', 'assistant_task'),
  router('route-recovery-outcome', 'Route Recovery Outcome', 'verification'),
  terminal('production-recovered', 'Production Recovered', 'verification'),
  terminal('human-intervention-required', 'Human Intervention Required', 'verification')
]

const APPROVAL_ROUTER: PipelineNodeDefinition = router(
  'route-approval-outcome',
  'Route Approval Outcome',
  'human-decision'
)

const V1_EDGES: PipelineEdgeDefinition[] = [
  edge('detect-anomaly', 'triage-event'),
  edge('triage-event', 'diagnose-equipment'),
  edge('triage-event', 'assess-quality-impact'),
  edge('triage-event', 'assess-production-impact'),
  edge('triage-event', 'check-resource-readiness'),
  edge('diagnose-equipment', 'generate-recovery-plan'),
  edge('assess-quality-impact', 'generate-recovery-plan'),
  edge('assess-production-impact', 'generate-recovery-plan'),
  edge('check-resource-readiness', 'generate-recovery-plan'),
  edge('generate-recovery-plan', 'route-execution-authority'),
  edge('route-execution-authority', 'execute-recovery-plan', 'execution-authority', 'auto-safe'),
  edge('route-execution-authority', 'approve-recovery-plan', 'execution-authority', 'approval-required'),
  edge('approve-recovery-plan', 'execute-recovery-plan'),
  edge('execute-recovery-plan', 'route-execution-outcome'),
  edge('route-execution-outcome', 'verify-recovery', 'execution-outcome', 'complete'),
  edge('route-execution-outcome', 'human-intervention-required', 'execution-outcome', 'partial-failure'),
  edge('verify-recovery', 'route-recovery-outcome'),
  edge('route-recovery-outcome', 'production-recovered', 'recovery-outcome', 'recovered'),
  edge('route-recovery-outcome', 'human-intervention-required', 'recovery-outcome', 'needs-intervention')
]

const V2_EDGES: PipelineEdgeDefinition[] = [
  ...V1_EDGES.filter((item) => item.from !== 'approve-recovery-plan'),
  edge('approve-recovery-plan', 'route-approval-outcome'),
  edge('route-approval-outcome', 'execute-recovery-plan', 'approval-outcome', 'approved'),
  edge('route-approval-outcome', 'human-intervention-required', 'approval-outcome', 'rejected')
]

export function projectFactoryPipeline(
  state: FactoryCaseState,
  executionRecords: FactoryExecutionRecordSummary[],
  refreshedAt = new Date().toISOString()
): FactoryPipelineProjection {
  const definitions = state.templateVersion >= 2
    ? insertApprovalRouter(BASE_NODES)
    : BASE_NODES
  const decisions = routeDecisions(state)
  const recordsByNode = groupExecutions(executionRecords)
  const nodes = definitions.map((definition) => projectNode(state, definition, recordsByNode.get(definition.key) ?? []))
  const nodeMap = new Map(nodes.map((node) => [node.key, node]))
  const edges = (state.templateVersion >= 2 ? V2_EDGES : V1_EDGES).map((definition) =>
    projectEdge(definition, nodeMap, decisions)
  )
  const completed = nodes.filter((node) => node.status === 'completed' || node.status === 'satisfied_externally').length
  const active = nodes.filter((node) => node.status === 'active').length
  const blocked = nodes.filter((node) => node.status === 'blocked').length
  const pending = nodes.filter((node) => node.status === 'ready' || node.status === 'not_started').length

  return {
    case: {
      id: state.id,
      title: `${state.event.deviceName} · ${state.event.title}`,
      status: state.status,
      revision: state.revision,
      templateKey: state.templateKey,
      templateVersion: state.templateVersion,
      context: [
        { key: 'case-key', label: 'Case', value: state.caseKey },
        { key: 'device', label: 'Device', value: state.event.deviceName },
        { key: 'line', label: 'Line', value: state.event.lineId }
      ]
    },
    summary: { completed, active, blocked, pending },
    lanes: LANES.map((item) => ({
      ...item,
      recentExecutions: executionRecords
        .filter((record) => record.roleKey === item.accountableRoleKey)
        .sort((left, right) => right.sequence - left.sequence)
        .slice(0, 10)
    })),
    stages: STAGES.map((item) => ({ ...item })),
    nodes,
    edges,
    routeDecisions: decisions,
    executableNodeKeys: nodes.filter((node) => node.status === 'ready').map((node) => node.key),
    routeRevision: state.revision,
    refreshedAt
  }
}

function projectNode(
  state: FactoryCaseState,
  definition: PipelineNodeDefinition,
  attempts: FactoryExecutionRecordSummary[]
): FactoryPipelineNode {
  let status = statusForNode(state, definition.key)
  const latest = attempts[0]
  if (latest && (latest.status === 'queued' || latest.status === 'running')) status = 'active'
  const blockers = status === 'blocked'
    ? [{
        code: 'factory-human-intervention-required',
        title: 'A named recovery blocker requires authorized human intervention.',
        ownerRoleKey: definition.accountableRoleKey ?? 'operations-approval-advisor',
        since: state.timeline.at(-1)?.occurredAt ?? state.event.occurredAt,
        retryable: state.status === 'escalated'
      }]
    : []
  return {
    key: definition.key,
    kind: definition.kind,
    title: definition.title,
    laneKey: definition.laneKey ?? null,
    stageKey: definition.stageKey,
    accountableRoleKey: definition.accountableRoleKey ?? null,
    executionMode: definition.executionMode ?? null,
    openMode: definition.openMode ?? null,
    status,
    workspaceKey: definition.workspaceKey ?? null,
    authorizedActions: status === 'ready' || status === 'active'
      ? ['node-open', ...(definition.actions ?? (definition.kind === 'task' ? ['node-start'] : []))]
      : definition.kind === 'task' ? ['node-open'] : [],
    blockers,
    executionSummary: {
      attemptCount: attempts.length,
      latestStatus: latest?.status ?? null,
      attempts: attempts.slice(0, 4)
    }
  }
}

function statusForNode(state: FactoryCaseState, nodeKey: string): FactoryPipelineNodeStatus {
  const findingsComplete = Object.values(state.findings).every(Boolean)
  const rejected = state.plan?.approval.status === 'rejected'
  const executionFailed = state.execution?.status === 'partial_failure'
  const needsIntervention = state.verification?.outcome === 'needs-intervention'
  switch (nodeKey) {
    case 'detect-anomaly': return 'completed'
    case 'triage-event': return state.triage ? 'completed' : 'ready'
    case 'diagnose-equipment': return state.findings.equipment ? 'completed' : state.triage ? 'ready' : 'not_started'
    case 'assess-quality-impact': return state.findings.quality ? 'completed' : state.triage ? 'ready' : 'not_started'
    case 'assess-production-impact': return state.findings.production ? 'completed' : state.triage ? 'ready' : 'not_started'
    case 'check-resource-readiness': return state.findings.resources ? 'completed' : state.triage ? 'ready' : 'not_started'
    case 'generate-recovery-plan': return state.plan ? 'completed' : findingsComplete ? 'ready' : 'not_started'
    case 'route-execution-authority': return state.plan ? 'completed' : 'not_started'
    case 'approve-recovery-plan':
      if (!state.plan) return 'not_started'
      return state.plan.approval.status === 'pending' ? 'ready' : 'completed'
    case 'route-approval-outcome': return state.plan?.approval.status === 'pending' || !state.plan ? 'not_started' : 'completed'
    case 'execute-recovery-plan':
      if (rejected) return 'not_applicable'
      if (state.execution) return state.execution.status === 'completed' ? 'satisfied_externally' : 'blocked'
      return state.plan?.approval.status === 'approved' ? 'ready' : 'not_started'
    case 'route-execution-outcome': return state.execution ? 'completed' : rejected ? 'not_applicable' : 'not_started'
    case 'verify-recovery':
      if (executionFailed || rejected) return 'not_applicable'
      if (state.verification) return 'completed'
      return state.execution?.status === 'completed' ? 'ready' : 'not_started'
    case 'route-recovery-outcome': return state.verification ? 'completed' : executionFailed || rejected ? 'not_applicable' : 'not_started'
    case 'production-recovered':
      if (state.verification?.outcome === 'recovered') return 'completed'
      return state.verification ? 'not_applicable' : 'not_started'
    case 'human-intervention-required':
      if (rejected || executionFailed || needsIntervention || state.status === 'escalated') return 'blocked'
      return state.status === 'recovered' ? 'not_applicable' : 'not_started'
    default: return 'not_started'
  }
}

function routeDecisions(state: FactoryCaseState): FactoryRouteDecision[] {
  const decisions: FactoryRouteDecision[] = []
  if (state.plan) {
    decisions.push(decision('route-execution-authority', 'execution-authority', state.plan.executionAuthority, 'recovery-plan', state.plan.artifactRevision, state.revision))
    if (state.plan.approval.status !== 'pending') {
      decisions.push(decision('route-approval-outcome', 'approval-outcome', state.plan.approval.status, 'recovery-plan', state.plan.artifactRevision, state.revision))
    }
  }
  if (state.execution) {
    decisions.push(decision(
      'route-execution-outcome',
      'execution-outcome',
      state.execution.status === 'completed' ? 'complete' : 'partial-failure',
      'execution-batch',
      state.execution.artifactRevision,
      state.revision
    ))
  }
  if (state.verification) {
    decisions.push(decision('route-recovery-outcome', 'recovery-outcome', state.verification.outcome, 'recovery-verification', state.verification.artifactRevision, state.revision))
  }
  return decisions
}

function projectEdge(
  definition: PipelineEdgeDefinition,
  nodes: Map<string, FactoryPipelineNode>,
  decisions: FactoryRouteDecision[]
): FactoryPipelineEdge {
  const source = nodes.get(definition.from)
  const target = nodes.get(definition.to)
  let state: FactoryPipelineEdge['state'] = source?.status === 'completed' || source?.status === 'satisfied_externally'
    ? 'available'
    : 'blocked'
  if (target?.status === 'not_applicable') state = 'inactive'
  if (definition.condition) {
    const selected = decisions.find((item) => item.factKey === definition.condition?.factKey)
    state = selected
      ? selected.value === definition.condition.value ? 'selected' : 'inactive'
      : state
  }
  return {
    from: definition.from,
    to: definition.to,
    state,
    label: definition.condition?.value ?? null
  }
}

function groupExecutions(records: FactoryExecutionRecordSummary[]) {
  const result = new Map<string, FactoryExecutionRecordSummary[]>()
  for (const record of records) {
    const items = result.get(record.nodeKey) ?? []
    items.push(record)
    result.set(record.nodeKey, items)
  }
  for (const items of result.values()) items.sort((left, right) => right.sequence - left.sequence)
  return result
}

function insertApprovalRouter(nodes: PipelineNodeDefinition[]) {
  const index = nodes.findIndex((node) => node.key === 'execute-recovery-plan')
  return [...nodes.slice(0, index), APPROVAL_ROUTER, ...nodes.slice(index)]
}

function task(
  key: string,
  title: string,
  laneKey: string,
  stageKey: string,
  accountableRoleKey: string,
  executionMode: NonNullable<FactoryPipelineNode['executionMode']>,
  actions?: string[]
): PipelineNodeDefinition {
  const openMode: NonNullable<FactoryPipelineNode['openMode']> = [
    'detect-anomaly',
    'approve-recovery-plan',
    'execute-recovery-plan'
  ].includes(key) ? 'dialog' : 'view'
  return {
    key,
    title,
    kind: 'task',
    laneKey,
    stageKey,
    accountableRoleKey,
    executionMode,
    openMode,
    ...(openMode === 'view' ? { workspaceKey: 'factory-case-workspace' } : {}),
    actions
  }
}

function router(key: string, title: string, stageKey: string): PipelineNodeDefinition {
  return { key, title, kind: 'router', stageKey }
}

function terminal(key: string, title: string, stageKey: string): PipelineNodeDefinition {
  return { key, title, kind: 'terminal', stageKey }
}

function lane(key: string, title: string, accountableRoleKey: string, order: number): FactoryPipelineLane {
  const definition = FACTORY_ROLE_ASSISTANTS.find((item) => item.laneKey === key)
  if (!definition) throw new Error(`Factory lane '${key}' has no independent Assistant definition.`)
  return {
    key,
    title,
    accountableRoleKey,
    order,
    assistant: {
      displayName: definition.title,
      name: definition.key,
      avatar: definition.avatar,
      avatarFallback: definition.title.slice(0, 2),
      status: 'unbound',
      templateKey: definition.key,
      primaryAgentKey: definition.agentKey,
      publishedVersion: null
    },
    recentExecutions: []
  }
}

function stage(key: string, title: string, order: number): FactoryPipelineStage {
  return { key, title, order }
}

function edge(from: string, to: string, factKey?: string, value?: string): PipelineEdgeDefinition {
  return { from, to, ...(factKey && value ? { condition: { factKey, value } } : {}) }
}

function decision(
  routerNodeKey: string,
  factKey: string,
  value: string,
  sourceArtifactKey: string,
  sourceRevision: number,
  decisionRevision: number
): FactoryRouteDecision {
  return { routerNodeKey, factKey, value, sourceArtifactKey, sourceRevision, decisionRevision }
}
