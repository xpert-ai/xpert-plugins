import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ILike, In, IsNull, LessThan, Raw, Repository } from 'typeorm'
import { ChangeProposal, DeliveryChangeLog, OrderLine, SupplierReply } from './entities'
import { DELIVERY_TIME_ZONE, PARSE_TIMEOUT_MS } from './constants'
import { DEMO_ORDER_LINES } from './demo-data'
import { DeliveryDomainError } from './domain-error'
import {
  delayDays,
  hash,
  modelFailureSummary,
  pagination,
  receivedDateAt,
  scopedId,
  scopeValues,
  scopeWhere,
  validateDate,
  validateQuantity
} from './domain-utils'
import type {
  DeliveryScope,
  EvidenceField,
  OrderLineSearch,
  PageInput,
  ParseFailureCode,
  ProposalDecision,
  SaveProposalInput
} from './types'

const EVIDENCE_FIELDS: EvidenceField[] = ['poNumber', 'proposedDate', 'proposedQuantity', 'batches', 'reason']
export { PARSE_TIMEOUT_MS } from './constants'

@Injectable()
export class SupplierDeliveryFollowupService {
  constructor(
    @InjectRepository(OrderLine) private readonly orders: Repository<OrderLine>,
    @InjectRepository(SupplierReply) private readonly replies: Repository<SupplierReply>,
    @InjectRepository(ChangeProposal) private readonly proposals: Repository<ChangeProposal>,
    @InjectRepository(DeliveryChangeLog) private readonly logs: Repository<DeliveryChangeLog>
  ) {}

  async importDemoData(scope: DeliveryScope) {
    let created = 0
    for (const seed of DEMO_ORDER_LINES) {
      const where = { ...scopeWhere(scope), poNumber: seed.poNumber, lineNo: seed.lineNo }
      if (await this.orders.findOneBy(where)) continue
      try {
        await this.orders.insert({
          ...seed,
          ...scopeValues(scope),
          id: scopedId(scope, 'order', seed.poNumber, seed.lineNo),
          promisedDate: seed.originalDate,
          revision: 0,
          lastAppliedProposalId: null
        })
        created++
      } catch (error) {
        // Losing a race to a concurrent import leaves the row in place; any other failure leaves none.
        if (!(await this.orders.findOneBy(where))) throw error
      }
    }
    return { created, total: await this.orders.countBy(scopeWhere(scope)) }
  }

  async createReply(rawText: string, scope: DeliveryScope) {
    const text = rawText.trim()
    if (!text) throw new DeliveryDomainError('reply_empty')
    if (text.length > 5000) throw new DeliveryDomainError('reply_too_long', { maximum: 5000, length: text.length })
    const now = new Date()
    // Keep the same column/unique key, but deduplicate only within the Shanghai receipt day.
    // Existing hashes intentionally remain untouched; relative dates use this receipt's date.
    const contentHash = hash(JSON.stringify([receivedDateAt(now), text]))
    const where = { ...scopeWhere(scope), contentHash }
    const existing = await this.replies.findOneBy(where)
    if (existing) return { reply: existing, created: false }
    const receivedAt = now.toISOString()
    const reply = this.replies.create({
      ...scopeValues(scope),
      id: scopedId(scope, 'reply', contentHash),
      rawText: text,
      contentHash,
      status: 'received',
      parseAttempt: 0,
      parseRequestedAt: null,
      failureCode: null,
      failureMessage: null,
      createdBy: scope.userId,
      createdAt: receivedAt,
      updatedAt: receivedAt,
      confirmedBy: null,
      confirmedByName: null,
      confirmedAt: null,
      summary: null,
      confirmationStartedAt: null,
      confirmationActorId: null,
      confirmationActorName: null,
      revision: 0
    })
    try {
      await this.replies.insert(reply)
      return { reply, created: true }
    } catch (error) {
      // A concurrent save of the same text wins the unique key; re-read instead of classifying the driver error.
      const duplicate = await this.replies.findOneBy(where)
      if (!duplicate) throw error
      return { reply: duplicate, created: false }
    }
  }

