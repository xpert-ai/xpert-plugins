import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { isDeepStrictEqual } from 'node:util'
import { ResumeMatchAnalysisEntity } from './entities/resume-match-analysis.entity.js'
import type {
  AnalysisDetail,
  AnalysisInput,
  AnalysisStatus,
  AnalysisSummary,
  ConfirmAnalysisInput,
  MatchLevel,
  MatchResult,
  MatchScope,
  ResumeMatchViewData,
  SaveMatchResultInput
} from './types.js'
import type { AnalysisInputDto, ConfirmAnalysisDto } from './schemas.js'

interface ListQuery {
  page?: number
  pageSize?: number
  selectionId?: string
}

const DIMENSION_LABELS = {
  skills: '专业技能',
  experience: '工作经验',
  domain: '行业与领域',
  education: '教育背景'
} as const

export function scoreToLevel(score: number): MatchLevel {
  if (score >= 85) return '高度匹配'
  if (score >= 70) return '较好匹配'
  if (score >= 55) return '基本匹配'
  return '匹配度较低'
}

export function weightedScore(input: {
  skillsScore: number
  experienceScore: number
  domainScore: number
  educationScore: number
}) {
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))
  return clamp(
    input.skillsScore * 0.45 +
      input.experienceScore * 0.3 +
      input.domainScore * 0.2 +
      input.educationScore * 0.05
  )
}

export function buildMatchResult(input: SaveMatchResultInput): MatchResult {
  const overallScore = weightedScore(input)
  return {
    schemaVersion: 1,
    overallScore,
    level: scoreToLevel(overallScore),
    dimensions: [
      {
        key: 'skills',
        label: DIMENSION_LABELS.skills,
        score: input.skillsScore,
        summary: input.skillsSummary
      },
      {
        key: 'experience',
        label: DIMENSION_LABELS.experience,
        score: input.experienceScore,
        summary: input.experienceSummary
      },
      {
        key: 'domain',
        label: DIMENSION_LABELS.domain,
        score: input.domainScore,
        summary: input.domainSummary
      },
      {
        key: 'education',
        label: DIMENSION_LABELS.education,
        score: input.educationScore,
        summary: input.educationSummary
      }
    ],
    matchedSkills: input.matchedSkills,
    missingSkills: input.missingSkills,
    highlights: input.highlights,
    risks: input.risks,
    summary: input.summary,
    recommendation: input.recommendation
  }
}

@Injectable()
export class ResumeMatchService {
  constructor(
    @InjectRepository(ResumeMatchAnalysisEntity)
    private readonly repository: Repository<ResumeMatchAnalysisEntity>
  ) {}

