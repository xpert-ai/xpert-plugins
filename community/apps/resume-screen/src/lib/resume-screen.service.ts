/**
 * 简历筛选核心领域服务
 *
 * 承载职位（JD）创建/查询与候选人批量录入、AI 回填、失败重试等业务规则，
 * 是插件内唯一对实体仓库做读写的业务层；多租户隔离靠 scope 三元组
 * （tenantId/organizationId/assistantId）注入每一条查询与写入。
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createHash } from 'crypto'
import { ResumeScreenCandidate, ResumeScreenJob } from './entities'
import type {
  ResumeScreenCandidateInput,
  ResumeScreenCandidateView,
  ResumeScreenIntakeDraftResult,
  ResumeScreenJobInput,
  ResumeScreenJobView,
  ResumeScreenScope
} from './types'

// JD 正文最短长度：过短的岗位描述无法支撑有效的匹配评分
const MIN_JD_LENGTH = 30

// 单批简历录入上限：与插件配置 maxResumesPerBatch 默认值保持一致，防止一次录入拖垮解析链路
const DEFAULT_MAX_RESUMES_PER_BATCH = 10

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

@Injectable()
export class ResumeScreenService {
  constructor(
    @InjectRepository(ResumeScreenJob)
    private readonly jobRepository: Repository<ResumeScreenJob>,
    @InjectRepository(ResumeScreenCandidate)
    private readonly candidateRepository: Repository<ResumeScreenCandidate>,
    // 插件运行参数（如单批录入上限），由模块装配时注入；缺省时使用与配置默认值一致的兜底值
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
}
