/**
 * 业务状态、枚举和对外数据结构（DTO）。
 * 状态值是稳定的英文代码，界面再按 i18n 翻译成中文，后端不返回本地化文案作为唯一状态表示。
 */

/** 提前交货请求状态（产品设计 3.2 节状态机） */
export const REQUEST_STATUSES = ['draft', 'analyzing', 'failed', 'pending_review', 'confirmed', 'rejected'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

/** 分析任务状态：queued 刚建好、running 智能体已读取任务、其余为终态 */
export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'superseded'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ['queued', 'running']

/** AI 可选的建议类型：催料 / 替代料 / 调整交期 / 无需处理 */
export const SUGGESTION_TYPES = ['expedite', 'substitute', 'reschedule', 'no_action'] as const
export type SuggestionType = (typeof SUGGESTION_TYPES)[number]

/** 总结论：可行 / 有条件可行 / 不可行 */
export const FEASIBILITIES = ['feasible', 'conditional', 'infeasible'] as const
export type Feasibility = (typeof FEASIBILITIES)[number]

/** 计划员对每条缺料结论的决定 */
export const FINDING_DECISIONS = ['pending', 'accepted', 'rejected'] as const
export type FindingDecision = (typeof FINDING_DECISIONS)[number]

/** 智能体上报失败时可选的错误码 */
export const REPORTED_FAILURE_CODES = ['INVENTORY_UNAVAILABLE', 'DATA_INCOMPLETE', 'OTHER'] as const
export type ReportedFailureCode = (typeof REPORTED_FAILURE_CODES)[number]

/** 分析任务超时时间：3 分钟（产品设计决策） */
export const ANALYSIS_TIMEOUT_MS = 3 * 60 * 1000

export type LogActor = 'user' | 'agent' | 'system'

/** 当前操作所在的租户/组织/用户范围，所有读写都按它过滤 */
export interface ExpediteScope {
  tenantId: string
  organizationId: string | null
  userId: string
}

/** 结论依据：保存当时的数据快照，保证“当时为什么这么判断”可追溯 */
export interface FindingEvidence {
  bomUsages: { componentCode: string; componentName: string; qtyPerProduct: number }[]
  onHand: number
  inventorySnapshotAt: string
  inboundInWindow: { poNo: string; qty: number; eta: string }[]
  inboundLate: { poNo: string; qty: number; eta: string }[]
  leadTimeDays: number | null
  earliestAvailableDate: string
  substitute: { code: string; name: string; onHand: number; note: string } | null
}
