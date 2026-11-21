/**
 * 业务服务：请求的状态机、分析任务的幂等、惰性超时、操作日志，以及工具要用的分析数据。
 *
 * 并发与幂等的做法（技术方案决策 T9，skill “Database Access and Transaction Boundaries”）：
 * - 不在插件里开数据库事务；
 * - 用唯一约束防重复插入（任务序号、(任务, 物料)、(组织, 订单号)）；
 * - 状态迁移用“条件更新”：WHERE 里带上旧状态和版本号，再看影响行数，0 行说明别人先改了。
 * Python 类比：SQLAlchemy 里 `update(...).where(status == old, revision == rev)`，再看 result.rowcount。
 */
import { randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ILike, In, IsNull, Repository } from 'typeorm'
import type { FindOptionsWhere } from 'typeorm'
import { EXPEDITE_CLOCK } from './clock.js'
import type { Clock } from './clock.js'
import { toFindingDto, toJobDto, toLogDto, toRequestDto } from './dto.js'
import {
  AnalysisJobEntity,
  ExpediteRequestEntity,
  RequestLogEntity,
  ShortageFindingEntity
} from './entities/index.js'
import { ExpediteError, isUniqueViolation } from './errors.js'
import {
  abandonAnalysisInputSchema,
  confirmRequestInputSchema,
  createRequestInputSchema,
  listRequestsQuerySchema,
  rejectAnalysisInputSchema,
  setFindingDecisionInputSchema
} from './schemas.js'
import type { ListRequestsQuery } from './schemas.js'
import { computeAvailability, earliestAvailableDate, explodeBom } from './shortage-calculator.js'
import type { AvailabilityLine } from './shortage-calculator.js'
import { DEMO_REQUESTS } from './supply/mock-data.js'
import { SupplyDataSource, SupplyUnavailableError } from './supply/supply-data-source.js'
import {
  ACTIVE_JOB_STATUSES,
  ANALYSIS_TIMEOUT_MS,
  SUGGESTION_TYPES
} from './types.js'
import type {
  ExpediteScope,
  Feasibility,
  FindingEvidence,
  LogActor,
  ReportedFailureCode,
  RequestStatus,
  SuggestionType
} from './types.js'

/** 智能体保存一条缺料结论时提交的内容（数字不在这里，服务端自己算） */
export interface SaveFindingInput {
  materialCode: string
  suggestionType: SuggestionType
  suggestedDate?: string | undefined
  substituteCode?: string | undefined
  rationale: string
}

export interface FinalizeAnalysisInput {
  feasibility: Feasibility
  recommendedDate: string
  summary: string
}

export interface ReportFailureInput {
  errorCode: ReportedFailureCode
  reason: string
}

/** 发给对话的分析指令支持的语言 */
export type MessageLocale = 'zh-Hans' | 'en-US'

/** 一次分析所需的数据快照（每个工具调用时重新计算，保证与库存数据一致） */
interface AnalysisSnapshot {
  request: ExpediteRequestEntity
  productName: string
  lines: AvailabilityLine[]
  snapshotAt: string
}

@Injectable()
export class ExpediteService {
  constructor(
    @InjectRepository(ExpediteRequestEntity) private readonly requests: Repository<ExpediteRequestEntity>,
    @InjectRepository(AnalysisJobEntity) private readonly jobs: Repository<AnalysisJobEntity>,
    @InjectRepository(ShortageFindingEntity) private readonly findings: Repository<ShortageFindingEntity>,
    @InjectRepository(RequestLogEntity) private readonly logs: Repository<RequestLogEntity>,
    private readonly supply: SupplyDataSource,
    @Inject(EXPEDITE_CLOCK) private readonly clock: Clock
  ) {}

  // ───────────────────────── 视图侧：请求 ─────────────────────────

