export const FACTORY_FINDING_KINDS = [
  'equipment',
  'quality',
  'production',
  'resources'
] as const

export type FactoryFindingKind = (typeof FACTORY_FINDING_KINDS)[number]
export type FactoryCaseStatus =
  | 'investigating'
  | 'planning'
  | 'awaiting_approval'
  | 'approved'
  | 'executing'
  | 'verifying'
  | 'recovered'
  | 'escalated'
  | 'rejected'

export type FactorySeverity = 'medium' | 'high' | 'critical'
export type EvidenceSource = 'iot' | 'mes' | 'qms' | 'cmms' | 'wms' | 'aps' | 'erp' | 'rule'

export interface FactoryScope {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
  threadId?: string | null
  executionId?: string | null
  agentKey?: string | null
  actorType: 'agent' | 'user' | 'system'
}

export interface EvidenceRecord {
  source: EvidenceSource
  reference: string
  observedAt: string
  summary: string
  value?: number
  unit?: string
}

export interface AnomalyEvent {
  eventId: string
  deviceId: string
  deviceName: string
  lineId: string
  category: 'equipment_failure'
  severity: FactorySeverity
  status: 'open' | 'closed'
  occurredAt: string
  title: string
  summary: string
  telemetry: {
    vibrationMmS: number
    bearingTemperatureC: number
    dimensionTrend: 'stable' | 'approaching_limit' | 'out_of_limit'
  }
  impactedWorkOrders: string[]
  impactedProductQuantity: number
  riskOrderCount: number
}

export interface FactoryAnalysisFacts {
  triage: {
    severity: FactorySeverity
    summary: string
    confidence: number
    evidence: EvidenceRecord[]
  }
  equipment: {
    failureMode: string
    remainingSafeMinutes: number
    recommendation: EquipmentFinding['recommendation']
    summary: string
    confidence: number
    evidence: EvidenceRecord[]
  }
  quality: {
    affectedQuantity: number
    isolationWindowMinutes: number
    recommendation: QualityFinding['recommendation']
    summary: string
    confidence: number
    evidence: EvidenceRecord[]
  }
  production: {
    impactedWorkOrderCount: number
    riskOrderCount: number
    estimatedDelayMinutes: number
    alternateLineId: string | null
    changeoverMinutes: number
    incrementalCostCny: number
    summary: string
    confidence: number
    evidence: EvidenceRecord[]
  }
  resources: {
    spareSku: string
    spareAvailability: ResourceFinding['spareAvailability']
    spareQuantity: number
    deliveryMinutes: number
    qualifiedEngineerAvailable: boolean
    summary: string
    confidence: number
    evidence: EvidenceRecord[]
  }
}

export interface TriageAssessment {
  artifactRevision: number
  status: 'confirmed'
  severity: FactorySeverity
  summary: string
  confidence: number
  evidence: EvidenceRecord[]
  agentKey: string
}

export interface EquipmentFinding {
  artifactRevision: number
  status: 'completed'
  failureMode: string
  remainingSafeMinutes: number
  recommendation: 'stop_immediately' | 'controlled_shutdown' | 'monitor'
  summary: string
  confidence: number
  evidence: EvidenceRecord[]
  agentKey: string
}

export interface QualityFinding {
  artifactRevision: number
  status: 'completed'
  affectedQuantity: number
  isolationWindowMinutes: number
  recommendation: 'isolate_and_reinspect' | 'sample_inspection' | 'release'
  summary: string
  confidence: number
  evidence: EvidenceRecord[]
  agentKey: string
}

export interface ProductionFinding {
  artifactRevision: number
  status: 'completed'
  impactedWorkOrderCount: number
  riskOrderCount: number
  estimatedDelayMinutes: number
  alternateLineId: string | null
  changeoverMinutes: number
  incrementalCostCny: number
  summary: string
  confidence: number
  evidence: EvidenceRecord[]
  agentKey: string
}

