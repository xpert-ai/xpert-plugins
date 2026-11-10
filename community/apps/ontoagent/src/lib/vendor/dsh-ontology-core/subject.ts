/**
 * 通用 agent 主体协议（ADR-0012）：接收 / 原样或派生转交 / 返回 / 向上建议。
 *
 * 设计口径：
 * - 协议能力与角色无关。lead / worker 只进 provenance，不参与任何判定；
 * - 权限来自宿主认证后的 `SubjectGrant`，不来自 Packet、模型自报或上游角色；
 * - 四个操作都是纯判定：不写 Store、不读时钟、不调模型。真正落盘仍走 gate → merge。
 */
import { gateG0 } from './gate.js'
import { scopeContains, scopeRoot, scopeWithinAny } from './keys.js'
import type { Assertion, Finding } from './types.js'
import {
  conflict, contentScopeFindings, depthLimit, envelopeFindings, finding, grantFindings,
  recipientScopeFindings, receiptOf, reject, PROPOSAL_ROOTS, RESULT_STATUSES, versionHash,
} from './subject-validate.js'
import type {
  CreateTransferInput, ForwardedTransfer, ForwardTransferInput, OntologyProposal, OntologyTransfer,
  ProposeDeltaInput, ProposedCandidate, ProtocolOutcome, ReceiveTransferInput,
  ReturnedCandidate, ReturnResultInput, TargetKind, TransferProvenance, TransferReceipt,
} from './subject-types.js'

/** 供宿主适配层复用：下一跳接收方的可见范围校验（与 forward 共用同一实现）。 */
export { recipientScopeFindings } from './subject-validate.js'
/** 供 A2A 适配层复用：完整 envelope 校验（转发 envelope 不再重新造 origin）。 */
export { envelopeFindings as validateTransferEnvelope } from './subject-validate.js'

export function createTransfer(input: CreateTransferInput): ProtocolOutcome<OntologyTransfer> {
  const visibleScopes = input.visibleScopes ?? [input.sourceScope]
  const transfer: OntologyTransfer = {
    transferId: input.transferId,
    taskId: input.taskId,
    traceId: input.traceId,
    sender: input.sender,
    recipient: input.recipient,
    packet: input.packet,
    sourceScope: input.sourceScope,
    visibleScopes: [...visibleScopes],
    provenance: {
      mode: 'origin',
      rootTransferId: input.transferId,
      depth: 0,
      senderRole: input.senderRole,
      recipientRole: input.recipientRole,
      issuedAt: input.issuedAt,
    },
  }
  const findings = envelopeFindings(transfer)
  if (findings.length > 0) return reject(findings)
  return { ok: true, value: transfer }
}

export function receiveTransfer(input: ReceiveTransferInput): ProtocolOutcome<TransferReceipt> {
  const transfer = input.transfer
  // 与 create / forward / return 共用同一份 envelope 校验：身份、参与方、scope、版本、转交链、内容可见性
  const findings: Finding[] = [
    ...envelopeFindings(transfer),
    ...recipientScopeFindings(
      input.recipient, input.grant, transfer.sourceScope, transfer.visibleScopes, 'authz.scope_not_visible',
    ),
  ]
  if (input.sender !== undefined && input.sender.subjectId !== transfer.sender.subjectId) {
    findings.push(finding('transfer.sender_mismatch', 'transfer.authenticated_sender', transfer.transferId,
      '认证发送方与 envelope 声称的发送方不符'))
  }
  if (transfer.recipient.subjectId !== input.recipient.subjectId) {
    findings.push(finding('transfer.recipient_mismatch', 'transfer.authenticated_recipient', transfer.transferId,
      '接收主体不是 envelope 指定的 recipient'))
  }
  const limit = depthLimit([input.maxDepth, input.grant.maxForwardDepth])
  if (transfer.provenance.depth > limit) {
    findings.push(finding('transfer.depth_exceeded', 'transfer.depth_limit', transfer.transferId,
      '转交深度 ' + transfer.provenance.depth + ' 超过上限 ' + limit))
  }
  if (findings.length > 0) return reject(findings)
  return { ok: true, value: receiptOf(transfer) }
}

