export type RemotePrimitive = string | number | boolean | null
export type RemoteValue = RemotePrimitive | RemoteObject | RemoteValue[] | undefined

export interface RemoteObject {
  [key: string]: RemoteValue
}

export interface HostContext {
  active?: boolean
  locale?: string
  manifest?: RemoteValue
  payload?: RemoteValue
  initialQuery?: RemoteObject
  theme?: RemoteValue
  debug?: RemoteValue
}

export type CaseStatus =
  | 'investigating'
  | 'planning'
  | 'awaiting_approval'
  | 'approved'
  | 'executing'
  | 'verifying'
  | 'recovered'
  | 'escalated'
  | 'rejected'

export interface Evidence {
  source: string
  reference: string
  observedAt: string
  summary: string
  value?: number
  unit?: string
}

export interface Finding {
  artifactRevision: number
  status: string
  summary: string
  confidence: number
  agentKey: string
  evidence: Evidence[]
  [key: string]: unknown
}

export interface RecoveryOption {
  id: 'A' | 'B' | 'C'
  title: string
  description: string
  deliveryDelayMinutes: number
  incrementalCostCny: number
  safetyRisk: 'low' | 'medium' | 'unacceptable'
  qualityRisk: 'low' | 'medium' | 'unacceptable'
  recommended: boolean
  rationale: string
}

export interface FactoryCase {
  id: string
  caseKey: string
  title?: string
  templateKey?: string
  templateVersion?: number
  revision: number
  status: CaseStatus
  currentStage: string
  workspace: {
    projectId: string
    status: 'provisioning' | 'ready' | 'failed'
    canLaunchTasks: boolean
    errorCode: string | null
  }
  event: {
    eventId: string
    deviceId: string
    deviceName: string
    lineId: string
    severity: string
    occurredAt: string
    title: string
    summary: string
    telemetry: {
      vibrationMmS: number
      bearingTemperatureC: number
      dimensionTrend: string
    }
    impactedWorkOrders: string[]
    impactedProductQuantity: number
    riskOrderCount: number
  }
  triage: Finding | null
  findings: {
    equipment: Finding | null
    quality: Finding | null
    production: Finding | null
    resources: Finding | null
  }
  plan: {
    artifactRevision: number
    status: 'proposed' | 'approved' | 'rejected'
    options: RecoveryOption[]
    recommendedOptionId: 'B'
    selectedOptionId: 'B' | null
    executionAuthority: 'approval-required'
    rationale: string
    approval: {
      status: 'pending' | 'approved' | 'rejected'
      actorId: string | null
      reason: string | null
      decidedAt: string | null
      caseRevision: number | null
    }
  } | null
  execution: {
    artifactRevision: number
    status: 'completed' | 'partial_failure'
    mode: 'simulation' | 'external'
    actions: Array<{
      key: string
      system: string
      title: string
      status: 'confirmed' | 'failed'
      externalReference: string | null
      confirmedAt: string | null
      failureCode: string | null
    }>
  } | null
  verification: {
    artifactRevision: number
    status: 'completed'
    outcome: 'recovered' | 'needs-intervention'
    verifiedAt: string
    summary: string
    evidence: Evidence[]
    confidence: number
    agentKey: string
  } | null
  timeline: Array<{
    key: string
    occurredAt: string
    title: string
    actor: string
    status: 'completed' | 'waiting' | 'failed'
  }>
  metrics: {
    responseSeconds: number | null
    recoveryMinutes: number | null
    avoidedDowntimeMinutes: number
    avoidedLossCny: number
  }
  progress: {
    completedSteps: number
    totalSteps: number
    percent: number
  }
  nextAction: string
  allowedActions: string[]
}

export type PipelineNodeStatus =
  | 'not_started'
  | 'ready'
  | 'active'
  | 'blocked'
  | 'completed'
  | 'not_applicable'
  | 'satisfied_externally'

export type AgentExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'cancelled'
  | 'superseded'

