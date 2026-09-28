import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  ContractReview,
  ContractReviewJob,
  ContractRiskItem,
  ContractSuggestion
} from './entities/index.js'
import type {
  ConfirmRiskDecisionInput,
  ContractAssistantChatCommand,
  ContractReviewJobType,
  ContractReviewStatus,
  ContractScope,
  ContractWorkbenchQuery,
  CreateContractReviewInput,
  ReportProcessingFailureInput,
  RetryPipelineInput,
  SaveExtractionInput,
  SaveRiskItemsInput,
  SaveSuggestionsInput,
  SaveSummaryInput
} from './types.js'

const PIPELINE_STAGES: ContractReviewJobType[] = ['extract', 'review', 'draft', 'summary']
const MIN_RAW_TEXT_LENGTH = 80
const MAX_RAW_TEXT_LENGTH = 60000

@Injectable()
export class ContractHealthCheckService {
  constructor(
    @InjectRepository(ContractReview)
    private readonly reviewRepository: Repository<ContractReview>,
    @InjectRepository(ContractRiskItem)
    private readonly riskRepository: Repository<ContractRiskItem>,
    @InjectRepository(ContractSuggestion)
    private readonly suggestionRepository: Repository<ContractSuggestion>,
    @InjectRepository(ContractReviewJob)
    private readonly jobRepository: Repository<ContractReviewJob>
  ) {}

  async createReview(scope: ContractScope, input: CreateContractReviewInput) {
    const contractName = normalizeRequired(input.contractName, '合同名称不能为空。')
    const rawText = normalizeRequired(input.rawText, '合同正文不能为空。')

    if (rawText.length < MIN_RAW_TEXT_LENGTH) {
      throw new BadRequestException(`合同正文过短（至少 ${MIN_RAW_TEXT_LENGTH} 字），请补充后再提交体检。`)
    }
    if (rawText.length > MAX_RAW_TEXT_LENGTH) {
      throw new BadRequestException(`合同正文过长（超过 ${MAX_RAW_TEXT_LENGTH} 字），请拆分后体检。`)
    }

    const review = await this.reviewRepository.save(
      this.reviewRepository.create({
        ...scopedCreate(scope),
        contractName,
        contractType: input.contractType ?? 'sales',
        counterparty: normalizeOptional(input.counterparty),
        rawText,
        xpertId: normalizeOptional(input.xpertId),
        agentKey: normalizeOptional(input.agentKey),
        status: 'draft',
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0
      })
    )

    return review
  }

  async createReviewJobs(scope: ContractScope, reviewId: string, stages: ContractReviewJobType[] = PIPELINE_STAGES) {
    const review = await this.requireReview(scope, reviewId)
    const created: ContractReviewJob[] = []

    for (const stage of stages) {
      const existing = await this.jobRepository.findOne({
        where: scopedWhere(scope, { reviewId, type: stage })
      })
      if (existing) {
        // Idempotency: reuse the existing job row instead of creating a duplicate per stage.
        created.push(existing)
        continue
      }
      created.push(
        await this.jobRepository.save(
          this.jobRepository.create({
            ...scopedCreate(scope),
            reviewId,
            type: stage,
            status: 'queued',
            attempts: 0
          })
        )
      )
    }

    await this.reviewRepository.save({ ...review, status: 'processing', failedStage: undefined, errorMessage: undefined })
    return created
  }

  buildPipelineCommand(scope: ContractScope, reviewId: string): ContractAssistantChatCommand {
    return {
      commandKey: 'assistant.chat.send_message',
      reviewId,
      stage: 'review',
      payload: {
        clientMessageId: `contract-health-check:${reviewId}`,
        text: buildPipelinePrompt(reviewId)
      }
    }
  }

  async beginStage(scope: ContractScope, reviewId: string, stage: ContractReviewJobType) {
    const review = await this.requireReview(scope, reviewId)
    const job = await this.requireJob(scope, reviewId, stage)

    await this.jobRepository.save({
      ...job,
      status: 'running',
      attempts: (job.attempts ?? 0) + 1,
      errorMessage: undefined
    })

    if (stage === 'extract') {
      await this.reviewRepository.save({ ...review, status: 'processing', failedStage: undefined, errorMessage: undefined })
    }

    return { review, job }
  }

  async saveExtraction(scope: ContractScope, input: SaveExtractionInput) {
    const review = await this.requireReview(scope, input.reviewId)
    await this.reviewRepository.save({
      ...review,
      elements: input.elements ?? {},
      status: 'processing'
    })
    await this.completeStage(scope, input.reviewId, 'extract')
    return this.getReviewDetail(scope, input.reviewId)
  }

