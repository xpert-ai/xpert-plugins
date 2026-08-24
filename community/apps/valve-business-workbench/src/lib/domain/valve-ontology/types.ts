import type { ValveJsonObject } from '../../types'

export type ValveOntologyAttributeType = 'string' | 'number' | 'integer' | 'boolean' | 'datetime' | 'json'
export type ValveOntologyCardinality = 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many'
export type ValveOntologyRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface ValveOntologyAttributeDefinition {
  code: string
  name: string
  description?: string
  valueType: ValveOntologyAttributeType
  required: boolean
  repeated: boolean
}

export interface ValveOntologyEntityTypeDefinition {
  code: string
  name: string
  description?: string
  icon?: string
  color?: string
  attributes: ValveOntologyAttributeDefinition[]
  defaultStateCode?: string
}

export interface ValveOntologyRelationTypeDefinition {
  code: string
  name: string
  description?: string
  sourceEntityTypeCode: string
  targetEntityTypeCode: string
  cardinality: ValveOntologyCardinality
  attributes: ValveOntologyAttributeDefinition[]
}

export interface ValveOntologyActionTypeDefinition {
  code: string
  name: string
  description?: string
  targetEntityTypeCodes: string[]
  attributes: ValveOntologyAttributeDefinition[]
  riskLevel: ValveOntologyRiskLevel
  requiresApproval: boolean
  discoveryMode: 'manual_only' | 'suggestable' | 'auto_plannable' | 'auto_executable'
  intentTags: string[]
  preconditions: string[]
  inputHint: string
  inputSchema: { required: string[]; properties: Record<string, unknown> }
  effects: Array<{ type: 'read' | 'analysis' | 'state_transition' | 'external_call'; target: string }>
  idempotencyRequired: boolean
  expectedEffectRequired: boolean
}

export interface ValveOntologyManifest {
  adapterId: string
  version: { semanticVersion: string; notes: string }
  entityTypes: ValveOntologyEntityTypeDefinition[]
  relationTypes: ValveOntologyRelationTypeDefinition[]
  actionTypes: ValveOntologyActionTypeDefinition[]
  states: Array<{ code: string; name: string; description?: string }>
  rules: []
  metrics: []
  policies: []
}

export interface ValveOntologyEntityInput {
  entityTypeCode: string
  externalKey: string
  displayName?: string
  currentStateCode?: string
  attributes: ValveJsonObject
  aliases?: string[]
  evidence?: ValveJsonObject
  provenance?: Array<{ ref: string; source?: 'manifest' | 'resource_schema' | 'resource_instance' | 'derived'; evidence?: ValveJsonObject }>
}

export interface ValveOntologyRelationInput {
  relationTypeCode: string
  source: { entityTypeCode: string; externalKey: string }
  target: { entityTypeCode: string; externalKey: string }
  attributes?: ValveJsonObject
  evidence?: ValveJsonObject
  provenance?: Array<{ ref: string; source?: 'manifest' | 'resource_schema' | 'resource_instance' | 'derived'; evidence?: ValveJsonObject }>
}

export type ValveOntologyInitializationState =
  | 'unconfigured'
  | 'missing'
  | 'draft'
  | 'outdated'
  | 'publishing'
  | 'failed'
  | 'current'

export interface ValveOntologyInitializationStatus {
  apiConfigured: boolean
  state: ValveOntologyInitializationState
  resourceId: string
  semanticVersion: string
  baseIri: string
  definitionId?: string
  draftRevision?: number
  publishedRevision?: number | null
  currentVersionNo?: number
  currentSemanticVersion?: string
  versionStatus?: 'publishing' | 'published' | 'failed'
  updatedAt?: string
  publishedAt?: string | null
  counts: { entityTypes: number; relationTypes: number; actionTypes: number; instances: number; relations: number }
}

export interface ValveOntologyInitializationResult {
  changed: boolean
  operation: 'already_current' | 'created_and_published' | 'updated_and_published'
  status: ValveOntologyInitializationStatus
  definitionId: string
  versionNo: number
  semanticVersion: string
  snapshotId: string
  graphVersion: string
  ontologyId: string
}
