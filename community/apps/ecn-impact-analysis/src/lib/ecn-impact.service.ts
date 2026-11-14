import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOperator, IsNull, Repository } from 'typeorm'
import { randomBytes } from 'crypto'
import {
  EcnAssessmentEntity,
  EcnAssessmentLogEntity,
  EcnImpactItemEntity
} from './entities'
import type {
  AssessmentDetailDto,
  AssessmentListData,
  AssessmentSummaryDto,
  ImpactItemDto
} from './contracts'
import type {
  EcnAnalysisSaveInput,
  EcnAssessmentCreateInput,
  EcnAssessmentStatus,
  EcnScope
} from './types'

const MAX_PAGE_SIZE = 50
const MAX_ITEMS_PER_SAVE = 50

export class EcnImpactError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'EcnImpactError'
  }
}

type ScopeFilter = {
  tenantId: string | FindOperator<string>
  organizationId: string | FindOperator<string>
}

function scopeFilter(scope: EcnScope): ScopeFilter {
  return {
    tenantId: scope.tenantId ?? IsNull(),
    organizationId: scope.organizationId ?? IsNull()
  }
}

@Injectable()
export class EcnImpactService {
  private readonly logger = new Logger(EcnImpactService.name)

  constructor(
    @InjectRepository(EcnAssessmentEntity)
    private readonly assessmentRepo: Repository<EcnAssessmentEntity>,
    @InjectRepository(EcnImpactItemEntity)
    private readonly itemRepo: Repository<EcnImpactItemEntity>,
    @InjectRepository(EcnAssessmentLogEntity)
    private readonly logRepo: Repository<EcnAssessmentLogEntity>
  ) {}

  /* ----------------------------- Agent-side operations ----------------------------- */

  async createAssessment(
    scope: EcnScope,
    input: EcnAssessmentCreateInput
  ): Promise<{ assessment: EcnAssessmentEntity; created: boolean }> {
    const changeNo = input.changeNo?.trim() || this.generateChangeNo()
    const existing = await this.assessmentRepo.findOne({
      where: { ...scopeFilter(scope), changeNo }
    })
    if (existing) {
      return { assessment: existing, created: false }
    }

    const assessment = await this.assessmentRepo.save(
      this.assessmentRepo.create({
        tenantId: scope.tenantId ?? undefined,
        organizationId: scope.organizationId ?? undefined,
        createdById: scope.userId ?? undefined,
        assistantId: scope.assistantId ?? undefined,
        conversationId: scope.conversationId ?? undefined,
        changeNo,
        materialNo: input.materialNo.trim(),
        materialName: input.materialName?.trim(),
        changeType: input.changeType,
        changeDescription: input.changeDescription.trim(),
        changeReason: input.changeReason?.trim(),
        expectedEffectDate: input.expectedEffectDate?.trim(),
        status: 'draft',
        retryCount: 0
      })
    )
    await this.addLog(scope, assessment.id!, 'created', `评估单 ${changeNo} 已创建（变更对象 ${input.materialNo}）`)
    this.logger.log(`created ecn assessment ${assessment.id} changeNo=${changeNo}`)
    return { assessment, created: true }
  }

  async getAssessmentForAgent(scope: EcnScope, assessmentId: string): Promise<AssessmentDetailDto> {
    return this.getAssessmentDetail(scope, assessmentId)
  }

