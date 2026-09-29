import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'crypto'
import { In, Like, Repository } from 'typeorm'
import { InspectionCase } from './entities/inspection-case.entity.js'
import { InspectionHistoryRecord } from './entities/inspection-history-record.entity.js'
import { buildSeedHistory } from './seed-data.js'
import type {
  ConfirmResolutionInput,
  CreateInspectionCaseInput,
  InspectionAiAnalysis,
  InspectionCaseView,
  InspectionHistoryReference,
  InspectionScope
} from './types.js'

const HISTORY_SEARCH_LIMIT = 5
const STATUS_FLOW: Record<string, string[]> = {
  // draft 工单可被 AI 直接分析完成或给出建议（宽容前进，不强制分步）
  draft: ['analyzing', 'analyzed', 'reviewing', 'failed'],
  analyzing: ['analyzed', 'reviewing', 'failed'],
  analyzed: ['reviewing', 'failed'],
  reviewing: ['confirmed', 'failed'],
  confirmed: ['closed', 'failed'],
  failed: ['analyzing', 'draft'],
  closed: []
}

@Injectable()
export class InspectionService {
  private readonly logger = new Logger(InspectionService.name)

  constructor(
    @InjectRepository(InspectionCase)
    private readonly caseRepository: Repository<InspectionCase>,
    @InjectRepository(InspectionHistoryRecord)
    private readonly historyRepository: Repository<InspectionHistoryRecord>
  ) {}

  // ---------- 工单 CRUD ----------

  async createCase(scope: InspectionScope, input: CreateInspectionCaseInput): Promise<InspectionCase> {
    await this.ensureSeedHistory(scope)
    const entity = this.caseRepository.create({
      id: randomUUID(),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      createdById: scope.userId,
      caseNo: buildCaseNo(),
      title: normalizeRequired(input.title, '工单标题不能为空'),
      deviceType: normalizeOptional(input.deviceType),
      faultDescription: normalizeRequired(input.faultDescription, '故障描述不能为空'),
      severity: normalizeSeverity(input.severity),
      impact: normalizeOptional(input.impact),
      status: 'draft',
      retryCount: 0
    })
    return this.caseRepository.save(entity)
  }

  async getCase(scope: InspectionScope, caseId: string): Promise<InspectionCase | null> {
    return this.caseRepository.findOne({
      where: { id: caseId, ...scopedWhere(scope) }
    })
  }

