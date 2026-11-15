import {
  flow,
  legacyFlow,
  type Variant,
  type RouterKey,
  reviewers,
  roles,
  type StepKey,
  type ScenarioMode,
} from './process.js'
import {
  sample as s,
  plans,
  replay,
  score,
  extract,
  ruleText,
  type RuleVersion,
  type Plan,
} from './sample.js'
export interface Fact {
  label: string
  value: string
}
export type RouteRecord =
  | { kind: 'inventory'; required: number; available: number }
  | { kind: 'assembly'; serial: string; lot: string }
  | { kind: 'report'; serial: string | null; report: string | null }
export interface Event {
  routeRecord?: RouteRecord
  node: StepKey
  actor: string
  authority: 'sample_assistant' | 'published_assistant' | 'human'
  role: string
  at: string
  facts: Fact[]
  decision?: 'approve' | 'reject'
  reason?: string
  plan?: Plan
  executionId?: string
  conversationId?: string
  assistantId?: string
  operation: string
}
export interface Order {
  id: string
  code: string
  variant?: Variant
  mode: ScenarioMode
  rule: RuleVersion
  parent?: string
  corrective?: { source: string; instruction: string }
  events: Event[]
}
export type Command = {
  node: StepKey
  operation: string
  reason?: string
  decision?: 'approve' | 'reject'
  plan?: Plan
}
export const orderSteps = (o: Order) => (o.variant ? flow : legacyFlow)
export function routeOutcome(o: Order, key: RouterKey) {
  const record = (node: StepKey) => o.events.find((e) => e.node === node)?.routeRecord
  if (key === 'materialRoute') {
    const stock = record('supply')
    if (
      stock?.kind !== 'inventory' ||
      !Number.isSafeInteger(stock.required) ||
      stock.required <= 0 ||
      !Number.isSafeInteger(stock.available) ||
      stock.available < 0
    )
      return
    return stock.available < stock.required ? 'shortage' : 'stocked'
  }
  const assembly = record('asBuilt'),
    report = record('benchReport')
  if (
    assembly?.kind !== 'assembly' ||
    !assembly.lot ||
    assembly.serial !== o.code + '-M001' ||
    report?.kind !== 'report'
  )
    return
  return report.report && report.serial === assembly.serial ? 'matched' : 'lookup'
}
export function skipped(o: Order, node: StepKey) {
  return (
    (node === 'expediteCheck' && routeOutcome(o, 'materialRoute') === 'stocked') ||
    (node === 'recoverReport' && routeOutcome(o, 'traceRoute') === 'matched')
  )
}
export function readySteps(o: Order) {
  if (o.events.at(-1)?.decision === 'reject') return []
  const remaining = orderSteps(o).filter((s) => !o.events.some((e) => e.node === s.key) && !skipped(o, s.key))
  const first = remaining[0]
  if (!first) return []
  if (first.key === 'asBuilt' || first.key === 'benchReport') {
    return remaining.filter((s) => s.key === 'asBuilt' || s.key === 'benchReport')
  }
  if (first.key === 'expediteCheck' && routeOutcome(o, 'materialRoute') !== 'shortage') return []
  if (first.key === 'recoverReport' && routeOutcome(o, 'traceRoute') !== 'lookup') return []
  return [first]
}
export const pending = (o: Order) => readySteps(o)[0]
export const status = (o: Order): 'rejected' | 'complete' | 'waiting' | 'active' =>
  o.events.at(-1)?.decision === 'reject'
    ? 'rejected'
    : o.events.at(-1)?.node === 'publish'
    ? 'complete'
    : pending(o)?.kind === 'human'
    ? 'waiting'
    : 'active'