  /** 新建草稿请求 */
  async createRequest(scope: ExpediteScope, rawInput: unknown) {
    const parsed = createRequestInputSchema.safeParse(rawInput)
    if (!parsed.success) {
      const fields: Record<string, string> = {}
      for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? 'input')] ??= issue.code
      throw new ExpediteError('VALIDATION_FAILED', { fields })
    }
    const input = parsed.data
    const fields: Record<string, string> = {}
    if (!this.supply.getProduct(input.productCode)) fields['productCode'] = 'unknown_product'
    if (input.targetDate >= input.originalDueDate) fields['targetDate'] = 'target_not_earlier'
    else if (input.targetDate <= this.supply.getAsOfDate()) fields['targetDate'] = 'target_in_past'
    if (Object.keys(fields).length) throw new ExpediteError('VALIDATION_FAILED', { fields })

    const now = this.clock.now()
    const request = this.requests.create({
      id: randomUUID(),
      ...this.scopeColumns(scope),
      orderNo: input.orderNo,
      customerName: input.customerName,
      productCode: input.productCode,
      quantity: input.quantity,
      originalDueDate: input.originalDueDate,
      targetDate: input.targetDate,
      remark: input.remark || null,
      status: 'draft',
      demoFailInventoryOnce: input.demoFailInventoryOnce ?? false,
      currentJobId: null,
      jobCount: 0,
      revision: 1,
      finalFeasibility: null,
      finalDate: null,
      finalNote: null,
      rejectReason: null,
      createdById: scope.userId,
      decidedById: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now
    })
    try {
      await this.requests.insert(request)
    } catch (error) {
      if (isUniqueViolation(error)) throw new ExpediteError('DUPLICATE_ORDER', { orderNo: input.orderNo })
      throw error
    }
    await this.log(scope, request.id, null, 'user', 'request_created', `Created ${request.orderNo}`)
    return toRequestDto(request, this.productName(request.productCode))
  }

  /** 幂等写入三条演示请求：已存在的订单号跳过 */
  async seedDemoRequests(scope: ExpediteScope) {
    let inserted = 0
    for (const demo of DEMO_REQUESTS) {
      const exists = await this.requests.exist({ where: { ...this.scopeWhere(scope), orderNo: demo.orderNo } })
      if (exists) continue
      try {
        await this.createRequest(scope, { ...demo })
        inserted += 1
      } catch (error) {
        // 并发点击时另一边已写入，视为已存在
        if (error instanceof ExpediteError && error.code === 'DUPLICATE_ORDER') continue
        throw error
      }
    }
    return { inserted, skipped: DEMO_REQUESTS.length - inserted }
  }

  /** 只有草稿可以删除 */
  async deleteDraft(scope: ExpediteScope, requestId: string) {
    const result = await this.requests.delete({ ...this.scopeWhere(scope), id: requestId, status: 'draft' })
    if (result.affected !== 1) {
      const request = await this.findRequest(scope, requestId)
      throw new ExpediteError('INVALID_STATE', { status: request.status })
    }
    await this.logs.delete({ ...this.scopeWhere(scope), requestId })
    return { requestId, deleted: true }
  }

  /** 分页列表；读取前先把已超时的分析标记为失败（决策 T8：读取时惰性判定） */
  async listRequests(scope: ExpediteScope, rawQuery: ListRequestsQuery = {}) {
    const query = listRequestsQuerySchema.parse(rawQuery)
    const analyzing = await this.requests.find({ where: { ...this.scopeWhere(scope), status: 'analyzing' }, take: 50 })
    for (const request of analyzing) await this.applyTimeout(scope, request)

    const base: FindOptionsWhere<ExpediteRequestEntity> = {
      ...this.scopeWhere(scope),
      ...(query.status ? { status: query.status } : {})
    }
    const where = query.search
      ? [
          { ...base, orderNo: ILike(`%${query.search}%`) },
          { ...base, customerName: ILike(`%${query.search}%`) }
        ]
      : base
    const [items, total] = await this.requests.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    })
    const counts = await this.countFindingsByJob(
      scope,
      items.filter((item) => item.currentJobId && ['pending_review', 'confirmed', 'rejected'].includes(item.status)).map((item) => item.currentJobId!)
    )
    return {
      items: items.map((item) =>
        toRequestDto(item, this.productName(item.productCode), item.currentJobId ? (counts.get(item.currentJobId) ?? null) : null)
      ),
      total,
      page: query.page,
      pageSize: query.pageSize
    }
  }

  /** 详情：请求 + 当前任务 + 当前任务的结论 + 历次任务 + 最近日志 */
  async getRequestDetail(scope: ExpediteScope, requestId: string) {
    let request = await this.findRequest(scope, requestId)
    request = await this.applyTimeout(scope, request)
    const jobs = await this.jobs.find({ where: { ...this.scopeWhere(scope), requestId }, order: { seq: 'ASC' } })
    const currentJob = jobs.find((job) => job.id === request.currentJobId) ?? null
    const findings = currentJob
      ? await this.findings.find({ where: { ...this.scopeWhere(scope), jobId: currentJob.id }, order: { shortageQty: 'DESC', materialCode: 'ASC' } })
      : []
    const logs = await this.logs.find({ where: { ...this.scopeWhere(scope), requestId }, order: { createdAt: 'DESC' }, take: 50 })
    return {
      request: toRequestDto(request, this.productName(request.productCode), currentJob?.status === 'succeeded' ? findings.length : null),
      currentJob: currentJob ? toJobDto(currentJob) : null,
      findings: findings.map(toFindingDto),
      jobs: jobs.map(toJobDto),
      logs: logs.map(toLogDto),
      asOfDate: this.supply.getAsOfDate(),
      serverTime: this.clock.now().toISOString(),
      timeoutMs: ANALYSIS_TIMEOUT_MS
    }
  }

  /** 新建对话框的产品下拉：只能选模拟数据里有 BOM 的产品；同时给出基准日，界面据此做日期校验 */
  getFormOptions() {
    return {
      asOfDate: this.supply.getAsOfDate(),
      products: this.supply.listProducts().map((product) => ({ code: product.code, name: product.name }))
    }
  }

  // ───────────────────────── 视图侧：分析与确认 ─────────────────────────

  /**
   * 开始分析 / 重试 / 重新分析（三者服务端逻辑相同）。
   * 幂等：已有未超时的活动任务时直接返回它，不新建（防止连点）。
   */
  async startAnalysis(scope: ExpediteScope, requestId: string, locale: MessageLocale = 'zh-Hans') {
    let request = await this.findRequest(scope, requestId)
    request = await this.applyTimeout(scope, request)

    if (request.status === 'analyzing' && request.currentJobId) {
      const job = await this.jobs.findOneBy({ ...this.scopeWhere(scope), id: request.currentJobId })
      if (job && ACTIVE_JOB_STATUSES.includes(job.status)) {
        return this.analysisCommand(request, job, false, locale)
      }
    }
    if (!['draft', 'failed', 'rejected'].includes(request.status)) {
      throw new ExpediteError('INVALID_STATE', { status: request.status })
    }

    const now = this.clock.now()
    const seq = request.jobCount + 1
    const job = this.jobs.create({
      id: randomUUID(),
      ...this.scopeColumns(scope),
      requestId,
      seq,
      status: 'queued',
      simulateInventoryOutage: request.demoFailInventoryOnce && seq === 1,
      errorCode: null,
      errorMessage: null,
      feasibility: null,
      recommendedDate: null,
      summary: null,
      conversationId: null,
      createdById: scope.userId,
      createdAt: now,
      startedAt: null,
      finishedAt: null
    })
    try {
      await this.jobs.insert(job)
    } catch (error) {
      // (requestId, seq) 唯一：另一个并发请求已经建了同序号任务，返回它
      if (isUniqueViolation(error)) return this.startAnalysisAfterRace(scope, requestId, locale)
      throw error
    }

    const moved = await this.requests.update(
      { ...this.scopeWhere(scope), id: requestId, status: request.status, revision: request.revision },
      { status: 'analyzing', currentJobId: job.id, jobCount: seq, revision: request.revision + 1, updatedAt: now }
    )
    if (moved.affected !== 1) {
      // 请求已被别人改动：这个任务作废，按最新状态重新判断
      await this.jobs.update({ id: job.id }, { status: 'superseded', finishedAt: now })
      return this.startAnalysisAfterRace(scope, requestId, locale)
    }
    await this.log(scope, requestId, job.id, 'user', 'analysis_started', `Analysis #${seq} started`)
    request = await this.findRequest(scope, requestId)
    return this.analysisCommand(request, job, true, locale)
  }

  /** 计划员逐条采纳/驳回：只能改当前任务的结论，且请求必须在“待确认” */
  async setFindingDecision(scope: ExpediteScope, rawInput: unknown) {
    const input = setFindingDecisionInputSchema.parse(rawInput)
    const finding = await this.findings.findOneBy({ ...this.scopeWhere(scope), id: input.findingId })
    if (!finding) throw new ExpediteError('NOT_FOUND', { entity: 'finding' })
    const request = await this.findRequest(scope, finding.requestId)
    if (request.status !== 'pending_review' || request.currentJobId !== finding.jobId) {
      throw new ExpediteError('FINDING_NOT_EDITABLE', { status: request.status })
    }
    const now = this.clock.now()
    await this.findings.update(
      { ...this.scopeWhere(scope), id: finding.id, jobId: finding.jobId },
      {
        decision: input.decision,
        decisionNote: input.note || null,
        decidedAt: input.decision === 'pending' ? null : now,
        updatedAt: now
      }
    )
    await this.log(scope, request.id, finding.jobId, 'user', 'finding_decided', `${finding.materialCode}: ${input.decision}`)
    const undecided = await this.findings.count({ where: { ...this.scopeWhere(scope), jobId: finding.jobId, decision: 'pending' } })
    return { findingId: finding.id, decision: input.decision, undecidedCount: undecided }
  }

  /** 确认结论：所有条目都已决定才允许；只有“待确认”能迁移到“已确认”，第二次提交被拒绝 */
  async confirmRequest(scope: ExpediteScope, rawInput: unknown) {
    const input = confirmRequestInputSchema.parse(rawInput)
    const request = await this.findRequest(scope, input.requestId)
    if (request.status === 'confirmed' || request.status === 'rejected') {
      throw new ExpediteError('ALREADY_DECIDED', { status: request.status })
    }
    if (request.status !== 'pending_review' || !request.currentJobId) {
      throw new ExpediteError('INVALID_STATE', { status: request.status })
    }
    const undecided = await this.findings.find({
      where: { ...this.scopeWhere(scope), jobId: request.currentJobId, decision: 'pending' },
      select: { materialCode: true }
    })
    if (undecided.length) {
      throw new ExpediteError('UNDECIDED_FINDINGS', { materialCodes: undecided.map((item) => item.materialCode) })
    }
    const job = await this.jobs.findOneBy({ ...this.scopeWhere(scope), id: request.currentJobId })
    const now = this.clock.now()
    const moved = await this.requests.update(
      { ...this.scopeWhere(scope), id: request.id, status: 'pending_review', revision: request.revision },
      {
        status: 'confirmed',
        finalFeasibility: job?.feasibility ?? null,
        finalDate: input.finalDate,
        finalNote: input.note || null,
        decidedById: scope.userId,
        decidedAt: now,
        revision: request.revision + 1,
        updatedAt: now
      }
    )
    if (moved.affected !== 1) {
      const latest = await this.findRequest(scope, request.id)
      if (latest.status === 'confirmed' || latest.status === 'rejected') {
        throw new ExpediteError('ALREADY_DECIDED', { status: latest.status })
      }
      throw new ExpediteError('CONFLICT', { status: latest.status })
    }
    await this.log(scope, request.id, request.currentJobId, 'user', 'request_confirmed', `Confirmed with final date ${input.finalDate}`)
    return { requestId: request.id, status: 'confirmed' as RequestStatus }
  }

  /** 驳回本次分析：待确认 → 已驳回，之后可重新分析 */
  async rejectAnalysis(scope: ExpediteScope, rawInput: unknown) {
    const input = rejectAnalysisInputSchema.parse(rawInput)
    const request = await this.findRequest(scope, input.requestId)
    if (request.status !== 'pending_review') {
      throw new ExpediteError(request.status === 'confirmed' || request.status === 'rejected' ? 'ALREADY_DECIDED' : 'INVALID_STATE', {
        status: request.status
      })
    }
    const now = this.clock.now()
    const moved = await this.requests.update(
      { ...this.scopeWhere(scope), id: request.id, status: 'pending_review', revision: request.revision },
      { status: 'rejected', rejectReason: input.reason, decidedById: scope.userId, decidedAt: now, revision: request.revision + 1, updatedAt: now }
    )
    if (moved.affected !== 1) throw new ExpediteError('CONFLICT', { status: (await this.findRequest(scope, request.id)).status })
    await this.log(scope, request.id, request.currentJobId, 'user', 'analysis_rejected', input.reason)
    return { requestId: request.id, status: 'rejected' as RequestStatus }
  }

  /**
   * 放弃本次分析：分析中 → 分析失败（错误码 ANALYSIS_ABANDONED），之后可立即重试。
   * 场景：智能体中途停了（例如达到递归上限），任务卡在 running，不想干等 3 分钟惰性超时。
   * 这是界面动作，不是工具，模型调不到；之后智能体的迟到写入会因 JOB_NOT_ACTIVE 被拒绝。
   */
  async abandonAnalysis(scope: ExpediteScope, rawInput: unknown) {
    const input = abandonAnalysisInputSchema.parse(rawInput)
    let request = await this.findRequest(scope, input.requestId)
    // 先做一次超时判定：已经超时的任务按超时处理，不再记成“放弃”
    request = await this.applyTimeout(scope, request)
    const job =
      request.currentJobId === input.jobId ? await this.jobs.findOneBy({ ...this.scopeWhere(scope), id: input.jobId }) : null
    if (request.status !== 'analyzing' || !job || !ACTIVE_JOB_STATUSES.includes(job.status)) {
      throw new ExpediteError('INVALID_STATE', { status: request.status })
    }
    try {
      await this.failJob(scope, request, job, 'ANALYSIS_ABANDONED', 'The planner abandoned this analysis.', 'user')
    } catch (error) {
      // 并发：智能体恰好在这一刻提交了结论或上报失败，按冲突返回，界面刷新后看最新状态
      if (error instanceof ExpediteError && error.code === 'JOB_NOT_ACTIVE') {
        throw new ExpediteError('CONFLICT', { status: (await this.findRequest(scope, request.id)).status })
      }
      throw error
    }
    return { requestId: request.id, jobId: job.id, status: 'failed' as RequestStatus }
  }

  // ───────────────────────── 工具侧：分析任务 ─────────────────────────

  /** 读取分析任务；首次读取时把任务从 queued 改为 running（重复调用无副作用） */
  async getAnalysisContext(scope: ExpediteScope, jobId: string, conversationId?: string) {
    const { job, request } = await this.requireActiveJob(scope, jobId)
    await this.ensureRunning(scope, job, conversationId)
    return {
      analysisJobId: job.id,
      attempt: job.seq,
      orderNo: request.orderNo,
      customerName: request.customerName,
      productCode: request.productCode,
      productName: this.productName(request.productCode),
      quantity: request.quantity,
      originalDueDate: request.originalDueDate,
      targetDate: request.targetDate,
      asOfDate: this.supply.getAsOfDate(),
      remark: request.remark,
      allowedSuggestionTypes: [...SUGGESTION_TYPES]
    }
  }

  /** 展开 BOM（只读） */
  async explodeBomForJob(scope: ExpediteScope, jobId: string) {
    const { job, request } = await this.requireActiveJob(scope, jobId)
    await this.ensureRunning(scope, job)
    const product = this.supply.getProduct(request.productCode)
    if (!product) throw new ExpediteError('PRODUCT_HAS_NO_BOM', { productCode: request.productCode })
    const lines = explodeBom(product, request.quantity, (code) => this.supply.getMaterial(code))
    return {
      productCode: product.code,
      productName: product.name,
      quantity: request.quantity,
      lines: lines.map((line) => ({
        materialCode: line.materialCode,
        materialName: line.materialName,
        unit: line.unit,
        bomPaths: line.usages.map((usage) => `${product.code} > ${usage.componentCode} ${usage.componentName} x${usage.qtyPerProduct}`),
        qtyPerProduct: line.qtyPerProduct,
        requiredQty: line.requiredQty
      }))
    }
  }

  /** 查询库存与在途、计算缺口（演示故障点） */
  async checkInventoryForJob(scope: ExpediteScope, jobId: string) {
    const { job } = await this.requireActiveJob(scope, jobId)
    await this.ensureRunning(scope, job)
    const snapshot = await this.analysisSnapshot(scope, job)
    const shortages = snapshot.lines.filter((line) => line.shortageQty > 0)
    return {
      inventorySnapshotAt: snapshot.snapshotAt,
      targetDate: snapshot.request.targetDate,
      materials: snapshot.lines.map((line) => ({
        materialCode: line.materialCode,
        materialName: line.materialName,
        requiredQty: line.requiredQty,
        onHand: line.onHand,
        inboundBeforeTarget: line.inboundInWindow.map(({ poNo, qty, eta }) => ({ poNo, qty, eta })),
        inboundAfterTarget: line.inboundLate.map(({ poNo, qty, eta }) => ({ poNo, qty, eta })),
        availableQty: line.availableQty,
        shortageQty: line.shortageQty
      })),
      shortageCount: shortages.length,
      shortageMaterialCodes: shortages.map((line) => line.materialCode)
    }
  }

  /** 查询提前期、最早可得日期和替代料 */
  async getSupplyOptionsForJob(scope: ExpediteScope, jobId: string, materialCodes: readonly string[]) {
    const { job } = await this.requireActiveJob(scope, jobId)
    await this.ensureRunning(scope, job)
    const snapshot = await this.analysisSnapshot(scope, job)
    const codes = [...new Set(materialCodes)]
    const unknown = codes.filter((code) => !snapshot.lines.some((line) => line.materialCode === code))
    if (unknown.length) throw new ExpediteError('UNKNOWN_MATERIAL', { materialCodes: unknown })

    const params = this.supply.getSupplyParameters(codes)
    const substitutes = this.supply.getSubstitutes(codes)
    const substitutePosition = await this.inventoryPosition(
      job,
      substitutes.map((item) => item.substituteCode)
    )
    return {
      asOfDate: this.supply.getAsOfDate(),
      materials: codes.map((code) => {
        const line = snapshot.lines.find((item) => item.materialCode === code)!
        const leadTimeDays = params.find((item) => item.materialCode === code)?.leadTimeDays ?? null
        return {
          materialCode: code,
          materialName: line.materialName,
          shortageQty: line.shortageQty,
          leadTimeDays,
          earliestAvailableDate: this.earliestDate(line, leadTimeDays),
          inboundAfterTarget: line.inboundLate.map(({ poNo, qty, eta }) => ({ poNo, qty, eta })),
          substitutes: substitutes
            .filter((item) => item.materialCode === code)
            .map((item) => ({
              materialCode: item.substituteCode,
              materialName: this.supply.getMaterial(item.substituteCode)?.name ?? item.substituteCode,
              onHand: substitutePosition.inventory.find((row) => row.materialCode === item.substituteCode)?.onHand ?? 0,
              note: item.note
            }))
        }
      })
    }
  }

  /** 保存一条缺料结论：服务端重算数字；按 (任务, 物料) 覆盖 */
  async saveFinding(scope: ExpediteScope, jobId: string, input: SaveFindingInput) {
    const { job, request } = await this.requireActiveJob(scope, jobId)
    await this.ensureRunning(scope, job)
    const snapshot = await this.analysisSnapshot(scope, job)
    const line = snapshot.lines.find((item) => item.materialCode === input.materialCode)
    const shortageCodes = snapshot.lines.filter((item) => item.shortageQty > 0).map((item) => item.materialCode)
    if (!line || line.shortageQty <= 0) {
      throw new ExpediteError('NOT_A_SHORTAGE', { materialCode: input.materialCode, shortageMaterialCodes: shortageCodes })
    }
    if ((input.suggestionType === 'expedite' || input.suggestionType === 'reschedule') && !input.suggestedDate) {
      throw new ExpediteError('SUGGESTED_DATE_REQUIRED', { suggestionType: input.suggestionType })
    }
    const substitutes = this.supply.getSubstitutes([line.materialCode])
    let substitute: FindingEvidence['substitute'] = null
    if (input.suggestionType === 'substitute') {
      const option = substitutes.find((item) => item.substituteCode === input.substituteCode)
      if (!option) {
        throw new ExpediteError('SUBSTITUTE_NOT_ALLOWED', {
          materialCode: line.materialCode,
          allowedSubstitutes: substitutes.map((item) => item.substituteCode)
        })
      }
      const position = await this.inventoryPosition(job, [option.substituteCode])
      substitute = {
        code: option.substituteCode,
        name: this.supply.getMaterial(option.substituteCode)?.name ?? option.substituteCode,
        onHand: position.inventory[0]?.onHand ?? 0,
        note: option.note
      }
    }
    const leadTimeDays = this.supply.getSupplyParameters([line.materialCode])[0]?.leadTimeDays ?? null
    const evidence: FindingEvidence = {
      bomUsages: line.usages.map((usage) => ({ ...usage })),
      onHand: line.onHand,
      inventorySnapshotAt: snapshot.snapshotAt,
      inboundInWindow: line.inboundInWindow.map(({ poNo, qty, eta }) => ({ poNo, qty, eta })),
      inboundLate: line.inboundLate.map(({ poNo, qty, eta }) => ({ poNo, qty, eta })),
      leadTimeDays,
      earliestAvailableDate: this.earliestDate(line, leadTimeDays),
      substitute
    }
    const now = this.clock.now()
    const values = {
      materialName: line.materialName,
      requiredQty: line.requiredQty,
      availableQty: line.availableQty,
      shortageQty: line.shortageQty,
      evidence,
      suggestionType: input.suggestionType,
      suggestedDate: input.suggestedDate ?? null,
      substituteCode: input.suggestionType === 'substitute' ? (input.substituteCode ?? null) : null,
      rationale: input.rationale,
      updatedAt: now
    }
    const existing = await this.findings.findOneBy({ ...this.scopeWhere(scope), jobId: job.id, materialCode: line.materialCode })
    let findingId = existing?.id ?? randomUUID()
    if (existing) {
      await this.findings.update({ id: existing.id }, values)
    } else {
      try {
        await this.findings.insert({
          id: findingId,
          ...this.scopeColumns(scope),
          jobId: job.id,
          requestId: request.id,
          materialCode: line.materialCode,
          decision: 'pending',
          decisionNote: null,
          decidedAt: null,
          createdAt: now,
          ...values
        })
      } catch (error) {
        // 同一工具调用被并发重放：唯一约束兜底，改为更新
        if (!isUniqueViolation(error)) throw error
        const raced = await this.findings.findOneByOrFail({ ...this.scopeWhere(scope), jobId: job.id, materialCode: line.materialCode })
        findingId = raced.id
        await this.findings.update({ id: raced.id }, values)
      }
    }
    const saved = await this.findings.find({ where: { ...this.scopeWhere(scope), jobId: job.id }, select: { materialCode: true } })
    const savedCodes = new Set(saved.map((item) => item.materialCode))
    await this.log(scope, request.id, job.id, 'agent', 'finding_saved', `${line.materialCode}: ${input.suggestionType}`)
    return {
      findingId,
      materialCode: line.materialCode,
      shortageQty: line.shortageQty,
      savedCount: savedCodes.size,
      remainingShortageCodes: shortageCodes.filter((code) => !savedCodes.has(code))
    }
  }

  /** 提交总结论：所有缺料都要有结论；任务 → 成功，请求 → 待确认 */
  async finalizeAnalysis(scope: ExpediteScope, jobId: string, input: FinalizeAnalysisInput) {
    const { job, request } = await this.requireActiveJob(scope, jobId)
    const snapshot = await this.analysisSnapshot(scope, job)
    const shortageCodes = snapshot.lines.filter((line) => line.shortageQty > 0).map((line) => line.materialCode)
    const saved = await this.findings.find({ where: { ...this.scopeWhere(scope), jobId: job.id }, select: { materialCode: true } })
    const missing = shortageCodes.filter((code) => !saved.some((item) => item.materialCode === code))
    if (missing.length) throw new ExpediteError('MISSING_FINDINGS', { materialCodes: missing })

    const now = this.clock.now()
    // 先改请求（用户看到的状态），条件是“当前任务仍是本任务且仍在分析中”，防止旧任务回写
    const moved = await this.requests.update(
      { ...this.scopeWhere(scope), id: request.id, currentJobId: job.id, status: 'analyzing' },
      { status: 'pending_review', revision: request.revision + 1, updatedAt: now }
    )
    if (moved.affected !== 1) throw new ExpediteError('JOB_NOT_ACTIVE', { jobStatus: job.status })
    await this.jobs.update(
      { ...this.scopeWhere(scope), id: job.id, status: In([...ACTIVE_JOB_STATUSES]) },
      {
        status: 'succeeded',
        feasibility: input.feasibility,
        recommendedDate: input.recommendedDate,
        summary: input.summary,
        startedAt: job.startedAt ?? now,
        finishedAt: now
      }
    )
    await this.log(scope, request.id, job.id, 'agent', 'analysis_finalized', `${input.feasibility}, recommended ${input.recommendedDate}`)
    return { requestId: request.id, requestStatus: 'pending_review' as RequestStatus, findingCount: saved.length }
  }

  /** 智能体上报失败：任务 → 失败，请求 → 分析失败 */
  async reportFailure(scope: ExpediteScope, jobId: string, input: ReportFailureInput) {
    const { job, request } = await this.requireActiveJob(scope, jobId)
    await this.failJob(scope, request, job, input.errorCode, input.reason, 'agent')
    return { requestId: request.id, requestStatus: 'failed' as RequestStatus, errorCode: input.errorCode }
  }

  // ───────────────────────── 内部方法 ─────────────────────────

  /** 当前范围的查询条件；organizationId 为空时要用 IS NULL，不能写 = null */
  private scopeWhere(scope: ExpediteScope) {
    return { tenantId: scope.tenantId, organizationId: scope.organizationId ?? IsNull() }
  }

  private scopeColumns(scope: ExpediteScope) {
    return { tenantId: scope.tenantId, organizationId: scope.organizationId }
  }

  private productName(productCode: string) {
    return this.supply.getProduct(productCode)?.name ?? productCode
  }

  private async findRequest(scope: ExpediteScope, requestId: string) {
    const request = await this.requests.findOneBy({ ...this.scopeWhere(scope), id: requestId })
    if (!request) throw new ExpediteError('NOT_FOUND', { entity: 'request' })
    return request
  }

  private async startAnalysisAfterRace(scope: ExpediteScope, requestId: string, locale: MessageLocale) {
    const request = await this.findRequest(scope, requestId)
    const job = request.currentJobId ? await this.jobs.findOneBy({ ...this.scopeWhere(scope), id: request.currentJobId }) : null
    if (request.status === 'analyzing' && job && ACTIVE_JOB_STATUSES.includes(job.status)) {
      return this.analysisCommand(request, job, false, locale)
    }
    throw new ExpediteError('CONFLICT', { status: request.status })
  }

  /** 组装发给对话的分析指令：只给业务 ID 和必要上下文，流程规则在助手提示词里 */
  private analysisCommand(request: ExpediteRequestEntity, job: AnalysisJobEntity, created: boolean, locale: MessageLocale) {
    const product = this.productName(request.productCode)
    const message =
      locale === 'en-US'
        ? [
            'Please analyse material shortages for this expedite request.',
            `analysisJobId: ${job.id}`,
            `Order ${request.orderNo}, product ${product} x${request.quantity}, target date ${request.targetDate} (originally ${request.originalDueDate}).`,
            'Check the results in the workbench when done.'
          ].join('\n')
        : [
            '请为提前交货请求做缺料分析。',
            `analysisJobId: ${job.id}`,
            `订单 ${request.orderNo}，产品 ${product} ×${request.quantity}，目标交期 ${request.targetDate}（原 ${request.originalDueDate}）。`,
            '完成后在工作台查看结果。'
          ].join('\n')
    return { requestId: request.id, jobId: job.id, seq: job.seq, created, message }
  }

  /** 工具调用前的校验：任务存在、仍是请求的当前任务、处于活动状态且未超时 */
  private async requireActiveJob(scope: ExpediteScope, jobId: string) {
    const job = await this.jobs.findOneBy({ ...this.scopeWhere(scope), id: jobId })
    if (!job) throw new ExpediteError('JOB_NOT_FOUND', { analysisJobId: jobId })
    let request = await this.findRequest(scope, job.requestId)
    request = await this.applyTimeout(scope, request)
    const latest = await this.jobs.findOneByOrFail({ id: job.id })
    if (request.currentJobId !== job.id) {
      throw new ExpediteError('JOB_NOT_ACTIVE', { jobStatus: latest.status === 'queued' || latest.status === 'running' ? 'superseded' : latest.status })
    }
    if (!ACTIVE_JOB_STATUSES.includes(latest.status) || request.status !== 'analyzing') {
      throw new ExpediteError('JOB_NOT_ACTIVE', { jobStatus: latest.status, errorCode: latest.errorCode })
    }
    return { job: latest, request }
  }

  /** queued → running（条件更新，重复调用无副作用） */
  private async ensureRunning(scope: ExpediteScope, job: AnalysisJobEntity, conversationId?: string) {
    if (job.status !== 'queued') return
    const now = this.clock.now()
    const moved = await this.jobs.update(
      { ...this.scopeWhere(scope), id: job.id, status: 'queued' },
      { status: 'running', startedAt: now, conversationId: conversationId ?? null }
    )
    if (moved.affected === 1) {
      job.status = 'running'
      job.startedAt = now
      await this.log(scope, job.requestId, job.id, 'agent', 'analysis_running', `Analysis #${job.seq} picked up by the assistant`)
    }
  }

  /** 惰性超时：分析中且当前任务创建超过 3 分钟 → 任务失败 + 请求失败 */
  private async applyTimeout(scope: ExpediteScope, request: ExpediteRequestEntity) {
    if (request.status !== 'analyzing' || !request.currentJobId) return request
    const job = await this.jobs.findOneBy({ ...this.scopeWhere(scope), id: request.currentJobId })
    if (!job || !ACTIVE_JOB_STATUSES.includes(job.status)) return request
    if (this.clock.now().getTime() - job.createdAt.getTime() <= ANALYSIS_TIMEOUT_MS) return request
    try {
      await this.failJob(scope, request, job, 'ANALYSIS_TIMEOUT', 'The assistant did not finish the analysis within 3 minutes.', 'system')
    } catch (error) {
      // 读取路径上并发判定超时：另一边已经改过状态，按最新数据返回即可
      if (!(error instanceof ExpediteError && error.code === 'JOB_NOT_ACTIVE')) throw error
    }
    return this.findRequest(scope, request.id)
  }

  private async failJob(
    scope: ExpediteScope,
    request: ExpediteRequestEntity,
    job: AnalysisJobEntity,
    errorCode: string,
    reason: string,
    actor: LogActor
  ) {
    const now = this.clock.now()
    const jobMoved = await this.jobs.update(
      { ...this.scopeWhere(scope), id: job.id, status: In([...ACTIVE_JOB_STATUSES]) },
      { status: 'failed', errorCode, errorMessage: reason, finishedAt: now }
    )
    const requestMoved = await this.requests.update(
      { ...this.scopeWhere(scope), id: request.id, currentJobId: job.id, status: 'analyzing' },
      { status: 'failed', revision: request.revision + 1, updatedAt: now }
    )
    if (jobMoved.affected !== 1 || requestMoved.affected !== 1) {
      throw new ExpediteError('JOB_NOT_ACTIVE', { jobStatus: (await this.jobs.findOneByOrFail({ id: job.id })).status })
    }
    await this.log(scope, request.id, job.id, actor, 'analysis_failed', `${errorCode}: ${reason}`)
  }

  /** 按当前任务重新取数并计算可用量与缺口 */
  private async analysisSnapshot(scope: ExpediteScope, job: AnalysisJobEntity): Promise<AnalysisSnapshot> {
    const request = await this.findRequest(scope, job.requestId)
    const product = this.supply.getProduct(request.productCode)
    if (!product) throw new ExpediteError('PRODUCT_HAS_NO_BOM', { productCode: request.productCode })
    const requirements = explodeBom(product, request.quantity, (code) => this.supply.getMaterial(code))
    const position = await this.inventoryPosition(job, requirements.map((line) => line.materialCode))
    return {
      request,
      productName: product.name,
      lines: computeAvailability(requirements, position.inventory, position.inbound, request.targetDate),
      snapshotAt: position.snapshotAt
    }
  }

  /** 调用数据源取库存；数据源不可用时转成稳定业务错误并记日志 */
  private async inventoryPosition(job: AnalysisJobEntity, materialCodes: readonly string[]) {
    try {
      return await this.supply.getInventoryPosition(materialCodes, { simulateInventoryOutage: job.simulateInventoryOutage })
    } catch (error) {
      if (error instanceof SupplyUnavailableError) {
        await this.log(
          { tenantId: job.tenantId, organizationId: job.organizationId, userId: job.createdById },
          job.requestId,
          job.id,
          'system',
          'inventory_unavailable',
          'Inventory service unavailable'
        )
        throw new ExpediteError('INVENTORY_UNAVAILABLE', { recoverableInThisAnalysis: false })
      }
      throw error
    }
  }

  private earliestDate(line: AvailabilityLine, leadTimeDays: number | null) {
    return earliestAvailableDate(
      line.requiredQty,
      line.onHand,
      [...line.inboundInWindow, ...line.inboundLate],
      leadTimeDays ?? 0,
      this.supply.getAsOfDate()
    )
  }

  private async countFindingsByJob(scope: ExpediteScope, jobIds: string[]) {
    const counts = new Map<string, number>()
    if (!jobIds.length) return counts
    const rows = await this.findings.find({ where: { ...this.scopeWhere(scope), jobId: In(jobIds) }, select: { jobId: true } })
    for (const row of rows) counts.set(row.jobId, (counts.get(row.jobId) ?? 0) + 1)
    return counts
  }

  private async log(scope: ExpediteScope, requestId: string, jobId: string | null, actor: LogActor, action: string, summary: string) {
    await this.logs.insert({
      id: randomUUID(),
      ...this.scopeColumns(scope),
      requestId,
      jobId,
      actor,
      action,
      summary: summary.slice(0, 500),
      createdAt: this.clock.now()
    })
  }
}
