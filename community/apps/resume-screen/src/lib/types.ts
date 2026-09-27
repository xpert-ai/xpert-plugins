/**
 * 简历筛选（resume-screen）领域类型定义
 *
 * 本文件是插件各层（实体、服务、中间件工具、视图）共享的纯类型契约，
 * 不含任何运行时逻辑；候选人状态机与评审动作的取值在此统一定义，
 * 避免各层各自硬编码字符串导致状态流转不一致。
 */

// 候选人在筛选流程中的生命周期状态：解析中 → 待人工评审 → 接收/搁置/淘汰，解析失败单独收敛为 failed
export type ResumeScreenCandidateStatus =
  | 'draft'
  | 'parsing'
  | 'pending_review'
  | 'accepted'
  | 'hold'
  | 'rejected'
  | 'failed'

// 人工评审动作：接受/搁置/淘汰为终态流转，reset_to_pending 允许把误操作的候选人退回待评审
export type ResumeScreenReviewAction = 'accept' | 'hold' | 'reject' | 'reset_to_pending'

// 多租户隔离范围：实体写入与查询都必须携带，organizationId/userId 等为可选弱化维度
export interface ResumeScreenScope {
  tenantId: string
  organizationId?: string | null
  userId?: string | null
  assistantId?: string | null
  conversationId?: string | null
}

// 创建职位描述（JD）时的输入：标题 + JD 原文
export interface ResumeScreenJobInput {
  title: string
  jdText: string
}

// 职位描述视图对象：jdHash 用于同文 JD 去重，时间字段为 ISO 字符串
export interface ResumeScreenJobView {
  id: string
  title: string
  jdText: string
  jdHash: string
  createdAt: string
  updatedAt: string
}

// 简历原文录入输入：sourceText 为必填原文，其余字段允许由 AI 抽取后补填
export interface ResumeScreenCandidateInput {
  sourceText: string
  name?: string
  yearsOfExperience?: string
  education?: string
  currentCompany?: string
  skills?: string[]
  summary?: string
  matchScore?: number
  matchReason?: string
  hitPoints?: string[]
  riskPoints?: string[]
}

// 候选人视图对象：携带状态机、人工编辑痕迹（humanEditedFields）与评审信息，
// attemptCount/revision 用于控制解析重试与乐观并发
export interface ResumeScreenCandidateView {
  id: string
  jobId: string
  status: ResumeScreenCandidateStatus
  name?: string
  yearsOfExperience?: string
  education?: string
  currentCompany?: string
  skills?: string[]
  summary?: string
  matchScore?: number
  matchReason?: string
  hitPoints?: string[]
  riskPoints?: string[]
  humanEditedFields?: string[]
  attemptCount: number
  failureReason?: string
  // 上传通道来源文件名：解析失败行在工作台展示“哪个文件”用的溯源字段
  sourceFileName?: string
  reviewedById?: string
  reviewedAt?: string
  revision: number
  createdAt: string
  updatedAt: string
}

// 批量录入结果：created 为新建候选人，skippedAsExisting 为命中去重键而跳过的原文指纹
export interface ResumeScreenIntakeDraftResult {
  created: ResumeScreenCandidateView[]
  skippedAsExisting: string[]
  jobId: string
}

/** 队列 job payload：红线=只放定位字段，大文本 handler 内按 id 现取（调研 B §3.4） */
export interface ResumeScreenParseJobPayload {
  candidateId: string
  tenantId?: string
  organizationId?: string
  userId?: string
}

// 候选人列表查询条件：排序字段白名单限定为匹配分/创建/更新时间，避免任意排序注入
export interface ResumeScreenCandidateListQuery {
  jobId?: string
  status?: ResumeScreenCandidateStatus
  search?: string
  sortBy?: 'matchScore' | 'createdAt' | 'updatedAt'
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

// 人工评审时允许修正的字段白名单：刻意不含状态与评审结论，二者只能走评审动作
export interface ResumeScreenCandidatePatch {
  name?: string
  yearsOfExperience?: string
  education?: string
  currentCompany?: string
  skills?: string[]
  summary?: string
  matchScore?: number
}

// 工作台视图聚合数据：职位列表/当前职位、候选人分页列表与各状态统计一次返回，
// 供前端渲染看板而无需多次往返
export interface ResumeScreenViewData {
  jobs: ResumeScreenJobView[]
  job?: ResumeScreenJobView
  candidates: ResumeScreenCandidateView[]
  stats: {
    total: number
    pendingReview: number
    accepted: number
    hold: number
    rejected: number
    failed: number
    parsing: number
  }
  page: { number: number; size: number; total: number }
}

// 助手工具返回给大模型的候选人摘要：刻意精简字段以控制上下文长度，
// 详情需通过 detail 工具按 id 二次查询
export interface ResumeScreenAgentCandidateSummary {
  id: string
  name?: string
  status: ResumeScreenCandidateStatus
  matchScore?: number
  education?: string
  yearsOfExperience?: string
  currentCompany?: string
  createdAt: string
}
