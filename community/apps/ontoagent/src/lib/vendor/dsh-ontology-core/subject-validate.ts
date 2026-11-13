/**
 * 主体协议的内部校验器：原因码、scope 包含、版本、授权、转交链与收据。
 * 四个公共操作共用 `envelopeFindings`，避免"创建时严格、接收和转交时放宽"。
 */
import { SCOPES, scopeRoot, scopeWithinAny } from './keys.js'
import type { BaseVersion, Finding, Packet } from './types.js'
import type {
  AgentSubject, OntologyTransfer, ProtocolOutcome, ResultStatus, SubjectGrant, TransferReceipt,
} from './subject-types.js'
import { DEFAULT_MAX_FORWARD_DEPTH } from './subject-types.js'

export const RESULT_STATUSES: readonly ResultStatus[] = ['completed', 'partial', 'blocked']
export const PROPOSAL_ROOTS = new Set(['task', 'gov'])
const TRANSFER_MODES = new Set(['origin', 'forward', 'derived'])

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

export const finding = (
  code: string, rule: string, target: string, detail: string, severity: Finding['severity'] = 'reject',
): Finding => ({ code, rule, target, detail, severity })

/**
 * 同一条件可能被协议层与闸门层各报一次（如 OA5 缺版本）。
 * 按 code+target 去重，保留更具体的协议层原因，避免拒绝原因列表噪声化。
 */
