export interface HostContext {
  manifest?: { key?: string }
  payload?: unknown
  initialQuery?: { search?: string; parameters?: Record<string, unknown> }
  locale?: string
  theme?: {
    mode?: 'light' | 'dark'
    density?: 'default' | 'compact'
    tokens?: Record<string, string | number>
  }
}

export interface ResourceSummary {
  resourceId: string
  displayName: string
  description?: string | null
  snapshotId?: string | null
  graphVersion?: string | null
  sourceVersion?: string | null
  updatedAt: string
  rootEntityTypeCode: string
}

export type OntologyInitializationState =
  | 'unconfigured'
  | 'missing'
  | 'draft'
  | 'outdated'
  | 'publishing'
  | 'failed'
  | 'current'

export interface OntologyInitializationStatus {
  apiConfigured: boolean
  state: OntologyInitializationState
  resourceId: string
  semanticVersion: string
  baseIri: string
  definitionId?: string
  draftRevision?: number
  currentVersionNo?: number
  currentSemanticVersion?: string
  versionStatus?: 'publishing' | 'published' | 'failed'
  counts: { entityTypes: number; relationTypes: number; actionTypes: number; instances: number; relations: number }
}

export interface SchemaSummary {
  resourceId: string
  snapshotId: string
  graphVersion: string
  ontologyId: string
  rootEntityTypeCode: string
  entityTypes: Array<{ code: string; name: string; aliases: string[]; attributeCodes: string[] }>
  relationTypes: Array<{
    code: string
    name: string
    sourceEntityTypeCode: string
    targetEntityTypeCode: string
    cardinality: string
  }>
  actionTypes: Array<{ code: string; name: string; targetEntityTypeCodes: string[]; intentTags: string[] }>
}

export interface ObjectSummary {
  entityId: string
  entityTypeCode: string
  externalKey: string
  label: string
  score: number
  snapshotId?: string | null
  graphVersion?: string | null
  partitionKey?: string | null
  attributes: Record<string, unknown>
  constraintRefs: string[]
  evidence: Record<string, unknown>
}

export interface Object360 {
  resourceId: string
  snapshotId: string
  graphVersion: string
  ontologyId: string
  partitionKey?: string | null
  entity: Omit<ObjectSummary, 'score' | 'snapshotId' | 'graphVersion' | 'partitionKey'>
  relationGroups: Array<{
    relationTypeCode: string
    direction: 'outbound' | 'inbound'
    items: Array<{
      relationId: string
      relatedEntityId: string
      relatedEntityTypeCode: string
      relatedEntityExternalKey: string
      relatedEntityLabel: string
      attributes: Record<string, unknown>
    }>
  }>
  relatedObjects: Array<Omit<ObjectSummary, 'score' | 'snapshotId' | 'graphVersion' | 'partitionKey'>>
  constraints: Array<{ code: string; summary: string; severity: 'error' | 'warning'; shapeRef?: string }>
  evidence: Record<string, unknown>
  availableActions: Array<{
    code: string
    name: string
    description?: string
    riskLevel?: string
    requiresApproval?: boolean
    intentTags: string[]
    inputHint?: string
  }>
}

export interface ActionDescriptor {
  code: string
  name: string
  description: string
  scenario: string
  source: 'ontology' | 'demo'
  ontologyDefined: boolean
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  requiresApproval: boolean
  executionMode: 'internal' | 'mock_external' | 'simulation_only'
  targetSystem: string
  intentTags: string[]
  inputHint?: string
  inputFields: Array<{
    key: string
    label: string
    type: 'string' | 'number' | 'boolean' | 'date'
    required: boolean
    description?: string
    defaultValue?: string | number | boolean | null
  }>
  preconditions: string[]
  expectedEffects: string[]
  available: boolean
  blockingReasons: string[]
  demoDefaults: Record<string, unknown>
}

export type ProposalStatus = 'pending_review' | 'approved' | 'rejected' | 'completed' | 'failed'

export interface Proposal {
  id: string
  operationId: string
  resourceId: string
  snapshotId: string
  graphVersion: string
  entityId: string
  entityLabel: string
  kind: 'ontology_action' | 'engineering_review'
  actionTypeCode?: string | null
  title: string
  summary: string
  expectedEffects: string[]
  evidence?: Record<string, unknown>
  actionInput: Record<string, unknown>
  status: ProposalStatus
  reviewComment?: string | null
  outcome?: string | null
  createdAt: string
  updatedAt: string
}

export interface AuditEvent {
  id: string
  proposalId?: string | null
  eventType: string
  fromStatus?: ProposalStatus | null
  toStatus?: ProposalStatus | null
  actorId?: string | null
  comment?: string | null
  payload?: Record<string, unknown> | null
  createdAt: string
  source: 'workbench' | 'data-xpert'
}

export interface BridgeMessage {
  channel?: string
  protocolVersion?: number
  instanceId?: string
  requestId?: string
  type?: string
  manifest?: HostContext['manifest']
  payload?: unknown
  initialQuery?: HostContext['initialQuery']
  locale?: string
  theme?: HostContext['theme']
  data?: unknown
  result?: unknown
  message?: string
}

declare global {
  interface Window {
    React: typeof import('react')
    ReactDOM: typeof import('react-dom') & {
      createRoot?: (container: Element | DocumentFragment | null) => { render(node: import('react').ReactNode): void }
    }
    __valveWorkbenchReload?: () => void
  }
}
