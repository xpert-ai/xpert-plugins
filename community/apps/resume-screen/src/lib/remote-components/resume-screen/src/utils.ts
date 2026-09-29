/**
 * 远端组件通用工具
 *
 * iframe 侧的纯函数集合：bridge 消息解包、I18n 双语文案取值、视图数据归一化、
 * 查询构造、时间/分数格式化与上传失败指引映射。
 * 刻意保持零依赖（不 import 服务端 lib），保证浏览器 bundle 干净。
 */
import type {
  ActionResult,
  CandidateView,
  JobView,
  ResumeScreenViewData,
  SortBy,
  SortDir,
  StatusFilter,
  UploadRow,
  UploadStatus
} from './types'

// 分页大小：与服务端 getViewData 兜底一致（蓝图 §0.3 查询口径）
export const PAGE_SIZE = 20
// 单列表 DOM 上限：超过后提示用筛选缩小范围，不做虚拟滚动（蓝图 §11）
export const DOM_ROW_CAP = 200
// parsing 行 30s 心跳轮询间隔（蓝图 §11 链路 B 回填校准）
export const PARSE_POLL_MS = 30_000
// 候选人解析超时判定阈值：10 分钟（蓝图 §6.4）
export const PARSE_TIMEOUT_MS = 10 * 60 * 1000
// 上传队列进行中行（v4.2 合并态「上传中」）无回执的行尾提醒阈值：60s（蓝图 §6.6 约束）
export const UPLOAD_STILL_WORKING_MS = 60_000
// A8 行移出淡出提交窗口：160ms 动画 + 20ms 缓冲，窗口结束才替换为纯净列表（蓝图 §7）
export const LEAVE_FADE_MS = 180
// 单文件大小前端预检上限（蓝图 §3.7/D5：≤10MB 预检 + 服务端复校；MB 数以服务端回执为准）
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024
// 预检超限的行内指引文案（与 §6.6 失败原因映射「文件过大」同一条，避免双处漂移）
export const UPLOAD_OVERSIZE_HINT = '文件超过 10MB，请精简或拆分后重新上传'

/**
 * 浮层层级刻度（单一真源，spec §5.6）
 *
 * 宿主把主题与若干浮层写在同一文档里，裸 z-index 会随组件增加互相踩；本表 +
 * CSS 变量 --rs-layer-* 约定「谁的层级归谁」：inline 0 < sticky 10 < sheet-overlay 39
 * < sheet 40 < dialog 50 < popper 60 < toast 70。样式里禁止再出现数字层级，新增层级必须先来这张表里加档。
 *
 * 与 styles.ts 的 --rs-layer-* 声明一一对应（styles.spec.ts 有用例钉死同名同值，防两处漂移）；
 * sheet-overlay 只存在于 CSS 侧、不进本表——它不是组件的「归属层」而是抽屉面板的伴生遮罩，
 * 取 39 落在 sheet(40) 之下，保证抽屉关闭动画中遮罩不会反过来盖住面板。
 */
export const RS_LAYERS = { inline: 0, sticky: 10, sheet: 40, dialog: 50, popper: 60, toast: 70 } as const

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// 解包宿主响应：data/result/payload 三种包装字段依次取壳，都缺省时原样返回
export function unwrap(response: unknown): Record<string, unknown> {
  if (!isObject(response)) return {}
  if (Object.prototype.hasOwnProperty.call(response, 'data')) return asRecord(response.data)
  if (Object.prototype.hasOwnProperty.call(response, 'result')) return asRecord(response.result)
  if (Object.prototype.hasOwnProperty.call(response, 'payload')) return asRecord(response.payload)
  return response
}

function asRecord(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {}
}

// I18n 文本取值：本工作台按中文优先（zh-Hans 部署，蓝图 §5.2），兼容纯字符串回执
export function resolveText(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (isObject(value)) return String(value.zh_Hans || value.en_US || '')
  return String(value)
}

// 解析 executeAction/fileAction 回执：桥响应壳 → ActionResult；解析失败按未知错误处理
export function parseActionResult(response: unknown): ActionResult {
  const value = unwrap(response)
  return {
    success: value.success !== false,
    message: value.message,
    refresh: value.refresh === true,
    data: isObject(value.data) ? value.data : undefined
  }
}

