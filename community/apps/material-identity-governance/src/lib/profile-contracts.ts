import type { CaseKind, CaseStatus, ExecutionStatus, NodeStatus, Proposal, RoleKey, Evidence, SourceMaterial } from './contracts.js'
export type ProfileMode = 'recent' | 'attention'
export interface MaterialProfileCase {
  id: string
  caseKey: string
  title: string
  kind: CaseKind
  status: CaseStatus
  revision: number
  updatedAt: string
  completedTasks: number
  totalTasks: number
  tasks: { key: string; title: string; status: NodeStatus }[]
  latestActivity: { summary: string; at: string; status: ExecutionStatus } | null
  facts: { sources: number; drawings: number; conflicts: number; exposure: number; publications: number }
  allowedActions: ('approve' | 'reject')[]
}
export interface MaterialProfileDetail {
  case: MaterialProfileCase
  proposal: Proposal | null
  materials: Pick<SourceMaterial, 'code' | 'name' | 'plant' | 'drawing' | 'revision'>[]
  evidence: Evidence[]
}
export interface MaterialProfileData {
  role: RoleKey
  mode: ProfileMode
  items: MaterialProfileCase[]
  total: number
  page: number
  pageSize: number
  selected: MaterialProfileDetail | null
  simulation: true
  workspaceViewKey: string
}
export interface ProfileDecision {
  caseId: string
  expectedRevision: number
  operationId: string
  decision: 'approved' | 'rejected'
  reason: string
}
