/**
 * 简历筛选核心领域服务
 *
 * 承载职位（JD）创建/查询与候选人批量录入、AI 回填、失败重试等业务规则，
 * 是插件内唯一对实体仓库做读写的业务层；多租户隔离靠 scope 三元组
 * （tenantId/organizationId/assistantId）注入每一条查询与写入。
 */
import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Repository } from 'typeorm'
import { createHash } from 'crypto'
import { RESUME_SCREEN_SWEEP_BATCH_LIMIT } from './constants'
import { RESUME_SCREEN_PLUGIN_CONTEXT } from './resume-screen-plugin-context'
import { ResumeFileStore } from './resume-file-store'
import { RESUME_SCREEN_DEFAULT_FILE_STORAGE_DIR, resolveFileStorageDir } from './resume-screen.config'
import type { ResumeFileKind } from './resume-file-parser'
import { ResumeScreenCandidate, ResumeScreenJob } from './entities'
import type {
  ResumeScreenAgentCandidateSummary,
  ResumeScreenCandidateInput,
  ResumeScreenCandidateListQuery,
  ResumeScreenCandidatePatch,
  ResumeScreenCandidateView,
  ResumeScreenIntakeDraftResult,
  ResumeScreenIntakeFile,
  ResumeScreenJobInput,
  ResumeScreenJobView,
  ResumeScreenReviewAction,
  ResumeScreenScope,
  ResumeScreenViewData
} from './types'

// JD 正文最短长度：过短的岗位描述无法支撑有效的匹配评分
const MIN_JD_LENGTH = 30

// 单批简历录入上限的兜底值：与插件配置 maxResumesPerBatch 默认值保持一致，防止一次录入拖垮解析链路
const DEFAULT_MAX_RESUMES_PER_BATCH = 10

// 助手列表查询单页封顶：约束模型上下文长度（工具入参 schema 另有更严的 pageSize≤50 闸）
const AGENT_LIST_MAX_PAGE_SIZE = 100

// 乐观锁冲突的机读错误码：视图动作失败回执以 data.code 携带，前端优先消费结构化标记，
// 不再从中文文案猜业务语义（S7 审核 F5）
export const RESUME_SCREEN_REVISION_CONFLICT_CODE = 'revision_conflict'

/**
 * 乐观锁版本冲突异常
 *
 * 继承 BadRequestException 以保持既有 HTTP 400 语义与「message 透传为失败回执文案」的
 * 处理链不变；额外携带 code 结构化标记，让视图层无需按中文文案正则即可识别冲突分支。
 */
export class ResumeScreenRevisionConflictError extends BadRequestException {
  readonly code = RESUME_SCREEN_REVISION_CONFLICT_CODE

  constructor() {
    super('记录已被他人修改，请刷新')
  }
}

// 人工编辑字段白名单：刻意不含状态与评审结论，二者只能走 reviewCandidate 处置通道
const EDITABLE_FIELDS: Array<keyof ResumeScreenCandidatePatch> = [
  'name',
  'yearsOfExperience',
  'education',
  'currentCompany',
  'skills',
  'summary',
  'matchScore'
]

// JD 原文的 SHA-256 归一化指纹，用于同文 JD 去重与简历录入幂等键
function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

// 插件安装上下文里本服务消费的两项配置：批量上限（F2 接线）与简历存储根目录（v5）；
// 上下文形态对齐 processor 的 ParsePluginContext 取法，声明为可选以兼容 harness/单测缺省
type ServicePluginContext = { config?: { maxResumesPerBatch?: number; fileStorageDir?: string } }

// mime → 预览渲染分支判定：docx 走服务端 HTML，pdf 走 base64 交浏览器原生查看器（spec §3.5）
// 无 mime（存量行/异常行）返回 undefined，由 hasFile=false 统一走禁用分支
function toFileKind(mime?: string | null): ResumeFileKind | undefined {
  if (!mime) return undefined
  if (mime.includes('pdf')) return 'pdf'
  return mime.includes('word') ? 'docx' : undefined
}

// 实体行 → 职位视图：时间统一序列化为 ISO 字符串，隔离实体结构与对外契约
function toJobView(job: ResumeScreenJob): ResumeScreenJobView {
  return {
    id: job.id,
    title: job.title,
    jdText: job.jdText,
    jdHash: job.jdHash,
    createdAt: job.createdAt?.toISOString?.() ?? String(job.createdAt),
    updatedAt: job.updatedAt?.toISOString?.() ?? String(job.updatedAt)
  }
}