  /**
   * Persist one AI analysis pass. Idempotent per impactKey:
   * - a repeated impactKey updates the AI-owned fields of its existing row;
   * - items already reviewed by a human (accepted/rejected) keep their review
   *   state, so a retry never repeats or resets human decisions;
   * - saving twice with the same payload yields the same database state.
   */
  async saveAnalysis(
    scope: EcnScope,
    input: EcnAnalysisSaveInput,
    operatorName?: string
  ): Promise<AssessmentDetailDto> {
    if (!input.items.length) {
      throw new EcnImpactError('items_empty', '影响项不能为空：至少保存一条影响项，或改用失败上报工具说明原因。')
    }
    const assessment = await this.findScopedAssessment(scope, input.assessmentId)
    if (assessment.status === 'confirmed' || assessment.status === 'closed') {
      throw new EcnImpactError(
        'invalid_state',
        `评估单当前状态为 ${assessment.status}，已确认或已归档的评估单不能被 AI 覆写。`
      )
    }

    const bounded = input.items.slice(0, MAX_ITEMS_PER_SAVE)
    const impactKeys = bounded.map((item) => item.impactKey)
    if (new Set(impactKeys).size !== impactKeys.length) {
      throw new EcnImpactError('duplicate_impact_keys', '同一批保存中存在重复的 impactKey。')
    }

    const existingItems = await this.itemRepo.find({
      where: { ...scopeFilter(scope), assessmentId: assessment.id! }
    })
    const existingByKey = new Map(existingItems.map((item) => [item.impactKey!, item]))

    let createdCount = 0
    let updatedCount = 0
    let skippedReviewedCount = 0
    for (const itemInput of bounded) {
      const existing = existingByKey.get(itemInput.impactKey)
      if (existing) {
        if (existing.status === 'accepted' || existing.status === 'rejected') {
          skippedReviewedCount += 1
          continue
        }
        await this.itemRepo.update(existing.id!, {
          domain: itemInput.domain,
          targetNo: itemInput.targetNo,
          targetName: itemInput.targetName,
          relationPath: itemInput.relationPath,
          impactDescription: itemInput.impactDescription,
          suggestedAction: itemInput.suggestedAction,
          riskLevel: itemInput.riskLevel,
          confidence: itemInput.confidence,
          evidence: itemInput.evidence
        })
        updatedCount += 1
      } else {
        await this.itemRepo.save(
          this.itemRepo.create({
            tenantId: scope.tenantId ?? undefined,
            organizationId: scope.organizationId ?? undefined,
            assessmentId: assessment.id!,
            impactKey: itemInput.impactKey,
            domain: itemInput.domain,
            targetNo: itemInput.targetNo,
            targetName: itemInput.targetName,
            relationPath: itemInput.relationPath,
            impactDescription: itemInput.impactDescription,
            suggestedAction: itemInput.suggestedAction,
            riskLevel: itemInput.riskLevel,
            confidence: itemInput.confidence,
            evidence: itemInput.evidence,
            status: 'pending'
          })
        )
        createdCount += 1
      }
    }

    await this.assessmentRepo.update(assessment.id!, {
      status: 'ai_completed',
      aiSummary: input.summary,
      aiRiskLevel: input.riskLevel,
      lastError: null
    })
    await this.addLog(
      scope,
      assessment.id!,
      'ai_analysis_saved',
      `AI 影响分析已保存：新增 ${createdCount} 条、更新 ${updatedCount} 条影响项${
        skippedReviewedCount ? `，保留 ${skippedReviewedCount} 条人工已审核项` : ''
      }。`
    )
    this.logger.log(
      `saved analysis for assessment ${assessment.id}: created=${createdCount} updated=${updatedCount} skipped=${skippedReviewedCount}`
    )
    return this.getAssessmentDetail(scope, assessment.id!)
  }

  /** Escape hatch when the agent cannot complete a meaningful analysis. */
  async reportAnalysisFailure(
    scope: EcnScope,
    assessmentId: string,
    reason: string
  ): Promise<AssessmentDetailDto> {
    const assessment = await this.findScopedAssessment(scope, assessmentId)
    if (assessment.status === 'confirmed' || assessment.status === 'closed') {
      throw new EcnImpactError('invalid_state', '已确认或已归档的评估单不能再标记分析失败。')
    }
    await this.assessmentRepo.update(assessment.id!, {
      status: 'draft',
      lastError: reason.slice(0, 2000),
      retryCount: (assessment.retryCount ?? 0) + 1
    })
    await this.addLog(scope, assessment.id!, 'failed', `AI 分析失败：${reason.slice(0, 500)}`)
    return this.getAssessmentDetail(scope, assessment.id!)
  }

  /* ----------------------------- Workbench (human) operations ----------------------------- */

  async listAssessments(
    scope: EcnScope,
    params: { page?: number; pageSize?: number; status?: string; search?: string }
  ): Promise<{ items: AssessmentSummaryDto[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? 20))
    const where: Record<string, unknown> = { ...scopeFilter(scope) }
    if (params.status) where['status'] = params.status
    if (params.search?.trim()) {
      where['changeNo'] = params.search.trim()
    }

