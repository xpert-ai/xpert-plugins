export const roles = {
  coordinator: '订单协调助手',
  sales: '销售需求助手',
  engineering: 'BOM 工程助手',
  purchasing: '采购齐套助手',
  planner: '生产计划助手',
  production: '制造交付助手',
  quality: '质量与验证助手',
  service: '售后改进助手',
} as const
export type Role = keyof typeof roles
export const stages = ['订单受理', '工程审核', '插单排程', '生产交付', '售后改进'] as const
export type Stage = 0 | 1 | 2 | 3 | 4
export const reviewers = {
  engineering: '工程负责人',
  planning: '计划负责人',
  quality: '质量负责人',
  knowledge: '工程知识负责人',
} as const
export type Reviewer = keyof typeof reviewers
export type Step = { key: string; title: string; stage: Stage } & (
  | { kind: 'assistant'; role: Exclude<Role, 'coordinator'> }
  | { kind: 'human'; reviewer: Reviewer }
)
export const legacyFlow = [
  {
    key: 'intake',
    title: '提取合同与产品要求',
    stage: 0,
    kind: 'assistant',
    role: 'sales',
  },
  {
    key: 'bom',
    title: '比对防护等级与技术 BOM',
    stage: 1,
    kind: 'assistant',
    role: 'engineering',
  },
  {
    key: 'lock',
    title: '批准差异并冻结 BOM',
    stage: 1,
    kind: 'human',
    reviewer: 'engineering',
  },
  {
    key: 'supply',
    title: '检查齐套与在途物料',
    stage: 2,
    kind: 'assistant',
    role: 'purchasing',
  },
  {
    key: 'schedule',
    title: '比较提前三天交付方案',
    stage: 2,
    kind: 'assistant',
    role: 'planner',
  },
  {
    key: 'commit',
    title: '选择方案并批准排程',
    stage: 2,
    kind: 'human',
    reviewer: 'planning',
  },
  {
    key: 'build',
    title: '报产、装配与实装登记',
    stage: 3,
    kind: 'assistant',
    role: 'production',
  },
  {
    key: 'test',
    title: '核对出厂试验记录',
    stage: 3,
    kind: 'assistant',
    role: 'quality',
  },
  {
    key: 'release',
    title: '签署质量放行',
    stage: 3,
    kind: 'human',
    reviewer: 'quality',
  },
  {
    key: 'ship',
    title: '出库、交付与签收',
    stage: 3,
    kind: 'assistant',
    role: 'production',
  },
  {
    key: 'trace',
    title: '按报修序列号反查实装与试验',
    stage: 4,
    kind: 'assistant',
    role: 'service',
  },
  {
    key: 'cause',
    title: '确认拆检根因与工程措施',
    stage: 4,
    kind: 'human',
    reviewer: 'quality',
  },
  {
    key: 'replay',
    title: '回放专家纠错样本',
    stage: 4,
    kind: 'assistant',
    role: 'engineering',
  },
  {
    key: 'publish',
    title: '审核并发布下一单可采用的规则',
    stage: 4,
    kind: 'human',
    reviewer: 'knowledge',
  },
] as const satisfies readonly Step[]
// Business steps in display order. The two trace lookups can finish in either order.
const after = {
  supply: [
    {
      key: 'expediteCheck',
      title: '核实缺口与供应商交期',
      stage: 2,
      kind: 'assistant',
      role: 'purchasing',
    },
  ],
  trace: [
    {
      key: 'asBuilt',
      title: '按序列号查 MES 实装批次',
      stage: 4,
      kind: 'assistant',
      role: 'production',
    },
    {
      key: 'benchReport',
      title: '按序列号查 QMS 台架索引',
      stage: 4,
      kind: 'assistant',
      role: 'quality',
    },
    {
      key: 'recoverReport',
      title: '按工单补调试验原件并复核序列号',
      stage: 4,
      kind: 'assistant',
      role: 'quality',
    },
  ],
} as const satisfies Record<string, readonly Step[]>
type DefinedStep = (typeof legacyFlow)[number] | (typeof after)[keyof typeof after][number]
type BusinessStep = Step & { key: DefinedStep['key'] }
export const flow = legacyFlow.flatMap((s): BusinessStep[] => [
  s.key === 'trace' ? { ...s, title: '受理报修并锁定序列号' } : s,
  ...(s.key === 'trace' || s.key === 'supply' ? after[s.key] : []),
])
export const variants = ['shortage', 'indexGap'] as const
export type Variant = (typeof variants)[number]
export const routers = {
  materialRoute: {
    title: '密封件是否齐套？',
    stage: 2,
    sources: ['supply'],
    outcomes: ['shortage', 'stocked'],
  },
  traceRoute: {
    title: '实装与试验序列号是否一致？',
    stage: 4,
    sources: ['asBuilt', 'benchReport'],
    outcomes: ['matched', 'lookup'],
  },
} as const
export type RouterKey = keyof typeof routers
export type StepKey = (typeof flow)[number]['key']
export type ScenarioMode = 'rehearsal' | 'pipeline'
export const legacyVersion = '1.0.0'
export const processVersion = '1.1.0'
export const name = '@xpert-ai/plugin-ev-motor-lifecycle'
export const appKey = 'ev-motor-lifecycle'
export const prefix = 'ev_motor'
export const views = {
  dashboard: 'ev_motor_operations_dashboard',
  workspace: 'ev_motor_pipeline_overview',
}
export const provider = 'ev_motor_views'
export const templateKey = (role: Role) => 'ev-motor-' + role
export const agentKey = (role: Role) => 'Agent_motor_' + role
export const middleware = (role: Role) => 'ev_motor_' + role
export const projectType = {
  applicationKey: name + ':' + appKey,
  projectTypeKey: 'order',
}
export const t = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