// 实体行 → 候选人视图：空值统一归一为 undefined 以便 JSON 序列化时省略字段，
// 时间字段序列化为 ISO 字符串，attemptCount/revision 兜底默认值
function toCandidateView(row: ResumeScreenCandidate): ResumeScreenCandidateView {
  return {
    id: row.id,
    jobId: row.jobId,
    status: row.status,
    name: row.name ?? undefined,
    yearsOfExperience: row.yearsOfExperience ?? undefined,
    education: row.education ?? undefined,
    currentCompany: row.currentCompany ?? undefined,
    skills: row.skills ?? undefined,
    summary: row.summary ?? undefined,
    matchScore: row.matchScore ?? undefined,
    matchReason: row.matchReason ?? undefined,
    hitPoints: row.hitPoints ?? undefined,
    riskPoints: row.riskPoints ?? undefined,
    humanEditedFields: row.humanEditedFields ?? [],
    attemptCount: row.attemptCount ?? 0,
    failureReason: row.failureReason ?? undefined,
    sourceFileName: row.sourceFileName || undefined,
    // 派生值而非原始列：fileKind 决定预览分支，hasFile 决定是否允许预览/重试；
    // filePath 刻意不外泄
    fileKind: toFileKind(row.fileMime),
    fileSize: row.fileSize ?? undefined,
    hasFile: Boolean(row.filePath),
    reviewedById: row.reviewedById ?? undefined,
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : undefined,
    revision: row.revision ?? 1,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : ''
  }
}

// 工作台列表排序/筛选：关键字命中姓名/学历/公司/摘要，状态过滤后按白名单字段排序；
// matchScore 缺省视为 -1 使未评分候选人稳定排在有分记录之后
function sortCandidates(candidates: ResumeScreenCandidateView[], query: ResumeScreenCandidateListQuery) {
  const sortBy = query.sortBy ?? 'createdAt'
  const dir = query.sortDir === 'asc' ? 1 : -1
  const keyword = query.search?.trim()?.toLowerCase()
  const filtered = keyword
    ? candidates.filter((candidate) =>
        [candidate.name, candidate.education, candidate.currentCompany, candidate.summary]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      )
    : candidates
  // 回调内必须对比 query.status 而不是 statusFilter 自身：statusFilter 此时仍在初始化表达式
  // 求值中（TDZ），自引用会在带 status 过滤的查询上直接抛 ReferenceError（M11 真机 500 缺陷）
  const statusFilter = query.status
    ? filtered.filter((candidate) => candidate.status === query.status)
    : filtered
  return [...statusFilter].sort((a, b) => {
    if (sortBy === 'matchScore') {
      return ((a.matchScore ?? -1) - (b.matchScore ?? -1)) * dir
    }
    return String(a[sortBy === 'updatedAt' ? 'updatedAt' : 'createdAt']).localeCompare(
      String(b[sortBy === 'updatedAt' ? 'updatedAt' : 'createdAt'])
    ) * dir
  })
}

@Injectable()
export class ResumeScreenService {
  // 简历字节存储：provider 上传落盘、processor 解析读盘、预览渲染读字节的唯一实例。
  // 懒建目录（ResumeFileStore 只在 put 时 mkdir），构造服务实例不碰磁盘。
  private readonly resumeFileStore: ResumeFileStore

  constructor(
    @InjectRepository(ResumeScreenJob)
    private readonly jobRepository: Repository<ResumeScreenJob>,
    @InjectRepository(ResumeScreenCandidate)
    private readonly candidateRepository: Repository<ResumeScreenCandidate>,
    // 插件安装上下文（index.ts register 以 useValue 注册）：读取 ctx.config.maxResumesPerBatch，
    // 让声明的配置真正生效（S7 审核 F2 接线）。harness/单测环境无此 provider 时 @Optional
    // 缺省回落到默认上限
    @Optional()
    @Inject(RESUME_SCREEN_PLUGIN_CONTEXT)
    private readonly pluginContext?: ServicePluginContext
  ) {
    this.resumeFileStore = new ResumeFileStore(
      resolveFileStorageDir(this.pluginContext?.config?.fileStorageDir ?? RESUME_SCREEN_DEFAULT_FILE_STORAGE_DIR)
    )
  }

  /** 简历文件存储（全插件唯一实例，见 §3.1） */
  get fileStore(): ResumeFileStore {
    return this.resumeFileStore
  }

  // 单批录入上限：优先取安装上下文配置（S7 审核 F2 接线），缺省或非法值回落到默认 10，
  // 避免未装配配置时放开限制
  private get maxResumesPerBatch(): number {
    const configured = this.pluginContext?.config?.maxResumesPerBatch
    if (typeof configured === 'number' && Number.isInteger(configured) && configured >= 1) {
      return configured
    }
    return DEFAULT_MAX_RESUMES_PER_BATCH
  }

  // 多租户隔离条件：organizationId/assistantId 缺省时以 null 过滤，保证跨维度不串数据
  private scopeWhere(scope: ResumeScreenScope) {
    return {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? null,
      assistantId: scope.assistantId ?? null
    }
  }

