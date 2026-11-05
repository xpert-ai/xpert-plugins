import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { PLUGIN_CONFIG_RESOLVER_TOKEN } from '@xpert-ai/plugin-sdk'
import type { IPluginConfigResolver } from '@xpert-ai/plugin-sdk'
import { In, Repository } from 'typeorm'
import { applyScopeToQueryBuilder, scopeColumns, scopeWhere } from './scope'
import { ContractReviewCase, ContractReviewClause } from './entities'
import { CONTRACT_REVIEW_PLUGIN_NAME } from './constants'
import { ContractReviewPluginConfigSchema, readContractReviewPluginEnvDefaults } from './contract-review.config'
import type {
  ContractClauseType,
  ContractHumanDecision,
  ContractReviewCaseStatus,
  ContractReviewClauseDecision,
  ContractReviewClauseInput,
  ContractReviewScope
} from './types'

export interface CreateCaseInput {
  title: string
  counterparty?: string | null
  contractText: string
  createdBy?: string | null
}

export interface SaveReviewInput {
  caseId: string
  decisions: ContractReviewClauseDecision[]
  /** 允许在仍有未处理条款时保存，但必须在返回值里如实告知还剩几条 */
  allowPartial?: boolean
}

@Injectable()
export class ContractReviewService {
  constructor(
    @InjectRepository(ContractReviewCase)
    private readonly caseRepo: Repository<ContractReviewCase>,
    @InjectRepository(ContractReviewClause)
    private readonly clauseRepo: Repository<ContractReviewClause>,
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  /**
   * 每次请求读取插件配置，而不是在启动时固化：
   * 运营在插件配置表单里改了分页或超时，下一次读视图/列表就生效，无需重启宿主。
   * resolver 不存在时（例如单测里直接 new）回退到环境变量默认值。
   */
  pluginConfig() {
    const defaults = readContractReviewPluginEnvDefaults()
    const raw = this.pluginConfigResolver
      ? this.pluginConfigResolver.resolve(CONTRACT_REVIEW_PLUGIN_NAME, { defaults })
      : defaults
    const parsed = ContractReviewPluginConfigSchema.safeParse(raw)
    return parsed.success ? parsed.data : defaults
  }

  // ---------------- 审查单 ----------------

  async createCase(scope: ContractReviewScope, input: CreateCaseInput) {
    const title = input.title?.trim()
    const contractText = input.contractText?.trim()
    if (!title) throw new Error('合同名称不能为空')
    if (!contractText) throw new Error('合同正文不能为空')

    const created = this.caseRepo.create({
      ...scopeColumns(scope),
      title,
      counterparty: input.counterparty?.trim() || null,
      contractText,
      status: 'draft',
      extractionAttempts: 0,
      createdBy: input.createdBy ?? scope.userId ?? null
    })
    const saved = await this.caseRepo.save(created)
    return this.getCase(scope, saved.id!)
  }

  async listCases(scope: ContractReviewScope, options: { page?: number; pageSize?: number; search?: string } = {}) {
    const page = Math.max(1, options.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? this.pluginConfig().defaultPageSize))

    const qb = this.caseRepo.createQueryBuilder('c')
    applyScopeToQueryBuilder(qb, 'c', scope)
    const search = options.search?.trim()
    if (search) {
      qb.andWhere('(c.title ILIKE :search OR c.counterparty ILIKE :search)', { search: `%${search}%` })
    }
    qb.orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    const [items, total] = await qb.getManyAndCount()
    const counts = await this.countClausesByCase(items.map((item) => item.id!))
    return {
      items: items.map((item) => this.decorateCase(item, counts[item.id!])),
      total,
      page,
      pageSize
    }
  }

  async getCase(scope: ContractReviewScope, caseId: string) {
    const entity = await this.caseRepo.findOne({ where: scopeWhere(scope, { id: caseId }) })
    if (!entity) throw new Error('审查单不存在，或不属于当前组织')

    const clauses = await this.clauseRepo.find({
      where: scopeWhere(scope, { caseId }),
      order: { sequence: 'ASC', createdAt: 'ASC' }
    })
    const stats = summarize(clauses)
    return {
      ...this.decorateCase(entity, stats),
      clauses: clauses.map(serializeClause)
    }
  }

  async deleteCase(scope: ContractReviewScope, caseId: string) {
    const entity = await this.caseRepo.findOne({ where: scopeWhere(scope, { id: caseId }) })
    if (!entity) throw new Error('审查单不存在，或不属于当前组织')
    await this.clauseRepo.delete(scopeWhere(scope, { caseId }))
    await this.caseRepo.delete(scopeWhere(scope, { id: caseId }))
    return { caseId, deleted: true }
  }

  // ---------------- AI 审查生命周期 ----------------

