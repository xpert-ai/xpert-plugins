import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ILike } from 'typeorm'
import type { FindOptionsWhere, Repository } from 'typeorm'
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_CHANNELS,
  SUPPORT_TICKET_MAX_MESSAGE_LENGTH,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES
} from './constants'
import { SupportTicket } from './entities'
import type {
  ConfirmTicketInput,
  CreateTicketInput,
  FailTicketInput,
  SaveDraftInput,
  SaveTriageInput,
  SupportTicketDetail,
  SupportTicketEventAction,
  SupportTicketListItem,
  SupportTicketListQuery,
  SupportTicketScope,
  SupportTicketStatus
} from './types'

/** Explicit, machine-readable outcome of a business mutation. Callers must branch on `outcome`, never on messages. */
export type SupportTicketMutationOutcome =
  | { outcome: 'applied'; ticket: SupportTicket }
  | { outcome: 'already_confirmed'; ticket: SupportTicket }
  | { outcome: 'revision_conflict'; ticket: SupportTicket }

@Injectable()
export class SupportTicketService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepository: Repository<SupportTicket>
  ) {}

  /**
   * Create a ticket for one submission. `requestId` is the idempotency key: a retried
   * submission returns the existing ticket instead of creating a second business record.
   */
  async createTicket(scope: SupportTicketScope, input: CreateTicketInput) {
    const requestId = trimToUndefined(input.requestId)
    if (!requestId) {
      throw new BadRequestException('requestId is required')
    }
    const existing = await this.ticketRepository.findOne({ where: { requestId } })
    if (existing) {
      await this.assertVisible(scope, existing)
      return { ticket: existing, duplicated: true }
    }

    const customerName = trimToUndefined(input.customerName)
    if (!customerName) {
      throw new BadRequestException('customerName is required')
    }
    const originalMessage = trimToUndefined(input.originalMessage)
    if (!originalMessage) {
      throw new BadRequestException('originalMessage is required')
    }
    if (originalMessage.length > SUPPORT_TICKET_MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `originalMessage exceeds ${SUPPORT_TICKET_MAX_MESSAGE_LENGTH} characters, split it before submitting`
      )
    }
    if (!SUPPORT_TICKET_CHANNELS.some((item) => item.value === input.channel)) {
      throw new BadRequestException(`channel '${input.channel}' is not supported`)
    }

    const now = new Date()
    const ticketNo = await this.nextTicketNo(scope, now)
    const ticket = await this.ticketRepository.save(
      this.ticketRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        createdById: scope.userId ?? undefined,
        assistantId: trimToUndefined(input.assistantId) ?? scope.assistantId ?? undefined,
        conversationId: trimToUndefined(input.conversationId) ?? scope.conversationId ?? undefined,
        requestId,
        ticketNo,
        status: 'processing',
        sourceType: input.sourceType ?? 'workbench_form',
        customerName,
        channel: input.channel,
        originalMessage,
        lastAttemptAt: now,
        attemptCount: 1,
        revision: 1,
        events: []
      })
    )
    appendEvent(ticket, 'submitted', `工单 ${ticketNo} 已创建，等待 AI 分类定级`, scope.userId)
    return { ticket: await this.ticketRepository.save(ticket), duplicated: false }
  }

  /** Write the model result. A confirmed ticket is never overwritten. */
  async saveTriage(scope: SupportTicketScope, input: SaveTriageInput): Promise<SupportTicketMutationOutcome> {
    const ticket = await this.getScopedTicket(scope, input.ticketId)
    if (ticket.status === 'confirmed') {
      return { outcome: 'already_confirmed', ticket }
    }
    const draftReply = trimToUndefined(input.draftReply)
    if (!draftReply) {
      throw new BadRequestException('draftReply is required')
    }
    if (!SUPPORT_TICKET_CATEGORIES.some((item) => item.value === input.category)) {
      throw new BadRequestException(`category '${input.category}' is not supported`)
    }
    if (!SUPPORT_TICKET_PRIORITIES.some((item) => item.value === input.priority)) {
      throw new BadRequestException(`priority '${input.priority}' is not supported`)
    }

    ticket.aiCategory = input.category
    ticket.aiPriority = input.priority
    ticket.aiPriorityReason = trimToUndefined(input.priorityReason)
    ticket.aiDraftReply = draftReply
    ticket.aiConfidence = typeof input.confidence === 'number' ? input.confidence : undefined
    ticket.aiMissingInfo = normalizeStringArray(input.missingInfo)
    ticket.aiRawResult = input.rawResult
    ticket.aiProcessedAt = new Date()
    ticket.status = 'pending_review'
    ticket.failureReason = undefined
    ticket.failureCode = undefined
    ticket.revision = (ticket.revision ?? 1) + 1
    appendEvent(ticket, 'ai_completed', `AI 返回分类 ${input.category} / 优先级 ${input.priority}`, scope.userId)
    return { outcome: 'applied', ticket: await this.ticketRepository.save(ticket) }
  }

  async markProcessing(scope: SupportTicketScope, ticketId: string): Promise<SupportTicketMutationOutcome> {
    const ticket = await this.getScopedTicket(scope, ticketId)
    if (ticket.status === 'confirmed') {
      return { outcome: 'already_confirmed', ticket }
    }
    ticket.status = 'processing'
    ticket.lastAttemptAt = new Date()
    ticket.attemptCount = (ticket.attemptCount ?? 0) + 1
    ticket.revision = (ticket.revision ?? 1) + 1
    return { outcome: 'applied', ticket: await this.ticketRepository.save(ticket) }
  }

  /**
   * Mark a ticket as failed with a readable reason. The original input is preserved so
   * the same ticket can be retried; a confirmed ticket can never be failed afterwards.
   */
  async markFailed(
    scope: SupportTicketScope,
    ticketId: string,
    input: FailTicketInput
  ): Promise<SupportTicketMutationOutcome> {
    const ticket = await this.getScopedTicket(scope, ticketId)
    if (ticket.status === 'confirmed') {
      return { outcome: 'already_confirmed', ticket }
    }
    const reason = trimToUndefined(input.reason) ?? 'AI processing failed'
    ticket.status = 'failed'
    ticket.failureReason = reason
    ticket.failureCode = trimToUndefined(input.code)
    ticket.revision = (ticket.revision ?? 1) + 1
    appendEvent(ticket, 'ai_failed', reason, scope.userId)
    return { outcome: 'applied', ticket: await this.ticketRepository.save(ticket) }
  }

  /** Idempotent retry anchor: the same ticket is re-queued, no second record and no duplicate AI result. */
  async retryTicket(scope: SupportTicketScope, ticketId: string): Promise<SupportTicketMutationOutcome> {
    const ticket = await this.getScopedTicket(scope, ticketId)
    if (ticket.status === 'confirmed') {
      return { outcome: 'already_confirmed', ticket }
    }
    ticket.status = 'processing'
    ticket.failureReason = undefined
    ticket.failureCode = undefined
    ticket.lastAttemptAt = new Date()
    ticket.attemptCount = (ticket.attemptCount ?? 0) + 1
    ticket.revision = (ticket.revision ?? 1) + 1
    appendEvent(ticket, 'retry_requested', `第 ${ticket.attemptCount} 次尝试`, scope.userId)
    return { outcome: 'applied', ticket: await this.ticketRepository.save(ticket) }
  }

  /** Save reviewer edits without confirming. Conflicts keep the caller's dirty state. */
  async saveDraft(
    scope: SupportTicketScope,
    ticketId: string,
    input: SaveDraftInput
  ): Promise<SupportTicketMutationOutcome> {
    const ticket = await this.getScopedTicket(scope, ticketId)
    if (ticket.status === 'confirmed') {
      return { outcome: 'already_confirmed', ticket }
    }
    if (ticket.revision !== input.expectedRevision) {
      return { outcome: 'revision_conflict', ticket }
    }
    applyReviewEdits(ticket, input)
    ticket.revision = (ticket.revision ?? 1) + 1
    appendEvent(ticket, 'draft_saved', '人工修改已保存（未确认）', scope.userId)
    return { outcome: 'applied', ticket: await this.ticketRepository.save(ticket) }
  }

  /** Human confirmation is the only path that turns AI suggestions into the official record. */
  async confirmTicket(
    scope: SupportTicketScope,
    ticketId: string,
    input: ConfirmTicketInput
  ): Promise<SupportTicketMutationOutcome> {
    const ticket = await this.getScopedTicket(scope, ticketId)
    if (ticket.status === 'confirmed') {
      return { outcome: 'already_confirmed', ticket }
    }
    if (ticket.revision !== input.expectedRevision) {
      return { outcome: 'revision_conflict', ticket }
    }
    const draftReply = trimToUndefined(input.draftReply)
    if (!draftReply) {
      throw new BadRequestException('draftReply is required before confirming')
    }
    applyReviewEdits(ticket, input)
    ticket.confirmedReply = draftReply
    ticket.reviewerNote = trimToUndefined(input.reviewerNote)
    ticket.status = 'confirmed'
    ticket.reviewedById = scope.userId ?? undefined
    ticket.reviewedAt = new Date()
    ticket.failureReason = undefined
    ticket.failureCode = undefined
    ticket.revision = (ticket.revision ?? 1) + 1
    appendEvent(ticket, 'confirmed', '人工确认完成并归档', scope.userId)
    return { outcome: 'applied', ticket: await this.ticketRepository.save(ticket) }
  }

  async getViewData(scope: SupportTicketScope, query: SupportTicketListQuery = {}) {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20))
    const [rows, total] = await this.ticketRepository.findAndCount({
      where: this.filteredWhere(scope, query),
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    // A selected ticket is fetched on its own so it stays visible even when it is not on the current page.
    const selected = query.ticketId ? await this.findSelectedTicket(scope, query) : rows[0]

    return {
      items: rows.map(toListItem),
      total,
      item: selected ? toDetail(selected) : undefined,
      summary: {
        mode: selected ? 'detail' : 'empty',
        stats: await this.countScopedStats(scope)
      },
      meta: {
        statuses: SUPPORT_TICKET_STATUSES,
        categories: SUPPORT_TICKET_CATEGORIES,
        priorities: SUPPORT_TICKET_PRIORITIES,
        channels: SUPPORT_TICKET_CHANNELS,
        maxMessageLength: SUPPORT_TICKET_MAX_MESSAGE_LENGTH
      }
    }
  }

  async searchTickets(scope: SupportTicketScope, query: SupportTicketListQuery = {}) {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 10))
    const [rows, total] = await this.ticketRepository.findAndCount({
      where: this.filteredWhere(scope, query),
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })

    return {
      items: rows.map(toListItem),
      total,
      page,
      pageSize,
      stats: await this.countScopedStats(scope)
    }
  }

  async getTicketDetail(scope: SupportTicketScope, ticketId: string): Promise<SupportTicketDetail> {
    return toDetail(await this.getScopedTicket(scope, ticketId))
  }

  async getTicketDetailForAgent(scope: SupportTicketScope, ticketId: string) {
    return this.getTicketDetail(scope, ticketId)
  }

  /**
   * Translates a workbench query into database filters. Dimensions that match either the AI result or the
   * human confirmed value are expanded into alternative where groups so PostgreSQL does the filtering.
   */
  private filteredWhere(
    scope: SupportTicketScope,
    query: SupportTicketListQuery
  ): FindOptionsWhere<SupportTicket>[] {
    const dimensions: FindOptionsWhere<SupportTicket>[][] = []
    if (query.status) {
      dimensions.push([{ status: query.status }])
    }
    if (query.category) {
      dimensions.push([{ aiCategory: query.category }, { confirmedCategory: query.category }])
    }
    if (query.priority) {
      dimensions.push([{ aiPriority: query.priority }, { confirmedPriority: query.priority }])
    }
    const keyword = escapeLikePattern(query.search)
    if (keyword) {
      const pattern = `%${keyword}%`
      dimensions.push([
        { ticketNo: ILike(pattern) },
        { customerName: ILike(pattern) },
        { originalMessage: ILike(pattern) },
        { aiDraftReply: ILike(pattern) }
      ])
    }
    return expandWhereAlternatives(this.scopeWhere(scope), dimensions)
  }

  private async findSelectedTicket(scope: SupportTicketScope, query: SupportTicketListQuery) {
    const ticketId = trimToUndefined(query.ticketId)
    if (!ticketId) {
      return undefined
    }
    const [ticket] = await this.ticketRepository.find({
      where: this.filteredWhere(scope, query).map((where) => ({ ...where, id: ticketId })),
      take: 1
    })
    return ticket
  }

  /** Status counters are aggregated by the database over the whole scope, never over the current page. */
  private async countScopedStats(scope: SupportTicketScope) {
    const where = this.scopeWhere(scope)
    const [total, processing, pending, confirmed, failed] = await Promise.all([
      this.ticketRepository.count({ where }),
      this.ticketRepository.count({ where: { ...where, status: 'processing' } }),
      this.ticketRepository.count({ where: { ...where, status: 'pending_review' } }),
      this.ticketRepository.count({ where: { ...where, status: 'confirmed' } }),
      this.ticketRepository.count({ where: { ...where, status: 'failed' } })
    ])
    return {
      total,
      processing,
      pending_review: pending,
      confirmed,
      failed
    }
  }

  private async getScopedTicket(scope: SupportTicketScope, ticketId: string) {
    const id = trimToUndefined(ticketId)
    if (!id) {
      throw new BadRequestException('ticketId is required')
    }
    const ticket = await this.ticketRepository.findOne({
      where: {
        ...this.scopeWhere(scope),
        id
      }
    })
    if (!ticket) {
      throw new NotFoundException(`Support ticket '${id}' was not found in the current scope`)
    }
    return ticket
  }

  /** An idempotency key reused by another tenant or organization must never expose or return that ticket. */
  private async assertVisible(scope: SupportTicketScope, ticket: SupportTicket) {
    const sameTenant = !ticket.tenantId || !scope.tenantId || ticket.tenantId === scope.tenantId
    const sameOrganization =
      !ticket.organizationId || !scope.organizationId || ticket.organizationId === scope.organizationId
    if (!sameTenant || !sameOrganization) {
      throw new NotFoundException(`Support ticket '${ticket.id}' was not found in the current scope`)
    }
  }

  private scopeWhere(scope: SupportTicketScope): FindOptionsWhere<SupportTicket> {
    return {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined
    }
  }

  private async nextTicketNo(scope: SupportTicketScope, now: Date) {
    const total = await this.ticketRepository.count({ where: this.scopeWhere(scope) })
    const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    return `ST-${day}-${String(total + 1).padStart(4, '0')}`
  }
}

