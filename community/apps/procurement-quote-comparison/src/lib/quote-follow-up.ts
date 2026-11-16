import {
  DeliveryCheck,
  DeliveryCheckReceipt,
  linkCheckReceipt,
  publishDeliveryCheck,
  timerFact,
  verifiedDeadline,
  resolveRiskQuote,
  riskQuoteFactsSql,
  workbenchPublication,
  type RiskQuoteFacts,
  type CheckKey
} from './delivery-check.js'
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { Column, Entity, EntityManager, Index, PrimaryColumn, IsNull } from 'typeorm'
import { z } from 'zod/v3'
import type { AgentEventContext, AgentEventDelivery, EventDecision } from '@xpert-ai/plugin-sdk'
import { ProcurementComparisonCase, ProcurementRiskItem } from './entities/index.js'
import { journal } from './event-journal.js'
import type { ProcurementScope } from './types.js'

export const dueType = 'procurement.follow_up.due'
/** Deadline edits use the timer version. Reminder publication uses the inspected quote revision. */
export const followUpInput = z
  .object({
    caseId: z.string().uuid(),
    riskId: z.string().uuid(),
    action: z.enum(['inspect', 'set', 'cancel', 'reply', 'publish_check']),
    expectedQuoteRevision: z.number().int().positive().optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
    replyNote: z.string().trim().min(1).max(2000).optional(),
    dueAt: z.string().datetime({ offset: true }).optional()
  })
  .strict()

/** Current follow-up for a risk. Its version changes as the buyer reschedules, answers or cancels it. */
@Entity('plugin_procurement_follow_up')
@Index(['binding', 'bindingRevision', 'state', 'dueAt'])
export class QuoteFollowUp {
  @PrimaryColumn('uuid') riskId!: string
  @Column('uuid') caseId!: string
  @Column('uuid') binding!: string
  @Column('integer') bindingRevision!: number
  @Column('uuid') conversationId!: string
  @Column('varchar', { length: 100, nullable: true }) threadId!: string | null
  @Column('varchar', { nullable: true }) agentKey!: string | null
  @Column('uuid', { nullable: true }) wakeReceiptId!: string | null
  @Column('varchar', { nullable: true }) wakeStatus!: 'queued' | 'started' | null
  @Column('text', { nullable: true }) replyNote!: string | null
  @Column('varchar') quoteSource!: string
  @Column('integer') version!: number
  @Column('timestamptz') dueAt!: Date
  @Column('varchar') state!: 'waiting' | 'captured' | 'fired' | 'cancelled' | 'answered' | 'superseded'
  @Column('uuid') updatedBy!: string
  @Column('timestamptz') updatedAt!: Date
}