  /**
   * 开始（或重试）一次 AI 审查。
   * 契约正文与已有人工结论都不动 —— 失败重试的前提是输入不丢。
   */
  async beginExtraction(scope: ContractReviewScope, caseId: string) {
    const entity = await this.caseRepo.findOne({ where: scopeWhere(scope, { id: caseId }) })
    if (!entity) throw new Error('审查单不存在，或不属于当前组织')

    entity.status = 'extracting'
    entity.extractionAttempts = (entity.extractionAttempts ?? 0) + 1
    entity.lastExtractionAt = new Date()
    entity.lastExtractionError = null
    await this.caseRepo.save(entity)
    return this.getCase(scope, caseId)
  }

  /**
   * Agent 记录一条抽出的条款。
   *
   * 幂等策略：同一审查单里同类型且「人工尚未处置」的条款会被覆盖，避免重试时堆出重复项；
   * 一旦人工已经确认/修改/驳回，再次写入就新增一条，绝不覆盖人工结论。
   */
  async recordClause(
    scope: ContractReviewScope,
    caseId: string,
    input: ContractReviewClauseInput
  ) {
    const entity = await this.caseRepo.findOne({ where: scopeWhere(scope, { id: caseId }) })
    if (!entity) throw new Error('审查单不存在，或不属于当前组织')

    const existing = await this.clauseRepo.findOne({
      where: scopeWhere(scope, { caseId, clauseType: input.clauseType, humanDecision: 'pending' })
    })

    const payload = {
      excerpt: input.excerpt,
      aiConclusion: input.conclusion,
      aiRiskLevel: input.riskLevel,
      aiReason: input.reason
    }

    let clauseId: string
    if (existing) {
      Object.assign(existing, payload)
      const saved = await this.clauseRepo.save(existing)
      clauseId = saved.id!
    } else {
      const maxSequence = await this.clauseRepo.count({ where: scopeWhere(scope, { caseId }) })
      const created = this.clauseRepo.create({
        ...scopeColumns(scope),
        caseId,
        sequence: maxSequence,
        clauseType: input.clauseType,
        humanDecision: 'pending',
        ...payload
      })
      const saved = await this.clauseRepo.save(created)
      clauseId = saved.id!
    }

    // 一旦有条款回写，就说明 AI 这一轮是有产出的
    if (entity.status === 'draft' || entity.status === 'extracting') {
      entity.status = 'extracted'
      entity.lastExtractionError = null
      await this.caseRepo.save(entity)
    }

    return { clauseId, caseId }
  }

  /** Agent 主动宣告本轮审查结束（成功或失败）。失败时保留正文，供人工重试。 */
  async markExtraction(
    scope: ContractReviewScope,
    caseId: string,
    outcome: 'success' | 'failed',
    detail?: { error?: string | null }
  ) {
    const entity = await this.caseRepo.findOne({ where: scopeWhere(scope, { id: caseId }) })
    if (!entity) throw new Error('审查单不存在，或不属于当前组织')

    if (outcome === 'success') {
      entity.status = 'extracted'
      entity.lastExtractionError = null
    } else {
      // 失败：状态回到 draft，正文和已有条款都不动，人工可直接重试
      entity.status = 'draft'
      entity.lastExtractionError = detail?.error?.trim() || 'AI 未返回可用条款'
    }
    await this.caseRepo.save(entity)
    return this.getCase(scope, caseId)
  }

  // ---------------- 人工确认与落库 ----------------

  async saveReview(scope: ContractReviewScope, input: SaveReviewInput) {
    const entity = await this.caseRepo.findOne({ where: scopeWhere(scope, { id: input.caseId }) })
    if (!entity) throw new Error('审查单不存在，或不属于当前组织')

    const decisions = input.decisions ?? []
    if (decisions.length) {
      const ids = decisions.map((item) => item.clauseId)
      const clauses = await this.clauseRepo.find({ where: scopeWhere(scope, { id: In(ids) }) })
      const byId = new Map(clauses.map((clause) => [clause.id!, clause]))

      const now = new Date()
      for (const decision of decisions) {
        const clause = byId.get(decision.clauseId)
        if (!clause) continue
        clause.humanDecision = decision.decision
        // edited 时写入人工改写后的结论；confirmed/rejected 时留空表示「采纳/否决 AI 原判」
        clause.humanConclusion = decision.decision === 'edited' ? decision.conclusion ?? null : null
        clause.humanNote = decision.note?.trim() || null
        clause.decidedAt = now
      }
      await this.clauseRepo.save([...byId.values()])
    }

    const all = await this.clauseRepo.find({ where: scopeWhere(scope, { caseId: input.caseId }) })
    const stats = summarize(all)

    if (stats.pending > 0 && !input.allowPartial) {
      return {
        saved: false,
        case: await this.getCase(scope, input.caseId),
        stats,
        message: `还有 ${stats.pending} 条条款未处置，确认后才会落库`
      }
    }

    entity.status = 'confirmed'
    entity.confirmedAt = new Date()
    await this.caseRepo.save(entity)

    return {
      saved: true,
      case: await this.getCase(scope, input.caseId),
      stats,
      message: `审查结论已保存：确认 ${stats.confirmed} 条、修改 ${stats.edited} 条、驳回 ${stats.rejected} 条`
    }
  }

