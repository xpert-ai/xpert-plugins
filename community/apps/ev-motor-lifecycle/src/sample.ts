export const sample = {
  family: 'EM-160',
  quantity: 12,
  standardIP: 'IP54',
  originalDay: 12,
  requestedDay: 9,
  clause: '技术附件 §4.2：驱动电机总成防护等级 IP67；端子盒维持 IP54。',
  standard: 'PLM / EM-160 / A：总成 IP54；端子盒 IP54；紧固件 4 件/台。',
  inventory: { onHand: 8, inTransit: 4, normalDay: 10, expediteDay: 7 },
  testDays: 2,
  alternativeOrder: 'SO-DEMO-220 / 工单 22B',
  expediteCost: 960,
  lot: 'SEAL-L07',
  seal: 'SEAL-K67',
  test: '台架 T-02 / 总成浸水试验记录合格',
  fieldReport: '客户描述：雨后报警，疑似进水。',
  teardown: '拆检记录：线束引出口密封圈装配偏位；未发现壳体裂纹。',
  corrective: '增设密封圈定位复核工序，留存实装照片并按修订开展验证。',
} as const
export type RuleVersion = 'R1' | 'R2'
export type Plan = 'expedite' | 'split' | 'original'
export function plans(stocked = false) {
  const s = sample,
    gap = s.quantity - s.inventory.onHand
  return [
    {
      key: 'expedite' as const,
      label: stocked ? '齐套，仅调整工单顺序' : '加急采购并换序',
      first: s.inventory.expediteDay + s.testDays,
      last: s.inventory.expediteDay + s.testDays,
      firstQty: s.quantity,
      cost: stocked ? 0 : s.expediteCost,
      impact: s.alternativeOrder + ' 顺延 1 天',
    },
    {
      key: 'split' as const,
      label: '分批交付',
      first: s.requestedDay,
      last: s.inventory.normalDay + s.testDays,
      firstQty: s.quantity - gap,
      cost: 240,
      impact: stocked ? '按现有台架窗口先放行 8 台，后放行 4 台' : '首批 8 台，另 4 台按原交期交付',
    },
    {
      key: 'original' as const,
      label: '维持原计划',
      first: s.originalDay,
      last: s.originalDay,
      firstQty: s.quantity,
      cost: 0,
      impact: '其他工单维持原计划，需与客户确认交期',
    },
  ]
}
const corpus = [
  ['总成 IP67；端子盒 IP54', 'IP67'],
  ['端子盒 IP54；总成 IP67', 'IP67'],
  ['端子盒 IP67；总成 IP54', 'IP54'],
  ['端子盒 IP67', null],
  ['总成 IP54', 'IP54'],
  ['交付前确认总成等级', null],
] as const
export function extract(text: string, rule: RuleVersion) {
  return (
    (rule === 'R1' ? /IP\d{2}/ : /总成(?:防护等级)?\s*(IP\d{2})/).exec(text)?.[rule === 'R1' ? 0 : 1] ?? null
  )
}
export const ruleText = '先区分整机与组件，仅提取明确属于总成的防护等级；缺少总成要求时转人工。'
export function replay() {
  return corpus.map(([input, expected]) => ({
    input,
    expected,
    before: extract(input, 'R1'),
    after: extract(input, 'R2'),
  }))
}
export function score(rows: ReturnType<typeof replay>, key: 'before' | 'after') {
  return rows.filter((row) => row[key] === row.expected).length
}
