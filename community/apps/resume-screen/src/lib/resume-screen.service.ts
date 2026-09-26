/**
 * 简历筛选核心领域服务
 *
 * 承载职位（JD）创建/查询与候选人批量录入、AI 回填、失败重试等业务规则，
 * 是插件内唯一对实体仓库做读写的业务层；多租户隔离靠 scope 三元组
 * （tenantId/organizationId/assistantId）注入每一条查询与写入。
 */
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createHash } from 'crypto'
import { ResumeScreenCandidate, ResumeScreenJob } from './entities'
import type {
  ResumeScreenAgentCandidateSummary,
  ResumeScreenCandidateInput,
  ResumeScreenCandidateListQuery,
  ResumeScreenCandidatePatch,
  ResumeScreenCandidateView,
  ResumeScreenIntakeDraftResult,
  ResumeScreenJobInput,
  ResumeScreenJobView,
  ResumeScreenReviewAction,
  ResumeScreenScope,
  ResumeScreenViewData
} from './types'

// JD 正文最短长度：过短的岗位描述无法支撑有效的匹配评分
const MIN_JD_LENGTH = 30

// 单批简历录入上限：与插件配置 maxResumesPerBatch 默认值保持一致，防止一次录入拖垮解析链路
const DEFAULT_MAX_RESUMES_PER_BATCH = 10

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
  const statusFilter = query.status
    ? filtered.filter((candidate) => candidate.status === statusFilter)
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
  constructor(
    @InjectRepository(ResumeScreenJob)
    private readonly jobRepository: Repository<ResumeScreenJob>,
    @InjectRepository(ResumeScreenCandidate)
    private readonly candidateRepository: Repository<ResumeScreenCandidate>,
    // 插件运行参数（如单批录入上限），由模块装配时注入；容器无对应 provider 时
    // @Optional 允许缺省回落到默认值，避免 DI 因无 Object token 而启动失败
    @Optional()
    private readonly options: { maxResumesPerBatch?: number } = {}
  ) {}

  // 单批录入上限：优先取注入配置，缺省回落到 10，避免未装配配置时放开限制
  private get maxResumesPerBatch(): number {
    return this.options.maxResumesPerBatch ?? DEFAULT_MAX_RESUMES_PER_BATCH
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
   * 批量录入简历原文，生成 parsing 状态的候选人草稿行
   *
   * 以 `jobId|原文` 的 SHA-256 作为幂等键（dedupeKey）：命中同职位下已存在的
   * 原文直接跳过并计入 skippedAsExisting，保证重复提交/断点重传不产生重复行；
   * 不同职位下的同文简历视为不同候选人（dedupeKey 按职位隔离）。
   *
   * @param scope 多租户隔离范围
   * @param jobId 归属职位 id，必须已存在且属于当前作用域
   * @param texts 简历原文数组（用户粘贴/上传内容），空文本会被剔除
   * @returns created 为新建的 parsing 行视图，skippedAsExisting 为被幂等跳过的原文摘要
   * @exception NotFoundException jobId 在作用域内不存在
   * @exception BadRequestException 剔除空文本后无有效输入，或单批超过 maxResumesPerBatch 上限
   */
  async prepareIntakeDraft(
    scope: ResumeScreenScope,
    jobId: string,
    texts: string[]
  ): Promise<ResumeScreenIntakeDraftResult> {
    // 职位必须存在且属于当前作用域，防止跨租户/跨助手挂载候选人
    const job = await this.jobRepository.findOne({ where: { ...this.scopeWhere(scope), id: jobId } })
    if (!job) {
      throw new NotFoundException('岗位不存在')
    }
    // 剔除空白输入，避免空文本产生无意义的解析任务
    const normalized = texts.map((text) => text?.trim()).filter((text): text is string => Boolean(text))
    if (normalized.length === 0) {
      throw new BadRequestException('至少需要一条非空简历文本')
    }
    if (normalized.length > this.maxResumesPerBatch) {
      throw new BadRequestException(`单批最多 ${this.maxResumesPerBatch} 条简历（maxResumesPerBatch 上限）`)
    }
    const created: ResumeScreenCandidateView[] = []
    const skippedAsExisting: string[] = []
    for (const text of normalized) {
      // 幂等键 = 职位 id + 原文指纹，按职位隔离去重范围
      const dedupeKey = sha256(`${jobId}|${text}`)
      const existing = await this.candidateRepository.findOne({
        where: { ...this.scopeWhere(scope), jobId, dedupeKey }
      })
      if (existing) {
        // 只保留原文前 50 字作为跳过摘要，避免结果体携带完整简历原文
        skippedAsExisting.push(text.slice(0, 50))
        continue
      }
      const row = await this.candidateRepository.save(
        this.candidateRepository.create({
          ...this.scopeWhere(scope),
          conversationId: scope.conversationId ?? null,
          createdById: scope.userId ?? null,
          jobId,
          dedupeKey,
          status: 'parsing',
          sourceText: text,
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
   * AI 解析结果的唯一写入口：按 dedupeKey 对 parsing 草稿行做回填式 upsert
   *
   * 与批量录入共用 `jobId|原文` 指纹作为幂等键，模型重试/重复回调不会产生重复行；
   * 已被人工修正过的字段（humanEditedFields）永远不被 AI 覆盖。回填成功后行状态
   * 统一流转到 pending_review 并清空历史失败原因。原文为空的条目直接跳过。
   *
   * @param scope 多租户隔离范围
   * @param jobId 归属职位 id，必须已存在且属于当前作用域
   * @param candidates AI 抽取出的候选人集合（sourceText 必填，用于对齐幂等键）
   * @returns 落库后的候选人视图数组
   * @exception NotFoundException jobId 在作用域内不存在
   * @exception BadRequestException matchScore 不是 0-100 的整数
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
      const sourceText = candidate.sourceText?.trim()
      // 无原文的条目无法对齐幂等键，直接跳过而不是落一条脏数据
      if (!sourceText) {
        continue
      }
      const dedupeKey = sha256(`${jobId}|${sourceText}`)
      const score = candidate.matchScore
      // 匹配分是看板排序与筛选的核心依据，越界值必须在入口处拒绝
      if (score !== undefined && (!Number.isInteger(score) || score < 0 || score > 100)) {
        throw new BadRequestException('matchScore 必须是 0-100 的整数')
      }
      let row = await this.candidateRepository.findOne({
        where: { ...this.scopeWhere(scope), jobId, dedupeKey }
      })
      // 人工修正过的字段受保护：AI 重跑不得覆盖（AC5.2）
      const humanEdited = new Set(row?.humanEditedFields ?? [])
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
      if (row) {
        // 已有草稿行（通常是 parsing 中/失败重试）：原地回填并推进状态，不新建行
        row = await this.candidateRepository.save({
          ...row,
          ...aiPatch,
          status: 'pending_review',
          failureReason: null
        })
      } else {
        row = await this.candidateRepository.save(
          this.candidateRepository.create({
            ...this.scopeWhere(scope),
            conversationId: scope.conversationId ?? null,
            jobId,
            dedupeKey,
            status: 'pending_review',
            sourceText,
            humanEditedFields: [],
            attemptCount: 0,
            revision: 1,
            ...aiPatch
          })
        )
      }
      results.push(toCandidateView(row))
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
   * 与库内 revision 不一致时拒绝写入，避免工作台并发编辑互相覆盖。
   *
   * @param scope 多租户隔离范围
   * @param candidateId 候选人 id，必须已存在且属于当前作用域
   * @patch 人工修正的字段集合（白名单外的字段被忽略），允许为空对象
   * @param expectedRevision 调用方持有的版本号（来自上次读取的视图），必须与库内一致
   * @returns 版本号 +1 且带人工编辑痕迹的候选人视图
   * @exception NotFoundException 候选人在作用域内不存在
   * @exception BadRequestException 版本号过期（提示刷新）或 matchScore 不是 0-100 整数
   */
  async updateCandidate(
    scope: ResumeScreenScope,
    candidateId: string,
    patch: ResumeScreenCandidatePatch,
    expectedRevision: number
  ): Promise<ResumeScreenCandidateView> {
    const row = await this.findCandidate(scope, candidateId)
    // 乐观锁校验：版本号不一致说明他人已先修改，必须让用户刷新后重试而不是静默覆盖
    if ((row.revision ?? 1) !== expectedRevision) {
      throw new BadRequestException('记录已被他人修改，请刷新')
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
    const updated = await this.candidateRepository.save({
      ...row,
      ...applied,
      humanEditedFields: Array.from(humanEdited),
      revision: (row.revision ?? 1) + 1
    })
    return toCandidateView(updated)
  }

  /**
   * 人工处置候选人：接受/搁置/淘汰/撤回为待评审
   *
   * 动作到目标状态的映射见 statusMap；已在目标状态时直接返回（幂等），
   * 避免重复提交产生多余的写库与评审时间刷新。
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
      reviewedAt: new Date()
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
   * attemptCount 保留历史次数以便上游执行重试上限策略。
   *
   * @param scope 多租户隔离范围
   * @param candidateId 候选人 id，必须已存在且属于当前作用域
   * @returns 重置为 parsing 态的候选人视图
   * @exception NotFoundException 候选人在作用域内不存在
   * @exception BadRequestException 当前状态（如 pending_review/终态）不支持重试
   */
  async retryCandidate(scope: ResumeScreenScope, candidateId: string): Promise<ResumeScreenCandidateView> {
    const row = await this.findCandidate(scope, candidateId)
    if (row.status !== 'failed' && row.status !== 'parsing') {
      throw new BadRequestException('当前状态不支持重试')
    }
    const updated = await this.candidateRepository.save({
      ...row,
      status: 'parsing',
      failureReason: null
    })
    return toCandidateView(updated)
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
   * 单次最多返回 100 条以约束模型上下文长度，详情走 getCandidateDetailForAgent 二次查询。
   *
   * @param scope 多租户隔离范围
   * @param query 列表查询条件（jobId 锁定职位维度，其余可选）
   * @returns 精简摘要数组；无候选人时返回空数组
   */
  async listCandidatesForAgent(
    scope: ResumeScreenScope,
    query: ResumeScreenCandidateListQuery
  ): Promise<ResumeScreenAgentCandidateSummary[]> {
    const data = await this.getViewData(scope, { ...query, page: 1, pageSize: 100 })
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
