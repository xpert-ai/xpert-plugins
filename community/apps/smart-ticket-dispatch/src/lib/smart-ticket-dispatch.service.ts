import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomInt } from 'node:crypto'
import { Repository } from 'typeorm'
import { SmartTicketLog } from './entities/smart-ticket-log.entity'
import { SmartTicket } from './entities/smart-ticket.entity'
import type {
  SmartTicketOperationLogSummary,
  SmartTicketScope,
  SmartTicketSearchParams,
  SmartTicketStatus,
  SmartTicketTriageInput
} from './types'
import { SmartTicketDispatchConfirmInput } from './types'

export interface SmartTicketListResult {
  total: number
  page: number
  pageSize: number
  items: SmartTicket[]
  counts: Record<SmartTicketStatus, number>
}

const ALL_STATUSES: SmartTicketStatus[] = ['pending_confirmation', 'dispatched', 'resolved', 'rejected']

@Injectable()
export class SmartTicketDispatchService {
  private readonly logger = new Logger(SmartTicketDispatchService.name)

  constructor(
    @InjectRepository(SmartTicket)
    private readonly ticketRepository: Repository<SmartTicket>,
    @InjectRepository(SmartTicketLog)
    private readonly logRepository: Repository<SmartTicketLog>
  ) {}

  /**
   * Persist one AI-triaged ticket as a draft that waits for human confirmation.
   *
   * Idempotent: when the same conversation already produced a pending ticket for
   * the same original content (e.g. the user retried after a transient model
   * failure), the existing ticket is returned instead of creating a duplicate.
   */
  async saveTriagedTicket(
    input: SmartTicketTriageInput,
    scope: SmartTicketScope
  ): Promise<{ ticket: SmartTicket; duplicated: boolean }> {
    const originalContent = (input.originalContent || '').trim()
    if (!originalContent) {
      throw new Error('工单描述内容不能为空')
    }

    const idempotencyKey = this.computeIdempotencyKey(scope, originalContent)
    const existing = await this.ticketRepository.findOne({
      where: {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        assistantId: scope.assistantId,
        idempotencyKey,
        status: 'pending_confirmation'
      }
    })

    if (existing) {
      this.logger.log(`duplicate triage ignored for existing ticket ${existing.ticketNo}`)
      return { ticket: existing, duplicated: true }
    }

    const ticket = new SmartTicket()
    ticket.tenantId = scope.tenantId
    ticket.organizationId = scope.organizationId
    ticket.createdById = scope.userId
    ticket.assistantId = scope.assistantId
    ticket.conversationId = scope.conversationId
    ticket.ticketNo = this.generateTicketNo()
    ticket.idempotencyKey = idempotencyKey
    ticket.status = 'pending_confirmation'
    ticket.sourceType = input.sourceType
    ticket.title = input.title || originalContent.slice(0, 50)
    ticket.originalContent = originalContent
    ticket.customerName = input.customerName
    ticket.customerContact = input.customerContact
    ticket.channel = input.channel
    ticket.category = input.category
    ticket.urgency = input.urgency
    ticket.aiSummary = input.aiSummary
    ticket.aiSuggestedTeam = input.aiSuggestedTeam
    ticket.aiSuggestedOwner = input.aiSuggestedOwner
    ticket.aiDispatchAdvice = input.aiDispatchAdvice
    ticket.aiConfidence = input.aiConfidence
    ticket.completenessTips = input.completenessTips
    ticket.aiRawResult = input.aiRawResult
    ticket.retryCount = 0

    const saved = await this.ticketRepository.save(ticket)
    await this.appendLog(saved.id, 'ai_triage_saved', 'ai', `AI 分诊草稿已保存（工单号 ${saved.ticketNo}）`)
    return { ticket: saved, duplicated: false }
  }

  async searchTickets(
    scope: SmartTicketScope,
    params: SmartTicketSearchParams = {}
  ): Promise<SmartTicketListResult> {
    const page = Math.max(1, params.page || 1)
    const pageSize = Math.min(50, Math.max(1, params.pageSize || 20))

    const qb = this.ticketRepository
      .createQueryBuilder('t')
      .where('t.tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere('t.organizationId = :organizationId', { organizationId: scope.organizationId })

    if (scope.assistantId) {
      qb.andWhere('t.assistantId = :assistantId', { assistantId: scope.assistantId })
    }
    if (params.status) {
      qb.andWhere('t.status = :status', { status: params.status })
    }
    if (params.urgency) {
      qb.andWhere('t.urgency = :urgency', { urgency: params.urgency })
    }
    if (params.search) {
      const keyword = `%${params.search.trim()}%`
      qb.andWhere(
        '(t.ticketNo ILIKE :keyword OR t.title ILIKE :keyword OR t.originalContent ILIKE :keyword OR t.customerName ILIKE :keyword)',
        { keyword }
      )
    }

    qb.orderBy('t.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    const [items, total] = await qb.getManyAndCount()
    return { total, page, pageSize, items, counts: await this.countByStatus(scope) }
  }

  async countByStatus(scope: SmartTicketScope): Promise<Record<SmartTicketStatus, number>> {
    const rows = await this.ticketRepository
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(1)', 'count')
      .where('t.tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere('t.organizationId = :organizationId', { organizationId: scope.organizationId })
      .groupBy('t.status')
      .getRawMany()

    const counts = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0])) as Record<SmartTicketStatus, number>
    for (const row of rows) {
      if (row?.status && row.status in counts) {
        counts[row.status as SmartTicketStatus] = Number(row.count)
      }
    }
    return counts
  }