export function forwardTransfer(input: ForwardTransferInput): ProtocolOutcome<ForwardedTransfer> {
  const transfer = input.transfer
  const depth = transfer.provenance.depth + 1
  const limit = depthLimit([input.maxDepth, input.grant.maxForwardDepth])
  // 先过共享 envelope 校验，再看"谁能转交、下一跳是否看得到"
  const findings: Finding[] = [
    ...envelopeFindings(transfer),
    ...grantFindings(input.forwarder, input.grant),
    ...recipientScopeFindings(input.recipient, input.recipientGrant, transfer.sourceScope, transfer.visibleScopes),
    ...(transfer.recipient.subjectId === input.forwarder.subjectId
      ? []
      : [finding('transfer.forwarder_mismatch', 'transfer.forward_only_by_recipient', transfer.transferId,
        '只有本次传递的接收方可以转交')]),
    ...(input.grant.canForward === false
      ? [finding('transfer.forward_denied', 'grant.forward', input.forwarder.subjectId,
        '授权显式禁止该主体转交')]
      : []),
    ...(input.recipient.subjectId === input.forwarder.subjectId
      ? [finding('transfer.self_forward', 'transfer.participants', transfer.transferId, '不能转交给自己')]
      : []),
    ...(input.transferId.length === 0 || input.transferId === transfer.transferId
      ? [finding('transfer.id_reused', 'transfer.new_id', transfer.transferId,
        '转交必须使用新的 transferId')]
      : []),
    ...(depth > limit
      ? [finding('transfer.depth_exceeded', 'transfer.depth_limit', transfer.transferId,
        '转交深度 ' + depth + ' 超过上限 ' + limit)]
      : []),
    ...(scopeWithinAny(transfer.sourceScope, input.grant.visibleScopes)
      ? []
      : [finding('authz.scope_expansion', 'grant.visible_scopes', transfer.sourceScope,
        '转交不得超出主体的可见范围')]),
  ]
  const hidden = transfer.visibleScopes.find((scope) => !scopeWithinAny(scope, input.grant.visibleScopes))
  if (hidden !== undefined) {
    findings.push(finding('authz.scope_expansion', 'grant.visible_scopes', hidden,
      '转交不得超出主体的可见范围'))
  }
  const visibleScopes = [...transfer.visibleScopes]
  const provenance: TransferProvenance = {
    mode: input.derivedPacket === undefined ? 'forward' : 'derived',
    rootTransferId: transfer.provenance.rootTransferId,
    parentTransferId: transfer.transferId,
    depth,
    senderRole: input.senderRole,
    recipientRole: input.recipientRole,
    issuedAt: input.issuedAt,
  }
  const base = {
    transferId: input.transferId,
    taskId: transfer.taskId,
    traceId: transfer.traceId,
    sender: input.forwarder,
    recipient: input.recipient,
    sourceScope: transfer.sourceScope,
    visibleScopes,
    provenance,
  }
  if (input.derivedPacket === undefined) {
    if (findings.length > 0) return reject(findings)
    const forwarded: OntologyTransfer = { ...base, packet: transfer.packet }
    const envelopeProblems = envelopeFindings(forwarded)
    if (envelopeProblems.length > 0) return reject(envelopeProblems)
    return { ok: true, value: { transfer: forwarded, receipt: receiptOf(forwarded) } }
  }
  const derived = input.derivedPacket
  const derivedHash = versionHash(derived.baseVersion)
  if (derivedHash === null) {
    findings.push(finding('OA5', 'packet.base_version.required', derived.packetId,
      '派生 Packet 未携带 baseVersion.hash'))
  } else if (derivedHash !== versionHash(transfer.packet.baseVersion)) {
    findings.push(finding('transfer.derived_version_mismatch', 'transfer.derived_same_base', derived.packetId,
      '派生切片必须基于收到的同一 baseVersion', 'warn'))
  }
  if (derived.packetId === transfer.packet.packetId) {
    findings.push(finding('transfer.derived_packet_id', 'transfer.derived_new_packet', derived.packetId,
      '派生切片必须使用新的 packetId'))
  }
  findings.push(...contentScopeFindings(derived, [transfer.sourceScope, ...visibleScopes]))
  if (findings.some((f) => f.severity === 'reject')) return reject(findings)
  if (findings.length > 0) return conflict(findings)
  const forwarded: OntologyTransfer = {
    ...base,
    packet: { ...derived, parentPacketId: transfer.packet.packetId },
  }
  const envelopeProblems = envelopeFindings(forwarded)
  if (envelopeProblems.length > 0) return reject(envelopeProblems)
  return { ok: true, value: { transfer: forwarded, receipt: receiptOf(forwarded) } }
}