// The case lock orders quote capture, timer edits and expiry. Stable risk references come from the journal decision.
export async function editFollowUp(tx: EntityManager, scope: ProcurementScope, input: z.infer<typeof followUpInput>) {
  if (!scope.tenantId || !scope.userId || !scope.organizationId || !scope.workspaceId || !journal)
    throw new ForbiddenException('follow_up_scope_required')
  const c = await tx.findOne(ProcurementComparisonCase, {
    where: {
      id: input.caseId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      createdById: scope.userId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId ?? IsNull(),
      ...(scope.assistantId ? { xpertId: scope.assistantId } : {})
    },
    lock: { mode: 'pessimistic_write' }
  })
  if (!c) throw new ForbiddenException('case_access_changed')
  const route = await journal.route(tx, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    ref: input.caseId
  })
  if (!route?.enabled) throw new ConflictException('follow_up_binding_disabled')
  const risk = await tx.findOneBy(ProcurementRiskItem, { id: input.riskId, caseId: input.caseId })
  if (!risk?.eventOperationKey || risk.type !== 'delivery_delay')
    throw new BadRequestException('delivery_risk_required')
  const [facts] = await tx.query<RiskQuoteFacts[]>(
    `SELECT q.origin, q.latest FROM (${riskQuoteFactsSql}) q
     WHERE q.binding=$1 AND q.operation_key=$2 AND q.risk_key=$3`,
    [route.binding, risk.eventOperationKey, input.riskId]
  )
  if (!facts && input.action !== 'inspect') throw new ConflictException('quote_origin_missing')
  const timer = await tx.findOne(QuoteFollowUp, {
    where: { riskId: input.riskId, binding: route.binding },
    lock: { mode: 'pessimistic_write' }
  })
  const { expected, current, status: quoteVersionStatus } = resolveRiskQuote(facts, input.caseId)
  const currentQuote = quoteVersionStatus === 'current'
  const key: CheckKey | null = expected && {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    caseId: input.caseId,
    riskId: input.riskId,
    series: expected.series,
    revision: expected.revision,
    actionKind: 'publish_delivery_check'
  }
  const deadline = scope.eventReceiptId
    ? await verifiedDeadline(tx, scope, route, input.caseId, input.riskId, facts?.origin.source)
    : null
  if (input.action === 'inspect') {
    const existing = key && (await tx.findOneBy(DeliveryCheck, key))
    const reminder = existing?.publishedFor === scope.userId ? existing : null
    if (reminder && deadline && scope.eventReceiptId) await linkCheckReceipt(tx, scope.eventReceiptId, reminder.id)
    return {
      risk: { id: risk.id, title: risk.title, description: risk.description },
      caseStatus: c.status,
      currentQuote,
      quoteVersionStatus,
      deliveryDate: current?.date ?? null,
      quoteSeriesId: expected?.series ?? null,
      quoteRevision: expected?.revision ?? null,
      latestQuoteRevision: current?.revision ?? null,
      workbenchPublication: workbenchPublication(
        quoteVersionStatus,
        risk.deliveryCheckVersion,
        !!existing,
        reminder?.id ?? null
      ),
      reminder: reminder
        ? { id: reminder.id, publishedAt: reminder.publishedAt, quoteRevision: reminder.revision }
        : null,
      waitingFor:
        currentQuote && c.status !== 'completed' && timer && ['waiting', 'captured', 'fired'].includes(timer.state)
          ? 'supplier_reply'
          : null,
      replyNote: timer?.replyNote ?? null,
      state: timer?.state ?? 'unscheduled',
      wakeStatus: timer?.wakeStatus ?? null,
      version: timer?.version ?? 0,
      dueAt: timer?.dueAt ?? null
    }
  }
  if (input.action === 'publish_check') {
    if (!deadline || !scope.eventReceiptId) throw new ForbiddenException('follow_up_event_required')
    if (!key || input.expectedQuoteRevision !== key.revision)
      throw new ConflictException('delivery_check_no_longer_applicable')
    const linked = await tx.findOneBy(DeliveryCheckReceipt, { receiptId: scope.eventReceiptId })
    if (linked && (await tx.existsBy(DeliveryCheck, { ...key, id: linked.checkId, publishedFor: scope.userId })))
      return { status: 'already_published', reminderId: linked.checkId, quoteRevision: key.revision }
    if (
      !currentQuote ||
      risk.deliveryCheckVersion !== 1 ||
      c.status === 'completed' ||
      timer?.state !== 'fired' ||
      timer.version !== deadline.version ||
      timer.bindingRevision !== route.revision ||
      timer.quoteSource !== facts.origin.source ||
      timer.wakeReceiptId !== scope.eventReceiptId
    )
      throw new ConflictException('delivery_check_no_longer_applicable')
    return publishDeliveryCheck(tx, key, scope.userId, scope.eventReceiptId, route)
  }
  if (deadline && (timer?.state !== 'fired' || timer.version !== deadline.version || !currentQuote))
    throw new ConflictException('follow_up_no_longer_applicable')
  if ((timer?.version ?? 0) !== input.expectedVersion) throw new ConflictException('follow_up_version_changed')
  const now = new Date()
  if (input.action === 'set') {
    const due = new Date(input.dueAt ?? '')
    if (!Number.isFinite(due.getTime()) || due <= now) throw new BadRequestException('future_deadline_required')
    const conversationId = timer?.conversationId ?? scope.conversationId ?? expected?.conversationId
    const threadId = timer ? timer.threadId : (scope.threadId ?? null)
    if (!conversationId) throw new BadRequestException('follow_up_conversation_required')
    if (c.status === 'completed' || !currentQuote || timer?.state === 'answered')
      throw new ConflictException('follow_up_no_longer_applicable')
    return tx.save(QuoteFollowUp, {
      riskId: input.riskId,
      caseId: input.caseId,
      binding: route.binding,
      bindingRevision: route.revision,
      quoteSource: facts.origin.source,
      conversationId,
      threadId,
      agentKey:
        (scope.conversationId === conversationId && scope.threadId === threadId ? scope.agentKey : null) ??
        timer?.agentKey ??
        null,
      dueAt: due,
      version: (timer?.version ?? 0) + 1,
      state: 'waiting',
      updatedBy: scope.userId,
      updatedAt: now
    })
  }
  if (!timer) throw new ConflictException('follow_up_missing')
  if (!['waiting', 'captured', 'fired'].includes(timer.state))
    throw new ConflictException('follow_up_no_longer_applicable')
  if (input.action === 'reply') timer.replyNote = input.replyNote ?? null
  timer.state = input.action === 'reply' ? 'answered' : 'cancelled'
  timer.version++
  timer.updatedBy = scope.userId
  timer.updatedAt = now
  return tx.save(timer)
}

