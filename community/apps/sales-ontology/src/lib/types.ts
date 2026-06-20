export type SalesOntologyRunType = 'perception' | 'reasoning' | 'insight' | 'suggestion' | 'action' | 'scenario' | 'learning' | 'effect'
export type SalesOntologyRunStatus = 'pending' | 'running' | 'completed' | 'failed'
export type SalesOntologySuggestionStatus = 'active' | 'accepted' | 'dismissed' | 'converted'
export type SalesOntologyActionProposalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'
export type SalesOntologyPriority = 'low' | 'medium' | 'high' | 'critical'

export interface SalesOntologyScope {
  tenantId?: string
  organizationId?: string | null
  userId?: string
  assistantId?: string
  conversationId?: string
}

export interface SalesOntologyEvidence {
  source?: string
  title?: string
  text?: string
  url?: string
  page?: string | number
  confidence?: number
  metadata?: Record<string, unknown>
}

export interface SalesOntologyPublishInput {
  resourceId?: string
  manifest?: SalesOntologyManifest
  entities?: SalesOntologyEntityInput[]
  relations?: SalesOntologyRelationInput[]
  actions?: SalesOntologyActionInput[]
  syncMode?: 'replace_snapshot' | 'merge'
}

export interface SalesOntologyManifest {
  adapterId: string
  version: {
    semanticVersion: string
    releasedAt?: string
    notes?: string
  }
  entityTypes: SalesOntologyEntityType[]
  relationTypes: SalesOntologyRelationType[]
  actionTypes: SalesOntologyActionType[]
  states: Array<{ code: string; name: string; description?: string }>
  rules: Array<{ code: string; name: string; expression: string; description?: string }>
  metrics: Array<{ code: string; name: string; unit?: string; description?: string }>
  policies: Array<{ code: string; name: string; effect: string; condition: string; description?: string }>
}

export interface SalesOntologyEntityType {
  code: string
  name: string
  description?: string
  defaultStateCode?: string
  attributes?: SalesOntologyAttribute[]
}

export interface SalesOntologyRelationType {
  code: string
  name: string
  description?: string
  sourceEntityTypeCode: string
  targetEntityTypeCode: string
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_many'
  attributes?: SalesOntologyAttribute[]
}

export interface SalesOntologyActionType {
  code: string
  name: string
  description?: string
  targetEntityTypeCodes: string[]
  attributes?: SalesOntologyAttribute[]
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  requiresApproval?: boolean
  discoveryMode?: 'manual_only' | 'suggestable' | 'auto_plannable' | 'auto_executable'
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

export interface SalesOntologyAttribute {
  code: string
  name: string
  valueType: 'string' | 'number' | 'integer' | 'boolean' | 'datetime' | 'json'
  description?: string
  required?: boolean
  repeated?: boolean
}

export interface SalesOntologyEntityRef {
  entityTypeCode: string
  externalKey: string
}

export interface SalesOntologyEntityInput extends SalesOntologyEntityRef {
  label?: string
  displayName?: string | null
  currentStateCode?: string
  attributes?: Record<string, unknown>
  evidence?: Record<string, unknown>
  provenance?: SalesOntologyEvidence[]
}

export interface SalesOntologyRelationInput {
  relationTypeCode: string
  source: SalesOntologyEntityRef
  target: SalesOntologyEntityRef
  attributes?: Record<string, unknown>
  provenance?: SalesOntologyEvidence[]
}

export interface SalesOntologyActionInput {
  actionTypeCode: string
  actionRef?: string
  target?: SalesOntologyEntityRef
  entity?: SalesOntologyEntityRef
  status?: string
  payload?: Record<string, unknown>
  result?: Record<string, unknown>
  inputPayload?: Record<string, unknown>
  resultPayload?: Record<string, unknown>
  evidence?: Record<string, unknown>
  provenance?: SalesOntologyEvidence[]
  occurredAt?: string
}

export interface SalesOntologyObjectSummary {
  externalKey: string
  label?: string
  state?: string
  objectType?: string
  domain?: string
  properties: Record<string, unknown>
  attributes: Record<string, unknown>
  provenance?: SalesOntologyEvidence[]
}