export function returnResult(input: ReturnResultInput): ProtocolOutcome<ReturnedCandidate> {
  const transfer = input.transfer
  const to = input.to ?? transfer.sender
  const findings: Finding[] = [
    ...envelopeFindings(transfer),
    ...grantFindings(input.from, input.grant),
    ...(input.from.subjectId === transfer.recipient.subjectId
      ? []
      : [finding('transfer.return_from_mismatch', 'return.from_is_recipient', transfer.transferId,
        '返回主体不是该传递的接收方')]),
    ...(to.subjectId === transfer.sender.subjectId
      ? []
      : [finding('return.target_mismatch', 'return.to_is_sender', to.subjectId,
        '返回目标必须是本次传递的发送方')]),
    ...(input.returnId.length === 0
      ? [finding('return.id_required', 'return.id', transfer.transferId, '缺少 returnId')]
      : []),
    ...(input.result.resultId.length === 0
      ? [finding('return.result_id_required', 'return.result_id', input.returnId, 'Result 缺少 resultId')]
      : []),
    ...(RESULT_STATUSES.includes(input.result.status)
      ? []
      : [finding('return.result_status_invalid', 'return.result_status', input.returnId,
        '未知 Result 状态: ' + String(input.result.status))]),
  ]
  if (scopeRoot(transfer.sourceScope) !== 'task') {
    findings.push(finding('return.target_not_writable', 'return.task_scope_only', transfer.sourceScope,
      '只有任务本体接收 Delta；治理本体请走 propose'))
  }
  if (!scopeWithinAny(transfer.sourceScope, input.grant.proposableScopes)) {
    findings.push(finding('authz.return_denied', 'grant.proposable_scopes', transfer.sourceScope,
      '主体未获准向该目标提交候选'))
  }
  const deltaHash = versionHash(input.delta.baseVersion)
  if (deltaHash === null) {
    findings.push(finding('OA5', 'delta.base_version.required', input.delta.deltaId,
      'Delta 未携带 baseVersion.hash（OA5：不带版本的增量一律拒绝）'))
  } else if (deltaHash !== versionHash(transfer.packet.baseVersion)) {
    findings.push(finding('transfer.base_version.stale', 'delta.base_version.match_received', input.delta.deltaId,
      'Delta 基于 ' + deltaHash + '，收到的是 ' + String(versionHash(transfer.packet.baseVersion)), 'warn'))
  }
  const knownNodes = new Set(transfer.packet.nodes.map((node) => node.id))
  findings.push(...gateG0({
    deltaId: input.delta.deltaId,
    baseVersion: input.delta.baseVersion,
    ops: input.delta.ops,
  }, knownNodes))
  const outside = input.delta.ops
    .filter((op): op is { op: 'assert'; assertion: Assertion } => (op as { op: string }).op === 'assert')
    .map((op) => op.assertion)
    .filter((a) => !scopeContains(transfer.sourceScope, a.scope))
  if (outside.length > 0) {
    findings.push(finding('return.scope_outside_target', 'return.scope_within_target', outside[0]!.id,
      '返回的断言必须在来源任务 scope 内'))
  }
  if (findings.some((f) => f.severity === 'reject')) return reject(findings)
  if (findings.length > 0) return conflict(findings)
  return {
    ok: true,
    value: {
      agentReturn: {
        returnId: input.returnId,
        transferId: transfer.transferId,
        taskId: transfer.taskId,
        from: input.from,
        to: transfer.sender,
        result: input.result,
        delta: input.delta,
        provenance: { role: input.role, issuedAt: input.issuedAt },
      },
      receipt: {
        returnId: input.returnId,
        taskId: transfer.taskId,
        targetScope: transfer.sourceScope,
        baseVersion: deltaHash ?? '',
        candidateOps: input.delta.ops.length,
        disposition: 'candidate-delta',
      },
    },
  }
}