  async getWorkbenchData(
    scope: InspectionScope,
    query: { search?: string; status?: string; page?: number; pageSize?: number }
  ): Promise<{ cases: InspectionCaseView[]; total: number }> {
    const page = normalizePage(query.page)
    const pageSize = normalizePageSize(query.pageSize)
    const where: Record<string, unknown> = { ...scopedWhere(scope) }
    const search = normalizeOptional(query.search)
    if (search) {
      where.title = Like(`%${escapeLike(search)}%`)
    }
    if (normalizeOptional(query.status)) {
      where.status = query.status
    }

    const [rows, total] = await this.caseRepository.findAndCount({
      where,
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    return { cases: rows.map(toView), total }
  }

  async deleteCase(scope: InspectionScope, caseId: string): Promise<{ id: string }> {
    const existing = await this.getCase(scope, caseId)
    if (!existing) {
      throw new Error('工单不存在或无权访问')
    }
    await this.caseRepository.remove(existing)
    return { id: caseId }
  }

  // ---------- AI 工具落库 ----------

  async saveAiAnalysis(
    scope: InspectionScope,
    caseId: string,
    analysis: InspectionAiAnalysis
  ): Promise<InspectionCase> {
    const entity = await this.requireCase(scope, caseId)
    const sanitized = sanitizeAnalysis(analysis)
    entity.aiAnalysis = sanitized
    if (sanitized.deviceType) {
      entity.deviceType = sanitized.deviceType
    }
    if (sanitized.severity) {
      entity.severity = sanitized.severity
    }
    if (sanitized.impact) {
      entity.impact = sanitized.impact
    }
    if (canTransition(entity.status, 'analyzed')) {
      entity.status = 'analyzed'
    }
    return this.caseRepository.save(entity)
  }

  async searchHistory(
    scope: InspectionScope,
    input: { caseId?: string; deviceType?: string; keywords?: string[]; limit?: number }
  ): Promise<InspectionHistoryReference[]> {
    await this.ensureSeedHistory(scope)
    const deviceType = normalizeOptional(input.deviceType)
    const keywords = (input.keywords ?? []).map(normalizeOptional).filter(Boolean)

    const where: Record<string, unknown> = scopedWhereHistory(scope)
    if (deviceType) {
      where.deviceType = deviceType
    }

    const candidates = await this.historyRepository.find({
      where,
      order: { updatedAt: 'DESC' },
      take: 50
    })

    const scored = candidates
      .map((record) => ({ record, score: scoreRecord(record, keywords, deviceType) }))
      .filter((item) => item.score > 0 || keywords.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit && input.limit > 0 ? Math.min(input.limit, HISTORY_SEARCH_LIMIT) : HISTORY_SEARCH_LIMIT)

    return scored.map(({ record }) => ({
      id: record.id,
      deviceType: record.deviceType,
      faultCategory: record.faultCategory,
      description: record.description,
      resolution: record.resolution,
      effectiveness: record.effectiveness ?? undefined,
      sourceCaseNo: record.sourceCaseNo ?? undefined,
      matchedKeywords: keywords.filter((keyword) => recordMatchesKeywords(record, keyword))
    }))
  }

  async saveRecommendation(
    scope: InspectionScope,
    caseId: string,
    input: { recommendation: string; historyReferenceIds?: string[] }
  ): Promise<InspectionCase> {
    const entity = await this.requireCase(scope, caseId)
    entity.recommendedAction = normalizeRequired(input.recommendation, '处理建议不能为空')
    if (Array.isArray(input.historyReferenceIds) && input.historyReferenceIds.length > 0) {
      const references = await this.historyRepository.find({
        where: { id: In(input.historyReferenceIds), ...scopedWhereHistory(scope) }
      })
      entity.historyReferences = references.map((record) => ({
        id: record.id,
        deviceType: record.deviceType,
        faultCategory: record.faultCategory,
        description: record.description,
        resolution: record.resolution,
        effectiveness: record.effectiveness ?? undefined,
        sourceCaseNo: record.sourceCaseNo ?? undefined,
        matchedKeywords: []
      }))
    }
    if (canTransition(entity.status, 'reviewing')) {
      entity.status = 'reviewing'
    }
    return this.caseRepository.save(entity)
  }

  async confirmResolution(scope: InspectionScope, caseId: string, input: ConfirmResolutionInput): Promise<InspectionCase> {
    const entity = await this.requireCase(scope, caseId)
    entity.resolution = normalizeRequired(input.resolution, '处理方案不能为空')
    entity.resolvedBy = normalizeOptional(input.resolvedBy) ?? scope.userId ?? null
    entity.resolvedAt = new Date()
    entity.status = input.close === true ? 'closed' : 'confirmed'

    // 沉淀为历史方案，供后续 AI 检索复用
    await this.sinkToHistory(scope, entity)
    return this.caseRepository.save(entity)
  }

  async reportFailure(scope: InspectionScope, caseId: string, input: { reason?: string }): Promise<InspectionCase> {
    const entity = await this.requireCase(scope, caseId)
    if (entity.status === 'closed') {
      throw new Error('已关闭的工单不能标记失败')
    }
    entity.status = 'failed'
    entity.failureReason = normalizeOptional(input.reason) ?? 'AI 处理失败，请重试'
    return this.caseRepository.save(entity)
  }

  /** 重试：清除失败状态，回到可重新分析的 analyzing 态（同一工单，不产生重复数据） */
  async retryCase(scope: InspectionScope, caseId: string): Promise<InspectionCase> {
    const entity = await this.requireCase(scope, caseId)
    if (entity.status !== 'failed') {
      throw new Error('只有失败状态的工单才能重试')
    }
    entity.status = 'analyzing'
    entity.retryCount = entity.retryCount + 1
    entity.failureReason = null
    return this.caseRepository.save(entity)
  }

  async listHistory(scope: InspectionScope, limit = 10): Promise<InspectionHistoryRecord[]> {
    await this.ensureSeedHistory(scope)
    return this.historyRepository.find({
      where: scopedWhereHistory(scope),
      order: { updatedAt: 'DESC' },
      take: limit
    })
  }

  // ---------- 内部 ----------

  private async requireCase(scope: InspectionScope, caseId: string): Promise<InspectionCase> {
    const existing = await this.getCase(scope, caseId)
    if (!existing) {
      throw new Error('工单不存在或无权访问')
    }
    return existing
  }

  private async ensureSeedHistory(scope: InspectionScope): Promise<void> {
    const existing = await this.historyRepository.findOne({
      where: { tenantId: scope.tenantId, sourceCaseNo: null }
    })
    if (existing) {
      return
    }
    const seeds = buildSeedHistory(scope).map((record) =>
      this.historyRepository.create(record)
    )
    try {
      await this.historyRepository.save(seeds)
    } catch (error) {
      // 并发初始化时可能重复写入，静默容忍
      this.logger.debug(`Seed history init skipped: ${(error as Error).message}`)
    }
  }

  private async sinkToHistory(scope: InspectionScope, entity: InspectionCase): Promise<void> {
    const deviceType = normalizeOptional(entity.deviceType) ?? '未分类'
    const faultCategory =
      normalizeOptional(entity.aiAnalysis?.faultCategory) ??
      normalizeOptional(entity.aiAnalysis?.deviceType) ??
      '未分类'
    const keywords = [deviceType, faultCategory, ...tokenize(entity.faultDescription)].slice(0, 6).join(' ')

    await this.historyRepository.save(
      this.historyRepository.create({
        id: randomUUID(),
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        deviceType,
        faultCategory,
        faultKeywords: keywords,
        description: entity.faultDescription.slice(0, 500),
        resolution: entity.resolution ?? '',
        effectiveness: entity.aiAnalysis?.faultSummary
          ? `依据工单 ${entity.caseNo} 确认的处理方案`
          : null,
        sourceCaseNo: entity.caseNo
      })
    )
  }
}

// ---------- 工具函数 ----------

function scopedWhere(scope: InspectionScope): Record<string, unknown> {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null
  }
}

function scopedWhereHistory(scope: InspectionScope): Record<string, unknown> {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null
  }
}