  async listOrderLines(input: OrderLineSearch, scope: DeliveryScope) {
    const { page, pageSize, skip, take } = pagination(input)
    // Exact but case-insensitive: ILIKE would turn `%` or `_` in the model's input into wildcards.
    const same = (param: string, value: string) =>
      Raw((alias) => `LOWER(${alias}) = LOWER(:${param})`, { [param]: value })
    const base = {
      ...scopeWhere(scope),
      ...(input.poNumber ? { poNumber: same('poNumber', input.poNumber) } : {}),
      ...(input.supplierName ? { supplierName: same('supplierName', input.supplierName) } : {})
    }
    const where = input.keyword
      ? [
          { ...base, materialName: ILike(`%${input.keyword}%`) },
          { ...base, materialCode: ILike(`%${input.keyword}%`) }
        ]
      : base
    const [items, total] = await this.orders.findAndCount({
      where,
      skip,
      take,
      order: { poNumber: 'ASC', lineNo: 'ASC', id: 'ASC' }
    })
    return { items: items.map((line) => ({ ...line, delayDays: delayDays(line) })), total, page, pageSize }
  }

  async getOrderLine(id: string, scope: DeliveryScope) {
    const line = await this.orders.findOneBy({ ...scopeWhere(scope), id })
    if (!line) throw new DeliveryDomainError('order_line_not_found', { orderLineId: id })
    const changeLogs = await this.logs.find({
      where: { ...scopeWhere(scope), orderLineId: id },
      order: { confirmedAt: 'ASC', id: 'ASC' }
    })
    return { ...line, delayDays: delayDays(line), changeLogs }
  }

  async listReplies(input: PageInput, scope: DeliveryScope) {
    const { page, pageSize, skip, take } = pagination(input)
    const [items, total] = await this.replies.findAndCount({
      where: scopeWhere(scope),
      skip,
      take,
      order: { createdAt: 'DESC', id: 'ASC' }
    })
    return { items: items.map((reply) => ({ ...reply, parseTimedOut: this.timedOut(reply) })), total, page, pageSize }
  }

  async getReply(id: string, scope: DeliveryScope) {
    const reply = await this.findReply(id, scope)
    // Older attempts remain stored for recovery but cannot be reviewed/confirmed as current output.
    const proposals = await this.proposals.find({
      where: { ...scopeWhere(scope), replyId: id, parseAttempt: reply.parseAttempt },
      order: { id: 'ASC' }
    })
    return { ...reply, parseTimedOut: this.timedOut(reply), proposals }
  }

  /**
   * What a reviewer is shown, with the review revision taken from the very rows returned. A decision that
   * changes after this read is not in `reviewRevision`, so confirming this snapshot is rejected instead of
   * applying something the reviewer never saw.
   */
  async getReplyForReview(id: string, scope: DeliveryScope) {
    const reply = await this.findReply(id, scope)
    const all = await this.proposals.find({ where: { ...scopeWhere(scope), replyId: id }, order: { id: 'ASC' } })
    return {
      ...reply,
      parseTimedOut: this.timedOut(reply),
      // Older attempts remain stored for recovery but cannot be reviewed/confirmed as current output.
      proposals: all.filter((proposal) => proposal.parseAttempt === reply.parseAttempt),
      reviewRevision: reply.revision + all.reduce((sum, proposal) => sum + proposal.revision, 0)
    }
  }

  /** Read-only workbench projection; does not change the Agent list/search contract. */
  async getWorkbenchOverview(scope: DeliveryScope) {
    const [orders, replies] = await Promise.all([
      this.orders.find({ where: scopeWhere(scope), select: { originalDate: true, promisedDate: true } }),
      this.replies.find({ where: scopeWhere(scope), select: { status: true } })
    ])
    const replyCounts = { received: 0, parsing: 0, pending_review: 0, confirmed: 0, needs_followup: 0, failed: 0 }
    for (const reply of replies) replyCounts[reply.status]++
    return {
      orderLineCount: orders.length,
      delayedLineCount: orders.filter((line) => delayDays(line) > 0).length,
      replyCounts,
      parseTimeoutMinutes: PARSE_TIMEOUT_MS / 60_000
    }
  }