  /**
   * 创建职位（JD）
   *
   * 以归一化后的 JD 原文指纹做同作用域幂等：同文重复创建直接返回既有职位，
   * 不产生重复行。标题必填，JD 正文最少 30 字。
   *
   * @param scope 多租户隔离范围（来自当前会话上下文）
   * @param input 岗位标题与 JD 原文（用户输入）
   * @returns 职位视图；命中幂等键时返回既有职位
   * @exception BadRequestException 标题为空或 JD 正文不足 30 字
   */
  async createJob(scope: ResumeScreenScope, input: ResumeScreenJobInput): Promise<ResumeScreenJobView> {
    const title = input.title?.trim()
    const jdText = input.jdText?.trim()
    if (!title) {
      throw new BadRequestException('岗位标题不能为空')
    }
    if (!jdText || jdText.length < MIN_JD_LENGTH) {
      throw new BadRequestException('JD 正文不能少于 30 字')
    }
    // 同文 JD 在同作用域内视为同一个职位，先查后插实现幂等创建
    const jdHash = sha256(jdText)
    const existing = await this.jobRepository.findOne({
      where: { ...this.scopeWhere(scope), jdHash }
    })
    if (existing) {
      return toJobView(existing)
    }
    const job = await this.jobRepository.save(
      this.jobRepository.create({
        ...this.scopeWhere(scope),
        createdById: scope.userId ?? null,
        title,
        jdText,
        jdHash,
        revision: 1
      })
    )
    return toJobView(job)
  }

  /**
   * 查询当前作用域下的职位列表（按创建时间倒序，最新在前）
   *
   * @param scope 多租户隔离范围
   * @returns 职位视图数组；无数据时返回空数组
   */
  async listJobs(scope: ResumeScreenScope): Promise<ResumeScreenJobView[]> {
    const jobs = await this.jobRepository.find({
      where: this.scopeWhere(scope),
      order: { createdAt: 'DESC' }
    })
    return jobs.map(toJobView)
  }

  /**
   * 获取当前职位：显式给定 jobId 时精确查找（带作用域校验，防止越权访问），
   * 未给定时回退为最新创建的职位，供工作台默认展示
   *
   * @param scope 多租户隔离范围
   * @param jobId 职位 id，来源为用户选择或系统上下文，允许为空
   * @returns 职位视图；作用域内无任何职位且未指定 jobId 时返回 null
   * @exception NotFoundException 指定的 jobId 在作用域内不存在
   */
  async getCurrentJob(scope: ResumeScreenScope, jobId?: string): Promise<ResumeScreenJobView | null> {
    if (jobId) {
      const job = await this.jobRepository.findOne({ where: { ...this.scopeWhere(scope), id: jobId } })
      if (!job) {
        throw new NotFoundException('岗位不存在')
      }
      return toJobView(job)
    }
    const [latest] = await this.jobRepository.find({
      where: this.scopeWhere(scope),
      order: { createdAt: 'DESC' },
      take: 1
    })
    return latest ? toJobView(latest) : null
  }

  /**
   * 批量录入已落盘的简历文件，生成 draft 状态的候选人草稿行
   *
   * 字节由 provider 交给 ResumeFileStore 落盘，本方法只收描述符（领域层不碰字节）。
   * 以 `jobId|fileHash` 的 SHA-256 作为幂等键（dedupeKey）：命中同职位下同一份文件内容
   * 直接跳过并回报文件名，保证重复上传/断点重传不产生重复行；不同职位下的同一份文件
   * 视为不同候选人（dedupeKey 按职位隔离）。
   *
   * @param scope 多租户隔离范围
   * @param jobId 归属职位 id，必须已存在且属于当前作用域
   * @param files 已落盘文件的描述符集合（key/size/sha256/mime 来自 ResumeFileStore.put，
   *              sourceFileName 为用户上传时的原始文件名，逐文件携带）
   * @returns created 为新建的 draft 行视图，skippedAsExisting 为被幂等跳过的**文件名**列表
   *          （刻意不回报任何内容信息）
   * @exception NotFoundException jobId 在作用域内不存在
   * @exception BadRequestException 剔除非法描述符后为空，或单批超过 maxResumesPerBatch 上限
   */
  async prepareIntakeDraft(
    scope: ResumeScreenScope,
    jobId: string,
    files: ResumeScreenIntakeFile[]
  ): Promise<ResumeScreenIntakeDraftResult> {
    // 职位必须存在且属于当前作用域，防止跨租户/跨助手挂载候选人
    const job = await this.jobRepository.findOne({ where: { ...this.scopeWhere(scope), id: jobId } })
    if (!job) {
      throw new NotFoundException('岗位不存在')
    }
    // 字节已由 provider 落盘，这里只收描述符；缺 key 或缺 hash 的条目一旦建行就是
    // 永远读不到内容的死行，必须在建行前剔除（整批全非法才报错）
    const normalized = files.filter((file) => Boolean(file?.key?.trim()) && Boolean(file?.sha256?.trim()))
    if (normalized.length === 0) {
      throw new BadRequestException('至少需要一份简历文件')
    }
    if (normalized.length > this.maxResumesPerBatch) {
      throw new BadRequestException(`单批最多 ${this.maxResumesPerBatch} 条简历（maxResumesPerBatch 上限）`)
    }
    const created: ResumeScreenCandidateView[] = []
    const skippedAsExisting: string[] = []
    for (const file of normalized) {
      // 幂等键 = 职位 id + 文件内容指纹：同名不同内容算两份，不同名同内容算一份
      const dedupeKey = sha256(`${jobId}|${file.sha256}`)
      const existing = await this.candidateRepository.findOne({
        where: { ...this.scopeWhere(scope), jobId, dedupeKey }
      })
      if (existing) {
        // 跳过项只回报文件名，不回报任何内容信息
        skippedAsExisting.push(file.sourceFileName || file.key)
        continue
      }
      const row = await this.candidateRepository.save(
        this.candidateRepository.create({
          ...this.scopeWhere(scope),
          conversationId: scope.conversationId ?? null,
          createdById: scope.userId ?? null,
          jobId,
          dedupeKey,
          // 两段式：先 draft，由 provider 入队成功后推进 parsing（spec §3.4）
          status: 'draft',
          sourceFileName: file.sourceFileName,
          filePath: file.key,
          fileSize: file.size,
          fileHash: file.sha256,
          fileMime: file.mime,
          humanEditedFields: [],
          attemptCount: 0,
          revision: 1
        })
      )
      created.push(toCandidateView(row))
    }
    return { jobId, created, skippedAsExisting }
  }

