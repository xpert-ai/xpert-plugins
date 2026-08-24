export type ValveJsonPrimitive = string | number | boolean | null
export type ValveJsonValue = ValveJsonPrimitive | ValveJsonValue[] | ValveJsonObject
export interface ValveJsonObject {
  [key: string]: ValveJsonValue
}

export interface ValveActorScope {
  tenantId?: string
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
  actorTokenProvider?: (() => Promise<string>) | null
}

export interface ValveResourceSummary {
  resourceId: string
  displayName: string
  description?: string | null
  definitionResourceId?: string | null
  snapshotId?: string | null
  graphVersion?: string | null
  sourceVersion?: string | null
  updatedAt: string
  rootEntityTypeCode: string
}

export interface ValveEntityTypeSummary {
  code: string
  name: string
  aliases: string[]
  attributeCodes: string[]
}

export interface ValveSchemaSummary {
  resourceId: string
  snapshotId: string
  graphVersion: string
  ontologyId: string
  rootEntityTypeCode: string
  entityTypes: ValveEntityTypeSummary[]
  relationTypes: Array<{
    code: string
    name: string
    sourceEntityTypeCode: string
    targetEntityTypeCode: string
    cardinality: string
  }>
  actionTypes: Array<{
    code: string
    name: string
    targetEntityTypeCodes: string[]
    intentTags: string[]
  }>
}

export interface ValveObjectSummary {
  entityId: string
  entityTypeCode: string
  externalKey: string
  label: string
  score: number
  snapshotId?: string | null
  graphVersion?: string | null
  partitionKey?: string | null
  attributes: ValveJsonObject
  constraintRefs: string[]
  evidence: ValveJsonObject
}

export interface ValveRelationGroup {
  relationTypeCode: string
  direction: 'outbound' | 'inbound'
  items: Array<{
    relationId: string
    relatedEntityId: string
    relatedEntityTypeCode: string
    relatedEntityExternalKey: string
    relatedEntityLabel: string
    attributes: ValveJsonObject
  }>
}

export interface ValveObject360 {
  resourceId: string
  snapshotId: string
  graphVersion: string
  ontologyId: string
  partitionKey?: string | null
  entity: Omit<ValveObjectSummary, 'score' | 'snapshotId' | 'graphVersion' | 'partitionKey'>
  relationGroups: ValveRelationGroup[]
  relatedObjects: Array<Omit<ValveObjectSummary, 'score' | 'snapshotId' | 'graphVersion' | 'partitionKey'>>
  constraints: Array<{ code: string; summary: string; severity: 'error' | 'warning'; shapeRef?: string }>
  evidence: ValveJsonObject
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

export type ValveProposalKind = 'ontology_action' | 'engineering_review'
export type ValveProposalStatus = 'pending_review' | 'approved' | 'rejected' | 'completed' | 'failed'
export type ValveActionRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ValveActionExecutionMode = 'internal' | 'mock_external' | 'simulation_only'
export type ValveActionSource = 'ontology' | 'demo'

export interface ValveActionInputField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'date'
  required: boolean
  description?: string
  defaultValue?: ValveJsonPrimitive
}

export interface ValveActionDescriptor {
  code: string
  name: string
  description: string
  scenario: string
  source: ValveActionSource
  ontologyDefined: boolean
  riskLevel: ValveActionRiskLevel
  requiresApproval: boolean
  executionMode: ValveActionExecutionMode
  targetSystem: string
  intentTags: string[]
  inputHint?: string
  inputFields: ValveActionInputField[]
  preconditions: string[]
  expectedEffects: string[]
  available: boolean
  blockingReasons: string[]
  demoDefaults: ValveJsonObject
}

export interface ValveActionPreflight {
  resourceId: string
  snapshotId: string
  graphVersion: string
  entityId: string
  externalKey: string
  action: ValveActionDescriptor
  allowed: boolean
  blockingReasons: string[]
  warnings: string[]
  normalizedInput: ValveJsonObject
  predictedEffects: string[]
  checkedAt: string
}

export interface ValveDemoExecutionReceipt {
  executionId: string
  proposalId: string
  actionTypeCode: string
  status: 'completed' | 'failed'
  executionMode: ValveActionExecutionMode
  targetSystem: string
  externalReference?: string
  message: string
  effects: string[]
  simulationOnly: boolean
  replayed: boolean
  completedAt: string
}

export interface ValveActionProposalDto {
  id: string
  operationId: string
  resourceId: string
  snapshotId: string
  graphVersion: string
  partitionKey?: string | null
  entityId: string
  entityTypeCode: string
  externalKey: string
  entityLabel: string
  kind: ValveProposalKind
  actionTypeCode?: string | null
  title: string
  summary: string
  expectedEffects: string[]
  evidence: ValveJsonObject
  actionInput: ValveJsonObject
  status: ValveProposalStatus
  reviewComment?: string | null
  outcome?: string | null
  createdBy?: string | null
  reviewedBy?: string | null
  completedBy?: string | null
  createdAt: string
  updatedAt: string
}

export interface ValveDecisionAuditEventDto {
  id: string
  proposalId?: string | null
  eventType: string
  fromStatus?: ValveProposalStatus | null
  toStatus?: ValveProposalStatus | null
  actorId?: string | null
  comment?: string | null
  payload?: ValveJsonObject | null
  createdAt: string
  source: 'workbench' | 'data-xpert'
}

export interface ValveAssistantContextV1 {
  version: 1
  resourceId: string
  snapshotId: string
  graphVersion: string
  partitionKey?: string | null
  entityId: string
  entityTypeCode: string
  externalKey: string
  label: string
}

export interface ValveToolResult<T> {
  ok: boolean
  code: string
  message: string
  data?: T
}

export interface ValveCreateProposalInput {
  operationId: string
  resourceId: string
  partitionKey?: string
  target: { entityId?: string; entityTypeCode?: string; entityRef?: string }
  kind: ValveProposalKind
  actionTypeCode?: string
  title: string
  summary: string
  expectedEffects?: string[]
  evidence?: ValveJsonObject
  actionInput?: ValveJsonObject
  expectedGraphVersion?: string
}