  async listWorkbenchReplies(input: PageInput, scope: DeliveryScope) {
    const { page, pageSize, skip, take } = pagination(input)
    const [items, total] = await this.replies.findAndCount({
      where: scopeWhere(scope),
      skip,
      take,
      order: { updatedAt: 'DESC', id: 'ASC' }
    })
    return { items: items.map((reply) => ({ ...reply, parseTimedOut: this.timedOut(reply) })), total, page, pageSize }
  }

  async listWorkbenchReplySummaries(input: PageInput, scope: DeliveryScope) {
    const page = await this.listWorkbenchReplies(input, scope)
    // Group by attempt so SQL fetches only the current attempt for each reply, in one query.
    const attempts = new Map<number, string[]>()
    for (const reply of page.items) {
      const ids = attempts.get(reply.parseAttempt) ?? []
      ids.push(reply.id)
      attempts.set(reply.parseAttempt, ids)
    }
    const proposals = page.items.length
      ? await this.proposals.find({
          where: [...attempts].map(([parseAttempt, ids]) => ({ ...scopeWhere(scope), replyId: In(ids), parseAttempt })),
          select: { id: true, replyId: true, orderLineId: true },
          order: { id: 'ASC' }
        })
      : []
    const byReply = new Map<string, ChangeProposal[]>()
    for (const proposal of proposals) {
      const items = byReply.get(proposal.replyId) ?? []
      items.push(proposal)
      byReply.set(proposal.replyId, items)
    }
    const orderIds = [...new Set(proposals.map((proposal) => proposal.orderLineId))]
    const orders = orderIds.length
      ? await this.orders.find({
          where: { ...scopeWhere(scope), id: In(orderIds) },
          select: { id: true, supplierName: true, poNumber: true, lineNo: true }
        })
      : []
    const byOrder = new Map(orders.map((order) => [order.id, order]))
    return {
      ...page,
      items: page.items.map((reply) => {
        const proposals = byReply.get(reply.id) ?? []
        const matchedOrders = proposals
          .map((proposal) => {
            const order = byOrder.get(proposal.orderLineId)
            if (!order) throw new DeliveryDomainError('order_line_not_found', { orderLineId: proposal.orderLineId })
            return order
          })
          .sort((a, b) => a.poNumber.localeCompare(b.poNumber) || a.lineNo - b.lineNo)
        const order = matchedOrders[0]
        return {
          id: reply.id,
          preview: reply.rawText.trim().slice(0, 80),
          supplierName: order?.supplierName ?? null,
          status: reply.status,
          parseTimedOut: reply.parseTimedOut,
          proposalCount: proposals.length,
          createdAt: reply.createdAt,
          updatedAt: reply.updatedAt
        }
      })
    }
  }

  async listWorkbenchOrderLines(input: PageInput & { search?: string }, scope: DeliveryScope) {
    const { page, pageSize, skip, take } = pagination(input)
    const base = scopeWhere(scope)
    const search = input.search?.trim()
    const where = search
      ? ['poNumber', 'supplierName', 'materialName', 'materialCode'].map((field) => ({
          ...base,
          [field]: ILike(`%${search}%`)
        }))
      : base
    const [items, total] = await this.orders.findAndCount({
      where,
      skip,
      take,
      order: { poNumber: 'ASC', lineNo: 'ASC', id: 'ASC' }
    })
    return { items: items.map((line) => ({ ...line, delayDays: delayDays(line) })), total, page, pageSize }
  }

  /** Bounded Agent projection; leaves the workbench detail contract unchanged. */
  /**
   * Version of everything a reviewer sees: the reply's revision plus every proposal revision
   * (all parse attempts). Proposals are never deleted and every write bumps a revision, so the
   * value only grows and changes whenever any decision changes.
   */
  async reviewRevision(replyId: string, scope: DeliveryScope) {
    const reply = await this.findReply(replyId, scope)
    const proposals = await this.proposals.findBy({ ...scopeWhere(scope), replyId })
    return reply.revision + proposals.reduce((sum, proposal) => sum + proposal.revision, 0)
  }