  /**
   * 把草稿行推进到解析中（上传链路入队前后的状态闸门）
   *
   * @param scope 多租户隔离范围
   * @param candidateId 草稿行 id（必须是 prepareIntakeDraft 刚建出的 draft 行）
   * @returns parsing 态视图；对非 draft 行幂等返回当前视图，不回退状态
   */
  async markCandidateParsing(scope: ResumeScreenScope, candidateId: string): Promise<ResumeScreenCandidateView> {
    const row = await this.findCandidate(scope, candidateId)
    if (row.status !== 'draft') {
      // 重复调用（重试/回执竞态）不得把已定稿行拉回 parsing
      return toCandidateView(row)
    }
    const updated = await this.candidateRepository.save({ ...row, status: 'parsing' })
    return toCandidateView(updated)
  }

  /**
   * AI 解析结果的唯一写入口：按草稿行主键 candidateId 回填 parsing/failed 行
   *
   * v5 起原文不入库，模型侧无法反推 dedupeKey，锚点整体换成上传通道建出的草稿行 id
   * （spec §3.4）。缺锚点或锚点未命中的条目只记 warn 后丢弃——既不中断整批，也绝不
   * 新建行（建行只属于上传通道）；只有 parsing / failed 可写，pending_review 及人工
   * 处置终态一律跳过，让迟到的重复回执改写不了已交人评审的结果。已被人工修正过的字段
   * （humanEditedFields）永远不被 AI 覆盖，回填成功后状态统一流转到 pending_review
   * 并清空历史失败原因。回填属系统写，刻意不推进 revision（S7 审核 F9）。
   *
   * @param scope 多租户隔离范围
   * @param jobId 归属职位 id，必须已存在且属于当前作用域
   * @param candidates AI 抽取出的候选人集合（candidateId 必填，来自列表工具返回的行 id）
   * @returns 落库后的候选人视图数组；被跳过的条目不出现在结果里
   * @exception NotFoundException jobId 在作用域内不存在
   * @exception BadRequestException matchScore 不是 0-100 的整数（入口闸，整批拒绝）
   */
  async saveCandidatesFromAgent(
    scope: ResumeScreenScope,
    jobId: string,
    candidates: ResumeScreenCandidateInput[]
  ): Promise<ResumeScreenCandidateView[]> {
    const job = await this.jobRepository.findOne({ where: { ...this.scopeWhere(scope), id: jobId } })
    if (!job) {
      throw new NotFoundException('岗位不存在')
    }
    const results: ResumeScreenCandidateView[] = []
    for (const candidate of candidates) {
      const candidateId = candidate.candidateId?.trim()
      if (!candidateId) {
        // 缺锚点的条目无从定位行（原文已不入库），记 warn 丢弃而不是抛错中断整批
        console.warn(`[ResumeScreenService] AI 回填条目缺少 candidateId，已跳过: jobId=${jobId}`)
        continue
      }
      const score = candidate.matchScore
      // 匹配分是看板排序与筛选的核心依据，越界值必须在入口处拒绝
      if (score !== undefined && (!Number.isInteger(score) || score < 0 || score > 100)) {
        throw new BadRequestException('matchScore 必须是 0-100 的整数')
      }
      const row = await this.candidateRepository.findOne({
        where: { ...this.scopeWhere(scope), jobId, id: candidateId }
      })
      if (!row) {
        console.warn(`[ResumeScreenService] AI 回填锚点未命中任何行，已跳过: jobId=${jobId}, candidateId=${candidateId}`)
        continue
      }
      // 幂等保护：只有等待解析的行可写。pending_review 及人工处置终态一律跳过——
      // 迟到的重复回执不得改写已交人评审的结果（spec §3.4）
      if (row.status !== 'parsing' && row.status !== 'failed') {
        console.warn(`[ResumeScreenService] 行状态不接受 AI 回填，已跳过: candidateId=${candidateId}, status=${row.status}`)
        continue
      }
      // 人工修正过的字段受保护：AI 重跑不得覆盖（AC5.2）
      const humanEdited = new Set(row.humanEditedFields ?? [])
      const protectedFields: Array<keyof ResumeScreenCandidateInput> = [
        'name',
        'yearsOfExperience',
        'education',
        'currentCompany',
        'skills',
        'summary',
        'matchScore',
        'matchReason',
        'hitPoints',
        'riskPoints'
      ]
      const aiPatch: Partial<ResumeScreenCandidate> = {}
      for (const field of protectedFields) {
        if (humanEdited.has(field)) {
          continue
        }
        const value = candidate[field]
        if (value !== undefined) {
          ;(aiPatch as Record<string, unknown>)[field] = value
        }
      }
      // 回填是系统写：原地推进状态，刻意不动 revision（S7 审核 F9）——本方法不得把人工
      // 正在编辑的行顶成「已被他人修改」冲突，版本推进只归属人工处置/编辑通道（spec §7.5
      // 硬约束 3）；人工编辑保护的语义由 humanEditedFields 承担，与版本号无关
      const saved = await this.candidateRepository.save({
        ...row,
        ...aiPatch,
        status: 'pending_review',
        failureReason: null
      })
      results.push(toCandidateView(saved))
    }
    return results
  }

