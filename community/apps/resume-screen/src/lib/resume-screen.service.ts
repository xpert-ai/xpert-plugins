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
import type { ResumeScreenJobInput, ResumeScreenJobView, ResumeScreenScope } from './types'

// JD 正文最短长度：过短的岗位描述无法支撑有效的匹配评分
const MIN_JD_LENGTH = 30

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

@Injectable()
export class ResumeScreenService {
  constructor(
    @InjectRepository(ResumeScreenJob)
    private readonly jobRepository: Repository<ResumeScreenJob>,
    @InjectRepository(ResumeScreenCandidate)
    private readonly candidateRepository: Repository<ResumeScreenCandidate>
  ) {}

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
}