  async getReplyForAgent(id: string, input: PageInput, scope: DeliveryScope) {
    const reply = await this.findReply(id, scope)
    const { page, pageSize, skip, take } = pagination(input)
    const [proposals, total] = await this.proposals.findAndCount({
      where: { ...scopeWhere(scope), replyId: id, parseAttempt: reply.parseAttempt },
      select: { id: true, orderLineId: true, changeType: true },
      order: { id: 'ASC' },
      skip,
      take
    })
    const orders = proposals.length
      ? await this.orders.find({
          where: { ...scopeWhere(scope), id: In(proposals.map((p) => p.orderLineId)) },
          select: { id: true, poNumber: true, lineNo: true }
        })
      : []
    const byId = new Map(orders.map((order) => [order.id, order]))
    const receivedAt = new Date(reply.createdAt)
    const receivedDate = receivedDateAt(receivedAt)
    const receivedWeekday = new Intl.DateTimeFormat('en-US', {
      timeZone: DELIVERY_TIME_ZONE,
      weekday: 'long'
    }).format(receivedAt)
    return {
      receivedAt: receivedAt.toISOString(),
      receivedDate,
      receivedWeekday,
      replyId: reply.id,
      status: reply.status,
      rawText: reply.rawText,
      parseAttempt: reply.parseAttempt,
      parseTimedOut: this.timedOut(reply),
      failureCode: reply.failureCode,
      failureMessage: reply.failureMessage,
      proposals: proposals.map((proposal) => {
        const order = byId.get(proposal.orderLineId)
        if (!order) throw new DeliveryDomainError('order_line_not_found', { orderLineId: proposal.orderLineId })
        return {
          orderLineId: order.id,
          poNumber: order.poNumber,
          lineNo: order.lineNo,
          changeType: proposal.changeType
        }
      }),
      total,
      page,
      pageSize
    }
  }

  async requestParse(replyId: string, scope: DeliveryScope) {
    const reply = await this.findReply(replyId, scope)
    this.assertMutable(reply)
    if (reply.status === 'parsing' && !this.timedOut(reply))
      throw new DeliveryDomainError('parse_not_retryable', { replyId })
    return this.startParse(reply, scope)
  }

  async resendParse(replyId: string, scope: DeliveryScope) {
    const reply = await this.findReply(replyId, scope)
    if (reply.status !== 'parsing') throw new DeliveryDomainError('invalid_reply_state')
    await this.updateReply(reply, { parseRequestedAt: new Date().toISOString() }, scope)
    return this.getReply(reply.id, scope)
  }

  async retryParse(replyId: string, scope: DeliveryScope) {
    const reply = await this.findReply(replyId, scope)
    this.assertMutable(reply)
    if (!['needs_followup', 'failed'].includes(reply.status) && !this.timedOut(reply)) {
      throw new DeliveryDomainError('parse_not_retryable', { replyId, status: reply.status })
    }
    return this.startParse(reply, scope)
  }