  // 按作用域查找候选人：查不到统一抛 404，防止跨租户/跨助手操作他人数据
  private async findCandidate(scope: ResumeScreenScope, candidateId: string): Promise<ResumeScreenCandidate> {
    const row = await this.candidateRepository.findOne({
      where: { ...this.scopeWhere(scope), id: candidateId }
    })
    if (!row) {
      throw new NotFoundException('候选人不存在')
    }
    return row
  }

  /**
   * 人工编辑候选人档案字段（乐观锁保护）
   *
   * 仅接受 EDITABLE_FIELDS 白名单内的字段，命中字段全部记入 humanEditedFields，
   * 使其后续被 saveCandidatesFromAgent 的 AI 回填保护规则豁免；expectedRevision
   * 与库内 revision 不一致时拒绝写入，避免工作台并发编辑互相覆盖。版本判定收敛进
   * UPDATE 的 WHERE 条件（读-判-写原子化），并发窗口内版本被他人抢先推进时以
   * affected=0 拒绝，杜绝「先读旧版本再盲目覆盖」的 TOCTOU 绕过（S7 审核 F1）。
   *
   * @param scope 多租户隔离范围
   * @param candidateId 候选人 id，必须已存在且属于当前作用域
   * @patch 人工修正的字段集合（白名单外的字段被忽略），允许为空对象
   * @param expectedRevision 调用方持有的版本号（来自上次读取的视图），必须与库内一致
   * @returns 版本号 +1 且带人工编辑痕迹的候选人视图
   * @exception NotFoundException 候选人在作用域内不存在
   * @exception ResumeScreenRevisionConflictError（BadRequestException 子类）版本号过期
   *            （携带机读 code，视图层据此回冲突回执）；matchScore 越界抛 BadRequestException
   */
  async updateCandidate(
    scope: ResumeScreenScope,
    candidateId: string,
    patch: ResumeScreenCandidatePatch,
    expectedRevision: number
  ): Promise<ResumeScreenCandidateView> {
    const row = await this.findCandidate(scope, candidateId)
    // 预检快速失败：常态下的过期版本在这里拦截；预检与条件更新之间的并发窗口由下方
    // UPDATE WHERE 的 revision 条件兜住，两层共同构成原子乐观锁
    if ((row.revision ?? 1) !== expectedRevision) {
      throw new ResumeScreenRevisionConflictError()
    }
    // 匹配分是看板排序依据，越界值在入口拒绝，避免脏分数破坏排序与筛选
    if (patch.matchScore !== undefined && (!Number.isInteger(patch.matchScore) || patch.matchScore < 0 || patch.matchScore > 100)) {
      throw new BadRequestException('matchScore 必须是 0-100 的整数')
    }
    const humanEdited = new Set(row.humanEditedFields ?? [])
    const applied: Partial<ResumeScreenCandidate> = {}
    // 只放行白名单字段：状态/评审结论等业务字段不允许通过编辑通道篡改
    for (const field of EDITABLE_FIELDS) {
      const value = patch[field]
      if (value !== undefined) {
        ;(applied as Record<string, unknown>)[field] = value
        // 记录人工编辑痕迹，AI 重跑回填时据此保护这些字段不被覆盖（AC5.2）
        humanEdited.add(field)
      }
    }
    // 条件更新（同 claimStaleParsing 模式）：WHERE 带作用域 + id + expectedRevision，
    // revision 用 SQL 表达式原子 +1——读-判-写三步在数据库层面原子化（S7 审核 F1）
    const result = await this.candidateRepository.update(
      { ...this.scopeWhere(scope), id: candidateId, revision: expectedRevision },
      {
        ...applied,
        humanEditedFields: Array.from(humanEdited),
        revision: () => '"revision" + 1',
        updatedAt: new Date()
      }
    )
    // affected≠1 即版本已在预检之后被他人推进（或行被并发删除），按冲突拒绝而不是覆盖
    if (Number(result.affected ?? 0) !== 1) {
      throw new ResumeScreenRevisionConflictError()
    }
    // UPDATE 不回传列值：回读写入后的行作为回执视图（条件更新成功即本窗口唯一写者）
    const updated = await this.candidateRepository.findOne({
      where: { ...this.scopeWhere(scope), id: candidateId }
    })
    return toCandidateView(updated as ResumeScreenCandidate)
  }