  async saveRiskItems(scope: ContractScope, input: SaveRiskItemsInput) {
    const review = await this.requireReview(scope, input.reviewId)
    if (!Array.isArray(input.risks) || input.risks.length === 0) {
      throw new BadRequestException('风险清单不能为空。')
    }

    await this.riskRepository.delete(scopedWhere(scope, { reviewId: input.reviewId }))

    const risks = await this.riskRepository.save(
      input.risks.map((risk) =>
        this.riskRepository.create({
          ...scopedCreate(scope),
          reviewId: input.reviewId,
          level: risk.level,
          clauseRef: normalizeOptional(risk.clauseRef),
          title: normalizeRequired(risk.title, '风险标题不能为空。'),
          issue: normalizeRequired(risk.issue, '风险描述不能为空。'),
          basis: normalizeOptional(risk.basis),
          decision: 'pending'
        })
      )
    )

    const counts = countByLevel(risks)
    await this.reviewRepository.save({
      ...review,
      status: 'processing',
      highRiskCount: counts.high,
      mediumRiskCount: counts.medium,
      lowRiskCount: counts.low
    })
    await this.completeStage(scope, input.reviewId, 'review')

    return { risks }
  }

  async saveSuggestions(scope: ContractScope, input: SaveSuggestionsInput) {
    await this.requireReview(scope, input.reviewId)
    await this.suggestionRepository.delete(scopedWhere(scope, { reviewId: input.reviewId }))

    const suggestions = await this.suggestionRepository.save(
      input.suggestions.map((item) =>
        this.suggestionRepository.create({
          ...scopedCreate(scope),
          reviewId: input.reviewId,
          clauseRef: normalizeOptional(item.clauseRef),
          riskTitle: normalizeRequired(item.riskTitle, '建议必须关联风险标题。'),
          originalText: normalizeOptional(item.originalText),
          suggestedText: normalizeRequired(item.suggestedText, '建议条款不能为空。'),
          rationale: normalizeOptional(item.rationale)
        })
      )
    )

    await this.completeStage(scope, input.reviewId, 'draft')
    return { suggestions }
  }

  async saveSummary(scope: ContractScope, input: SaveSummaryInput) {
    const review = await this.requireReview(scope, input.reviewId)
    const score = clampScore(input.score)

    await this.reviewRepository.save({
      ...review,
      score,
      summary: normalizeRequired(input.summary, '摘要不能为空。'),
      summaryHighlights: input.highlights ?? [],
      pendingQuestions: input.pendingQuestions ?? [],
      status: 'needs_review',
      summarySkipped: false
    })
    await this.completeStage(scope, input.reviewId, 'summary')

    return this.getReviewDetail(scope, input.reviewId)
  }

  /**
   * When the summary stage fails we keep the main flow usable: risks and suggestions
   * remain reviewable, the review moves to needs_review and summarySkipped is flagged.
   */
  async skipSummaryAfterFailure(scope: ContractScope, reviewId: string) {
    const review = await this.requireReview(scope, reviewId)
    return this.reviewRepository.save({
      ...review,
      status: 'needs_review',
      summarySkipped: true
    })
  }

  async confirmRiskDecision(scope: ContractScope, input: ConfirmRiskDecisionInput) {
    const review = await this.requireReview(scope, input.reviewId)
    const risk = await this.riskRepository.findOne({
      where: scopedWhere(scope, { id: input.riskId, reviewId: input.reviewId })
    })
    if (!risk) {
      throw new NotFoundException('风险项不存在。')
    }

    const saved = await this.riskRepository.save({
      ...risk,
      decision: input.decision,
      customText: input.decision === 'custom' ? normalizeRequired(input.customText, '自定义修改不能为空。') : undefined,
      note: normalizeOptional(input.note)
    })

    if (review.status === 'draft' || review.status === 'processing') {
      await this.reviewRepository.save({ ...review, status: 'needs_review' })
    }

    return saved
  }

  async completeReview(scope: ContractScope, reviewId: string) {
    const review = await this.requireReview(scope, reviewId)
    const risks = await this.riskRepository.find({ where: scopedWhere(scope, { reviewId }) })
    const pending = risks.filter((risk) => (risk.decision ?? 'pending') === 'pending')

    // Every risk must be explicitly confirmed before the report can be finalized.
    if (risks.length > 0 && pending.length > 0) {
      throw new BadRequestException(`还有 ${pending.length} 条风险未确认，确认后才能保存报告。`)
    }

    return this.reviewRepository.save({ ...review, status: 'completed' })
  }

