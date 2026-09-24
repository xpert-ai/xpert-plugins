import { randomInt, randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'
import type { EntityManager } from 'typeorm'
import { ANALYSIS_TIMEOUT_MS } from './constants.js'
import {
  ANALYZABLE_STATUSES,
  TICKET_STATUSES,
  TriageError,
  confirmTicketSchema,
  createTicketSchema,
  type AttemptDto,
  type ComplaintAnalysis,
  type ConfirmTicketInput,
  type CreateTicketInput,
  type Evidence,
  type FailureCode,
  type ReportFailureInput,
  type Resolution,
  type SaveAnalysisInput,
  type TicketDetail,
  type TicketListItem,
  type TicketScope,
  type TicketStatus
} from './domain/contracts.js'
import { CATEGORY_GUIDE, SEVERITY_GUIDE } from './domain/policy.js'
import { splitSentences, type Sentence } from './domain/sentences.js'
import { ComplaintAnalysisAttempt, ComplaintTicket } from './ticket.entity.js'

export interface TicketListQuery {
  page?: number
  pageSize?: number
  status?: TicketStatus
  search?: string
}

export interface TicketListResult {
  items: TicketListItem[]
  total: number
  page: number
  pageSize: number
  counts: Record<TicketStatus, number>
}

export interface AnalysisStartResult {
  ticket: TicketDetail
  attemptNo: number
  // False when an attempt was already running: a double click or a concurrent request must not
  // start a second attempt.
  started: boolean
}

// Compact results for the Agent: ids, status and the next step - never the whole ticket.
export type AgentToolResult =
  | { success: true; ticketNo: string; status: TicketStatus; attemptNo: number; duplicate?: boolean; message: string; unknownEvidenceIds?: string[] }
  | { success: false; ticketNo: string; code: string; retryable: boolean; message: string }

export interface AgentTicketBrief {
  success: true
  ticketNo: string
  status: TicketStatus
  attemptNo: number
  channel: string
  customerName: string | null
  sentences: Sentence[]
  policy: { categories: typeof CATEGORY_GUIDE; severities: typeof SEVERITY_GUIDE }
}

const TICKET_NO_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // no 0/O/1/I: the number is read aloud and typed

@Injectable()
export class ComplaintTriageService {
  // Replaceable in tests to exercise the timeout path without waiting.
  now: () => Date = () => new Date()

  constructor(
    @InjectRepository(ComplaintTicket) private readonly tickets: Repository<ComplaintTicket>,
    @InjectRepository(ComplaintAnalysisAttempt) private readonly attempts: Repository<ComplaintAnalysisAttempt>
  ) {}

  // ---- Workbench -----------------------------------------------------------------------------------

  async createTicket(scope: TicketScope, input: CreateTicketInput): Promise<TicketDetail> {
    const data = createTicketSchema.parse(input)
    const timestamp = this.now().toISOString()
    const ticket = this.tickets.create({
      id: randomUUID(),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      ticketNo: await this.nextTicketNo(scope),
      channel: data.channel,
      customerName: data.customerName || null,
      content: data.content,
      status: 'draft',
      attemptCount: 0,
      currentAttemptId: null,
      analysisRequestedAt: null,
      faultInjection: data.faultInjection,
      analysisJson: null,
      resolutionJson: null,
      severity: null,
      failureCode: null,
      failureMessage: null,
      createdById: scope.userId,
      confirmedById: null,
      confirmedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    await this.tickets.insert(ticket)
    return this.toDetail(ticket, [])
  }

  async listTickets(scope: TicketScope, query: TicketListQuery = {}): Promise<TicketListResult> {
    await this.expireStaleAnalyses(scope)
    const page = Math.max(1, Math.trunc(query.page ?? 1))
    const pageSize = Math.min(50, Math.max(1, Math.trunc(query.pageSize ?? 20)))
    const search = query.search?.trim()

    const builder = this.tickets
      .createQueryBuilder('ticket')
      .where('ticket.tenantId = :tenantId AND ticket.organizationId = :organizationId', scope)
    if (query.status) builder.andWhere('ticket.status = :status', { status: query.status })
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
      builder.andWhere(
        new Brackets((where) =>
          where
            .where("ticket.ticketNo LIKE :like ESCAPE '\\'", { like })
            .orWhere("ticket.customerName LIKE :like ESCAPE '\\'", { like })
            .orWhere("ticket.content LIKE :like ESCAPE '\\'", { like })
        )
      )
    }
    const [rows, total] = await builder
      .orderBy('ticket.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()

    const grouped = await this.tickets
      .createQueryBuilder('ticket')
      .select('ticket.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('ticket.tenantId = :tenantId AND ticket.organizationId = :organizationId', scope)
      .groupBy('ticket.status')
      .getRawMany<{ status: TicketStatus; count: string | number }>()
    const counts = Object.fromEntries(TICKET_STATUSES.map((status) => [status, 0])) as Record<TicketStatus, number>
    for (const row of grouped) counts[row.status] = Number(row.count)

    return { items: rows.map((row) => this.toListItem(row)), total, page, pageSize, counts }
  }

  async getTicket(scope: TicketScope, ticketId: string): Promise<TicketDetail> {
    await this.expireStaleAnalyses(scope, ticketId)
    const ticket = await this.requireTicket(scope, { id: ticketId })
    return this.toDetail(ticket, await this.loadAttempts(scope, ticket.id))
  }

  async requestAnalysis(scope: TicketScope, ticketId: string): Promise<AnalysisStartResult> {
    await this.expireStaleAnalyses(scope, ticketId)
    const ticket = await this.requireTicket(scope, { id: ticketId })
    const started = await this.beginAttempt(scope, ticket)
    const fresh = await this.getTicket(scope, ticketId)
    return { ticket: fresh, attemptNo: fresh.attemptCount, started }
  }

  // The Workbench marked the ticket `analyzing` and then failed to hand the request to the Assistant
  // chat. Without this the ticket would sit in `analyzing` until the timeout.
  async reportDispatchFailure(scope: TicketScope, ticketId: string, attemptNo: number, reason?: string): Promise<TicketDetail> {
    const ticket = await this.requireTicket(scope, { id: ticketId })
    if (ticket.status === 'analyzing' && ticket.attemptCount === attemptNo) {
      await this.failAttempt(scope, ticket, 'dispatch_failed', reason ?? null)
    }
    return this.getTicket(scope, ticketId)
  }

  async confirmTicket(scope: TicketScope, input: ConfirmTicketInput): Promise<TicketDetail> {
    const data = confirmTicketSchema.parse(input)
    const ticket = await this.requireTicket(scope, { id: data.ticketId })
    if (ticket.status === 'confirmed') throw new TriageError('already_confirmed')
    if (ticket.status !== 'pending_review') throw new TriageError('invalid_state', ticket.status)
    // The reviewer must confirm the analysis they actually saw, not one that arrived in the meantime.
    if (ticket.attemptCount !== data.attemptNo) throw new TriageError('stale_view')

    const timestamp = this.now().toISOString()
    await this.tickets.update(
      { id: ticket.id, tenantId: scope.tenantId, organizationId: scope.organizationId, status: 'pending_review', attemptCount: data.attemptNo },
      {
        status: 'confirmed',
        resolutionJson: JSON.stringify(data.resolution),
        severity: data.resolution.severity,
        confirmedById: scope.userId,
        confirmedAt: timestamp,
        updatedAt: timestamp
      }
    )
    const saved = await this.getTicket(scope, ticket.id)
    if (saved.status !== 'confirmed' || saved.confirmedAt !== timestamp) throw new TriageError('conflict')
    return saved
  }

  // ---- Agent tools -----------------------------------------------------------------------------------

  // Opening a new or failed ticket starts an attempt when none is running, so "analyze TCK-..." typed
  // straight into the chat works the same as the Workbench button - and both paths share one attempt,
  // never two. Replacing a suggestion that already waits for review stays a deliberate human action.
  async openTicketForAgent(scope: TicketScope, ticketNo: string): Promise<AgentTicketBrief | AgentToolResult> {
    const found = await this.findByTicketNo(scope, ticketNo)
    if (!found) return this.agentFailure(ticketNo, 'not_found', false, 'No such ticket in this organization. Ask the user to check the ticket number.')
    await this.expireStaleAnalyses(scope, found.id)
    const ticket = await this.requireTicket(scope, { id: found.id })
    if (ticket.status === 'confirmed') {
      return this.agentFailure(ticket.ticketNo, 'already_confirmed', false, 'A reviewer already confirmed this ticket. It must not be analyzed again.')
    }
    if (ticket.status === 'pending_review') {
      return this.agentFailure(
        ticket.ticketNo,
        'already_analyzed',
        false,
        'An analysis already waits for human review. Only the user can replace it, with Re-analyze in the workbench.'
      )
    }
    if (ticket.status !== 'analyzing') await this.beginAttempt(scope, ticket)

    const current = await this.requireTicket(scope, { id: ticket.id })
    return {
      success: true,
      ticketNo: current.ticketNo,
      status: current.status,
      attemptNo: current.attemptCount,
      channel: current.channel,
      customerName: current.customerName,
      sentences: splitSentences(current.content),
      policy: { categories: CATEGORY_GUIDE, severities: SEVERITY_GUIDE }
    }
  }

  async saveAnalysis(scope: TicketScope, input: SaveAnalysisInput): Promise<AgentToolResult> {
    const found = await this.findByTicketNo(scope, input.ticketNo)
    if (!found) return this.agentFailure(input.ticketNo, 'not_found', false, 'No such ticket in this organization.')
    const ticket = found

    if (ticket.status === 'confirmed') {
      return this.agentFailure(ticket.ticketNo, 'already_confirmed', false, 'A reviewer already confirmed this ticket. Nothing was changed.')
    }
    if (ticket.status === 'pending_review') {
      // Idempotent: a repeated tool call must not produce a second result or overwrite the first.
      return {
        success: true,
        duplicate: true,
        ticketNo: ticket.ticketNo,
        status: ticket.status,
        attemptNo: ticket.attemptCount,
        message: 'An analysis for this attempt is already saved. Nothing was changed.'
      }
    }
    // A result that arrives after the timeout is still the answer to the latest attempt: accept it.
    const lateButCurrent = ticket.status === 'analysis_failed' && ticket.failureCode === 'timeout'
    if (ticket.status !== 'analyzing' && !lateButCurrent) {
      return this.agentFailure(ticket.ticketNo, 'not_analyzing', true, 'No analysis is running for this ticket. Call complaint_open_ticket first.')
    }

    if (ticket.faultInjection === 'first_attempt' && ticket.attemptCount === 1) {
      await this.failAttempt(scope, ticket, 'simulated_downstream_failure', null)
      return this.agentFailure(
        ticket.ticketNo,
        'simulated_downstream_failure',
        true,
        'Saving failed (simulated downstream outage). Nothing was saved. Tell the user the analysis failed and that they can press Retry in the workbench. Do not call this tool again in this turn.'
      )
    }

    const { analysis, unknownEvidenceIds } = this.buildAnalysis(ticket, input)
    const timestamp = analysis.analyzedAt
    await this.tickets.manager.transaction(async (manager) => {
      await manager.update(
        ComplaintTicket,
        { id: ticket.id, tenantId: scope.tenantId, organizationId: scope.organizationId, status: ticket.status, attemptCount: ticket.attemptCount },
        { status: 'pending_review', analysisJson: JSON.stringify(analysis), severity: analysis.severity, failureCode: null, failureMessage: null, updatedAt: timestamp }
      )
      await this.finishAttempt(manager, scope, ticket.id, ticket.attemptCount, 'succeeded', null, null, timestamp)
    })

    const saved = await this.requireTicket(scope, { id: ticket.id })
    return {
      success: true,
      ticketNo: saved.ticketNo,
      status: saved.status,
      attemptNo: saved.attemptCount,
      unknownEvidenceIds,
      message: 'Analysis saved as a suggestion. Tell the user to review and confirm it in the Complaint Triage workbench; nothing is final until they confirm.'
    }
  }

  async reportFailure(scope: TicketScope, input: ReportFailureInput): Promise<AgentToolResult> {
    const ticket = await this.findByTicketNo(scope, input.ticketNo)
    if (!ticket) return this.agentFailure(input.ticketNo, 'not_found', false, 'No such ticket in this organization.')
    if (ticket.status !== 'analyzing') {
      return this.agentFailure(ticket.ticketNo, 'not_analyzing', false, `Ticket is ${ticket.status}; nothing was changed.`)
    }
    await this.failAttempt(scope, ticket, 'model_reported', input.reason)
    const saved = await this.requireTicket(scope, { id: ticket.id })
    return {
      success: true,
      ticketNo: saved.ticketNo,
      status: saved.status,
      attemptNo: saved.attemptCount,
      message: 'The failure reason was recorded on the ticket. Tell the user what is missing.'
    }
  }

  // ---- internals -------------------------------------------------------------------------------------

  private agentFailure(ticketNo: string, code: string, retryable: boolean, message: string): AgentToolResult {
    return { success: false, ticketNo, code, retryable, message }
  }

  private async nextTicketNo(scope: TicketScope): Promise<string> {
    const day = this.now().toISOString().slice(0, 10).replace(/-/g, '')
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const suffix = Array.from({ length: 4 }, () => TICKET_NO_ALPHABET[randomInt(TICKET_NO_ALPHABET.length)]).join('')
      const ticketNo = `TCK-${day}-${suffix}`
      const taken = await this.tickets.countBy({ tenantId: scope.tenantId, organizationId: scope.organizationId, ticketNo })
      if (!taken) return ticketNo
    }
    throw new TriageError('conflict', 'ticket_no')
  }

  private async requireTicket(scope: TicketScope, where: { id: string }): Promise<ComplaintTicket> {
    const ticket = await this.tickets.findOneBy({ id: where.id, tenantId: scope.tenantId, organizationId: scope.organizationId })
    if (!ticket) throw new TriageError('not_found')
    return ticket
  }

  private findByTicketNo(scope: TicketScope, ticketNo: string) {
    return this.tickets.findOneBy({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      ticketNo: ticketNo.trim().toUpperCase()
    })
  }

  private loadAttempts(scope: TicketScope, ticketId: string) {
    return this.attempts.find({
      where: { tenantId: scope.tenantId, organizationId: scope.organizationId, ticketId },
      order: { attemptNo: 'ASC' }
    })
  }

  // Returns true when this call started the attempt. The conditional UPDATE is the lock: of two
  // concurrent callers only one matches (status, attemptCount), and the re-read of currentAttemptId
  // tells each caller who won. Protected so a test can replay the race with one stale snapshot.
  protected async beginAttempt(scope: TicketScope, ticket: ComplaintTicket): Promise<boolean> {
    if (ticket.status === 'confirmed') throw new TriageError('already_confirmed')
    if (ticket.status === 'analyzing') return false
    if (!ANALYZABLE_STATUSES.includes(ticket.status)) throw new TriageError('invalid_state', ticket.status)

    const attemptId = randomUUID()
    const attemptNo = ticket.attemptCount + 1
    const timestamp = this.now().toISOString()
    return this.tickets.manager.transaction(async (manager) => {
      await manager.update(
        ComplaintTicket,
        { id: ticket.id, tenantId: scope.tenantId, organizationId: scope.organizationId, status: ticket.status, attemptCount: ticket.attemptCount },
        {
          status: 'analyzing',
          attemptCount: attemptNo,
          currentAttemptId: attemptId,
          analysisRequestedAt: timestamp,
          analysisJson: null,
          severity: null,
          failureCode: null,
          failureMessage: null,
          updatedAt: timestamp
        }
      )
      const current = await manager.findOneBy(ComplaintTicket, { id: ticket.id })
      if (current?.currentAttemptId !== attemptId) return false

      // Re-analysis of a reviewed suggestion replaces it; the old attempt stays in the audit trail.
      if (ticket.status === 'pending_review') {
        await manager.update(
          ComplaintAnalysisAttempt,
          { tenantId: scope.tenantId, organizationId: scope.organizationId, ticketId: ticket.id, attemptNo: ticket.attemptCount, status: 'succeeded' },
          { status: 'superseded' }
        )
      }
      await manager.insert(ComplaintAnalysisAttempt, {
        id: attemptId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        ticketId: ticket.id,
        attemptNo,
        status: 'running',
        failureCode: null,
        failureMessage: null,
        requestedById: scope.userId,
        startedAt: timestamp,
        finishedAt: null
      })
      return true
    })
  }

  private async failAttempt(scope: TicketScope, ticket: ComplaintTicket, code: FailureCode, message: string | null) {
    const timestamp = this.now().toISOString()
    await this.tickets.manager.transaction(async (manager) => {
      await manager.update(
        ComplaintTicket,
        { id: ticket.id, tenantId: scope.tenantId, organizationId: scope.organizationId, status: 'analyzing', attemptCount: ticket.attemptCount },
        { status: 'analysis_failed', failureCode: code, failureMessage: message, updatedAt: timestamp }
      )
      await this.finishAttempt(manager, scope, ticket.id, ticket.attemptCount, 'failed', code, message, timestamp)
    })
  }

  private finishAttempt(
    manager: EntityManager,
    scope: TicketScope,
    ticketId: string,
    attemptNo: number,
    status: 'succeeded' | 'failed',
    failureCode: FailureCode | null,
    failureMessage: string | null,
    timestamp: string
  ) {
    return manager.update(
      ComplaintAnalysisAttempt,
      { tenantId: scope.tenantId, organizationId: scope.organizationId, ticketId, attemptNo },
      { status, failureCode, failureMessage, finishedAt: timestamp }
    )
  }

  // Lazy expiry on read: no timer or queue is needed, and the state is correct after an API restart.
  private async expireStaleAnalyses(scope: TicketScope, ticketId?: string) {
    const deadline = new Date(this.now().getTime() - ANALYSIS_TIMEOUT_MS).toISOString()
    const stale = await this.tickets
      .createQueryBuilder('ticket')
      .where('ticket.tenantId = :tenantId AND ticket.organizationId = :organizationId', scope)
      .andWhere("ticket.status = 'analyzing' AND ticket.analysisRequestedAt < :deadline", { deadline })
      .andWhere(ticketId ? 'ticket.id = :ticketId' : '1 = 1', { ticketId })
      .getMany()
    for (const ticket of stale) await this.failAttempt(scope, ticket, 'timeout', null)
  }

  private buildAnalysis(ticket: ComplaintTicket, input: SaveAnalysisInput) {
    const sentences = new Map(splitSentences(ticket.content).map((sentence) => [sentence.id, sentence.text]))
    const unknown = new Set<string>()
    const resolve = (ids: string[]): Evidence[] => {
      const evidence: Evidence[] = []
      for (const raw of new Set(ids.map((id) => id.trim().toLowerCase()))) {
        const quote = sentences.get(raw)
        if (quote) evidence.push({ sentenceId: raw, quote })
        else unknown.add(raw)
      }
      return evidence
    }

    const analysis: ComplaintAnalysis = {
      attemptNo: ticket.attemptCount,
      category: input.category,
      severity: input.severity,
      severityReason: input.severityReason,
      severityEvidence: resolve(input.severityEvidenceIds),
      sentiment: input.sentiment,
      summary: input.summary,
      customerDemands: input.customerDemands,
      keyFacts: input.keyFacts.map((item) => {
        const evidence = resolve(item.evidenceIds)
        return { fact: item.fact, evidence, evidenceVerified: evidence.length > 0 }
      }),
      suggestedActions: input.suggestedActions,
      replyDraft: input.replyDraft,
      unknownEvidenceIds: [],
      analyzedAt: this.now().toISOString()
    }
    analysis.unknownEvidenceIds = [...unknown]
    return { analysis, unknownEvidenceIds: analysis.unknownEvidenceIds }
  }

  private toListItem(ticket: ComplaintTicket): TicketListItem {
    const flat = ticket.content.replace(/\s+/g, ' ').trim()
    return {
      id: ticket.id,
      ticketNo: ticket.ticketNo,
      channel: ticket.channel,
      customerName: ticket.customerName,
      excerpt: flat.length > 80 ? `${flat.slice(0, 80)}…` : flat,
      status: ticket.status,
      severity: ticket.severity,
      attemptCount: ticket.attemptCount,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt
    }
  }

  private toDetail(ticket: ComplaintTicket, attempts: ComplaintAnalysisAttempt[]): TicketDetail {
    return {
      ...this.toListItem(ticket),
      content: ticket.content,
      sentences: splitSentences(ticket.content),
      faultInjection: ticket.faultInjection,
      failureCode: ticket.failureCode,
      failureMessage: ticket.failureMessage,
      analysisRequestedAt: ticket.analysisRequestedAt,
      analysisTimeoutMs: ANALYSIS_TIMEOUT_MS,
      analysis: ticket.analysisJson ? (JSON.parse(ticket.analysisJson) as ComplaintAnalysis) : null,
      resolution: ticket.resolutionJson ? (JSON.parse(ticket.resolutionJson) as Resolution) : null,
      confirmedAt: ticket.confirmedAt,
      attempts: attempts.map(
        (attempt): AttemptDto => ({
          attemptNo: attempt.attemptNo,
          status: attempt.status,
          failureCode: attempt.failureCode,
          failureMessage: attempt.failureMessage,
          startedAt: attempt.startedAt,
          finishedAt: attempt.finishedAt
        })
      )
    }
  }
}