  /**
   * 人工处置候选人：接受/搁置/淘汰/撤回为待评审
   *
   * 动作到目标状态的映射见 statusMap；已在目标状态时直接返回（幂等），
   * 避免重复提交产生多余的写库与评审时间刷新。每次实际写库都递增 revision：
   * 处置同样是人工写，必须推进乐观锁版本使并发编辑者的旧版本号失效（S7 审核 F9，
   * spec §7.5 硬约束 3）。
   *
   * @param scope 多租户隔离范围
   * @param candidateId 候选人 id，必须已存在且属于当前作用域
   * @param action 评审动作（accept/hold/reject/reset_to_pending）
   * @param reviewerId 评审人用户 id（来自会话上下文），落库用于审计追溯
   * @returns 处置后的候选人视图
   * @exception NotFoundException 候选人在作用域内不存在
   */
  async reviewCandidate(
    scope: ResumeScreenScope,
    candidateId: string,
    action: ResumeScreenReviewAction,
    reviewerId: string
  ): Promise<ResumeScreenCandidateView> {
    const row = await this.findCandidate(scope, candidateId)
    // 评审动作 → 目标状态映射：终态流转集中在此，避免各调用方自行拼状态字符串
    const statusMap: Record<ResumeScreenReviewAction, ResumeScreenCandidateView['status']> = {
      accept: 'accepted',
      hold: 'hold',
      reject: 'rejected',
      reset_to_pending: 'pending_review'
    }
    const target = statusMap[action]
    // 幂等保护：重复提交同一处置动作直接返回当前行，不重复写库（AC3.3）
    if (row.status === target) {
      return toCandidateView(row)
    }
    const updated = await this.candidateRepository.save({
      ...row,
      status: target,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      // 处置写库推进版本号：让持有旧 revision 的并发编辑在下一次保存时收到冲突回执（F9）
      revision: (row.revision ?? 1) + 1
    })
    return toCandidateView(updated)
  }

  /**
   * 标记候选人解析失败
   *
   * 记录可读的失败原因并累加 attemptCount（重试上限的计数依据），
   * 只做状态标记不触发重试，重试由 retryCandidate 显式发起。
   *
   * @param scope 多租户隔离范围
   * @param candidateId 候选人 id，必须已存在且属于当前作用域
   * @param reason 失败原因（来自模型/解析层的可读描述），空值兜底为通用文案
   * @returns 失败态的候选人视图
   * @exception NotFoundException 候选人在作用域内不存在
   */
  async markCandidateFailed(scope: ResumeScreenScope, candidateId: string, reason: string): Promise<ResumeScreenCandidateView> {
    const row = await this.findCandidate(scope, candidateId)
    const updated = await this.candidateRepository.save({
      ...row,
      status: 'failed',
      failureReason: reason || '处理失败',
      attemptCount: (row.attemptCount ?? 0) + 1
    })
    return toCandidateView(updated)
  }

  /**
   * 重试候选人解析
   *
   * 仅 failed / parsing 两种状态允许重试（M1 修正：parsing 行在模型彻底失败后
   * 也要能被人工重新拉起）；重试复用同一行（不变更 dedupeKey），保证幂等不产生重复，
   * attemptCount 保留历史次数以便上游执行重试上限策略。重试属人工写，同样递增
   * revision 使并发编辑者的旧版本号失效（S7 审核 F9）。
   *
   * @param scope 多租户隔离范围
   * @param candidateId 候选人 id，必须已存在且属于当前作用域
   * @returns 重置为 parsing 态的候选人视图
   * @exception NotFoundException 候选人在作用域内不存在
   * @exception BadRequestException 当前状态（如 pending_review/终态）不支持重试，
   *            或该行没有落盘文件（v5 之前的存量行，只能重新上传）
   */
  async retryCandidate(scope: ResumeScreenScope, candidateId: string): Promise<ResumeScreenCandidateView> {
    const row = await this.findCandidate(scope, candidateId)
    if (row.status !== 'failed' && row.status !== 'parsing') {
      throw new BadRequestException('当前状态不支持重试')
    }
    // 存量行（v5 前录入）没有文件字节，重试只会让任务期读到空路径：
    // 直接给可读失败，指引人工重新上传（spec §6.4 文案同源）
    if (!row.filePath) {
      throw new BadRequestException('该候选人未保留原始简历文件，无法重新解析，请重新上传该简历')
    }
    const updated = await this.candidateRepository.save({
      ...row,
      status: 'parsing',
      failureReason: null,
      // 人工重试推进版本号（与 reviewCandidate 同口径，provider 的 r{revision} 入队
      // 后缀也因此逐次变号，不与上一代 jobId 撞车）
      revision: (row.revision ?? 1) + 1
    })
    return toCandidateView(updated)
  }