export interface ExecutionRecord {
  recordId: string
  caseId: string
  sequence: number
  attemptNumber: number
  nodeKey: string
  roleKey: string
  roleLabel: string
  agentKey: string
  status: AgentExecutionStatus
  startedAt: string
  finishedAt: string | null
  inputRevision: number
  outputRevision: number | null
  safeSummary: string
  workspaceProjectId: string
  queueJobId: string | null
  assistantTaskId: string | null
  conversationId: string | null
  threadId: string | null
  executionId: string | null
  requesterXpertId: string
  executorXpertId: string | null
  executorAgentKey: string | null
  executorAssistantTemplateKey: string | null
  executorAssistantTitle: string | null
  executorPublishedVersion: string | null
  supersededByRecordId: string | null
}

export interface PipelineLane {
  key: string
  title: string
  order: number
  accountableRoleKey: string
  assistant: {
    displayName: string
    name: string
    avatar: {
      url?: string | null
      background?: string | null
      emoji?: {
        id?: string | null
        set?: string | null
        colons?: string | null
        unified?: string | null
      } | null
      useNotoColor?: boolean
    } | null
    avatarFallback: string
    status: 'available' | 'incompatible' | 'unpublished' | 'cross_organization' | 'unbound'
    templateKey: string
    primaryAgentKey: string
    publishedVersion: string | null
  }
  recentExecutions: ExecutionRecord[]
}

export interface PipelineStage {
  key: string
  title: string
  order: number
}

export interface PipelineNode {
  key: string
  kind: 'task' | 'router' | 'terminal'
  title: string
  laneKey: string | null
  stageKey: string
  accountableRoleKey: string | null
  executionMode: 'assistant_task' | 'human' | 'system' | null
  openMode: 'dialog' | 'view' | 'component' | null
  status: PipelineNodeStatus
  workspaceKey: string | null
  authorizedActions: string[]
  blockers: Array<{
    code: string
    title: string
    ownerRoleKey: string
    since: string
    retryable: boolean
  }>
  executionSummary: {
    attemptCount: number
    latestStatus: AgentExecutionStatus | null
    attempts: ExecutionRecord[]
  }
}

export interface PipelineEdge {
  from: string
  to: string
  state: 'selected' | 'available' | 'inactive' | 'blocked'
  label: string | null
}

export interface FactoryPipelineProjection {
  case: {
    id: string
    title: string
    status: CaseStatus
    revision: number
    templateKey: string
    templateVersion: number
    context: Array<{ key: string; label: string; value: string }>
  }
  summary: { completed: number; active: number; blocked: number; pending: number }
  lanes: PipelineLane[]
  stages: PipelineStage[]
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  routeDecisions: Array<{
    routerNodeKey: string
    factKey: string
    value: string
    sourceArtifactKey: string
    sourceRevision: number
    decisionRevision: number
  }>
  executableNodeKeys: string[]
  routeRevision: number
  refreshedAt: string
}

export interface FactoryWorkbenchData {
  tableKey: 'cases'
  table: {
    key: 'cases'
    items: FactoryCase[]
    total: number
    page: number
    pageSize: number
  }
  selectedCase: FactoryCase | null
  projection: FactoryPipelineProjection | null
  selectedNodeKey: string | null
  runtimeProjectId: string | null
  simulation: boolean
}

export interface FactoryDashboardData {
  generatedAt: string
  revision: string
  kpis: Array<{
    key: string
    label: string
    value: number | null
    unit: string | null
    status: 'neutral' | 'info' | 'success' | 'warning' | 'critical'
    definition: string
  }>
  series: Array<{
    key: string
    chartIntent: 'trend' | 'comparison' | 'composition' | 'bottleneck'
    dimensions: string[]
    rows: Array<Record<string, string | number | null>>
  }>
  summary: {
    totalCases: number
    activeCases: number
    criticalCases: number
    awaitingApproval: number
    recoveredCases: number
    failedExecutions: number
    averageResponseSeconds: number | null
    averageRecoveryMinutes: number | null
    avoidedDowntimeMinutes: number
    avoidedLossCny: number
  }
  pipelineHealth: Array<{
    laneKey: string
    laneTitle: string
    ready: number
    active: number
    blocked: number
    completed: number
  }>
  cases: FactoryCase[]
  recentExecutions: ExecutionRecord[]
  simulation: boolean
  truncated: boolean
  refreshedAt: string
}
