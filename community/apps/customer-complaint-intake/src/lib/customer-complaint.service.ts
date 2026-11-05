import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ComplaintCaseLog } from './entities/complaint-case-log.entity'
import { ComplaintCase } from './entities/complaint-case.entity'
import { assertConfirmable, evaluateDraft, normalizeText, scopeWhere } from './rules'
import type { ComplaintDraftInput, ComplaintFieldEdits, ComplaintLogAction, ComplaintScope, ComplaintStatus } from './types'

@Injectable()
export class CustomerComplaintService {
  constructor(
    @InjectRepository(ComplaintCase)
    private readonly caseRepository: Repository<ComplaintCase>,
    @InjectRepository(ComplaintCaseLog)
    private readonly logRepository: Repository<ComplaintCaseLog>
  ) {}

  async ensureRawCase(scope: ComplaintScope, rawText: string, caseId?: string) {
    const text = normalizeText(rawText)
    if (!text) throw new BadRequestException('客户原话不能为空')
    if (text.length < 8) throw new BadRequestException('客户原话过短，请补充具体问题、订单号和联系方式')
    const existing = caseId ? await this.requireCase(scope, caseId) : undefined
    if (existing?.status === 'confirmed') throw new BadRequestException('已确认的受理单不能重新生成')
    const record = existing ?? this.caseRepository.create({ caseNo: createCaseNo(), confirmedCount: 0, status: 'draft' })
    record.tenantId = scope.tenantId
    record.organizationId = scope.organizationId
    record.createdById = record.createdById ?? scope.userId
    record.assistantId = scope.assistantId ?? record.assistantId
    record.rawText = text
    record.status = 'draft'
    record.validationErrors = []
    record.failureReason = null
    const saved = await this.caseRepository.save(record)
    await this.appendLog(saved, scope, 'draft_saved', '已保存客户原话，等待助手生成草稿')
    return this.toSummary(saved, '已保存客户原话')
  }