export function proposeDelta(input: ProposeDeltaInput): ProtocolOutcome<ProposedCandidate> {
  const root = scopeRoot(input.targetScope)
  const targetKind: TargetKind = root === 'gov' ? 'governance' : 'task'
  const findings: Finding[] = [
    ...grantFindings(input.proposer, input.grant),
    ...(input.proposalId.length === 0
      ? [finding('proposal.id_required', 'proposal.id', '?', '缺少 proposalId')]
      : []),
    ...(PROPOSAL_ROOTS.has(root) && input.targetScope.length > 0
      ? []
      : [finding('proposal.target_scope', 'proposal.target_kind', input.targetScope,
        '建议目标只能是 task:<id> 或 gov:<...>')]),
    ...(scopeWithinAny(input.targetScope, input.grant.proposableScopes)
      ? []
      : [finding('authz.proposal_denied', 'grant.proposable_scopes', input.targetScope,
        '主体未获准向该目标提出建议')]),
  ]
  const baseHash = versionHash(input.baseVersion)
  const deltaHash = versionHash(input.delta.baseVersion)
  if (baseHash === null) {
    findings.push(finding('OA5', 'proposal.base_version.required', input.proposalId,
      '建议未携带 baseVersion.hash'))
  }
  if (deltaHash === null) {
    findings.push(finding('OA5', 'delta.base_version.required', input.delta.deltaId,
      'Delta 未携带 baseVersion.hash'))
  } else if (baseHash !== null && deltaHash !== baseHash) {
    findings.push(finding('proposal.version_mismatch', 'proposal.base_version.match_delta', input.delta.deltaId,
      '建议版本 ' + baseHash + ' 与 Delta 版本 ' + deltaHash + ' 不一致', 'warn'))
  }
  findings.push(...gateG0({
    deltaId: input.delta.deltaId,
    baseVersion: input.delta.baseVersion,
    ops: input.delta.ops,
  }, new Set()))
  const outside = input.delta.ops
    .filter((op): op is { op: 'assert'; assertion: Assertion } => (op as { op: string }).op === 'assert')
    .map((op) => op.assertion)
    .filter((a) => !scopeContains(input.targetScope, a.scope))
  if (outside.length > 0) {
    findings.push(finding('proposal.scope_mismatch', 'proposal.scope_within_target', outside[0]!.id,
      '建议的断言必须在目标 scope 内'))
  }
  if (root === 'gov' && input.evidence.length === 0) {
    findings.push(finding('OA1', 'proposal.evidence.required', input.proposalId,
      '治理建议必须带证据（OA1：无证据不传播）'))
  }
  if (findings.some((f) => f.severity === 'reject')) return reject(findings)
  if (findings.length > 0) return conflict(findings)
  const proposal: OntologyProposal = {
    proposalId: input.proposalId,
    taskId: input.taskId,
    proposer: input.proposer,
    targetScope: input.targetScope,
    baseVersion: input.baseVersion,
    delta: input.delta,
    evidence: input.evidence,
    sourceTransferId: input.sourceTransferId,
    provenance: { role: input.role, issuedAt: input.issuedAt },
  }
  const disposition = targetKind === 'governance' ? 'governance-proposal' : 'candidate-delta'
  return {
    ok: true,
    value: {
      proposal,
      receipt: {
        proposalId: input.proposalId,
        targetScope: input.targetScope,
        targetKind,
        disposition,
        requiresPromotion: targetKind === 'governance',
        baseVersion: baseHash ?? '',
        candidateOps: input.delta.ops.length,
      },
    },
  }
}