export async function captureDue(tx: EntityManager, ctx: AgentEventContext, limit: number) {
  const route = await journal!.route(tx, {
    tenantId: ctx.tenantId,
    organizationId: ctx.organizationId,
    ref: ctx.sourceBindingRef
  })
  if (!route?.enabled || route.binding !== ctx.bindingId || route.revision !== ctx.bindingRevision) return
  const timers = await tx
    .getRepository(QuoteFollowUp)
    .createQueryBuilder('t')
    .where({
      binding: ctx.bindingId,
      bindingRevision: ctx.bindingRevision,
      state: 'waiting'
    })
    .andWhere('t."dueAt" <= now()')
    .orderBy('t."dueAt"', 'ASC')
    .addOrderBy('t."riskId"', 'ASC')
    .take(limit)
    .getMany()
  for (const timer of timers) {
    const fact = timerFact.parse({
      caseId: timer.caseId,
      riskId: timer.riskId,
      version: timer.version,
      dueAt: timer.dueAt.toISOString(),
      conversationId: timer.conversationId,
      threadId: timer.threadId ?? undefined,
      agentKey: timer.agentKey ?? undefined,
      quoteSource: timer.quoteSource
    })
    const key = 'follow-up/' + timer.riskId + '/' + timer.version
    await journal!.capture(
      tx,
      route,
      {
        sourceEventId: key,
        type: dueType,
        schemaVersion: 1,
        occurredAt: fact.dueAt,
        subject: { kind: 'comparison-case', key: timer.caseId }
      },
      fact,
      timer.riskId,
      String(timer.version)
    )
    await tx.update(QuoteFollowUp, timer.riskId, { state: 'captured' })
  }
}

export async function decideDue(
  tx: EntityManager,
  ctx: AgentEventContext,
  delivery: AgentEventDelivery,
  c: ProcurementComparisonCase,
  snapshot: unknown
): Promise<EventDecision> {
  const fact = timerFact.parse(snapshot)
  const timer = await tx.findOneBy(QuoteFollowUp, {
    riskId: fact.riskId,
    caseId: c.id,
    binding: ctx.bindingId,
    bindingRevision: ctx.bindingRevision,
    version: fact.version
  })
  if (!timer || timer.state !== 'captured' || c.status === 'completed')
    return { status: 'ignored', reasonCode: 'follow_up_superseded' }
  await tx.update(QuoteFollowUp, timer.riskId, {
    state: 'fired',
    wakeReceiptId: delivery.receiptId,
    wakeStatus: 'queued'
  })
  return {
    status: 'handled',
    operationKey: delivery.event.sourceEventId,
    resultRef: { kind: 'procurement-follow-up', key: fact.riskId }
  }
}