  async retryPipeline(scope: ContractScope, input: RetryPipelineInput) {
    const review = await this.requireReview(scope, input.reviewId)
    const stage = input.stage ?? resolveFailedStage(review)

    if (!stage) {
      throw new BadRequestException('没有可重试的失败环节。')
    }

    const job = await this.requireJob(scope, input.reviewId, stage)
    await this.jobRepository.save({
      ...job,
      status: 'running',
      attempts: (job.attempts ?? 0) + 1,
      errorMessage: undefined
    })
    await this.reviewRepository.save({ ...review, status: 'processing', failedStage: undefined, errorMessage: undefined })

    return {
      reviewId: input.reviewId,
      stage,
      action: 'retry',
      command: this.buildStageRetryCommand(input.reviewId, stage)
    }
  }

  async reportProcessingFailure(scope: ContractScope, input: ReportProcessingFailureInput) {
    const review = await this.requireReview(scope, input.reviewId)
    const errorMessage = normalizeRequired(input.errorMessage, '失败原因不能为空。')

    const job = await this.jobRepository.findOne({
      where: scopedWhere(scope, { reviewId: input.reviewId, type: input.stage })
    })
    if (job) {
      await this.jobRepository.save({ ...job, status: 'failed', errorMessage })
    }

    if (input.stage === 'summary') {
      // Non-blocking failure: keep risk/suggestion results usable.
      await this.reviewRepository.save({
        ...review,
        status: 'needs_review',
        failedStage: 'summary',
        summarySkipped: true,
        errorMessage
      })
      return { status: 'needs_review', stage: input.stage, summarySkipped: true }
    }

    await this.reviewRepository.save({
      ...review,
      status: 'failed',
      failedStage: input.stage,
      errorMessage
    })

    return { status: 'failed', stage: input.stage, errorMessage }
  }

  async getWorkbenchData(scope: ContractScope, query: ContractWorkbenchQuery = {}) {
    if (query.reviewId) {
      return this.getReviewDetail(scope, query.reviewId)
    }

    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 20, 100))
    const search = query.search?.trim().toLowerCase() ?? ''
    const reviews = await this.reviewRepository.find({ where: scopedWhere(scope) })
    const filtered = search
      ? reviews.filter((item) =>
          [item.contractName, item.counterparty]
            .filter(isString)
            .some((value) => value.toLowerCase().includes(search))
        )
      : reviews

    filtered.sort((a, b) => getTimestamp(b) - getTimestamp(a))
    const start = (page - 1) * pageSize

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      summary: {
        page,
        pageSize,
        search,
        xpertConfigured: filtered.some((item) => isNonEmptyString(item.xpertId))
      }
    }
  }

  async deleteReview(scope: ContractScope, reviewId: string) {
    await this.requireReview(scope, reviewId)
    const where = scopedWhere(scope, { reviewId })

    await this.riskRepository.delete(where)
    await this.suggestionRepository.delete(where)
    await this.jobRepository.delete(where)
    await this.reviewRepository.delete(scopedWhere(scope, { id: reviewId }))

    return { deleted: true, reviewId }
  }

  async getReviewDetail(scope: ContractScope, reviewId: string) {
    const review = await this.requireReview(scope, reviewId)
    const [risks, suggestions, jobs] = await Promise.all([
      this.riskRepository.find({ where: scopedWhere(scope, { reviewId }) }),
      this.suggestionRepository.find({ where: scopedWhere(scope, { reviewId }) }),
      this.jobRepository.find({ where: scopedWhere(scope, { reviewId }) })
    ])

    return {
      item: {
        review,
        risks: sortRisks(risks),
        suggestions,
        jobs
      },
      total: 1,
      summary: {
        highRiskCount: risks.filter((risk) => risk.level === 'high').length,
        mediumRiskCount: risks.filter((risk) => risk.level === 'medium').length,
        lowRiskCount: risks.filter((risk) => risk.level === 'low').length,
        pendingDecisionCount: risks.filter((risk) => (risk.decision ?? 'pending') === 'pending').length
      }
    }
  }

  private async completeStage(scope: ContractScope, reviewId: string, stage: ContractReviewJobType) {
    const job = await this.jobRepository.findOne({
      where: scopedWhere(scope, { reviewId, type: stage })
    })
    if (job) {
      await this.jobRepository.save({ ...job, status: 'succeeded', errorMessage: undefined })
    }
  }

  private buildStageRetryCommand(reviewId: string, stage: ContractReviewJobType): ContractAssistantChatCommand {
    return {
      commandKey: 'assistant.chat.send_message',
      reviewId,
      stage,
      payload: {
        clientMessageId: `contract-health-check:${reviewId}:${stage}:retry`,
        text: buildStageRetryPrompt(reviewId, stage)
      }
    }
  }

  private async requireReview(scope: ContractScope, reviewId: string) {
    const review = await this.reviewRepository.findOne({
      where: scopedWhere(scope, { id: reviewId })
    })
    if (!review) {
      throw new NotFoundException('合同体检记录不存在。')
    }
    return review
  }

  private async requireJob(scope: ContractScope, reviewId: string, stage: ContractReviewJobType) {
    const job = await this.jobRepository.findOne({
      where: scopedWhere(scope, { reviewId, type: stage })
    })
    if (!job) {
      return this.jobRepository.save(
        this.jobRepository.create({
          ...scopedCreate(scope),
          reviewId,
          type: stage,
          status: 'queued',
          attempts: 0
        })
      )
    }
    return job
  }
}