  // ---------------- 视图数据 ----------------

  async getViewData(
    scope: ContractReviewScope,
    options: { caseId?: string; page?: number; pageSize?: number; search?: string; timeoutSeconds?: number } = {}
  ) {
    const timeoutSeconds = options.timeoutSeconds ?? this.pluginConfig().extractionTimeoutSeconds

    // 超时判定：AI 审查中停留过久 → 在前端呈现为「本轮失败，可重试」
    await this.failStaleExtractions(scope, timeoutSeconds)

    if (options.caseId) {
      const detail = await this.getCase(scope, options.caseId)
      return { selected: detail, list: await this.listCases(scope, options) }
    }
    return { selected: null, list: await this.listCases(scope, options) }
  }

  /**
   * 没有任何后台任务：超时的审查单在下次读视图时被就地判定为失败。
   * 这样即便宿主重启，失败态也不会丢失，且不引入额外的定时器复杂度。
   */
  private async failStaleExtractions(scope: ContractReviewScope, timeoutSeconds: number) {
    const deadline = new Date(Date.now() - timeoutSeconds * 1000)
    const qb = this.caseRepo.createQueryBuilder('c')
    applyScopeToQueryBuilder(qb, 'c', scope)
    qb.andWhere('c.status = :status', { status: 'extracting' })
      .andWhere('c.lastExtractionAt < :deadline', { deadline })

    const stale = await qb.getMany()
    if (!stale.length) return
    for (const item of stale) {
      item.status = 'draft'
      item.lastExtractionError = `AI 在 ${timeoutSeconds} 秒内没有返回任何条款，已判定本轮失败，可直接重试`
    }
    await this.caseRepo.save(stale)
  }

  private async countClausesByCase(caseIds: string[]) {
    const result: Record<string, { total: number; pending: number }> = {}
    if (!caseIds.length) return result
    const clauses = await this.clauseRepo.find({ where: { caseId: In(caseIds) } })
    for (const clause of clauses) {
      const bucket = (result[clause.caseId!] ??= { total: 0, pending: 0 })
      bucket.total += 1
      if (clause.humanDecision === 'pending') bucket.pending += 1
    }
    return result
  }

  private decorateCase(entity: ContractReviewCase, counts?: { total: number; pending: number }) {
    return {
      ...serializeCase(entity),
      clauseCount: counts?.total ?? 0,
      pendingCount: counts?.pending ?? 0
    }
  }
}

// ---------------- 序列化 / 统计 ----------------

export function summarize(clauses: ContractReviewClause[]) {
  const stats = { total: clauses.length, pending: 0, confirmed: 0, edited: 0, rejected: 0, highRisk: 0 }
  for (const clause of clauses) {
    const decision = (clause.humanDecision ?? 'pending') as ContractHumanDecision
    if (decision in stats) stats[decision as 'pending' | 'confirmed' | 'edited' | 'rejected'] += 1
    if (clause.aiRiskLevel === 'high') stats.highRisk += 1
  }
  return stats
}

export function serializeCase(entity: ContractReviewCase) {
  return {
    id: entity.id!,
    title: entity.title ?? '',
    counterparty: entity.counterparty ?? null,
    // 列表页不需要全文，但仍然返回，便于「恢复」时无需二次请求
    contractText: entity.contractText ?? '',
    status: (entity.status ?? 'draft') as ContractReviewCaseStatus,
    extractionAttempts: entity.extractionAttempts ?? 0,
    lastExtractionAt: entity.lastExtractionAt ?? null,
    lastExtractionError: entity.lastExtractionError ?? null,
    confirmedAt: entity.confirmedAt ?? null,
    createdAt: entity.createdAt ?? null,
    updatedAt: entity.updatedAt ?? null
  }
}

export function serializeClause(entity: ContractReviewClause) {
  return {
    id: entity.id!,
    caseId: entity.caseId!,
    sequence: entity.sequence ?? 0,
    clauseType: entity.clauseType as ContractClauseType,
    excerpt: entity.excerpt ?? '',
    aiConclusion: entity.aiConclusion ?? null,
    aiRiskLevel: entity.aiRiskLevel ?? 'medium',
    aiReason: entity.aiReason ?? null,
    humanDecision: (entity.humanDecision ?? 'pending') as ContractHumanDecision,
    humanConclusion: entity.humanConclusion ?? null,
    humanNote: entity.humanNote ?? null,
    decidedAt: entity.decidedAt ?? null
  }
}
