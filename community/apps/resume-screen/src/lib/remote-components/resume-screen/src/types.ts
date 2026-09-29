/**
 * 简历初筛工作台远端组件类型契约
 *
 * 本文件只放 iframe 侧需要的纯类型：bridge 消息协议类型（对齐平台
 * xpertai.remote_component v1 协议，与 crm-workbench 同构）与服务端
 * ResumeScreenViewData 的只读镜像（来源 lib/types.ts，iframe 不 import
 * 服务端模块以避免把 node 依赖带进浏览器 bundle）。
 */

// ===== bridge 协议类型（与宿主 remote-component-renderer 约定一致） =====

export interface HostContext {
  locale?: string
  manifest?: unknown
  payload?: {
    parameters?: Record<string, unknown>
  }
  initialQuery?: {
    page?: number
    pageSize?: number
    search?: string
    parameters?: Record<string, unknown>
  }
  theme?: unknown
}

export interface BridgeMessage {
  channel?: string
  protocolVersion?: number
  instanceId?: string | null
  type?: string
  requestId?: string
  manifest?: unknown
  payload?: HostContext['payload']
  initialQuery?: HostContext['initialQuery']
  locale?: string
  theme?: unknown
  data?: unknown
  result?: unknown
  message?: string
  event?: unknown
}

// ===== 视图数据镜像（服务端 lib/types.ts 的浏览器侧只读拷贝） =====

// 候选人六态 + 服务端中间态 draft（UI 不呈现 draft，竞态时按解析中处理）
export type CandidateStatus = 'draft' | 'parsing' | 'pending_review' | 'accepted' | 'hold' | 'rejected' | 'failed'

export interface JobView {
  id: string
  title: string
  jdText: string
  jdHash: string
  createdAt: string
  updatedAt: string
}

export interface CandidateView {
  id: string
  jobId: string
  status: CandidateStatus
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
  // 上传通道来源文件名：列表/详情来源角标与上传队列「查看」跳转的溯源字段
  sourceFileName?: string
  reviewedById?: string
  reviewedAt?: string
  revision: number
  createdAt: string
  updatedAt: string
  // 展示域（非服务端字段）：筛选/刷新导致行移除时的 A8 淡出标记，180ms 后随纯净列表提交消失
  leaving?: boolean
}

export interface ViewStats {
  total: number
  pendingReview: number
  accepted: number
  hold: number
  rejected: number
  failed: number
  parsing: number
}

export interface ViewPage {
  number: number
  size: number
  total: number
}

export interface ResumeScreenViewData {
  jobs: JobView[]
  job?: JobView
  candidates: CandidateView[]
  stats: ViewStats
  page: ViewPage
}

// 动作回执（服务端 XpertViewActionResult 的镜像；message 为 I18n 双语文本）
export interface ActionResult {
  success?: boolean
  message?: unknown
  refresh?: boolean
  data?: unknown
}

// 新建岗位提交出口（蓝图 §3.2 双通道裁决）：ok=false 且无 notice 为标题重复类业务失败
// （仅 notify + 回焦名称字段）；带 notice 为「其他异常」，由 Dialog 内 notice 红变体呈现（M10 M-3），Dialog 保持打开
export interface JobCreateOutcome {
  ok: boolean
  notice?: string
}

// ===== 上传弹窗逐文件进度行（iframe 前端内存态，蓝图 §5.3/§6.6） =====

// 文件级状态机（v4.2 五态）：排队中 → 上传中（单一进行态：字节传输+服务端校验/解析/落库同一请求往返）
// → 回执终态 已创建/跳过/失败；进度行为前端内存态，无服务端台账（§0.3/§6.6）
export type UploadStatus = 'queued' | 'uploading' | 'created' | 'skipped' | 'failed'

// 上传弹窗内的逐文件进度行（前端内存态，无服务端台账）
export interface UploadRow {
  // 本地自增 id：乐观行不依赖服务端返回即可稳定渲染
  localId: number
  fileName: string
  status: UploadStatus
  // 失败时展示的服务端可读指引文案（failureReason 映射，§6.6 表）
  failureReason?: string
  // 已创建行的候选人 id：「查看」跳转选中用
  candidateId?: string
  // 入队时间戳：进行中行超 60s 的「仍在处理」提示判定（§6.6 约束）
  startedAt: number
  // 「清除失败记录」淡出中（A8）：置位后 160ms 移除，不整队列重渲
  leaving?: boolean
}

// 人工修正字段白名单镜像（服务端 ResumeScreenCandidatePatch：刻意不含状态与评审结论）
export interface ResumeScreenCandidatePatchMirror {
  name?: string
  yearsOfExperience?: string
  education?: string
  currentCompany?: string
  skills?: string[]
  summary?: string
  matchScore?: number
}

// 排序参数镜像：与服务端 ResumeScreenCandidateListQuery 白名单一致
export type SortBy = 'matchScore' | 'createdAt' | 'updatedAt'
export type SortDir = 'asc' | 'desc'

// 状态筛选值：'all' 为前端态，其余映射服务端 status
export type StatusFilter = 'all' | CandidateStatus

declare global {
  interface Window {
    // bridge 层未就绪时宿主触发的重载钩子（对齐 crm __crmReload 模式）
    __resumeScreenReload?: () => void
  }
}
