export type EcnAssessmentStatus =
  | 'draft'
  | 'analyzing'
  | 'ai_completed'
  | 'confirmed'
  | 'closed'

export type EcnChangeType = 'material' | 'dimension' | 'structure' | 'process' | 'other'

export type EcnRiskLevel = 'high' | 'medium' | 'low'

export type EcnImpactDomain = 'bom' | 'routing' | 'production' | 'inventory'

export type EcnImpactItemStatus = 'pending' | 'accepted' | 'rejected'

/** Tenant/organization/user context resolved from the authenticated runtime. */
export interface EcnScope {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

export interface EcnImpactItemInput {
  impactKey: string
  domain: EcnImpactDomain
  targetNo: string
  targetName?: string
  relationPath?: string
  impactDescription: string
  suggestedAction?: string
  riskLevel?: EcnRiskLevel
  confidence?: number
  evidence?: Record<string, unknown>
}

export interface EcnAssessmentCreateInput {
  /** Omit to let the service generate one; creation is idempotent per changeNo. */
  changeNo?: string
  materialNo: string
  materialName?: string
  changeType: EcnChangeType
  changeDescription: string
  changeReason?: string
  expectedEffectDate?: string
}

export interface EcnAnalysisSaveInput {
  assessmentId: string
  summary: string
  riskLevel: EcnRiskLevel
  items: EcnImpactItemInput[]
}

/* ------- Mock system gateway records (PLM / ERP / MES shapes) ------- */

export interface EcnMaterialRecord {
  materialNo: string
  name: string
  type: 'finished' | 'assembly' | 'component' | 'raw'
  specification?: string
  material?: string
  unit: string
  designVersion?: string
  status: 'released' | 'draft' | 'obsolete'
}

export interface EcnBomParentRecord {
  parentNo: string
  parentName: string
  quantityPer: number
  depth: number
  relationPath: string
  parentType: EcnMaterialRecord['type']
}

export interface EcnRoutingRecord {
  routingNo: string
  routingName: string
  materialNo: string
  materialName: string
  operations: Array<{
    opNo: number
    opName: string
    workCenter: string
    keyCharacteristic?: string
  }>
}

export interface EcnProductionOrderRecord {
  orderNo: string
  materialNo: string
  materialName: string
  quantity: number
  status: 'released' | 'started' | 'finished_unconfirmed'
  plannedStart?: string
  plannedEnd?: string
  workCenter?: string
}

export interface EcnInventoryRecord {
  materialNo: string
  materialName: string
  storageLocation: string
  type: 'on_hand' | 'in_transit' | 'quality_hold'
  quantity: number
  unit: string
  batch?: string
  designVersion?: string
}