const uniqueFindings = (findings: Finding[]): Finding[] => {
  const seen = new Set<string>()
  return findings.filter((f) => {
    const key = f.code + '|' + f.target
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const reject = <T>(findings: Finding[]): ProtocolOutcome<T> =>
  ({ ok: false, status: 'rejected', findings: uniqueFindings(findings) })
export const conflict = <T>(findings: Finding[]): ProtocolOutcome<T> =>
  ({ ok: false, status: 'conflict', findings: uniqueFindings(findings) })

export const versionHash = (version?: BaseVersion | null): string | null => {
  if (version === undefined || version === null) return null
  return typeof version.hash === 'string' && version.hash.length > 0 ? version.hash : null
}

/** 取调用方与授权里最紧的深度上限（协议上限优先）。 */
export const depthLimit = (values: Array<number | undefined>): number => {
  const limits = values.filter((x): x is number => typeof x === 'number' && x >= 0)
  return Math.min(DEFAULT_MAX_FORWARD_DEPTH, ...limits)
}

/**
 * Packet 内容的可见范围校验：
 * - 断言逐条校验 scope；
 * - 节点先看自身 scope；若越界，只有被**可见断言**引用时才放行 ——
 *   节点是切片子图的命名元数据，引用它的可见断言就是它进入本次传递的依据。
 *   节点 scope 可能是 task:local 这类占位值，因此不能只用节点 scope 判授权，
 *   也不能放任未被任何可见断言引用的越界节点随包传递。
 */
export const contentScopeFindings = (
  packet: Packet, allowed: readonly string[], code = 'authz.scope_leak',
): Finding[] => {
  const findings: Finding[] = []
  const visibleAssertions = packet.assertions.filter((a) => scopeWithinAny(a.scope, allowed))
  const badAssertions = packet.assertions.filter((a) => !scopeWithinAny(a.scope, allowed))
  if (badAssertions.length > 0) {
    findings.push(finding(code, 'packet.assertion_scope_within_view', badAssertions[0]!.id,
      '断言 scope 越出授权视图: ' + badAssertions.map((a) => a.scope + ' ' + a.id).join(', ')))
  }
  const referenced = new Set<string>()
  for (const a of visibleAssertions) {
    referenced.add(a.s)
    if (typeof a.o === 'string') referenced.add(a.o)
  }
  const badNodes = packet.nodes.filter((n) => !scopeWithinAny(n.scope, allowed) && !referenced.has(n.id))
  if (badNodes.length > 0) {
    findings.push(finding(code, 'packet.node_scope_within_view', badNodes[0]!.id,
      '节点 scope 越出授权视图且未被可见断言引用: ' +
      badNodes.map((n) => n.scope + ' ' + n.id).join(', ')))
  }
  return findings
}

export const scopeNameFindings = (scope: string, field: string): Finding[] => {
  const value = str(scope)
  if (value.length === 0) return [finding('transfer.scope_required', field, '?', '缺少 ' + field)]
  if (!value.includes(':')) {
    return [finding('transfer.scope_invalid', field, value, 'scope 必须带“:”分段（如 gov: 或 task:T1）')]
  }
  if (!(SCOPES as readonly string[]).includes(scopeRoot(value))) {
    return [finding('transfer.scope_invalid', field, value, '未知 scope 根: ' + scopeRoot(value))]
  }
  return []
}

export const scopeListFindings = (scopes: string[], field: string): Finding[] =>
  scopes.flatMap((scope) => scopeNameFindings(scope, field))

export const grantFindings = (subject: AgentSubject, grant: SubjectGrant): Finding[] => (
  grant.subjectId === subject.subjectId
    ? []
    : [finding('authz.subject_grant_mismatch', 'grant.subject_binding', grant.subjectId,
      '授权记录不属于主体 ' + subject.subjectId)]
)

/**
 * 下一跳接收方授权：转交方必须证明接收方看得到本次来源与全部可见 scope。
 * 初始投递（host adapter）与转交共用这一条，避免"只查发送方"。
 */
export const recipientScopeFindings = (
  recipient: AgentSubject, grant: SubjectGrant, sourceScope: string, visibleScopes: readonly string[],
  code = 'authz.recipient_scope',
): Finding[] => {
  if (grant === undefined) {
    return [finding('authz.recipient_grant_required', 'grant.recipient_required', recipient.subjectId,
      '缺少下一接收方授权，不得发送')]
  }
  const findings = grantFindings(recipient, grant)
  for (const scope of new Set([sourceScope, ...visibleScopes])) {
    if (!scopeWithinAny(scope, grant.visibleScopes)) {
      findings.push(finding(code, 'grant.visible_scopes', scope,
        code === 'authz.recipient_scope' ? '接收方无权读取该 scope，不得发送' : '接收方无权看到该 scope'))
    }
  }
  return findings
}

export const provenanceFindings = (transfer: OntologyTransfer): Finding[] => {
  const p = transfer.provenance
  const bad = (detail: string): Finding =>
    finding('transfer.provenance_invalid', 'transfer.provenance', str(transfer.transferId), detail)
  if (!TRANSFER_MODES.has(p.mode)) return [bad('未知 transfer mode: ' + String(p.mode))]
  if (!Number.isInteger(p.depth) || p.depth < 0) return [bad('depth 必须是非负整数')]
  if (str(p.rootTransferId).length === 0) return [bad('rootTransferId 不能为空')]
  const hasParent = typeof transfer.packet.parentPacketId === 'string' && transfer.packet.parentPacketId.length > 0
  if (p.mode === 'derived' && !hasParent) return [bad('mode=derived 时 Packet 必须带 parentPacketId')]
  if (p.mode === 'origin') {
    return p.depth === 0 && p.parentTransferId === undefined && p.rootTransferId === transfer.transferId
      ? []
      : [bad('origin 必须是 depth=0、无 parentTransferId、rootTransferId=自身')]
  }
  return p.depth >= 1 && typeof p.parentTransferId === 'string' && p.parentTransferId.length > 0
    ? []
    : [bad('forward/derived 必须有 parentTransferId 且 depth ≥ 1')]
}

/**
 * 所有传递 envelope 的统一校验入口：身份、参与方、scope、版本、转交链与内容可见性。
 * create / receive / forward / return 都必须先过这里。
 */
export const envelopeFindings = (transfer: OntologyTransfer): Finding[] => {
  const transferId = str(transfer.transferId)
  const sourceScope = str(transfer.sourceScope)
  const visibleScopes = (transfer.visibleScopes ?? []).map(str)
  const findings: Finding[] = []
  if (transferId.length === 0) {
    findings.push(finding('transfer.id_required', 'transfer.id', '?', '缺少 transferId'))
  }
  if (str(transfer.taskId).length === 0) {
    findings.push(finding('transfer.task_required', 'transfer.task', transferId, '缺少 taskId'))
  }
  if (str(transfer.packet?.packetId).length === 0) {
    findings.push(finding('transfer.packet_id_required', 'transfer.packet_id', transferId, 'Packet 缺少 packetId'))
  }
  if (str(transfer.sender?.subjectId).length === 0) {
    findings.push(finding('transfer.sender_required', 'transfer.sender', transferId, '发送方缺少 subjectId'))
  }
  if (str(transfer.recipient?.subjectId).length === 0) {
    findings.push(finding('transfer.recipient_required', 'transfer.recipient', transferId, '接收方缺少 subjectId'))
  }
  if (str(transfer.sender?.subjectId) === str(transfer.recipient?.subjectId)) {
    findings.push(finding('transfer.self_forward', 'transfer.participants', transferId, '发送方与接收方相同'))
  }
  findings.push(...scopeNameFindings(sourceScope, 'sourceScope'))
  findings.push(...scopeListFindings(visibleScopes, 'visibleScopes'))
  findings.push(...provenanceFindings(transfer))
  if (versionHash(transfer.packet?.baseVersion) === null) {
    findings.push(finding('OA5', 'packet.base_version.required', str(transfer.packet?.packetId),
      'Packet 未携带 baseVersion.hash（OA5：不带版本的本体视图一律拒绝）'))
  }
  if (sourceScope.length > 0 && !scopeWithinAny(sourceScope, visibleScopes)) {
    findings.push(finding('transfer.source_scope_not_visible', 'transfer.visible_scopes', sourceScope,
      'sourceScope 不在 visibleScopes 内'))
  }
  if (sourceScope.length > 0) {
    findings.push(...contentScopeFindings(transfer.packet, [sourceScope, ...visibleScopes]))
  }
  return findings
}

export const receiptOf = (transfer: OntologyTransfer): TransferReceipt => ({
  transferId: transfer.transferId,
  taskId: transfer.taskId,
  packetId: transfer.packet.packetId,
  baseVersion: versionHash(transfer.packet.baseVersion) ?? '',
  assertions: transfer.packet.assertions.length,
  nodes: transfer.packet.nodes.length,
  truncated: transfer.packet.truncated,
  visibleScopes: [...transfer.visibleScopes],
  depth: transfer.provenance.depth,
})