function scoreRecord(
  record: InspectionHistoryRecord,
  keywords: string[],
  deviceType?: string
): number {
  if (deviceType && record.deviceType !== deviceType) {
    // 设备类型不匹配仍可返回，但降权
  }
  let score = deviceType && record.deviceType === deviceType ? 10 : 0
  for (const keyword of keywords) {
    const lower = keyword.toLowerCase()
    if (recordMatchesKeywords(record, keyword)) {
      score += 4
    }
    if (record.faultCategory.toLowerCase().includes(lower)) {
      score += 3
    }
    if (record.description.toLowerCase().includes(lower)) {
      score += 2
    }
  }
  return score
}

function recordMatchesKeywords(record: InspectionHistoryRecord, keyword: string): boolean {
  const lower = keyword.toLowerCase()
  return (
    record.faultKeywords.toLowerCase().includes(lower) ||
    record.deviceType.toLowerCase().includes(lower) ||
    record.faultCategory.toLowerCase().includes(lower)
  )
}

function tokenize(text: string): string[] {
  const cleaned = text.replace(/[，。；、,.?!;:：\s]+/g, ' ').trim()
  return cleaned
    .split(' ')
    .filter((part) => part.length >= 2)
    .slice(0, 8)
}

function toView(entity: InspectionCase): InspectionCaseView {
  return {
    id: entity.id,
    caseNo: entity.caseNo,
    title: entity.title,
    deviceType: entity.deviceType ?? null,
    faultDescription: entity.faultDescription,
    severity: entity.severity ?? null,
    impact: entity.impact ?? null,
    status: entity.status,
    aiAnalysis: entity.aiAnalysis ?? null,
    recommendedAction: entity.recommendedAction ?? null,
    historyReferences: entity.historyReferences ?? [],
    failureReason: entity.failureReason ?? null,
    retryCount: entity.retryCount ?? 0,
    resolution: entity.resolution ?? null,
    resolvedBy: entity.resolvedBy ?? null,
    resolvedAt: entity.resolvedAt ? entity.resolvedAt.toISOString() : null,
    createdAt: entity.createdAt ? entity.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: entity.updatedAt ? entity.updatedAt.toISOString() : new Date().toISOString()
  }
}

function sanitizeAnalysis(analysis: InspectionAiAnalysis): InspectionAiAnalysis {
  return {
    deviceType: normalizeOptional(analysis.deviceType),
    faultCategory: normalizeOptional(analysis.faultCategory),
    faultSummary: normalizeOptional(analysis.faultSummary),
    severity: normalizeSeverity(analysis.severity) ?? undefined,
    impact: normalizeOptional(analysis.impact),
    possibleCauses: Array.isArray(analysis.possibleCauses)
      ? analysis.possibleCauses.map(normalizeOptional).filter(Boolean).slice(0, 8)
      : undefined
  }
}

function normalizeSeverity(value: unknown): InspectionAiAnalysis['severity'] {
  const normalized = normalizeOptional(value)?.toLowerCase()
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'critical') {
    return normalized
  }
  return undefined
}

function canTransition(current: string, target: string): boolean {
  return (STATUS_FLOW[current] ?? []).includes(target)
}

function buildCaseNo(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const suffix = Math.floor(1000 + Math.random() * 9000)
  return `INSP-${yyyy}${mm}${dd}-${suffix}`
}

function normalizeRequired(value: unknown, message: string): string {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    throw new Error(message)
  }
  return normalized
}

function normalizeOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function normalizePage(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1
}

function normalizePageSize(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(parsed) && parsed >= 1) {
    return Math.min(Math.floor(parsed), 100)
  }
  return 20
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}
