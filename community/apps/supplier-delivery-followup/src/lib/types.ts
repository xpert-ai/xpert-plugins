import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

/** Supplied by a trusted execution/View adapter, never by model or browser input. */
export type DeliveryScope = Pick<IAgentMiddlewareContext, 'tenantId' | 'organizationId' | 'userId'>
export type ReplyStatus = 'received' | 'parsing' | 'pending_review' | 'confirmed' | 'needs_followup' | 'failed'
export type ChangeType = 'delay' | 'advance' | 'unchanged' | 'partial'
export type ProposalDecision = 'pending' | 'accepted' | 'edited' | 'rejected'
export type EvidenceField = 'poNumber' | 'proposedDate' | 'proposedQuantity' | 'batches' | 'reason'
export type ParseFailureCode = 'no_delivery_info' | 'ambiguous_order' | 'unreadable' | 'other'
export interface Batch {
  quantity: number
  date: string
}
export interface Evidence {
  field: EvidenceField
  quote: string
  start: number
  end: number
}
export interface SaveProposalInput {
  replyId: string
  poNumber: string
  lineNo: number
  changeType: ChangeType
  proposedDate?: string
  proposedQuantity?: number
  batches?: Batch[]
  reason?: string
  evidence: Pick<Evidence, 'field' | 'quote'>[]
  confidence: number
}
export interface PageInput {
  page?: number
  pageSize?: number
}
export interface OrderLineSearch extends PageInput {
  poNumber?: string
  keyword?: string
  supplierName?: string
}
export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