function resolveFailedStage(review: ContractReview): ContractReviewJobType | null {
  if (review.failedStage && (PIPELINE_STAGES as string[]).includes(review.failedStage)) {
    return review.failedStage as ContractReviewJobType
  }
  return null
}

function buildPipelinePrompt(reviewId: string) {
  return [
    '你正在为“合同智能体检”工作台执行一次完整的合同体检，请按顺序完成四个环节。',
    `reviewId: ${reviewId}`,
    '',
    '1. 抽取：识别合同主体、金额、付款条款、交付条款、违约责任、争议管辖、保密与知识产权等要素。',
    '2. 审查：对照中小企业常见合同风险清单，逐项输出风险等级（high/medium/low）、条款位置、问题描述与依据。',
    '3. 改写：对 high/medium 风险给出可直接替换的条款表述。',
    '4. 摘要：给出总体风险评分（0-100，分数越低风险越高）与一页式摘要。',
    '',
    '每一步完成时，必须调用对应工具保存结构化结果，并带上 reviewId：',
    '- contract_save_extraction',
    '- contract_save_risk_items',
    '- contract_save_suggestions',
    '- contract_save_summary',
    '如果某个环节无法完成（例如模型失败或信息不足），请调用 contract_report_failure 并说明原因，不要伪造结果。'
  ].join('\n')
}

function buildStageRetryPrompt(reviewId: string, stage: ContractReviewJobType) {
  const stageInstruction: Record<ContractReviewJobType, string> = {
    extract: '重新执行「抽取」环节，并调用 contract_save_extraction 保存结果。',
    review: '基于已保存的合同要素重新执行「审查」环节，并调用 contract_save_risk_items 保存结果。',
    draft: '基于已保存的风险清单重新执行「改写」环节，并调用 contract_save_suggestions 保存结果。',
    summary: '基于已保存的风险与改写结果重新执行「摘要」环节，并调用 contract_save_summary 保存结果。'
  }

  return [
    `请只重试“合同智能体检”的单个环节，不要重新生成其他环节的结果。`,
    `reviewId: ${reviewId}`,
    `stage: ${stage}`,
    stageInstruction[stage],
    '如果仍然失败，请调用 contract_report_failure 说明原因。'
  ].join('\n')
}

function scopedCreate(scope: ContractScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null,
    createdById: scope.userId ?? null
  }
}

function scopedWhere<T extends Record<string, unknown>>(
  scope: ContractScope,
  extra?: Record<string, unknown>
): Partial<T> & Record<string, unknown> {
  const where: Record<string, unknown> = {
    tenantId: scope.tenantId
  }

  if (scope.organizationId != null) {
    where.organizationId = scope.organizationId
  }
  if (scope.projectId != null) {
    where.projectId = scope.projectId
  } else if (scope.workspaceId != null) {
    where.workspaceId = scope.workspaceId
  }

  return {
    ...where,
    ...extra
  } as Partial<T> & Record<string, unknown>
}

function normalizeRequired(value: string | undefined, message: string) {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    throw new BadRequestException(message)
  }
  return normalized
}

function normalizeOptional(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function clampScore(value: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(value)))
}

function countByLevel(risks: ContractRiskItem[]) {
  return {
    high: risks.filter((risk) => risk.level === 'high').length,
    medium: risks.filter((risk) => risk.level === 'medium').length,
    low: risks.filter((risk) => risk.level === 'low').length
  }
}

const RISK_LEVEL_WEIGHT: Record<string, number> = { high: 0, medium: 1, low: 2 }

function sortRisks(risks: ContractRiskItem[]) {
  return [...risks].sort((a, b) => (RISK_LEVEL_WEIGHT[a.level] ?? 3) - (RISK_LEVEL_WEIGHT[b.level] ?? 3))
}

function getTimestamp(entity: { updatedAt?: Date; createdAt?: Date }) {
  const value = entity.updatedAt ?? entity.createdAt
  return value instanceof Date ? value.getTime() : 0
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export { PIPELINE_STAGES, MIN_RAW_TEXT_LENGTH }