  async saveIntakeDraft(input: ComplaintDraftInput, scope: ComplaintScope) {
    const rawText = normalizeText(input.rawText)
    if (!rawText) throw new BadRequestException('客户原话不能为空')
    const evaluation = evaluateDraft({ ...input, rawText })
    const existing = input.caseId ? await this.requireCase(scope, input.caseId) : undefined
    if (existing?.status === 'confirmed') {
      return this.toSummary(existing, '这条受理单已经确认，未新建记录')
    }

    const saved = await this.caseRepository.manager.transaction(async (manager) => {
      const cases = manager.getRepository(ComplaintCase)
      const logs = manager.getRepository(ComplaintCaseLog)
      const record = existing ?? cases.create({ caseNo: createCaseNo(), confirmedCount: 0 })
      const previousStatus = record.status
      record.tenantId = scope.tenantId
      record.organizationId = scope.organizationId
      record.createdById = record.createdById ?? scope.userId
      record.assistantId = scope.assistantId ?? record.assistantId
      record.conversationId = scope.conversationId ?? record.conversationId
      record.rawText = rawText
      record.status = evaluation.status
      record.category = evaluation.category
      record.urgency = evaluation.urgency
      record.customerDemand = normalizeText(input.customerDemand)
      record.missingFields = evaluation.missingFields
      record.suggestedReply = normalizeText(input.suggestedReply)
      record.escalationSuggested = evaluation.escalationSuggested
      record.escalationReason = evaluation.escalationReason
      record.orderNo = normalizeText(input.orderNo)
      record.contact = normalizeText(input.contact)
      record.validationErrors = evaluation.validationErrors
      record.failureReason = evaluation.failureReason ?? null
      record.confirmedCount = record.confirmedCount ?? 0
      const savedRecord = await cases.save(record)
      await logs.save(
        logs.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          caseId: savedRecord.id,
          complaintCase: savedRecord,
          operatorId: scope.userId,
          action: actionForEvaluation(previousStatus, evaluation.status, Boolean(existing)),
          message: evaluation.failureReason ?? evaluation.validationErrors[0] ?? '已保存受理草稿'
        })
      )
      return savedRecord
    })
    return this.toSummary(saved, messageForStatus(saved.status))
  }

  async getCase(scope: ComplaintScope, caseId: string) {
    const record = await this.requireCase(scope, caseId)
    return this.toDetail(record)
  }

  async searchCases(scope: ComplaintScope, query: { status?: ComplaintStatus; search?: string; page?: number; pageSize?: number }) {
    const page = query.page && query.page > 0 ? query.page : 1
    const pageSize = Math.min(query.pageSize && query.pageSize > 0 ? query.pageSize : 20, 50)
    const qb = this.caseRepository.createQueryBuilder('item')
    const where = scopeWhere(scope)
    if (where.tenantId) qb.andWhere('item.tenantId = :tenantId', { tenantId: where.tenantId })
    if (where.organizationId) qb.andWhere('item.organizationId = :organizationId', { organizationId: where.organizationId })
    if (query.status) qb.andWhere('item.status = :status', { status: query.status })
    if (query.search?.trim()) {
      qb.andWhere('(item.caseNo ILIKE :search OR item.rawText ILIKE :search OR item.customerDemand ILIKE :search)', {
        search: `%${query.search.trim()}%`
      })
    }
    qb.orderBy('item.updatedAt', 'DESC').skip((page - 1) * pageSize).take(pageSize)
    const [items, total] = await qb.getManyAndCount()
    return { items: items.map((item) => this.toSummary(item)), total, page, pageSize }
  }

  async updateFields(scope: ComplaintScope, caseId: string, edits: ComplaintFieldEdits) {
    const record = await this.requireCase(scope, caseId)
    if (record.status === 'confirmed') throw new BadRequestException('已确认的受理单不能再改草稿')
    if (edits.rawText !== undefined) record.rawText = normalizeText(edits.rawText) ?? record.rawText
    if (edits.category) record.category = edits.category
    if (edits.urgency) record.urgency = edits.urgency
    if (edits.customerDemand !== undefined) record.customerDemand = normalizeText(edits.customerDemand)
    if (edits.suggestedReply !== undefined) record.suggestedReply = normalizeText(edits.suggestedReply)
    if (edits.orderNo !== undefined) record.orderNo = normalizeText(edits.orderNo)
    if (edits.contact !== undefined) record.contact = normalizeText(edits.contact)
    if (edits.escalationSuggested !== undefined) record.escalationSuggested = edits.escalationSuggested
    if (edits.escalationReason !== undefined) record.escalationReason = normalizeText(edits.escalationReason)
    if (edits.missingFields) record.missingFields = edits.missingFields
    const saved = await this.caseRepository.save(record)
    await this.appendLog(saved, scope, 'fields_updated', '客服修改了草稿字段')
    return this.toDetail(saved)
  }

  async confirmIntake(scope: ComplaintScope, caseId: string, edits: ComplaintFieldEdits = {}) {
    if (Object.keys(edits).length) await this.updateFields(scope, caseId, edits)
    const record = await this.requireCase(scope, caseId)
    if (record.status === 'confirmed') return this.toDetail(record)
    const missing = record.missingFields ?? []
    try {
      assertConfirmable(record.status ?? 'draft', missing)
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '当前不能确认')
    }
    record.status = 'confirmed'
    record.confirmedCount = 1
    record.confirmedAt = new Date()
    record.confirmedById = scope.userId
    record.failureReason = null
    const saved = await this.caseRepository.save(record)
    await this.appendLog(saved, scope, 'confirmed', '客服确认受理')
    return this.toDetail(saved)
  }

  async returnForSupplement(scope: ComplaintScope, caseId: string, reason?: string) {
    const record = await this.requireCase(scope, caseId)
    if (record.status === 'confirmed') throw new BadRequestException('已确认的受理单不能退回')
    record.status = 'returned'
    record.returnReason = normalizeText(reason) ?? '请补充客户原话中的关键信息'
    const saved = await this.caseRepository.save(record)
    await this.appendLog(saved, scope, 'returned', saved.returnReason)
    return this.toDetail(saved)
  }

  async simulateModelFailure(scope: ComplaintScope, caseId: string | undefined, rawText?: string) {
    return this.saveIntakeDraft(
      {
        caseId,
        rawText: rawText ?? '用于模拟模型失败的客户原话，不会生成可确认草稿。',
        simulateModelFailure: true,
        failureReason: '模型调用失败，请在同一条受理单上重试'
      },
      scope
    )
  }

  async getViewData(scope: ComplaintScope, query: { caseId?: string; search?: string; page?: number; pageSize?: number }) {
    const list = await this.searchCases(scope, query)
    const selected = query.caseId ? await this.getCase(scope, query.caseId).catch(() => null) : list.items[0] ? await this.getCase(scope, list.items[0].id) : null
    return {
      empty: list.total === 0,
      items: list.items,
      total: list.total,
      page: list.page,
      pageSize: list.pageSize,
      selected
    }
  }

  private async requireCase(scope: ComplaintScope, caseId: string) {
    const record = await this.caseRepository.findOne({ where: { id: caseId, ...scopeWhere(scope) } })
    if (!record || !record.id) throw new BadRequestException('受理单不存在或不在当前组织范围内')
    return record
  }

  private async appendLog(record: ComplaintCase, scope: ComplaintScope, action: ComplaintLogAction, message?: string) {
    await this.logRepository.save(
      this.logRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        caseId: record.id,
        complaintCase: record,
        operatorId: scope.userId,
        action,
        message
      })
    )
  }

  private toSummary(record: ComplaintCase, message?: string) {
    return {
      id: record.id as string,
      caseNo: record.caseNo,
      status: record.status,
      category: record.category,
      urgency: record.urgency,
      customerDemand: record.customerDemand,
      escalationSuggested: record.escalationSuggested,
      failureReason: record.failureReason,
      validationErrors: record.validationErrors ?? [],
      missingFields: record.missingFields ?? [],
      confirmedCount: record.confirmedCount ?? 0,
      updatedAt: record.updatedAt,
      message
    }
  }

  private toDetail(record: ComplaintCase) {
    return {
      ...this.toSummary(record),
      rawText: record.rawText,
      suggestedReply: record.suggestedReply,
      escalationReason: record.escalationReason,
      orderNo: record.orderNo,
      contact: record.contact,
      returnReason: record.returnReason,
      confirmedAt: record.confirmedAt
    }
  }
}

function createCaseNo() {
  const now = new Date()
  const day = now.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `CC-${day}-${suffix}`
}

function actionForEvaluation(previous: ComplaintStatus | undefined, next: ComplaintStatus, existed: boolean): ComplaintLogAction {
  if (next === 'failed') return 'model_failed'
  if (next === 'draft') return 'validation_failed'
  if (existed && previous === 'failed') return 'retried'
  return 'draft_saved'
}

function messageForStatus(status: ComplaintStatus | undefined) {
  if (status === 'failed') return '模型处理失败，已保留同一条受理单'
  if (status === 'draft') return '原话信息不足，请补充后再生成'
  if (status === 'needs_info') return '草稿已保存，仍有关键信息待补充'
  if (status === 'ready') return '草稿已保存，等待客服确认'
  return '受理单已保存'
}