const f = (label: string, value: string | number): Fact => ({
  label,
  value: String(value),
})
const previous = (o: Order, key: StepKey) => {
  const e = o.events.find((e) => e.node === key)
  if (!e) throw Error('predecessor_required')
  return e
}
const stocked = (o: Order) => o.variant === 'indexGap'
export const orderPlans = (o: Order) => plans(stocked(o))
function routeRecord(o: Order, node: StepKey): RouteRecord | undefined {
  if (!o.variant) return
  if (node === 'supply')
    return {
      kind: 'inventory',
      required: s.quantity,
      available: stocked(o) ? s.quantity : s.inventory.onHand,
    }
  if (node === 'asBuilt')
    return {
      kind: 'assembly',
      serial: previous(o, 'build').facts[4]!.value,
      lot: previous(o, 'build').facts[3]!.value,
    }
  if (node === 'benchReport' && o.variant === 'indexGap')
    return { kind: 'report', serial: null, report: null }
  if (node === 'benchReport' || node === 'recoverReport') {
    const test = previous(o, 'test')
    return {
      kind: 'report',
      serial: test.facts[0]!.value,
      report: test.facts[2]!.value,
    }
  }
}
export function evidence(o: Order, node: StepKey, plan?: Plan): Fact[] {
  const tag = o.code,
    serial = tag + '-M001',
    bom = 'EM-160/B · ' + tag,
    lot = s.lot + '-' + tag,
    wo = 'WO-' + tag
  const contract = o.rule === 'R1' ? s.clause : '技术附件 §4.2：端子盒 IP54；驱动电机总成防护等级 IP67。'
  switch (node) {
    case 'intake':
      return [
        f('合同原文', contract),
        f('订单行', tag + '/10'),
        f('交付数量', s.quantity),
        f('采用规则', o.rule),
        f('提取总成要求', extract(contract, o.rule) ?? '需人工核实'),
        ...(o.parent ? [f('经验来源订单', o.parent)] : []),
      ]
    case 'bom':
      return [
        f('参考配置', s.standard),
        ...previous(o, 'intake').facts.filter((x) => x.label === '提取总成要求'),
        f('工程差异', '总成 IP54 → IP67；端子盒仍为 IP54'),
        f('技术通知', '每台紧固件 4 → 8，新增密封组件 ' + s.seal + ' × 1；需出厂试验'),
        ...(o.corrective
          ? [f('上单已批准的装配要求', o.corrective.instruction), f('措施来源', o.corrective.source)]
          : []),
      ]
    case 'lock':
      return [
        f('冻结版本', bom),
        f('订单展开', '螺栓 96 件，密封组件 12 套'),
        f('来源', '模拟 PLM 变更回执 / ' + tag),
      ]
    case 'supply':
      return [
        f('依据', previous(o, 'lock').facts[0]!.value),
        f('ERP/WMS 样例', stocked(o) ? '需求 12，在库 12，在途 0' : '需求 12，在库 8，在途 4'),
        f('欠料', stocked(o) ? 0 : s.quantity - s.inventory.onHand),
        f('客户改期', '第 12 天 → 第 9 天'),
      ]
    case 'expediteCheck':
      return [
        f('待补物料', s.seal + ' × 4'),
        f('样例供应商回函', '常规第 10 天到货；接受加急费 ¥960 则第 7 天到货'),
        f('交给计划负责人', '台架试验预留 2 天；换序影响工单 22B，待审批后执行'),
      ]
    case 'schedule':
      return orderPlans(o).map((p) =>
        f(
          p.label,
          `首批 ${p.firstQty} 台第 ${p.first} 天，齐交第 ${p.last} 天，加费 ¥${p.cost}；${p.impact}`,
        ),
      )
    case 'commit': {
      const p = orderPlans(o).find((p) => p.key === plan)
      if (!p) throw Error('plan_required')
      return [
        f('批准方案', p.label),
        f('影响', p.impact),
        f('末批交期', '第 ' + p.last + ' 天'),
        f('费用', '¥' + p.cost),
        f('模拟排程回执', 'APS-' + tag),
      ]
    }
    case 'build':
      return [
        f('模拟 ERP 报产回执', 'ERP-' + tag),
        f('MES 工单', wo),
        f('技术 BOM', bom),
        f('实装密封件', s.seal + ' / ' + lot),
        f('首台序列号', serial),
        f('样例产量', s.quantity),
      ]
    case 'test':
      return [
        f('受检序列号', serial),
        f('QMS 样例', s.test),
        f('试验记录', 'TEST-' + tag),
        f('首检通过', '12 / 12'),
        ...(o.corrective
          ? [
              f('新增样例复核回执', '引出口密封圈定位及实装照片已复核 / CHECK-' + tag),
              f('措施来源', o.corrective.source),
            ]
          : []),
      ]
    case 'release':
      return [
        f('放行依据', previous(o, 'test').facts[2]!.value),
        f('放行批次', wo),
        f('受检数量', s.quantity),
      ]
    case 'ship': {
      const choice = previous(o, 'commit').plan,
        p = orderPlans(o).find((p) => p.key === choice)!
      return [
        f('质量放行', previous(o, 'release').facts[0]!.value),
        f('模拟 WMS 出库', 'OUT-' + tag),
        f('首台序列号', serial),
        f('模拟签收', p.key === 'split' ? '第 9 天 8 台，第 12 天 4 台' : '第 ' + p.last + ' 天 12 台'),
        f('签收凭证', 'POD-' + tag),
      ]
    }
    case 'trace':
      if (o.variant)
        return [
          f('服务单', 'SR-' + tag),
          f('客户报告', s.fieldReport),
          previous(o, 'ship').facts[2]!,
          f('拆检原始记录', s.teardown),
        ]
      return [
        f('服务单', 'SR-' + tag),
        f('客户报告', s.fieldReport),
        previous(o, 'ship').facts[2]!,
        previous(o, 'build').facts[3]!,
        previous(o, 'build').facts[2]!,
        previous(o, 'test').facts[2]!,
        f('拆检原始记录', s.teardown),
      ]
    case 'asBuilt':
      return [previous(o, 'build').facts[4]!, previous(o, 'build').facts[3]!, previous(o, 'build').facts[2]!]
    case 'benchReport':
      return o.variant === 'indexGap'
        ? [f('查询键', serial), f('QMS 样例索引', '未命中；待按出厂工单调阅归档原件')]
        : [previous(o, 'test').facts[0]!, previous(o, 'test').facts[2]!]
    case 'recoverReport': {
      const recovered = routeRecord(o, node)
      if (recovered?.kind !== 'report' || recovered.serial !== serial || !recovered.report)
        throw Error('archive_not_verified')
      return [f('归档工单', wo), f('原件报告号', recovered.report), f('核对序列号', recovered.serial)]
    }
    case 'cause':
      return [
        ...(o.variant
          ? [
              previous(o, 'asBuilt').facts[1]!,
              previous(o, routeOutcome(o, 'traceRoute') === 'matched' ? 'benchReport' : 'recoverReport')
                .facts[1]!,
              previous(o, 'trace').facts[3]!,
            ]
          : []),
        f('典型根因', '引出口密封圈装配偏位'),
        f('批准措施', s.corrective),
        f('验证窗口', '同产品族、同工况、投运 90 天；首批 1 / 12，改进后尚无在役样本'),
      ]
    case 'replay': {
      const rows = replay()
      if (o.rule === 'R2')
        return [
          f('沿用规则', ruleText),
          f('复测样例', rows.length),
          f('继承的 R2', score(rows, 'after') + ' / ' + rows.length),
        ]
      return [
        f('专家纠错', ruleText),
        f('基线 R1', score(rows, 'before') + ' / ' + rows.length),
        f('候选 R2', score(rows, 'after') + ' / ' + rows.length),
        ...rows.map((x) =>
          f(x.input, `${x.before ?? '转人工'} → ${x.after ?? '转人工'}；标注 ${x.expected ?? '转人工'}`),
        ),
      ]
    }
    case 'publish': {
      if (o.rule === 'R2')
        return [
          f('沿用当前版本', 'R2'),
          f('本单复测', previous(o, 'replay').facts[2]!.value),
          f('作用范围', '下一单继续采用已发布的 R2'),
        ]
      const rows = replay()
      if (score(rows, 'after') !== rows.length) throw Error('regression_failed')
      return [
        f('经验卡 / 样例规则 R2', ruleText),
        f('复核依据', previous(o, 'replay').facts[2]!.value),
        f('新单采用', '由本单创建后续订单时冻结 R2；原单保留原版本'),
        f('产品效果', '需积累后续在役分母和同类故障数'),
      ]
    }
  }
}
export type Actor = {
  id: string
  kind: Event['authority']
  executionId?: string
  conversationId?: string
  assistantId?: string
}
export function advance(o: Order, c: Command, a: Actor, at: string): Order {
  const already = o.events.find((x) => x.operation === c.operation)
  if (already) {
    if (
      already.node !== c.node ||
      already.actor !== a.id ||
      already.authority !== a.kind ||
      already.decision !== c.decision ||
      already.plan !== c.plan ||
      already.reason !== c.reason
    )
      throw Error('operation_conflict')
    return o
  }
  const step = readySteps(o).find((s) => s.key === c.node)
  if (!step || step.key !== c.node) throw Error('node_not_current')
  if (step.kind === 'human') {
    if (a.kind !== 'human' || !c.decision || !c.reason?.trim()) throw Error('human_review_required')
  } else if (
    a.kind !== (o.mode === 'pipeline' ? 'published_assistant' : 'sample_assistant') ||
    c.decision ||
    c.plan ||
    c.reason
  )
    throw Error('assistant_required')
  if (c.plan && (step.key !== 'commit' || c.decision !== 'approve')) throw Error('unexpected_plan')
  const record = routeRecord(o, c.node)
  const facts = c.decision === 'reject' ? [f('退回原因', c.reason!)] : evidence(o, step.key, c.plan)
  return {
    ...o,
    events: [
      ...o.events,
      {
        ...c,
        ...(record ? { routeRecord: record } : {}),
        actor: a.id,
        authority: a.kind,
        role: step.kind === 'human' ? reviewers[step.reviewer] : roles[step.role],
        at,
        facts,
        assistantId: a.assistantId,
        executionId: a.executionId,
        conversationId: a.conversationId,
      },
    ],
  }
}
export function successor(parent: Order, id: string, code: string): Order {
  if (status(parent) !== 'complete' || parent.events.at(-1)?.node !== 'publish')
    throw Error('published_rule_required')
  const cause = previous(parent, 'cause').facts.find((x) => x.label === '批准措施')
  if (!cause) throw Error('approved_measure_required')
  return {
    id,
    code,
    mode: parent.mode,
    variant: parent.variant ?? 'shortage',
    rule: 'R2',
    parent: parent.code,
    corrective: { source: parent.code, instruction: cause.value },
    events: [],
  }
}