  /**
   * 按 id 跨视图取解析所需全量行 + 所属 job 文本（链路 B worker 专用）
   *
   * 队列 handler 无请求上下文，不能走 scopeWhere 常规读路径；隔离维度靠行自携带
   * 字段重建（含 assistantId——saveCandidatesFromAgent 的作用域校验依赖它），
   * JD 文本按行 jobId 现查，prompt 构造不再回库。
   * v5 起本行不回简历正文：只给文件定位三字段，字节由 processor 经 fileStore 现读，
   * 文本仅存在于任务内存（spec §3.5 红线）。
   *
   * @param candidateId 候选人行 id（job payload 唯一业务字段）
   * @returns 解析行视图；行不存在返回 null（幂等认领的判据之一）
   */
  async getCandidateForParse(candidateId: string) {
    const row = await this.candidateRepository.findOne({ where: { id: candidateId } })
    if (!row) {
      return null
    }
    const job = await this.jobRepository.findOne({ where: { id: row.jobId } })
    return {
      id: row.id,
      jobId: row.jobId,
      status: row.status,
      // 文件定位三字段：processor 用 filePath 读字节、用 sourceFileName 判扩展名
      filePath: row.filePath ?? '',
      fileMime: row.fileMime ?? '',
      sourceFileName: row.sourceFileName ?? '',
      attemptCount: row.attemptCount ?? 0,
      humanEditedFields: row.humanEditedFields ?? [],
      scope: {
        tenantId: row.tenantId ?? '',
        organizationId: row.organizationId ?? null,
        userId: row.createdById ?? null,
        assistantId: row.assistantId ?? null
      },
      jobTitle: job?.title ?? '',
      jobJdText: job?.jdText ?? ''
    }
  }

  /**
   * sweep 查询：捞 updatedAt 早于阈值的 parsing 滞留行（全局无请求作用域）
   *
   * worker 上下文合法例外——跨租户捞取，但返回行自带原 scope 三元组，
   * 重投 payload 按原行归属路由，不会把 A 租户的滞留行投给 B。
   *
   * @param thresholdMs 滞留判定毫秒数（parsing 且 updatedAt 早于 now-thresholdMs）
   * @returns 每行 { id, attemptCount, scope }，供 sweep 抢占与重投使用
   */
  async findStaleParsingRows(thresholdMs: number) {
    const cutoff = new Date(Date.now() - thresholdMs)
    const rows = await this.candidateRepository.find({
      where: { status: 'parsing', updatedAt: LessThan(cutoff) },
      take: RESUME_SCREEN_SWEEP_BATCH_LIMIT
    })
    return rows.map((row) => ({
      id: row.id,
      attemptCount: row.attemptCount ?? 0,
      scope: {
        tenantId: row.tenantId ?? '',
        organizationId: row.organizationId ?? null,
        userId: row.createdById ?? null,
        assistantId: row.assistantId ?? null
      }
    }))
  }

  /**
   * 条件抢占并原子变号：仍 parsing 且已滞留（updatedAt<cutoff）才占位
   *
   * 多副本/双 sweep 并发安全（调研 B §4 lease 模式简化版），affected=1 视为独占成功。
   * 关键点（M8' Important-1）：attemptCount 在同一条件更新里用 SQL 表达式原子 +1 持久化——
   * 若只在内存 +1，重投 job 再次丢失（worker 崩溃循环）时下轮从库读回的还是原值，
   * jobId 会与 Redis 内存活（failed 保留 7d）的上一代同 id 被 BullMQ 静默去重，行永卡 parsing。
   * cutoff 条件同时防止抢占窗口内被回填的新鲜行被误计一次。
   *
   * @param candidateId 候选人行 id
   * @param cutoff 滞留判定时刻（updatedAt 早于该时刻才允许抢占，来源为 sweep 的阈值时刻）
   * @returns null=抢占失败（行非 parsing / 仍新鲜 / 竞争输给他人）；number=自增后回读的新投递代号，
   *          调用方直接以该值入队，jobId 与上一代必然不同
   */
  async claimStaleParsing(candidateId: string, cutoff: Date): Promise<number | null> {
    const result = await this.candidateRepository.update(
      { id: candidateId, status: 'parsing', updatedAt: LessThan(cutoff) },
      { updatedAt: new Date(), attemptCount: () => '"attemptCount" + 1' }
    )
    if (Number(result.affected ?? 0) !== 1) {
      return null
    }
    // UPDATE 不回传列值：回读自增后的新号作为重投 jobId 的唯一口径（抢占成功后本方为唯一写者）
    const claimed = await this.candidateRepository.findOne({
      where: { id: candidateId },
      select: { attemptCount: true }
    })
    return claimed?.attemptCount ?? 0
  }

