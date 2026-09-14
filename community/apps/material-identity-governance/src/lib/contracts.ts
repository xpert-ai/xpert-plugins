export type RoleKey =
  | 'coordinator'
  | 'intake'
  | 'engineering'
  | 'standardization'
  | 'quality'
  | 'impact'
  | 'governance'
  | 'publisher'
export type CaseKind = 'duplicate_codes' | 'code_collision' | 'drawing_request'
export type CaseStatus =
  | 'open'
  | 'active'
  | 'blocked'
  | 'review_required'
  | 'approved'
  | 'completed'
  | 'rejected'
export type NodeStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'skipped'
export type ExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
export type Relation =
  | 'same_identity'
  | 'local_alias'
  | 'substitute'
  | 'revision_successor'
  | 'different'
  | 'uncertain'
export interface Scope {
  tenantId: string
  organizationId: string
  userId: string
}
export interface Evidence {
  id: string
  system: string
  reference: string
  field: string
  value: string
  excerpt: string
  observedAt: string
  page?: number
}
export interface Attribute {
  key: string
  label: string
  value: string
  unit: string | null
  critical: boolean
  evidenceIds: string[]
}
export interface SourceMaterial {
  id: string
  system: string
  plant: string
  code: string
  name: string
  category: string
  drawing: string
  revision: string
  attributes: Attribute[]
  supplier: string
  quantity: number
  unitCost: number
}
export interface Difference {
  key: string
  label: string
  source: string
  candidate: string
  result: 'match' | 'conflict' | 'missing'
  critical: boolean
}
export interface Candidate {
  id: string
  code: string
  name: string
  relation: Relation
  score: number
  hardFilterPassed: boolean
  differences: Difference[]
  evidenceIds: string[]
  rationale: string
}
export interface Impact {
  system: string
  reference: string
  type: 'bom' | 'inventory' | 'purchase' | 'quality'
  description: string
  quantity: number
  amount: number
  action: string
}
export interface Proposal {
  revision: number
  operation:
    | 'map_aliases'
    | 'split_identity'
    | 'reuse_existing'
    | 'new_identity'
  summary: string
  goldenIds: string[]
  mappings: {
    sourceId: string
    localCode: string
    plant: string
    goldenId: string
    relation: Relation
  }[]
  safeguards: string[]
  evidenceIds: string[]
  confidence?: number
}
export interface Approval {
  proposalRevision: number
  decision: 'approved' | 'rejected'
  actor: string
  reason: string
  at: string
}
export interface Publication {
  system: string
  operationId: string
  status: 'confirmed' | 'failed'
  externalReference: string | null
  errorCode: string | null
  at: string
}
export interface Artifact {
  key: string
  revision: number
  status: 'accepted' | 'failed'
  roleKey: RoleKey
  summary: string
  evidenceIds: string[]
  at: string
}
export interface DrawingDocument {
  id: string
  sourceId: string
  title: string
  mediaType: 'image/svg+xml'
  content: string
  sha256: string
}
export interface GovernanceCase {
  id: string
  caseKey: string
  title: string
  kind: CaseKind
  status: CaseStatus
  revision: number
  templateKey: string
  templateVersion: number
  createdAt: string
  updatedAt: string
  materials: SourceMaterial[]
  drawings: DrawingDocument[]
  sourceSnapshotHash: string
  evidence: Evidence[]
  candidates: Candidate[]
  impacts: Impact[]
  artifacts: Artifact[]
  criticalConflict: boolean | null
  proposal: Proposal | null
  approval: Approval | null
  publications: Publication[]
  mockMode: true
}
export interface ExecutionRecord {
  id: string
  organizationId: string
  caseId: string
  nodeKey: string
  roleKey: RoleKey
  attempt: number
  sequence: number
  status: ExecutionStatus
  taskId: string | null
  conversationId: string | null
  threadId: string | null
  executionId: string | null
  inputRevision: number
  outputRevision: number | null
  startedAt: string
  finishedAt: string | null
  safeSummary: string
  supersededById: string | null
}
export interface AssistantProfile {
  displayName: string
  templateKey: string
  primaryAgentKey: string
  avatarUrl: string | null
  avatarEmoji?: string
  available: boolean
}
export interface Lane {
  key: RoleKey
  title: string
  order: number
  assistant: AssistantProfile
  executions: ExecutionRecord[]
}
export interface Stage {
  key: string
  title: string
  order: number
}
export interface FlowNode {
  key: string
  title: string
  kind: 'task' | 'router' | 'terminal'
  laneKey: RoleKey
  stageKey: string
  order: number
  openMode: 'dialog' | 'view'
  executionMode: 'assistant_task' | 'human' | 'system'
  status: NodeStatus
  executable: boolean
  summary: string
  artifactKey: string | null
  executions: ExecutionRecord[]
}
export interface FlowEdge {
  from: string
  to: string
  outcome: string | null
  state: 'selected' | 'pending' | 'skipped'
}
export interface FlowProjection {
  caseId: string
  revision: number
  lanes: Lane[]
  stages: Stage[]
  nodes: FlowNode[]
  edges: FlowEdge[]
  executableNodeKeys: string[]
  completed: number
  total: number
  blocker: string | null
}
export interface DashboardProjection {
  generatedAt: string
  total: number
  active: number
  reviewRequired: number
  completed: number
  conflictCount: number
  exposure: number
  categories: { key: CaseKind; count: number; caseIds: string[] }[]
  roleQueues: {
    roleKey: RoleKey
    ready: number
    running: number
    completed: number
  }[]
}
export interface CaseListItem {
  id: string
  caseKey: string
  title: string
  kind: CaseKind
  status: CaseStatus
  revision: number
  updatedAt: string
}
export type Surface = 'dashboard' | 'pipeline' | 'workspace'
export interface WorkbenchData {
  surface: Surface
  table: {
    items: CaseListItem[]
    total: number
    page: number
    pageSize: number
  }
  selectedCase: GovernanceCase | null
  flow: FlowProjection | null
  dashboard: DashboardProjection
  canManage: boolean
  canApprove: boolean
  canCreate?: boolean
  simulation: true
  projectStatus?: 'pending' | 'ready' | 'failed' | null
  coordinatorExecutions?: ExecutionRecord[]
}
export interface ActionInput {
  caseId?: string
  nodeKey?: string
  kind?: CaseKind
  title?: string
  expectedRevision?: number
  operationId: string
  decision?: 'approved' | 'rejected'
  reason?: string
}
export interface ActionReceipt {
  success: boolean
  code: string
  caseId?: string
  revision?: number
  recordId?: string
  message?: string
}
export interface ViewQuery {
  selectionId?: string
  page?: number
  pageSize?: number
  search?: string
  parameters?: { surface?: Surface; status?: string; nodeKey?: string }
}