  async getTicket(scope: SmartTicketScope, id: string): Promise<SmartTicket> {
    const ticket = await this.ticketRepository.findOne({
      where: {
        id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId
      }
    })
    if (!ticket) {
      throw new Error('工单不存在或无权访问')
    }
    return ticket
  }

  async getTicketLogs(ticketId: string): Promise<SmartTicketOperationLogSummary[]> {
    return this.logRepository.find({ where: { ticketId }, order: { createdAt: 'ASC' } })
  }

  /** Human confirms (possibly adjusting) the AI dispatch proposal. */
  async confirmDispatch(
    scope: SmartTicketScope,
    id: string,
    input: SmartTicketDispatchConfirmInput,
    operatorId?: string
  ): Promise<SmartTicket> {
    const ticket = await this.getTicket(scope, id)
    if (ticket.status !== 'pending_confirmation') {
      throw new Error(`只有待确认状态的工单才能确认分派（当前状态：${ticket.status}）`)
    }
    ticket.status = 'dispatched'
    ticket.confirmedTeam = input.confirmedTeam || ticket.aiSuggestedTeam
    ticket.confirmedOwner = input.confirmedOwner || ticket.aiSuggestedOwner
    ticket.dispatchRemark = input.dispatchRemark
    ticket.dispatchedAt = new Date()
    const saved = await this.ticketRepository.save(ticket)
    await this.appendLog(
      id,
      'dispatch_confirmed',
      operatorId || 'human',
      `人工确认分派：${saved.confirmedTeam || '未指定团队'} / ${saved.confirmedOwner || '未指定负责人'}`
    )
    return saved
  }

  async rejectTicket(scope: SmartTicketScope, id: string, reason: string, operatorId?: string): Promise<SmartTicket> {
    const ticket = await this.getTicket(scope, id)
    if (ticket.status !== 'pending_confirmation') {
      throw new Error(`只有待确认状态的工单才能驳回（当前状态：${ticket.status}）`)
    }
    ticket.status = 'rejected'
    ticket.rejectReason = reason
    const saved = await this.ticketRepository.save(ticket)
    await this.appendLog(id, 'rejected', operatorId || 'human', `驳回原因：${reason || '未填写'}`)
    return saved
  }

  async markResolved(
    scope: SmartTicketScope,
    id: string,
    resolutionSummary: string,
    operatorId?: string
  ): Promise<SmartTicket> {
    const ticket = await this.getTicket(scope, id)
    if (ticket.status !== 'dispatched') {
      throw new Error(`只有已分派状态的工单才能标记解决（当前状态：${ticket.status}）`)
    }
    ticket.status = 'resolved'
    ticket.resolutionSummary = resolutionSummary
    ticket.resolvedAt = new Date()
    const saved = await this.ticketRepository.save(ticket)
    await this.appendLog(id, 'resolved', operatorId || 'human', `处理结果：${resolutionSummary || '未填写'}`)
    return saved
  }

  /**
   * Record a triage retry attempt. The ticket row itself is reused, so a retry
   * never creates a duplicate business record; the AI is expected to refresh the
   * triage draft through `saveTriagedTicket` (idempotent by idempotencyKey).
   */
  async retryTriage(scope: SmartTicketScope, id: string, operatorId?: string): Promise<SmartTicket> {
    const ticket = await this.getTicket(scope, id)
    if (ticket.status !== 'pending_confirmation') {
      throw new Error(`只有待确认状态的工单才能重新分诊（当前状态：${ticket.status}）`)
    }
    ticket.retryCount = (ticket.retryCount || 0) + 1
    const saved = await this.ticketRepository.save(ticket)
    await this.appendLog(id, 'triage_retry', operatorId || 'human', `第 ${saved.retryCount} 次重新分诊`)
    return saved
  }

  /** Data source for the Workbench remote view. */
  async getViewData(
    scope: SmartTicketScope,
    params: {
      ticketId?: string
      status?: SmartTicketStatus
      search?: string
      page?: number
      pageSize?: number
    } = {}
  ) {
    const list = await this.searchTickets(scope, {
      status: params.status,
      search: params.search,
      page: params.page,
      pageSize: params.pageSize
    })

    let detail: { ticket: SmartTicket; logs: SmartTicketOperationLogSummary[] } | null = null
    if (params.ticketId) {
      const ticket = await this.getTicket(scope, params.ticketId)
      detail = { ticket, logs: await this.getTicketLogs(ticket.id) }
    }

    return { ...list, detail }
  }

  private computeIdempotencyKey(scope: SmartTicketScope, originalContent: string): string {
    return createHash('sha256')
      .update([scope.conversationId || scope.assistantId || '', originalContent.trim()].join('::'))
      .digest('hex')
  }

  private generateTicketNo(): string {
    const now = new Date()
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    return `TD-${date}-${randomInt(1000, 9999)}`
  }

  private async appendLog(ticketId: string, action: string, operator: string, detail?: string) {
    const log = new SmartTicketLog()
    log.ticketId = ticketId
    log.action = action
    log.operator = operator
    log.detail = detail
    try {
      await this.logRepository.save(log)
    } catch (error) {
      // Operation logs are best-effort; never fail the business action for them.
      this.logger.warn(`failed to append ticket log: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