function applyReviewEdits(
  ticket: SupportTicket,
  input: { category?: SupportTicket['confirmedCategory']; priority?: SupportTicket['confirmedPriority']; draftReply?: string }
) {
  if (input.category) {
    ticket.confirmedCategory = input.category
  }
  if (input.priority) {
    ticket.confirmedPriority = input.priority
  }
  const reply = trimToUndefined(input.draftReply)
  if (reply) {
    ticket.confirmedReply = reply
  }
}

function appendEvent(
  ticket: SupportTicket,
  action: SupportTicketEventAction,
  detail?: string,
  operatorId?: string | null
) {
  const events = Array.isArray(ticket.events) ? ticket.events : []
  ticket.events = [
    ...events,
    {
      action,
      at: new Date().toISOString(),
      ...(detail ? { detail } : {}),
      ...(operatorId ? { operatorId } : {})
    }
  ]
}

/**
 * Combines OR-dimensions into flat where objects: each option of a dimension becomes its own alternative, and
 * all dimensions are AND-ed together. PostgreSQL receives one indexed query instead of an in-memory scan.
 */
function expandWhereAlternatives(
  base: FindOptionsWhere<SupportTicket>,
  dimensions: FindOptionsWhere<SupportTicket>[][]
): FindOptionsWhere<SupportTicket>[] {
  return dimensions.reduce<FindOptionsWhere<SupportTicket>[]>(
    (alternatives, dimension) =>
      alternatives.flatMap((current) => dimension.map((option) => ({ ...current, ...option }))),
    [{ ...base }]
  )
}

