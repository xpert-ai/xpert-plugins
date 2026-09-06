import type {
  AssistantProfile,
  DashboardProjection,
  ExecutionRecord,
  FlowNode,
  FlowProjection,
  GovernanceCase,
  RoleKey,
} from './contracts.js'
import { FLOW_DEFINITION as definition } from './flow-definition.js'
export type Profiles = Partial<Record<RoleKey, AssistantProfile>>
export function projectFlow(
  current: GovernanceCase,
  executions: ExecutionRecord[] = [],
  profiles: Profiles = {},
): FlowProjection {
  const completedArtifacts = new Set(
    current.artifacts.filter((a) => a.status === 'accepted').map((a) => a.key),
  )
  const states = new Map<string, FlowNode>()
  const inputs = definition.nodes
  const completed = (key: string) =>
    states.get(key)?.status === 'completed' ||
    states.get(key)?.status === 'skipped'
  const incoming = (key: string) => definition.edges.filter((e) => e.to === key)
  const selected = (e: (typeof definition.edges)[number]) =>
    !('condition' in e) ||
    current.criticalConflict === null ||
    e.condition.value === (current.criticalConflict ? 'conflict' : 'clear')
  // The immutable DAG coordinates accepted artifacts; an LLM return value never completes a node.
  for (let pass = 0; pass < inputs.length; pass++)
    for (const [order, n] of inputs.entries()) {
      if (states.has(n.key)) continue
      const edges = incoming(n.key)
      if (edges.some((e) => !states.has(e.from))) continue
      const skipped =
        n.key === 'contain-conflict' && current.criticalConflict === false
      const predecessors = edges
        .filter(selected)
        .every((e) => completed(e.from))
      const record = executions.filter((r) => r.nodeKey === n.key)
      const active = record.some(
        (r) => r.status === 'queued' || r.status === 'running',
      )
      let accepted = false,
        mode: FlowNode['executionMode'] = 'system',
        artifactKey: string | null = null,
        lane: RoleKey = 'quality'
      if (n.kind === 'task') {
        mode = n.execution.mode
        lane = n.laneKey
        artifactKey = n.completion.artifactKey
        accepted = completedArtifacts.has(artifactKey)
        if (n.key === 'approve-governance')
          accepted =
            current.approval?.decision === 'approved' &&
            current.approval.proposalRevision === current.proposal?.revision
        if (n.key === 'contain-conflict')
          accepted =
            current.criticalConflict === true && completedArtifacts.has('audit')
      } else if (n.kind === 'router') {
        accepted =
          completedArtifacts.has('audit') && current.criticalConflict !== null
      } else {
        accepted = current.status === 'completed'
        lane = 'publisher'
      }
      const rejected = current.status === 'rejected'
      const executable =
        !accepted &&
        !skipped &&
        predecessors &&
        !active &&
        !rejected &&
        n.kind === 'task'
      const status = skipped
        ? 'skipped'
        : accepted
          ? 'completed'
          : active
            ? 'running'
            : rejected
              ? 'blocked'
              : executable
                ? 'ready'
                : 'pending'
      states.set(n.key, {
        key: n.key,
        title: n.title,
        kind: n.kind,
        laneKey: lane,
        stageKey: n.stageKey,
        order,
        openMode: 'openMode' in n ? n.openMode : 'dialog',
        executionMode: mode,
        status,
        executable,
        artifactKey,
        summary:
          current.artifacts.filter((a) => a.key === artifactKey).at(-1)
            ?.summary ?? '',
        executions: record,
      })
    }
  const nodes = [...states.values()].sort((a, b) => a.order - b.order)
  const lanes = definition.lanes.map((l) => ({
    key: l.key,
    title: l.title,
    order: l.order,
    assistant: profiles[l.key] ?? {
      displayName: l.title,
      templateKey: `material-identity-${l.key}`,
      primaryAgentKey: `Agent_${l.key}`,
      avatarUrl: null,
      available: false,
    },
    executions: executions.filter((r) => r.roleKey === l.key),
  }))
  return {
    caseId: current.id,
    revision: current.revision,
    lanes,
    stages: definition.stages.map((s) => ({ ...s })),
    nodes,
    edges: definition.edges.map((e) => ({
      from: e.from,
      to: e.to,
      outcome: 'condition' in e ? e.condition.value : null,
      state: !selected(e)
        ? 'skipped'
        : completed(e.from)
          ? 'selected'
          : 'pending',
    })),
    executableNodeKeys: nodes.filter((n) => n.executable).map((n) => n.key),
    completed: nodes.filter(
      (n) => n.kind === 'task' && n.status === 'completed',
    ).length,
    total: nodes.filter((n) => n.kind === 'task' && n.status !== 'skipped')
      .length,
    blocker:
      current.status === 'review_required'
        ? '主数据负责人需要审核当前方案，批准后方可发布。'
        : current.status === 'rejected'
          ? '方案已驳回。保留证据并创建修订案例重新治理。'
          : null,
  }
}
export function projectDashboard(
  cases: GovernanceCase[],
  records: ExecutionRecord[] = [],
): DashboardProjection {
  const flows = cases.map((c) =>
    projectFlow(
      c,
      records.filter((r) => r.caseId === c.id),
    ),
  )
  return {
    generatedAt: new Date().toISOString(),
    total: cases.length,
    active: cases.filter((c) =>
      ['open', 'active', 'blocked'].includes(c.status),
    ).length,
    reviewRequired: cases.filter((c) => c.status === 'review_required').length,
    completed: cases.filter((c) => c.status === 'completed').length,
    conflictCount: cases.filter((c) => c.criticalConflict === true).length,
    exposure: cases.reduce(
      (a, c) =>
        a + c.materials.reduce((s, m) => s + m.quantity * m.unitCost, 0),
      0,
    ),
    categories: (
      ['duplicate_codes', 'code_collision', 'drawing_request'] as const
    ).map((key) => ({
      key,
      count: cases.filter((c) => c.kind === key).length,
      caseIds: cases.filter((c) => c.kind === key).map((c) => c.id),
    })),
    roleQueues: definition.lanes.map((l) => ({
      roleKey: l.key,
      ready: flows.reduce(
        (s, f) =>
          s +
          f.nodes.filter((n) => n.laneKey === l.key && n.status === 'ready')
            .length,
        0,
      ),
      running: flows.reduce(
        (s, f) =>
          s +
          f.nodes.filter((n) => n.laneKey === l.key && n.status === 'running')
            .length,
        0,
      ),
      completed: flows.reduce(
        (s, f) =>
          s +
          f.nodes.filter(
            (n) =>
              n.kind === 'task' &&
              n.laneKey === l.key &&
              n.status === 'completed',
          ).length,
        0,
      ),
    })),
  }
}