  async getViewData(
    scope: MatchScope,
    query: ListQuery = {}
  ): Promise<ResumeMatchViewData> {
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20))
    const [entities, total] = await this.repository.findAndCount({
      where: {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId
      },
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    let selected: ResumeMatchAnalysisEntity | null = null
    if (query.selectionId) {
      selected = await this.findScoped(scope, query.selectionId, false)
    }
    selected = selected ?? entities[0] ?? null
    return {
      items: entities.map(toSummary),
      selected: selected ? toDetail(selected) : null,
      total,
      query: { page, pageSize }
    }
  }

  async create(scope: MatchScope, input: AnalysisInputDto): Promise<AnalysisDetail> {
    const entity = this.repository.create({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      userId: scope.userId,
      assistantId: scope.assistantId ?? null,
      candidateName: input.candidateName,
      candidateTitle: input.candidateTitle ?? null,
      candidateYears: input.candidateYears ?? null,
      candidateCity: input.candidateCity ?? null,
      candidatePhone: input.candidatePhone ?? null,
      candidateEmail: input.candidateEmail ?? null,
      jobTitle: input.jobTitle,
      company: input.company ?? null,
      jobCity: input.jobCity ?? null,
      salary: input.salary ?? null,
      jobText: input.jobText,
      resumeText: input.resumeText,
      status: 'waiting_ai',
      revision: 0,
      attempt: 1
    })
    return toDetail(await this.repository.save(entity))
  }

  async prepareRetry(
    scope: MatchScope,
    analysisId: string,
    expectedRevision: number
  ): Promise<AnalysisDetail> {
    const entity = await this.findScoped(scope, analysisId)
    if (entity.status === 'confirmed') {
      throw new BadRequestException('这条分析已经人工确认，不能重新发起智能分析。')
    }
    if (entity.revision !== expectedRevision) {
      throw new ConflictException('记录已被更新，请刷新后重新发起分析。')
    }
    const outcome = await this.repository.update(
      {
        id: entity.id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        revision: expectedRevision,
        attempt: entity.attempt,
        status: In(['waiting_ai', 'failed', 'review'])
      },
      {
        attempt: entity.attempt + 1,
        status: 'waiting_ai',
        errorMessage: null,
        revision: expectedRevision + 1
      }
    )
    if (!outcome.affected) {
      throw new ConflictException('记录已被更新或确认，请刷新后重新发起分析。')
    }
    return toDetail(await this.findScoped(scope, entity.id))
  }

  async readForAssistant(scope: MatchScope, analysisId: string) {
    const entity = await this.findScoped(scope, analysisId)
    return {
      analysisId: entity.id,
      attempt: entity.attempt,
      status: entity.status,
      candidate: {
        name: entity.candidateName,
        title: entity.candidateTitle,
        years: entity.candidateYears,
        city: entity.candidateCity
      },
      job: {
        title: entity.jobTitle,
        company: entity.company,
        city: entity.jobCity,
        salary: entity.salary
      },
      jobText: entity.jobText,
      resumeText: entity.resumeText,
      instruction:
        '仅依据 jobText 与 resumeText 判断。引用具体项目或经历时不得编造；信息不足时写入 risks。'
    }
  }

  async saveResult(
    scope: MatchScope,
    input: SaveMatchResultInput
  ): Promise<AnalysisDetail> {
    const entity = await this.findScoped(scope, input.analysisId)
    this.assertAttempt(entity, input.attempt)
    if (entity.status === 'confirmed') {
      throw new BadRequestException('人工结论已确认，模型结果不能覆盖已确认记录。')
    }
    const result = buildMatchResult(input)
    if (entity.status === 'review' && isDeepStrictEqual(entity.result, result)) {
      return toDetail(entity)
    }
    const outcome = await this.repository.update(
      {
        id: entity.id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        attempt: input.attempt,
        status: In(['waiting_ai', 'failed'])
      },
      {
        status: 'review',
        score: result.overallScore,
        result,
        errorMessage: null,
        revision: entity.revision + 1
      }
    )
    if (!outcome.affected) {
      throw new ConflictException(
        '分析轮次已变化或记录已确认，请重新读取最新记录后再提交。'
      )
    }
    return toDetail(await this.findScoped(scope, entity.id))
  }

  async markFailed(
    scope: MatchScope,
    analysisId: string,
    attempt: number,
    reason: string
  ): Promise<AnalysisDetail> {
    const entity = await this.findScoped(scope, analysisId)
    this.assertAttempt(entity, attempt)
    if (entity.status === 'confirmed') {
      throw new BadRequestException('已确认记录不能标记为分析失败。')
    }
    const outcome = await this.repository.update(
      {
        id: entity.id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        attempt,
        status: In(['waiting_ai', 'failed'])
      },
      {
        status: 'failed',
        errorMessage: reason,
        revision: entity.revision + 1
      }
    )
    if (!outcome.affected) {
      throw new ConflictException('分析轮次已变化，请刷新后重试。')
    }
    return toDetail(await this.findScoped(scope, entity.id))
  }

  async confirm(
    scope: MatchScope,
    input: ConfirmAnalysisDto
  ): Promise<AnalysisDetail> {
    const entity = await this.findScoped(scope, input.analysisId)
    if (
      entity.status === 'confirmed' &&
      entity.revision === input.expectedRevision + 1 &&
      entity.humanDecision === input.humanDecision &&
      entity.humanScore === input.humanScore &&
      entity.humanConclusion === input.humanConclusion
    ) {
      return toDetail(entity)
    }
    if (entity.revision !== input.expectedRevision) {
      throw new ConflictException('记录已被更新，请刷新后重新确认。')
    }
    if (entity.status !== 'review' && entity.status !== 'confirmed') {
      throw new BadRequestException('只有已完成智能分析的记录才能提交人工结论。')
    }
    const outcome = await this.repository.update(
      {
        id: entity.id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        revision: input.expectedRevision,
        status: In(['review', 'confirmed'])
      },
      {
        status: 'confirmed',
        humanDecision: input.humanDecision,
        humanScore: input.humanScore,
        humanConclusion: input.humanConclusion,
        reviewedAt: new Date(),
        revision: input.expectedRevision + 1
      }
    )
    if (!outcome.affected) {
      throw new ConflictException('记录已被其他操作更新，请刷新后重新确认。')
    }
    return toDetail(await this.findScoped(scope, entity.id))
  }

  buildAnalysisPrompt(input: {
    analysisId: string
    attempt: number
    candidateName: string
    jobTitle: string
  }) {
    return [
      '请完成一条简历与岗位的智能匹配分析。',
      `分析记录编号：${input.analysisId}`,
      `分析轮次：${input.attempt}`,
      `候选人：${input.candidateName}`,
      `岗位：${input.jobTitle}`,
      '',
      `第一步：调用 ${'resume_match_get_analysis'}，参数为 {"analysisId":"${input.analysisId}"}，读取岗位说明、简历和本轮轮次。`,
      '第二步：只依据读取到的岗位说明与简历进行判断，覆盖专业技能、工作经验、行业与领域、教育背景四个维度；每个维度给出 0 到 100 的整数得分和一句可追溯的判断依据。',
      '只对岗位明确要求的条件判定缺口；岗位未要求的学历、年龄、性别、婚育、高并发等不得新增为筛选条件。没有信息的维度说明未知，分数只作未校准的演示参考。',
      '第三步：提炼零到十项有证据的已覆盖能力、至多六项能力缺口、零到六条匹配理由、至多五条需人工核实的问题。没有匹配证据时，已覆盖能力和匹配理由传空数组；不得为了凑数虚构经历、公司、学历或技术。',
      `第四步：调用 resume_match_save_result，将结构化结果一次性写入，analysisId 与 attempt 必须原样传入；不要只把结果写在聊天里。`,
      `如果材料无法读取或无法形成可靠判断，调用 resume_match_mark_failed，并说明可理解的原因，不要伪造分数。`,
      '',
      '完成后请用一小段中文告诉招聘负责人：分析已写入工作台，请回到工作台查看依据并做人工确认。不要声称已经完成人工确认。'
    ].join('\n')
  }

  private async findScoped(
    scope: MatchScope,
    analysisId: string,
    throwWhenMissing = true
  ) {
    const entity = await this.repository.findOne({
      where: {
        id: analysisId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId
      }
    })
    if (!entity && throwWhenMissing) {
      throw new NotFoundException('未找到这条分析记录，或当前账号无权访问。')
    }
    return entity
  }

  private assertAttempt(entity: ResumeMatchAnalysisEntity, attempt: number) {
    if (entity.attempt !== attempt) {
      throw new ConflictException(
        `分析轮次已更新为第 ${entity.attempt} 轮，旧轮次结果不会再写入记录。`
      )
    }
  }
}