/** Escapes LIKE wildcards so a keyword such as `100%` matches literally instead of matching everything. */
function escapeLikePattern(value?: string) {
  const keyword = value?.trim()
  if (!keyword) {
    return undefined
  }
  return keyword.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export function toListItem(ticket: SupportTicket): SupportTicketListItem {
  return {
    id: ticket.id as string,
    ticketNo: ticket.ticketNo as string,
    status: ticket.status as SupportTicketStatus,
    customerName: ticket.customerName as string,
    channel: ticket.channel as SupportTicketListItem['channel'],
    category: ticket.confirmedCategory ?? ticket.aiCategory,
    priority: ticket.confirmedPriority ?? ticket.aiPriority,
    confirmedReplyPreview: preview(ticket.confirmedReply),
    draftReplyPreview: preview(ticket.aiDraftReply),
    attemptCount: ticket.attemptCount ?? 0,
    revision: ticket.revision ?? 1,
    createdAt: toIso(ticket.createdAt),
    updatedAt: toIso(ticket.updatedAt)
  }
}

export function toDetail(ticket: SupportTicket): SupportTicketDetail {
  return {
    id: ticket.id as string,
    ticketNo: ticket.ticketNo as string,
    status: ticket.status as SupportTicketStatus,
    sourceType: (ticket.sourceType ?? 'workbench_form') as SupportTicketDetail['sourceType'],
    customerName: ticket.customerName as string,
    channel: ticket.channel as SupportTicketDetail['channel'],
    originalMessage: ticket.originalMessage as string,
    revision: ticket.revision ?? 1,
    attemptCount: ticket.attemptCount ?? 0,
    ...(ticket.aiCategory
      ? {
          ai: {
            category: ticket.aiCategory,
            priority: ticket.aiPriority as SupportTicketDetail['ai']['priority'],
            priorityReason: ticket.aiPriorityReason ?? '',
            draftReply: ticket.aiDraftReply ?? '',
            confidence: ticket.aiConfidence,
            missingInfo: ticket.aiMissingInfo,
            processedAt: toIso(ticket.aiProcessedAt)
          }
        }
      : {}),
    ...(ticket.confirmedReply || ticket.confirmedCategory
      ? {
          confirmed: {
            category: ticket.confirmedCategory,
            priority: ticket.confirmedPriority,
            draftReply: ticket.confirmedReply,
            reviewerNote: ticket.reviewerNote,
            reviewedAt: toIso(ticket.reviewedAt),
            reviewedBy: ticket.reviewedById
          }
        }
      : {}),
    ...(ticket.failureReason
      ? {
          failure: {
            reason: ticket.failureReason,
            code: ticket.failureCode,
            at: toIso(ticket.lastAttemptAt)
          }
        }
      : {}),
    events: Array.isArray(ticket.events) ? ticket.events : [],
    createdAt: toIso(ticket.createdAt),
    updatedAt: toIso(ticket.updatedAt)
  }
}

function preview(value?: string) {
  const text = trimToUndefined(value)
  if (!text) {
    return undefined
  }
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

function toIso(value?: Date) {
  return value instanceof Date ? value.toISOString() : undefined
}

function trimToUndefined(value?: string | null) {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function normalizeStringArray(value?: string[]) {
  if (!Array.isArray(value)) {
    return undefined
  }
  const items = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
  return items.length ? items : undefined
}
