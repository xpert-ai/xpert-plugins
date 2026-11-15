import type { ProjectPipelineGraph } from '@xpert-ai/contracts'
import { configuration } from './configuration.js'
import { orderSteps, routeOutcome, status, type Order } from './domain.js'
import { legacyVersion, processVersion, routers, stages, type StepKey } from './process.js'

export type DeskKey = StepKey | keyof typeof routers | 'traceFork' | 'traceJoin' | 'complete' | 'returned'
export type DeskState =
  | 'done'
  | 'current'
  | 'queued'
  | 'skipped'
  | 'rejected'
  | 'blocked'
  | 'cancelled'
  | 'unavailable'
const inputRecords: Record<DeskKey, readonly StepKey[]> = {
  intake: [],
  bom: ['intake'],
  lock: ['bom'],
  supply: ['lock'],
  materialRoute: ['supply'],
  expediteCheck: ['supply'],
  schedule: ['supply', 'expediteCheck'],
  commit: ['schedule'],
  build: ['lock', 'commit'],
  test: ['build'],
  release: ['test'],
  ship: ['release', 'commit'],
  trace: ['ship'],
  traceFork: ['trace'],
  asBuilt: ['trace', 'build'],
  benchReport: ['trace'],
  traceJoin: ['asBuilt', 'benchReport'],
  traceRoute: ['asBuilt', 'benchReport'],
  recoverReport: ['benchReport', 'build', 'test'],
  cause: ['trace', 'asBuilt', 'benchReport', 'recoverReport'],
  replay: ['intake', 'cause'],
  publish: ['cause', 'replay'],
  complete: ['publish'],
  returned: [],
}
const routedTemplate = configuration().template
const legacyTemplate = configuration({}, legacyVersion).template
function workspaceDefinition(template: typeof routedTemplate) {
  if (template.executionAuthority !== 'platform') throw Error('platform_definition_required')
  const approvalParents: Record<string, string> = {}
  for (const node of template.nodes) {
    if (node.kind !== 'work' || node.laneKey !== 'receipt') continue
    const decision = node.inputBindings?.decision
    if (decision?.from !== 'node_output') throw Error('receipt_approval_required')
    approvalParents[node.key] = decision.nodeKey
  }
  return { definitionKey: template.key, version: template.version, routeToExecutor: true, approvalParents }
}
const routedWorkspace = workspaceDefinition(routedTemplate)
const legacyWorkspace = workspaceDefinition(legacyTemplate)
export const nodeWorkbenches = [legacyWorkspace, routedWorkspace]
type GraphNode = ProjectPipelineGraph['nodes'][number]
function nativeState(node: GraphNode): DeskState {
  const s = node.projection.state
  if (s.applicability === 'excluded') return 'skipped'
  if (s.lifecycle === 'cancelled') return 'cancelled'
  if (s.lifecycle === 'failed' || s.readiness === 'blocked') return 'blocked'
  if (s.lifecycle === 'completed') return 'done'
  return s.lifecycle === 'active' || s.readiness === 'ready' ? 'current' : 'queued'
}
function controlState(o: Order, key: DeskKey): DeskState {
  const has = (k: StepKey) => o.events.some((e) => e.node === k)
  const ended = status(o)
  if (key === 'complete' || key === 'returned') {
    if (ended !== 'rejected' && ended !== 'complete') return 'queued'
    return (key === 'complete') === (ended === 'complete') ? 'done' : 'skipped'
  }
  if (key === 'materialRoute' || key === 'traceRoute') return routeOutcome(o, key) ? 'done' : 'queued'
  if (key === 'traceFork') return has('trace') ? 'done' : 'queued'
  if (key === 'traceJoin') return has('asBuilt') && has('benchReport') ? 'done' : 'queued'
  return 'queued'
}
export function nodeWorkbench(o: Order, graph?: ProjectPipelineGraph) {
  const tpl = o.variant ? routedTemplate : legacyTemplate
  if (tpl.executionAuthority !== 'platform') throw Error('platform_definition_required')
  const order: DeskKey[] = orderSteps(o).flatMap((s): DeskKey[] => {
    if (!o.variant) return [s.key]
    if (s.key === 'supply') return ['supply', 'materialRoute']
    if (s.key === 'trace') return ['trace', 'traceFork']
    if (s.key === 'benchReport') return ['benchReport', 'traceJoin', 'traceRoute']
    return [s.key]
  })
  order.push('complete', 'returned')
  const nodes = new Map(tpl.nodes.map((n) => [n.key, n]))
  const active = graph && new Map(graph.nodes.map((n) => [n.projection.key, n]))
  const { approvalParents } = o.variant ? routedWorkspace : legacyWorkspace
  const receipt = (key: string) => Object.hasOwn(approvalParents, key)
  const outgoing = (k: string) => tpl.edges.filter((e) => e.from === k)
  const destinations = (key: DeskKey) =>
    outgoing(key).flatMap((e) =>
      (receipt(e.to) ? outgoing(e.to) : [e]).map((dest) => ({
        to: dest.to as DeskKey,
        outcome: e.outcome,
        selection: graph?.edges.find((x) => x.from === e.from && x.to === e.to && x.outcome === e.outcome)
          ?.selection,
      })),
    )
  return {
    version: o.variant ? processVersion : legacyVersion,
    roundId: graph?.roundId,
    roundSequence: graph?.round.sequence,
    historical: graph?.historical ?? false,
    stages,
    pages: order.map((key) => {
      const spec = nodes.get(key)!
      const n = active?.get(key)
      const sources =
        key === 'returned'
          ? o.events.filter((e) => e.decision === 'reject').map((e) => e.node)
          : key === 'trace' && !o.variant
          ? (['ship', 'build', 'test'] as const)
          : inputRecords[key]
      const children = [
        ...new Set(
          outgoing(key)
            .map((e) => e.to)
            .filter(receipt),
        ),
      ]
      return {
        key,
        title: spec.label ?? key,
        stage: stages.find((_, i) => spec.stageKey === 's' + i)!,
        kind: spec.kind,
        id: n?.id,
        nativeState: n && nativeState(n),
        controlState:
          o.mode === 'rehearsal' ? controlState(o, key) : n ? nativeState(n) : ('unavailable' as const),
        inputs: sources.filter((k) => order.includes(k)),
        exits: destinations(key),
        evidenceCount: n?.projection.evidence.length,
        receipts: children.map((k) => {
          const item = active?.get(k)
          const branch = outgoing(key).some((edge) => edge.to === k && edge.outcome === 'reject')
            ? ('reject' as const)
            : ('approve' as const)
          return {
            key: k,
            title: nodes.get(k)!.label!,
            branch,
            id: item?.id,
            state: item && nativeState(item),
            evidenceCount: item?.projection.evidence.length,
          }
        }),
      }
    }),
  }
}
export type NodeWorkbench = ReturnType<typeof nodeWorkbench>