  /**
   * 聚合工作台视图数据：职位列表、当前职位、候选人分页与各状态统计
   *
   * 候选人始终挂在当前职位（显式 jobId 或最新职位）下，先排序筛选再内存分页，
   * 统计基于过滤前的全量候选人，保证分页翻页时看板总数稳定。
   *
   * @param scope 多租户隔离范围
   * @param query 列表查询条件（jobId/状态/关键字/排序/分页），全部可选
   * @returns 视图聚合数据；作用域内无职位时 candidates/stats/page 返回空值结构
   * @exception NotFoundException 显式指定的 jobId 在作用域内不存在
   */
  async getViewData(scope: ResumeScreenScope, query: ResumeScreenCandidateListQuery): Promise<ResumeScreenViewData> {
    const jobs = await this.listJobs(scope)
    const currentJob = await this.getCurrentJob(scope, query.jobId)
    // 无当前职位时返回空结构，前端据此渲染引导页而不是报错
    const candidates = currentJob
      ? (
          await this.candidateRepository.find({
            where: { ...this.scopeWhere(scope), jobId: currentJob.id }
          })
        ).map(toCandidateView)
      : []
    const sorted = sortCandidates(candidates, query)
    const pageSize = query.pageSize ?? 20
    const pageNumber = query.page ?? 1
    const start = (pageNumber - 1) * pageSize
    const paged = sorted.slice(start, start + pageSize)
    // 统计口径为当前职位全量候选人（过滤前），与列表分页解耦
    const countBy = (status: ResumeScreenCandidateView['status']) =>
      candidates.filter((candidate) => candidate.status === status).length
    return {
      jobs,
      job: currentJob ?? undefined,
      candidates: paged,
      stats: {
        total: candidates.length,
        pendingReview: countBy('pending_review'),
        accepted: countBy('accepted'),
        hold: countBy('hold'),
        rejected: countBy('rejected'),
        failed: countBy('failed'),
        parsing: countBy('parsing')
      },
      page: { number: pageNumber, size: pageSize, total: sorted.length }
    }
  }

  /**
   * 助手只读查询：返回候选人紧凑摘要列表（刻意不含简历原文）
   *
   * 供 resume_screen_list_candidates 工具使用；复用 getViewData 的排序/过滤口径，
   * 分页透传调用方取值、pageSize 封顶 100 以约束模型上下文长度（S7 审核 F8：
   * 工具入参声明了 page/pageSize，服务层不得硬覆盖），详情走 getCandidateDetailForAgent 二次查询。
   *
   * @param scope 多租户隔离范围
   * @param query 列表查询条件（jobId 锁定职位维度，page/pageSize 等可选）
   * @returns 精简摘要数组；无候选人时返回空数组
   */
  async listCandidatesForAgent(
    scope: ResumeScreenScope,
    query: ResumeScreenCandidateListQuery
  ): Promise<ResumeScreenAgentCandidateSummary[]> {
    // 透传 page；pageSize 缺省取封顶值、超界值收敛到 100，保住「单次查询不撑爆上下文」的闸
    const data = await this.getViewData(scope, {
      ...query,
      page: query.page ?? 1,
      pageSize: Math.min(query.pageSize ?? AGENT_LIST_MAX_PAGE_SIZE, AGENT_LIST_MAX_PAGE_SIZE)
    })
    // 逐字段白名单映射，确保 sourceText 等大字段永不进入模型上下文
    return data.candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      status: candidate.status,
      matchScore: candidate.matchScore,
      education: candidate.education,
      yearsOfExperience: candidate.yearsOfExperience,
      currentCompany: candidate.currentCompany,
      createdAt: candidate.createdAt
    }))
  }

  /**
   * 助手只读查询：返回单个候选人详情（剥离简历原文）
   *
   * 供 resume_screen_get_candidate_detail 工具使用；sourceText 仅用于幂等对齐，
   * 对模型无增量价值且占用大量上下文，故在出口剥离。
   *
   * @param scope 多租户隔离范围
   * @param candidateId 候选人 id，必须已存在且属于当前作用域
   * @returns 不含 sourceText 的候选人视图
   * @exception NotFoundException 候选人在作用域内不存在
   */
  async getCandidateDetailForAgent(
    scope: ResumeScreenScope,
    candidateId: string
  ): Promise<Omit<ResumeScreenCandidateView, 'sourceText'>> {
    const row = await this.findCandidate(scope, candidateId)
    const view = toCandidateView(row)
    const { sourceText: _sourceText, ...detail } = view as ResumeScreenCandidateView & { sourceText?: string }
    return detail
  }
}