  async saveProposal(input: SaveProposalInput, scope: DeliveryScope) {
    const reply = await this.findReply(input.replyId, scope)
    this.assertMutable(reply)
    this.assertStatus(reply, 'parsing')
    const line = await this.orders.findOneBy({ ...scopeWhere(scope), poNumber: input.poNumber, lineNo: input.lineNo })
    if (!line) throw new DeliveryDomainError('order_line_not_found', { poNumber: input.poNumber, lineNo: input.lineNo })
    if (
      !['delay', 'advance', 'unchanged', 'partial'].includes(input.changeType) ||
      !Number.isFinite(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 1
    ) {
      throw new DeliveryDomainError('invalid_proposal')
    }
    if (!input.evidence?.length) throw new DeliveryDomainError('evidence_required')
    const evidence = input.evidence.map(({ field, quote }) => {
      if (!EVIDENCE_FIELDS.includes(field)) throw new DeliveryDomainError('invalid_proposal', { field })
      const start = reply.rawText.indexOf(quote)
      if (!quote?.trim() || start < 0) throw new DeliveryDomainError('quote_not_in_reply', { field, quote })
      return { field, quote, start, end: start + quote.length }
    })
    const batches = (input.batches ?? [])
      .map((batch) => ({ date: validateDate(batch.date), quantity: validateQuantity(batch.quantity) }))
      .sort((a, b) => a.date.localeCompare(b.date))
    if (input.changeType === 'partial' ? batches.length < 2 : batches.length > 0)
      throw new DeliveryDomainError('invalid_batches')
    if (input.proposedDate !== undefined) validateDate(input.proposedDate)
    if (input.proposedQuantity !== undefined) validateQuantity(input.proposedQuantity)
    const proposedDate =
      input.changeType === 'partial' ? batches[batches.length - 1].date : (input.proposedDate ?? null)
    if (input.changeType !== 'partial') {
      if (proposedDate === null) throw new DeliveryDomainError('invalid_date')
      const expected =
        proposedDate > line.promisedDate ? 'delay' : proposedDate < line.promisedDate ? 'advance' : 'unchanged'
      if (input.changeType !== expected) {
        throw new DeliveryDomainError('invalid_change_type', { field: 'changeType', value: input.changeType, expected })
      }
    }
    const where = { ...scopeWhere(scope), replyId: reply.id, orderLineId: line.id }
    const values = {
      ...scopeValues(scope),
      replyId: reply.id,
      orderLineId: line.id,
      orderLineRevision: line.revision,
      orderLineDate: line.promisedDate,
      orderLineQuantity: line.quantity,
      parseAttempt: reply.parseAttempt,
      changeType: input.changeType,
      proposedDate,
      proposedQuantity: input.proposedQuantity ?? null,
      batches,
      reason: input.reason ?? null,
      evidence,
      confidence: input.confidence,
      decision: 'pending' as const,
      finalDate: null,
      finalQuantity: null
    }
    let existing = await this.proposals.findOneBy(where)
    if (!existing) {
      const proposal = this.proposals.create({ ...values, id: randomUUID(), confirmationState: 'draft', revision: 0 })
      try {
        await this.proposals.insert(proposal)
      } catch (error) {
        // A concurrent save for the same reply and order line wins the unique key; update that row instead.
        existing = await this.proposals.findOneBy(where)
        if (!existing) throw error
      }
      if (!existing) {
        await this.touchReply(reply.id, scope)
        return { proposalId: proposal.id, replyId: reply.id, created: true, message: 'proposal_saved' }
      }
    }
    const result = await this.proposals.update(
      { ...where, id: existing.id, revision: existing.revision, confirmationState: 'draft' },
      { ...values, revision: existing.revision + 1 }
    )
    if (result.affected !== 1) throw new DeliveryDomainError('concurrent_change', { proposalId: existing.id })
    await this.touchReply(reply.id, scope)
    return { proposalId: existing.id, replyId: reply.id, created: false, message: 'proposal_updated' }
  }

  async finalizeParse(replyId: string, summary: string, scope: DeliveryScope) {
    const reply = await this.findReply(replyId, scope)
    this.assertMutable(reply)
    this.assertStatus(reply, 'parsing')
    const proposalCount = await this.proposals.countBy({
      ...scopeWhere(scope),
      replyId,
      parseAttempt: reply.parseAttempt
    })
    if (!proposalCount) throw new DeliveryDomainError('no_proposals', { replyId })
    await this.updateReply(reply, { status: 'pending_review', summary, failureCode: null, failureMessage: null }, scope)
    return { replyId, status: 'pending_review' as const, proposalCount }
  }

  /** Model failures are advisory: stale attempts and replies already in review remain untouched. */
  async reportModelFailure(
    replyId: string,
    attempt: number | null,
    message: string,
    scope: DeliveryScope,
    code: 'model_failed' | 'run_stopped' = 'model_failed'
  ) {
    const reply = await this.replies.findOneBy({ ...scopeWhere(scope), id: replyId })
    if (
      !reply ||
      reply.status !== 'parsing' ||
      reply.confirmationStartedAt !== null ||
      (attempt !== null && attempt !== reply.parseAttempt)
    )
      return
    try {
      // A stopped run has nothing useful to show beyond its code; a model error keeps a redacted summary.
      await this.updateReply(
        reply,
        {
          status: 'failed',
          failureCode: code,
          failureMessage: code === 'run_stopped' ? null : modelFailureSummary(message)
        },
        scope
      )
    } catch (error) {
      // Another writer may finish/retry/freeze after our read. Its state takes precedence.
      if (!(error instanceof DeliveryDomainError) || error.code !== 'concurrent_change') throw error
    }
  }

  async reportParseFailure(replyId: string, code: ParseFailureCode, message: string, scope: DeliveryScope) {
    const reply = await this.findReply(replyId, scope)
    this.assertMutable(reply)
    this.assertStatus(reply, 'parsing')
    if (!['no_delivery_info', 'ambiguous_order', 'unreadable', 'other'].includes(code))
      throw new DeliveryDomainError('invalid_proposal', { code })
    await this.updateReply(reply, { status: 'needs_followup', failureCode: code, failureMessage: message }, scope)
    return { replyId, status: 'needs_followup' as const }
  }

  async decideProposal(
    proposalId: string,
    decision: Exclude<ProposalDecision, 'pending'>,
    finalDate: string | undefined,
    finalQuantity: number | undefined,
    scope: DeliveryScope
  ) {
    const proposal = await this.findProposal(proposalId, scope)
    const reply = await this.findReply(proposal.replyId, scope)
    if (reply.status !== 'confirmed' && reply.confirmationStartedAt) {
      const locked = () => new DeliveryDomainError('confirmation_in_progress', { replyId: reply.id, proposalId })
      if (
        decision !== 'rejected' ||
        finalDate !== undefined ||
        finalQuantity !== undefined ||
        proposal.parseAttempt !== reply.parseAttempt ||
        proposal.confirmationState === 'confirmed'
      )
        throw locked()
      const line = await this.orders.findOneBy({ ...scopeWhere(scope), id: proposal.orderLineId })
      if (line && (line.revision === proposal.orderLineRevision || line.lastAppliedProposalId === proposal.id))
        throw locked()
      const result = await this.proposals.update(
        {
          ...scopeWhere(scope),
          id: proposalId,
          revision: proposal.revision,
          confirmationState: In(['draft', 'applying'])
        },
        { decision: 'rejected', finalDate: null, finalQuantity: null, revision: proposal.revision + 1 }
      )
      if (result.affected !== 1) throw new DeliveryDomainError('concurrent_change', { proposalId })
      await this.touchReply(reply.id, scope)
      return this.findProposal(proposalId, scope)
    }
    this.assertMutable(reply)
    this.assertStatus(reply, 'pending_review')
    if (proposal.parseAttempt !== reply.parseAttempt) throw new DeliveryDomainError('invalid_reply_state')
    if (
      !['accepted', 'edited', 'rejected'].includes(decision) ||
      (decision !== 'edited' && (finalDate !== undefined || finalQuantity !== undefined)) ||
      (decision === 'edited' && finalDate === undefined && finalQuantity === undefined)
    )
      throw new DeliveryDomainError('invalid_decision')
    const date = decision === 'rejected' ? null : (finalDate ?? proposal.proposedDate)
    const quantity = decision === 'rejected' ? null : (finalQuantity ?? proposal.proposedQuantity)
    if (decision !== 'rejected' && date === null) throw new DeliveryDomainError('invalid_date')
    if (date !== null) validateDate(date)
    if (quantity !== null) validateQuantity(quantity)
    const result = await this.proposals.update(
      { ...scopeWhere(scope), id: proposalId, revision: proposal.revision, confirmationState: 'draft' },
      { decision, finalDate: date, finalQuantity: quantity, revision: proposal.revision + 1 }
    )
    if (result.affected !== 1) throw new DeliveryDomainError('concurrent_change', { proposalId })
    await this.touchReply(reply.id, scope)
    return this.findProposal(proposalId, scope)
  }

  /** Returns the reply plus this invocation's successful order writes (not prior attempts). */
  async confirmReply(replyId: string, actorId: string, scope: DeliveryScope, actorName: string | null = null) {
    scopeValues(scope)
    if (!actorId || actorId !== scope.userId) throw new DeliveryDomainError('invalid_actor')
    let reply = await this.getReply(replyId, scope)
    if (reply.status === 'confirmed') return { ...reply, appliedCount: 0 }
    this.assertStatus(reply, 'pending_review')
    this.assertReviewed(reply.proposals)
    if (!reply.confirmationStartedAt) {
      // Detect already-stale reviews before freezing them, so the caller can
      // request a fresh parse. The update below still enforces the revision if
      // another reply changes an order after this preflight.
      for (const proposal of reply.proposals) {
        if (proposal.decision === 'rejected') continue
        const line = await this.orders.findOneBy({ ...scopeWhere(scope), id: proposal.orderLineId })
        if (!line || (line.revision !== proposal.orderLineRevision && line.lastAppliedProposalId !== proposal.id)) {
          throw new DeliveryDomainError('order_line_changed', { orderLineId: proposal.orderLineId })
        }
      }
      const now = new Date().toISOString()
      await this.replies.update(
        {
          ...scopeWhere(scope),
          id: replyId,
          revision: reply.revision,
          status: 'pending_review',
          confirmationStartedAt: IsNull()
        },
        {
          confirmationStartedAt: now,
          confirmationActorId: actorId,
          confirmationActorName: actorName,
          revision: reply.revision + 1,
          updatedAt: now
        }
      )
      reply = await this.getReply(replyId, scope)
      if (reply.status === 'confirmed') return { ...reply, appliedCount: 0 }
      if (!reply.confirmationStartedAt) throw new DeliveryDomainError('concurrent_change', { replyId })
    }
    let appliedCount = 0
    for (const proposal of reply.proposals) appliedCount += await this.applyProposal(proposal, reply, scope)
    const result = await this.replies.update(
      {
        ...scopeWhere(scope),
        id: replyId,
        status: 'pending_review',
        confirmationStartedAt: reply.confirmationStartedAt!
      },
      {
        status: 'confirmed',
        confirmedAt: reply.confirmationStartedAt,
        confirmedBy: reply.confirmationActorId,
        confirmedByName: reply.confirmationActorName ?? null,
        revision: reply.revision + 1,
        updatedAt: new Date().toISOString()
      }
    )
    const confirmed = await this.getReply(replyId, scope)
    if (result.affected !== 1 && confirmed.status !== 'confirmed')
      throw new DeliveryDomainError('concurrent_change', { replyId })
    return { ...confirmed, appliedCount }
  }

  private async applyProposal(input: ChangeProposal, reply: SupplierReply, scope: DeliveryScope): Promise<number> {
    let proposal = input
    let appliedCount = 0
    if (proposal.confirmationState === 'confirmed') return 0
    if (proposal.confirmationState === 'draft') {
      const claim = await this.proposals.update(
        { ...scopeWhere(scope), id: proposal.id, revision: proposal.revision, confirmationState: 'draft' },
        { confirmationState: 'applying', revision: proposal.revision + 1 }
      )
      if (claim.affected === 1) await this.touchReply(reply.id, scope)
      proposal = await this.findProposal(proposal.id, scope)
      if (proposal.confirmationState === 'confirmed') return 0
      if (proposal.confirmationState !== 'applying')
        throw new DeliveryDomainError('concurrent_change', { proposalId: proposal.id })
    }
    this.assertReviewed([proposal])
    if (proposal.decision !== 'rejected') {
      const newDate = proposal.finalDate!
      const result = await this.orders.update(
        { ...scopeWhere(scope), id: proposal.orderLineId, revision: proposal.orderLineRevision },
        {
          promisedDate: newDate,
          ...(proposal.finalQuantity !== null ? { quantity: proposal.finalQuantity } : {}),
          revision: proposal.orderLineRevision + 1,
          lastAppliedProposalId: proposal.id
        }
      )
      appliedCount = result.affected === 1 ? 1 : 0
      if (appliedCount) await this.touchReply(reply.id, scope)
      if (result.affected !== 1) {
        const current = await this.orders.findOneBy({ ...scopeWhere(scope), id: proposal.orderLineId })
        if (current?.lastAppliedProposalId !== proposal.id)
          throw new DeliveryDomainError('order_line_changed', { orderLineId: proposal.orderLineId })
      }
      const log = this.logs.create({
        ...scopeValues(scope),
        id: scopedId(scope, 'log', proposal.id),
        orderLineId: proposal.orderLineId,
        proposalId: proposal.id,
        replyId: reply.id,
        oldDate: proposal.orderLineDate,
        newDate,
        aiDate: proposal.proposedDate,
        oldQuantity: proposal.orderLineQuantity,
        newQuantity: proposal.finalQuantity ?? proposal.orderLineQuantity,
        batches: proposal.batches,
        confirmedBy: reply.confirmationActorId!,
        confirmedByName: reply.confirmationActorName ?? null,
        confirmedAt: reply.confirmationStartedAt!
      })
      try {
        await this.logs.insert(log)
      } catch (error) {
        // A repeated confirmation already wrote this proposal's log; any other failure leaves none.
        if (!(await this.logs.findOneBy({ ...scopeWhere(scope), proposalId: proposal.id }))) throw error
      }
    }
    const result = await this.proposals.update(
      { ...scopeWhere(scope), id: proposal.id, confirmationState: 'applying', revision: proposal.revision },
      { confirmationState: 'confirmed', revision: proposal.revision + 1 }
    )
    if (result.affected !== 1 && (await this.findProposal(proposal.id, scope)).confirmationState !== 'confirmed') {
      throw new DeliveryDomainError('concurrent_change', { proposalId: proposal.id })
    }
    if (result.affected === 1) await this.touchReply(reply.id, scope)
    return appliedCount
  }

  private assertReviewed(proposals: ChangeProposal[]) {
    if (!proposals.length) throw new DeliveryDomainError('no_proposals')
    if (proposals.some((p) => p.decision === 'pending')) throw new DeliveryDomainError('review_incomplete')
  }
  private timedOut(reply: SupplierReply) {
    return (
      reply.status === 'parsing' &&
      reply.parseRequestedAt !== null &&
      Date.now() - Date.parse(reply.parseRequestedAt) > PARSE_TIMEOUT_MS
    )
  }
  private assertMutable(reply: SupplierReply) {
    if (reply.status === 'confirmed') throw new DeliveryDomainError('reply_locked', { replyId: reply.id })
    if (reply.confirmationStartedAt) throw new DeliveryDomainError('confirmation_in_progress', { replyId: reply.id })
  }
  private assertStatus(reply: SupplierReply, status: SupplierReply['status']) {
    if (reply.status !== status)
      throw new DeliveryDomainError('invalid_reply_state', {
        replyId: reply.id,
        status: reply.status,
        expected: status
      })
  }
  private async findReply(id: string, scope: DeliveryScope) {
    const reply = await this.replies.findOneBy({ ...scopeWhere(scope), id })
    if (!reply) throw new DeliveryDomainError('reply_not_found', { replyId: id })
    return reply
  }
  private async findProposal(id: string, scope: DeliveryScope) {
    const proposal = await this.proposals.findOneBy({ ...scopeWhere(scope), id })
    if (!proposal) throw new DeliveryDomainError('proposal_not_found', { proposalId: id })
    return proposal
  }
  private async updateReply(reply: SupplierReply, values: Partial<SupplierReply>, scope: DeliveryScope) {
    const result = await this.replies.update(
      {
        ...scopeWhere(scope),
        id: reply.id,
        revision: reply.revision,
        status: reply.status,
        confirmationStartedAt: IsNull()
      },
      { ...values, revision: reply.revision + 1, updatedAt: new Date().toISOString() }
    )
    if (result.affected !== 1) throw new DeliveryDomainError('concurrent_change', { replyId: reply.id })
  }
  private async touchReply(replyId: string, scope: DeliveryScope) {
    const updatedAt = new Date().toISOString()
    // Concurrent proposal writes must not let a delayed touch move time backwards.
    // Do not change revision: the existing reply/proposal CAS boundaries remain intact.
    await this.replies.update({ ...scopeWhere(scope), id: replyId, updatedAt: LessThan(updatedAt) }, { updatedAt })
  }
  private async startParse(reply: SupplierReply, scope: DeliveryScope) {
    await this.updateReply(
      reply,
      {
        status: 'parsing',
        parseAttempt: reply.parseAttempt + 1,
        parseRequestedAt: new Date().toISOString(),
        failureCode: null,
        failureMessage: null,
        summary: null
      },
      scope
    )
    return this.getReply(reply.id, scope)
  }
}