/**
 * 乐观锁冲突识别（S7 审核 F5）
 *
 * 优先消费服务端失败回执的机读错误码（data.code='revision_conflict'），结构化标记
 * 命中即判定冲突；中文文案正则仅作为旧服务端/回执缺 code 时的兜底通道保留，
 * 不再作为主判据（不从 localized copy 猜 payload 语义），新增判定语义禁止挂到正则上。
 */
export function looksLikeRevisionConflict(message: string, code?: unknown): boolean {
  if (code === 'revision_conflict') return true
  return /(刷新|冲突|其他人|已被|stale|conflict|revision)/i.test(message)
}

/**
 * 视图数据归一化：服务端字段缺失时给安全默认，保证渲染层不判空
 *
 * draft 态为服务端中间态：若竞态出现在响应里按 parsing 呈现（蓝图 §6.2）。
 */
export function normalizeViewData(raw: unknown): ResumeScreenViewData {
  const value = unwrap(raw)
  const stats = isObject(value.stats) ? value.stats : {}
  const page = isObject(value.page) ? value.page : {}
  return {
    jobs: Array.isArray(value.jobs) ? (value.jobs as unknown as JobView[]) : [],
    job: isObject(value.job) ? (value.job as unknown as JobView) : undefined,
    candidates: (Array.isArray(value.candidates) ? (value.candidates as CandidateView[]) : []).map((item) =>
      item.status === 'draft' ? { ...item, status: 'parsing' as const } : item
    ),
    stats: {
      total: num(stats.total),
      pendingReview: num(stats.pendingReview),
      accepted: num(stats.accepted),
      hold: num(stats.hold),
      rejected: num(stats.rejected),
      failed: num(stats.failed),
      parsing: num(stats.parsing)
    },
    page: { number: num(page.number, 1), size: num(page.size, PAGE_SIZE), total: num(page.total) }
  }
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

// 视图态查询口径：jobId/status/排序走 parameters，search/分页走宿主标准字段（蓝图 §0.3/P5）
export function buildQuery(options: {
  jobId: string | null
  status: StatusFilter
  sortBy: SortBy
  sortDir: SortDir
  search: string
  page: number
  pageSize: number
}) {
  const parameters: Record<string, unknown> = {
    jobId: options.jobId || undefined,
    status: options.status === 'all' ? undefined : options.status,
    sortBy: options.sortBy,
    sortDir: options.sortDir
  }
  return {
    page: options.page,
    pageSize: options.pageSize,
    search: options.search || undefined,
    parameters
  }
}

// 匹配分档色（列表细条与详情评分区同档）：≥70 蓝、40–69 琥珀、<40 红（蓝图 §3.4/§3.5）
export function scoreTier(score: number | undefined): 'blue' | 'amber' | 'red' | 'none' {
  if (score === undefined || score === null || Number.isNaN(score)) return 'none'
  if (score >= 70) return 'blue'
  if (score >= 40) return 'amber'
  return 'red'
}

// 时间格式化：详情元信息「创建于 MM-DD HH:mm」（蓝图 §3.5）
export function formatMonthDay(value: string | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// parsing 行本地超时判定（30s 心跳重算，蓝图 §6.4）：基线取 updatedAt（服务端最近推进时间）
export function isParsingTimedOut(candidate: CandidateView, now: number): boolean {
  if (candidate.status !== 'parsing') return false
  const base = Date.parse(candidate.updatedAt || candidate.createdAt || '')
  if (Number.isNaN(base)) return false
  return now - base > PARSE_TIMEOUT_MS
}

// 解析中已耗时展示（P3：纯文本呈现，不自绘时间轴）
export function elapsedLabel(fromIso: string | undefined, now: number): string {
  const base = Date.parse(fromIso || '')
  if (Number.isNaN(base)) return ''
  const minutes = Math.max(0, Math.floor((now - base) / 60_000))
  return minutes < 1 ? '不到 1 分钟' : `${minutes} 分钟`
}

// reason token → 可执行指引文案（spec §6.4/§6.6）：processor 与 provider 写入的 failureReason
// 就是这些机器可读原值，命中即翻译；未命中沿用关键字映射，保证旧中文回执通道不回归。
const UPLOAD_FAILURE_TOKEN_COPY: Record<string, string> = {
  file_missing: '该候选人未保留原始简历文件，无法重新解析，请重新上传该简历',
  no_text_layer: '该 PDF 无法提取文字（可能为扫描件），请转存为 Word 后重新上传',
  encrypted: '文件已加密，请解除密码后重新上传',
  unsupported_format: '仅支持 .docx / .pdf（≤10MB），请转换格式后重新上传',
  file_too_large: UPLOAD_OVERSIZE_HINT,
  parse_error: '文件内容无法解析，请确认文件未损坏后重新上传'
}

/**
 * 上传失败指引归一（蓝图 §6.6；失败文案单一真源，弹窗行内指引必须走本函数）
 *
 * 三级映射：机器可读 reason token 精确命中（T11 processor 原值）→ 中文关键字兜底
 * （旧服务端 message 通道）→ 未识别原样透出。空文案按「未知失败」给通用重新上传指引。
 */
export function mapUploadFailure(message: string): string {
  const text = message.trim()
  if (!text) return '上传失败，请重新上传'
  const byToken = UPLOAD_FAILURE_TOKEN_COPY[text]
  if (byToken) return byToken
  if (/加密|password/i.test(text)) return UPLOAD_FAILURE_TOKEN_COPY.encrypted
  if (/扫描|无文本|无法提取文字/.test(text)) return UPLOAD_FAILURE_TOKEN_COPY.no_text_layer
  if (/格式|不支持/.test(text)) return UPLOAD_FAILURE_TOKEN_COPY.unsupported_format
  if (/超过|过大|10MB|size/i.test(text)) return UPLOAD_OVERSIZE_HINT
  return text
}

/**
 * 上传弹窗汇总（spec §5.3）
 *
 * inFlight = queued + uploading；closable 供 footer「完成」与遮罩关闭共判——
 * 有在途字节时关闭必须走 AlertDialog 轻确认，防用户误以为已上传。
 * leaving 行（清除失败记录的 160ms 淡出残影）不参与计数，汇总条数字必须等于用户可见行数。
 */
export function summarizeUploadRows(rows: UploadRow[]) {
  const alive = rows.filter((row) => !row.leaving)
  const count = (status: UploadStatus) => alive.filter((row) => row.status === status).length
  const done = count('created')
  const skipped = count('skipped')
  const failed = count('failed')
  const inFlight = count('queued') + count('uploading')
  return { selected: alive.length, done, skipped, failed, inFlight, closable: inFlight === 0 }
}

/**
 * 列表行内容签名（「琢」性能项）
 *
 * 覆盖行渲染读取的全部字段（含数组逐项）：签名相等 ⇒ 该行本次刷新视觉必然无差异。
 * 只比内容不比引用——normalizeViewData 每轮requestData都产新对象，不收敛引用则
 * memo 形同虚设（§11「避免 hostEvent 全量刷新时整列表重渲」）。
 */
export function candidateSignature(candidate: CandidateView): string {
  return JSON.stringify([
    candidate.status,
    candidate.name ?? '',
    candidate.yearsOfExperience ?? '',
    candidate.education ?? '',
    candidate.currentCompany ?? '',
    candidate.skills ?? [],
    candidate.summary ?? '',
    candidate.matchScore ?? null,
    candidate.matchReason ?? '',
    candidate.hitPoints ?? [],
    candidate.riskPoints ?? [],
    candidate.humanEditedFields ?? [],
    candidate.attemptCount,
    candidate.failureReason ?? '',
    candidate.sourceFileName ?? '',
    candidate.revision,
    candidate.createdAt,
    candidate.updatedAt
  ])
}

/**
 * 引用复用合并（§11）：next 中与 previous 内容完全一致的行沿用旧引用
 *
 * 顺序一律以 next（服务端事实）为准；命中复用的行引用不变 ⇒ memo 行组件整行跳过重渲，
 * 30s 心跳轮询与回执刷新的重渲成本收敛到「真实变化行 + 新增行」。
 */
export function reconcileCandidateItems(previous: CandidateView[], next: CandidateView[]): CandidateView[] {
  if (previous.length === 0) return next
  const previousById = new Map(previous.map((item) => [item.id, item]))
  return next.map((item) => {
    const existing = previousById.get(item.id)
    return existing && !existing.leaving && candidateSignature(existing) === candidateSignature(item) ? existing : item
  })
}

/**
 * 静默刷新合并列表（A8 淡出的数据侧）：新增行直接在场、被移除行原地挂 leaving 副本淡出
 *
 * 关键设计：保留行的排列已经就是最终（next）顺序，淡出行按旧序邻居锚点插入——180ms 后
 * 提交纯净列表时其余行零位移，不会出现「淡出结束后行突然跳位」。previous 里仍在淡出的
 * 行（连续两轮移除竞态）不重复标记，随本轮结果一并延后提交。
 */
export function mergeRefreshedList(previous: CandidateView[], next: CandidateView[]): CandidateView[] {
  const nextIds = new Set(next.map((item) => item.id))
  const merged = reconcileCandidateItems(previous, next)
  const carried = previous.filter((item) => item.leaving && !nextIds.has(item.id))
  const removed = previous.filter((item) => !item.leaving && !nextIds.has(item.id))
  if (removed.length === 0) return carried.length > 0 ? [...merged, ...carried] : merged
  for (const item of removed) {
    // 锚点=旧列表中最近一条仍存活的行：淡出行插在它后面，保持原视觉位置
    const index = previous.indexOf(item)
    const before = previous.slice(0, index).reverse().find((row) => !row.leaving && nextIds.has(row.id))
    const after = before ? undefined : previous.slice(index + 1).find((row) => !row.leaving && nextIds.has(row.id))
    const anchorIndex = before ? merged.findIndex((row) => row.id === before.id) : after ? merged.findIndex((row) => row.id === after.id) : -1
    const position = before && anchorIndex >= 0 ? anchorIndex + 1 : after && anchorIndex >= 0 ? anchorIndex : merged.length
    merged.splice(position, 0, { ...item, leaving: true })
  }
  return carried.length > 0 ? [...merged, ...carried] : merged
}

/**
 * 「加载更多」分页追加合并（I-2 竞态防护的数据侧）
 *
 * 竞态背景：静默刷新若移除了行，会挂 leaving 副本并开 LEAVE_FADE_MS 提交窗口，窗口内的
 * 定时器以「第 1 页快照」做最终合并；若这 180ms 内「加载更多」回执落地并入第 2 页，
 * 旧定时器照常提交就会把整个新页当作「不在快照中」误标 leaving——这批新挂的淡出副本
 * 没有任何后续定时器清理，成为滞留 DOM 的幽灵行。故追加侧以存活行为基底（淡出行即时
 * 净化，不再等窗口提交），并由调用方（workbench）同步递增 removalToken 作废在途定时器，
 * 二者共同保证业务结果：more 回执落地后列表无滞留 leaving 行、新页数据完整在场。
 * 去重按 id：服务端分页边界漂移（新候选人插入使第 2 页回显已有行）不得产生重复 key。
 */
export function mergeAppendedPage(previous: CandidateView[], appended: CandidateView[]): CandidateView[] {
  const merged = previous.filter((item) => !item.leaving)
  for (const item of appended) {
    if (!merged.some((existing) => existing.id === item.id)) merged.push(item)
  }
  return merged
}

// 处置后自动滑向下一条待审：从当前索引沿列表顺序找下一 pending_review（蓝图 §3.6 流水线节奏）
export function nextPendingId(list: CandidateView[], afterId: string | null): string | null {
  const startIndex = afterId ? list.findIndex((item) => item.id === afterId) : -1
  for (let offset = 1; offset <= list.length; offset += 1) {
    const item = list[(startIndex + offset + list.length) % list.length]
    if (item && item.status === 'pending_review') return item.id
  }
  return null
}