function toSummary(entity: ResumeMatchAnalysisEntity): AnalysisSummary {
  return {
    id: entity.id,
    candidateName: entity.candidateName,
    candidateTitle: entity.candidateTitle ?? undefined,
    candidateYears: entity.candidateYears ?? undefined,
    jobTitle: entity.jobTitle,
    company: entity.company ?? undefined,
    jobCity: entity.jobCity ?? undefined,
    salary: entity.salary ?? undefined,
    status: entity.status as AnalysisStatus,
    score: entity.score ?? undefined,
    level: entity.result?.level,
    revision: entity.revision,
    attempt: entity.attempt,
    updatedAt: entity.updatedAt.toISOString(),
    createdAt: entity.createdAt.toISOString()
  }
}

function toDetail(entity: ResumeMatchAnalysisEntity): AnalysisDetail {
  return {
    ...toSummary(entity),
    candidateCity: entity.candidateCity ?? undefined,
    candidatePhone: entity.candidatePhone ?? undefined,
    candidateEmail: entity.candidateEmail ?? undefined,
    jobText: entity.jobText,
    resumeText: entity.resumeText,
    result: entity.result ?? undefined,
    humanDecision: entity.humanDecision ?? undefined,
    humanScore: entity.humanScore ?? undefined,
    humanConclusion: entity.humanConclusion ?? undefined,
    reviewedAt: entity.reviewedAt?.toISOString(),
    errorMessage: entity.errorMessage ?? undefined
  }
}

export type { AnalysisInput, AnalysisStatus }
