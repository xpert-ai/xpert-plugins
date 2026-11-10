/** 本体对象与红线类型（纯类型声明 + 极少数类型守卫）。 */

export type Qualifiers = Record<string, string | number | boolean | null>
export interface Evidence { kind: string; locator: string; digest?: string }
export interface Authority { rank?: number; confidence?: number; rank_name?: string }

export type NodeKind = 'class' | 'property' | 'relation' | 'term' | 'individual'
export type Status = 'candidate' | 'validated' | 'accepted' | 'promoted' | 'retracted'

export interface Node {
  id: string
  kind: NodeKind
  labels?: string[]
  aliases?: string[]
  scope: string
  status?: string
  definition?: string
}

export interface Assertion {
  id: string
  s: string
  p: string
  o: unknown
  q?: Qualifiers
  scope: string
  status: string
  authority?: Authority
  evidence?: Evidence[]
  valid?: { from?: string; to?: string | null }
  provenance?: { agent?: string; turn?: number; agent_role?: string; gated?: boolean }
  retract_reason?: string
}

/** OA5：必带版本；缺 hash 则该类型不成立 */
export interface BaseVersion { readonly hash: string; readonly scope?: string }

/** OA2：模型能产出的断言只能是 candidate */
export type CandidateAssertion = Assertion & { status: 'candidate' }

/** OA2：只有 gate 能签发 accepted —— gateToken 是 GateToken 实例（构造器私有） */
export interface AcceptedAssertion extends Assertion {
  readonly status: 'accepted'
  readonly gateToken: { readonly issued: true }
}

export interface Finding {
  code: string
  rule: string
  target: string
  detail: string
  severity: 'reject' | 'warn' | 'downgrade'
}

/** OA6：裁定记录保留败者负载，不只留 id */
export interface Resolution {
  key: string[]
  candidates: string[]
  winner: string
  rule: string
  disputed: boolean
  humanRequired: boolean
  losers: Array<{ id: string; o: unknown; evidence: Evidence[]; authority?: Authority }>
}

export interface Packet {
  packetId: string
  /**
   * OA5：切片必带版本。ADR-0012 §3.3 把"缺版本"列为直接拒绝项，
   * 因此这里不是可选项 —— 没有版本就没有可追溯的本体视图。
   */
  baseVersion: BaseVersion
  focus: string[]
  nodes: Node[]
  assertions: Assertion[]
  truncated: boolean
  budget: { maxAssertions: number; maxTokens?: number }
  /** 派生转交：本切片由哪个父切片重新切片而来（由协议写入，不由模型填写） */
  parentPacketId?: string
}

export type Op =
  | { op: 'assert'; assertion: Assertion }
  | { op: 'retract'; target: string; reason?: string; physicalDelete?: false }
  | { op: 'restrict'; target: string; patch: Partial<Assertion> }
  | { op: 'alias'; from: string; to: string; evidence: Evidence[] }
  | { op: 'map'; from: string; to: string; evidence: Evidence[] }
  | { op: 'merge_node'; from: string; into: string; evidence: Evidence[] }
  | { op: 'split_node'; from: string; into: string[]; evidence: Evidence[] }

export interface Delta {
  deltaId: string
  baseVersion: BaseVersion
  ops: Op[]
}

export interface FoldResult {
  table: Map<string, Assertion>
  resolutions: Array<Record<string, unknown>>
  tombstones: string[]
}

export interface MergeResult {
  merged: Map<string, Assertion>
  conflicts: Resolution[]
  resolutions: Array<Record<string, unknown>>
}