    const [rows, total] = await this.assessmentRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: pageSize,
      skip: (page - 1) * pageSize
    })
    const items = rows.map((row) => this.toSummaryDto(row, 0, 0))
    if (items.length) {
      const counts = await this.itemRepo
        .createQueryBuilder('item')
        .select('item.assessmentId', 'assessmentId')
        .addSelect('item.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('item.assessmentId IN (:...ids)', { ids: items.map((item) => item.id) })
        .groupBy('item.assessmentId')
        .addGroupBy('item.status')
        .getRawMany()
      const byAssessment = new Map<string, { total: number; pending: number }>()
      for (const row of counts) {
        const entry = byAssessment.get(row['assessmentId']) ?? { total: 0, pending: 0 }
        const count = Number(row['count'])
        entry.total += count
        if (row['status'] === 'pending') entry.pending += count
        byAssessment.set(row['assessmentId'], entry)
      }
      for (const item of items) {
        const count = byAssessment.get(item.id)
        item.itemCount = count?.total ?? 0
        item.pendingCount = count?.pending ?? 0
      }
    }
    return { items, total, page, pageSize }
  }

  async getViewData(
    scope: EcnScope,
    params: { page?: number; pageSize?: number; status?: string; search?: string; selectionId?: string }
  ): Promise<AssessmentListData> {
    const list = await this.listAssessments(scope, params)
    const selected = params.selectionId
      ? await this.getAssessmentDetail(scope, params.selectionId).catch(() => undefined)
      : list.items.length === 1
        ? await this.getAssessmentDetail(scope, list.items[0]!.id)
        : undefined
    return { ...list, selected }
  }

  async getAssessmentDetail(scope: EcnScope, assessmentId: string): Promise<AssessmentDetailDto> {
    const assessment = await this.findScopedAssessment(scope, assessmentId)
    const items = await this.itemRepo.find({
      where: { ...scopeFilter(scope), assessmentId: assessment.id! },
      order: { createdAt: 'ASC' }
    })
    const logs = await this.logRepo.find({
      where: { assessmentId: assessment.id! },
      order: { createdAt: 'DESC' },
      take: 50
    })
    return this.toDetailDto(assessment, items, logs)
  }

  /** Record a re-analysis attempt; the agent re-runs and save_analysis stays idempotent. */
  async recordRetry(scope: EcnScope, assessmentId: string, operatorName?: string): Promise<AssessmentDetailDto> {
    const assessment = await this.findScopedAssessment(scope, assessmentId)
    await this.assessmentRepo.update(assessment.id!, {
      retryCount: (assessment.retryCount ?? 0) + 1,
      lastError: null,
      lastOperatorName: operatorName
    })
    await this.addLog(scope, assessment.id!, 'retry', `发起第 ${(assessment.retryCount ?? 0) + 1} 次 AI 影响分析`, operatorName)
    return this.getAssessmentDetail(scope, assessment.id!)
  }

  async reviewItem(
    scope: EcnScope,
    assessmentId: string,
    itemId: string,
    decision: 'accepted' | 'rejected',
    note?: string,
    operatorName?: string
  ): Promise<AssessmentDetailDto> {
    const assessment = await this.findScopedAssessment(scope, assessmentId)
    if (assessment.status !== 'ai_completed' && assessment.status !== 'confirmed') {
      throw new EcnImpactError('invalid_state', '评估单尚未完成 AI 分析，暂无可确认的影响项。')
    }
    const item = await this.itemRepo.findOne({
      where: {
        ...scopeFilter(scope),
        id: itemId,
        assessmentId: assessment.id!
      }
    })
    if (!item) throw new EcnImpactError('item_not_found', '影响项不存在。')
    await this.itemRepo.update(item.id!, {
      status: decision,
      reviewNote: note?.trim() || null,
      reviewedById: scope.userId,
      reviewedByName: operatorName,
      reviewedAt: new Date()
    })
    await this.addLog(
      scope,
      assessment.id!,
      decision === 'accepted' ? 'item_accepted' : 'item_rejected',
      `${decision === 'accepted' ? '采纳' : '驳回'}影响项 ${item.targetNo ?? item.impactKey}${
        note?.trim() ? `：${note.trim().slice(0, 200)}` : ''
      }`,
      operatorName
    )
    return this.getAssessmentDetail(scope, assessment.id!)
  }

  async confirmAssessment(
    scope: EcnScope,
    assessmentId: string,
    operatorName?: string
  ): Promise<AssessmentDetailDto> {
    const assessment = await this.findScopedAssessment(scope, assessmentId)
    if (assessment.status !== 'ai_completed') {
      throw new EcnImpactError('invalid_state', '只有 AI 分析完成（ai_completed）的评估单可以确认。')
    }
    const items = await this.itemRepo.find({ where: { assessmentId: assessment.id! } })
    const pending = items.filter((item) => item.status === 'pending')
    if (!items.length) {
      throw new EcnImpactError('no_items', '评估单没有任何影响项，请先完成 AI 分析。')
    }
    if (pending.length) {
      throw new EcnImpactError('pending_items', `还有 ${pending.length} 条影响项未处理，请先采纳或驳回。`)
    }
    await this.assessmentRepo.update(assessment.id!, {
      status: 'confirmed',
      confirmedById: scope.userId,
      confirmedByName: operatorName,
      confirmedAt: new Date(),
      lastOperatorName: operatorName
    })
    await this.addLog(scope, assessment.id!, 'confirmed', `影响评估已由 ${operatorName ?? '工程师'} 确认完成`, operatorName)
    return this.getAssessmentDetail(scope, assessment.id!)
  }

  async closeAssessment(
    scope: EcnScope,
    assessmentId: string,
    reason?: string,
    operatorName?: string
  ): Promise<AssessmentDetailDto> {
    const assessment = await this.findScopedAssessment(scope, assessmentId)
    if (assessment.status !== 'confirmed') {
      throw new EcnImpactError('invalid_state', '只有已确认（confirmed）的评估单可以归档。')
    }
    await this.assessmentRepo.update(assessment.id!, {
      status: 'closed',
      closedReason: reason?.trim() || null,
      lastOperatorName: operatorName
    })
    await this.addLog(scope, assessment.id!, 'closed', `评估单已归档${reason?.trim() ? `：${reason.trim().slice(0, 200)}` : ''}`, operatorName)
    return this.getAssessmentDetail(scope, assessment.id!)
  }

  /* ----------------------------- helpers ----------------------------- */

  async findScopedAssessment(scope: EcnScope, assessmentId: string): Promise<EcnAssessmentEntity> {
    const assessment = await this.assessmentRepo.findOne({ where: { id: assessmentId } })
    if (!assessment) throw new EcnImpactError('assessment_not_found', '评估单不存在。')
    if (assessment.tenantId !== scope.tenantId || assessment.organizationId !== scope.organizationId) {
      // Same response for not-found and cross-scope to avoid leaking existence.
      throw new EcnImpactError('assessment_not_found', '评估单不存在。')
    }
    return assessment
  }

  private async addLog(
    scope: EcnScope,
    assessmentId: string,
    type: string,
    detail?: string,
    operatorName?: string
  ): Promise<void> {
    await this.logRepo.save(
      this.logRepo.create({
        tenantId: scope.tenantId ?? undefined,
        organizationId: scope.organizationId ?? undefined,
        assessmentId,
        type,
        detail,
        operatorName: operatorName ?? (scope.userId ? `user:${String(scope.userId).slice(0, 8)}` : undefined)
      })
    )
  }

  private generateChangeNo(): string {
    const date = new Date()
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    return `ECN-${stamp}-${randomBytes(2).toString('hex').toUpperCase()}`
  }

  private toSummaryDto(
    row: EcnAssessmentEntity,
    itemCount: number,
    pendingCount: number
  ): AssessmentSummaryDto {
    return {
      id: row.id!,
      changeNo: row.changeNo!,
      materialNo: row.materialNo!,
      materialName: row.materialName ?? undefined,
      changeType: row.changeType ?? 'other',
      changeDescription: row.changeDescription ?? '',
      status: (row.status ?? 'draft') as EcnAssessmentStatus,
      riskLevel: row.aiRiskLevel ?? undefined,
      itemCount,
      pendingCount,
      createdAt: row.createdAt?.toISOString() ?? '',
      updatedAt: row.updatedAt?.toISOString() ?? ''
    }
  }

  private toDetailDto(
    assessment: EcnAssessmentEntity,
    items: EcnImpactItemEntity[],
    logs: EcnAssessmentLogEntity[]
  ): AssessmentDetailDto {
    const itemDtos: ImpactItemDto[] = items.map((item) => ({
      id: item.id!,
      impactKey: item.impactKey!,
      domain: item.domain!,
      targetNo: item.targetNo ?? '',
      targetName: item.targetName ?? undefined,
      relationPath: item.relationPath ?? undefined,
      impactDescription: item.impactDescription ?? '',
      suggestedAction: item.suggestedAction ?? undefined,
      riskLevel: item.riskLevel ?? undefined,
      confidence: item.confidence ?? undefined,
      evidence: item.evidence ?? undefined,
      status: item.status ?? 'pending',
      reviewNote: item.reviewNote ?? undefined
    }))
    return {
      ...this.toSummaryDto(assessment, itemDtos.length, itemDtos.filter((i) => i.status === 'pending').length),
      changeReason: assessment.changeReason ?? undefined,
      expectedEffectDate: assessment.expectedEffectDate ?? undefined,
      aiSummary: assessment.aiSummary ?? undefined,
      lastError: assessment.lastError ?? undefined,
      retryCount: assessment.retryCount ?? 0,
      confirmedBy: assessment.confirmedByName ?? undefined,
      confirmedAt: assessment.confirmedAt?.toISOString() ?? undefined,
      items: itemDtos,
      logs: logs.map((log) => ({
        id: log.id!,
        type: log.type ?? '',
        detail: log.detail ?? undefined,
        createdAt: log.createdAt?.toISOString() ?? ''
      }))
    }
  }
}
