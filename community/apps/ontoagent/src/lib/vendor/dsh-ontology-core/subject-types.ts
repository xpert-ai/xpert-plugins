/**
 * 通用 agent 主体协议的类型（ADR-0012 §4）。
 * 纯类型与输入形状：无 IO、无时钟、无随机；角色不进入主体或授权。
 */
import type { BaseVersion, Delta, Evidence, Finding, Packet } from './types.js'

/** 协议默认转交深度上限：防止原样转交链无限放大上下文与审计成本。 */
export const DEFAULT_MAX_FORWARD_DEPTH = 8

/** 认证主体。角色标签不在主体对象里 —— 它只能出现在 provenance。 */
export interface AgentSubject {
  subjectId: string
  /** 认证态派生的 principal；用于 usr: 命名空间，不参与本体裁定 */
  principal?: string
}

/** 宿主显式授权。能力是协议共享的，能不能用由这份记录决定。 */
export interface SubjectGrant {
  subjectId: string
  /** 最小可见范围（可含前缀，如 task:T1、gov:） */
  visibleScopes: string[]
  /** 可提交 candidate Delta / proposal 的目标 scope */
  proposableScopes: string[]
  /** false = 该主体只能接收与返回，不转交（默认允许） */
  canForward?: boolean
  /** 该主体的转交深度上限（协议另有全局上限） */
  maxForwardDepth?: number
}

export type TransferMode = 'origin' | 'forward' | 'derived'

/** 转交链。角色只在这里出现，任何判定都不得读取。 */
export interface TransferProvenance {
  mode: TransferMode
  rootTransferId: string
  parentTransferId?: string
  depth: number
  senderRole?: string
  recipientRole?: string
  /** 由调用方传入（core 不读时钟） */
  issuedAt?: string
}

export interface OntologyTransfer {
  transferId: string
  taskId: string
  traceId?: string
  sender: AgentSubject
  recipient: AgentSubject
  packet: Packet
  sourceScope: string
  visibleScopes: string[]
  provenance: TransferProvenance
}

export type ResultStatus = 'completed' | 'partial' | 'blocked'

export interface AgentResult {
  resultId: string
  status: ResultStatus
  summary: string
  evidence?: Evidence[]
}

/** 返回 envelope：Result + candidate Delta，目标固定为本次调用的发送方。 */
export interface OntologyReturn {
  returnId: string
  /** 这次返回对应哪次 transfer（跨进程回传必须能定位原 transfer） */
  transferId: string
  taskId: string
  from: AgentSubject
  to: AgentSubject
  result: AgentResult
  delta: Delta
  provenance: { role?: string; issuedAt?: string }
}

/** 向上建议 envelope：目标 scope、来源版本、证据与 candidate Delta。 */
export interface OntologyProposal {
  proposalId: string
  taskId?: string
  proposer: AgentSubject
  targetScope: string
  baseVersion: BaseVersion
  delta: Delta
  evidence: Evidence[]
  sourceTransferId?: string
  provenance?: { role?: string; issuedAt?: string }
}

export type ProtocolStatus = 'rejected' | 'conflict'

export type ProtocolOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; status: ProtocolStatus; findings: Finding[] }

export interface TransferReceipt {
  transferId: string
  taskId: string
  packetId: string
  baseVersion: string
  assertions: number
  nodes: number
  truncated: boolean
  visibleScopes: string[]
  depth: number
}

export interface ForwardedTransfer {
  transfer: OntologyTransfer
  receipt: TransferReceipt
}

export interface ReturnReceipt {
  returnId: string
  taskId: string
  targetScope: string
  baseVersion: string
  candidateOps: number
  disposition: 'candidate-delta'
}

export interface ReturnedCandidate {
  agentReturn: OntologyReturn
  receipt: ReturnReceipt
}

export type TargetKind = 'task' | 'governance'

export interface ProposalReceipt {
  proposalId: string
  targetScope: string
  targetKind: TargetKind
  disposition: 'candidate-delta' | 'governance-proposal'
  requiresPromotion: boolean
  baseVersion: string
  candidateOps: number
}

export interface ProposedCandidate {
  proposal: OntologyProposal
  receipt: ProposalReceipt
}

export interface CreateTransferInput {
  transferId: string
  taskId: string
  traceId?: string
  sender: AgentSubject
  recipient: AgentSubject
  packet: Packet
  sourceScope: string
  visibleScopes?: string[]
  senderRole?: string
  recipientRole?: string
  issuedAt?: string
}

export interface ReceiveTransferInput {
  transfer: OntologyTransfer
  recipient: AgentSubject
  grant: SubjectGrant
  /** 宿主认证出的发送方；提供时与 envelope 声称的发送方比对 */
  sender?: AgentSubject
  maxDepth?: number
}

export interface ForwardTransferInput {
  transfer: OntologyTransfer
  /** 宿主认证出的转交主体，必须等于这次传递的接收方 */
  forwarder: AgentSubject
  grant: SubjectGrant
  /** 下一接收方的认证与授权；转交前必须证明对方看得到本次来源与可见 scope */
  recipientGrant: SubjectGrant
  recipient: AgentSubject
  /** 新投递记录 id，必须与原 transferId 不同 */
  transferId: string
  /** 省略 = 原样转交；提供 = 派生转交（从同一授权视图重新 slice） */
  derivedPacket?: Packet
  senderRole?: string
  recipientRole?: string
  issuedAt?: string
  maxDepth?: number
}

export interface ReturnResultInput {
  transfer: OntologyTransfer
  /** 宿主认证出的返回主体，必须是这次传递的接收方 */
  from: AgentSubject
  grant: SubjectGrant
  returnId: string
  result: AgentResult
  delta: Delta
  /** 省略 = 返回给本次传递的发送方 */
  to?: AgentSubject
  role?: string
  issuedAt?: string
}

export interface ProposeDeltaInput {
  proposalId: string
  proposer: AgentSubject
  grant: SubjectGrant
  targetScope: string
  baseVersion: BaseVersion
  delta: Delta
  evidence: Evidence[]
  taskId?: string
  sourceTransferId?: string
  role?: string
  issuedAt?: string
}