export interface ResourceFinding {
  artifactRevision: number
  status: 'completed'
  spareSku: string
  spareAvailability: 'available' | 'unavailable'
  spareQuantity: number
  deliveryMinutes: number
  qualifiedEngineerAvailable: boolean
  summary: string
  confidence: number
  evidence: EvidenceRecord[]
  agentKey: string
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

export interface RecoveryPlan {
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
}

export interface RecoveryAction {
  key: string
  system: 'MES' | 'CMMS' | 'WMS' | 'AGV' | 'APS' | 'QMS' | 'ERP'
  title: string
  status: 'confirmed' | 'failed'
  externalReference: string | null
  confirmedAt: string | null
  failureCode: string | null
}

export interface RecoveryExecution {
  artifactRevision: number
  status: 'completed' | 'partial_failure'
  mode: 'simulation' | 'external'
  startedAt: string
  completedAt: string
  actions: RecoveryAction[]
}

export interface RecoveryVerification {
  artifactRevision: number
  status: 'completed'
  outcome: 'recovered' | 'needs-intervention'
  verifiedAt: string
  summary: string
  evidence: EvidenceRecord[]
  confidence: number
  agentKey: string
}

export interface FactoryTimelineEvent {
  key: string
  occurredAt: string
  title: string
  actor: string
  status: 'completed' | 'waiting' | 'failed'
}

export interface FactoryCaseState {
  id: string
  caseKey: string
  templateKey: 'factory_anomaly_recovery'
  templateVersion: 1 | 2 | 3
  revision: number
  status: FactoryCaseStatus
  currentStage: string
  event: AnomalyEvent
  analysisFacts: FactoryAnalysisFacts
  triage: TriageAssessment | null
  findings: {
    equipment: EquipmentFinding | null
    quality: QualityFinding | null
    production: ProductionFinding | null
    resources: ResourceFinding | null
  }
  plan: RecoveryPlan | null
  execution: RecoveryExecution | null
  verification: RecoveryVerification | null
  timeline: FactoryTimelineEvent[]
  metrics: {
    responseSeconds: number | null
    recoveryMinutes: number | null
    avoidedDowntimeMinutes: number
    avoidedLossCny: number
  }
}

export interface FactoryCaseSummary {
  id: string
  caseKey: string
  title: string
  templateKey: FactoryCaseState['templateKey']
  templateVersion: FactoryCaseState['templateVersion']
  revision: number
  status: FactoryCaseStatus
  currentStage: string
  workspace: {
    projectId: string
    status: 'provisioning' | 'ready' | 'failed'
    canLaunchTasks: boolean
    errorCode: string | null
  }
  event: AnomalyEvent
  analysisFacts: FactoryAnalysisFacts
  triage: TriageAssessment | null
  findings: FactoryCaseState['findings']
  plan: RecoveryPlan | null
  execution: RecoveryExecution | null
  verification: RecoveryVerification | null
  timeline: FactoryTimelineEvent[]
  metrics: FactoryCaseState['metrics']
  progress: {
    completedSteps: number
    totalSteps: number
    percent: number
  }
  nextAction: string
  allowedActions: string[]
}

export type FactoryPipelineNodeStatus =
  | 'not_started'
  | 'ready'
  | 'active'
  | 'blocked'
  | 'completed'
  | 'not_applicable'
  | 'satisfied_externally'

export type FactoryAgentExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'cancelled'
  | 'superseded'

export interface FactoryExecutionRecordSummary {
  recordId: string
  caseId: string
  sequence: number
  attemptNumber: number
  nodeKey: string
  roleKey: string
  roleLabel: string
  agentKey: string
  status: FactoryAgentExecutionStatus
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

export interface FactoryPipelineLane {
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
  recentExecutions: FactoryExecutionRecordSummary[]
}

export interface FactoryPipelineStage {
  key: string
  title: string
  order: number
}

export interface FactoryPipelineBlocker {
  code: string
  title: string
  ownerRoleKey: string
  since: string
  retryable: boolean
}

export interface FactoryPipelineNode {
  key: string
  kind: 'task' | 'router' | 'terminal'
  title: string
  laneKey: string | null
  stageKey: string
  accountableRoleKey: string | null
  executionMode: 'assistant_task' | 'human' | 'system' | null
  openMode: 'dialog' | 'view' | 'component' | null
  status: FactoryPipelineNodeStatus
  workspaceKey: string | null
  authorizedActions: string[]
  blockers: FactoryPipelineBlocker[]
  executionSummary: {
    attemptCount: number
    latestStatus: FactoryAgentExecutionStatus | null
    attempts: FactoryExecutionRecordSummary[]
  }
}

export interface FactoryPipelineEdge {
  from: string
  to: string
  state: 'selected' | 'available' | 'inactive' | 'blocked'
  label: string | null
}

export interface FactoryRouteDecision {
  routerNodeKey: string
  factKey: string
  value: string
  sourceArtifactKey: string
  sourceRevision: number
  decisionRevision: number
}

export interface FactoryPipelineProjection {
  case: {
    id: string
    title: string
    status: FactoryCaseStatus
    revision: number
    templateKey: FactoryCaseState['templateKey']
    templateVersion: FactoryCaseState['templateVersion']
    context: Array<{ key: string; label: string; value: string }>
  }
  summary: {
    completed: number
    active: number
    blocked: number
    pending: number
  }
  lanes: FactoryPipelineLane[]
  stages: FactoryPipelineStage[]
  nodes: FactoryPipelineNode[]
  edges: FactoryPipelineEdge[]
  routeDecisions: FactoryRouteDecision[]
  executableNodeKeys: string[]
  routeRevision: number
  refreshedAt: string
}

export interface FactoryManagementDashboard {
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
  cases: FactoryCaseSummary[]
  recentExecutions: FactoryExecutionRecordSummary[]
  simulation: boolean
  truncated: boolean
  refreshedAt: string
}

export interface FactoryMutationReceipt {
  success: true
  duplicate: boolean
  operationId: string
  caseId: string
  previousRevision: number | null
  revision: number
  status: FactoryCaseStatus
  changedArtifact: string
  rebasedFromRevision: number | null
  nextAction: string
}
