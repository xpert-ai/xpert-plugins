import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { Column, Entity, EntityManager, Index, PrimaryColumn, IsNull } from 'typeorm'
import { z } from 'zod/v3'
import type { AgentEventContext, AgentEventDelivery, EventDecision } from '@xpert-ai/plugin-sdk'
import { ProcurementComparisonCase, ProcurementRiskItem } from './entities/index.js'
import { journal } from './event-journal.js'
import type { ProcurementScope } from './types.js'

export const dueType = 'procurement.follow_up.due'
export const followUpInput = z
  .object({
    caseId: z.string().uuid(),
    riskId: z.string().uuid(),
    action: z.enum(['inspect', 'set', 'cancel', 'reply']),
    expectedVersion: z.number().int().nonnegative().optional(),
    replyNote: z.string().trim().min(1).max(2000).optional(),
    dueAt: z.string().datetime({ offset: true }).optional()
  })
  .strict()
const timerFact = z
  .object({
    caseId: z.string().uuid(),
    riskId: z.string().uuid(),
    version: z.number().int().positive(),
    conversationId: z.string().uuid(),
    threadId: z.string().min(1).max(100).optional(),
    agentKey: z.string().min(1).optional(),
    dueAt: z.string().datetime(),
    quoteSource: z.string()
  })
  .strict()

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
  if (!scope.userId || !scope.organizationId || !scope.workspaceId || !journal)
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
  const [origin] = await tx.query(
    `SELECT source, snapshot->>'conversationId' AS conversation, snapshot->>'series' AS series
    FROM plugin_procurement_event_fact WHERE binding=$1 AND event->>'type'='procurement.quote.revised'
    AND event->>'schemaVersion'='1' AND decision->>'operationKey'=$2 AND decision->'resultRef'->>'key'=$3`,
    [route.binding, risk.eventOperationKey, input.riskId]
  )
  if (!origin) throw new ConflictException('quote_origin_missing')
  const timer = await tx.findOne(QuoteFollowUp, {
    where: { riskId: input.riskId, binding: route.binding },
    lock: { mode: 'pessimistic_write' }
  })
  const [latest] = await tx.query(
    `SELECT source, snapshot->>'date' AS delivery FROM plugin_procurement_event_fact WHERE binding=$1
    AND event->>'type'='procurement.quote.revised' AND event->>'schemaVersion'='1' AND snapshot->>'series'=$2 ORDER BY seq DESC LIMIT 1`,
    [route.binding, origin.series]
  )
  if (input.action === 'inspect')
    return {
      risk: { id: risk.id, title: risk.title, description: risk.description },
      caseStatus: c.status,
      currentQuote: latest?.source === origin.source,
      deliveryDate: latest?.delivery ?? null,
      replyNote: timer?.replyNote ?? null,
      state: timer?.state ?? 'unscheduled',
      wakeStatus: timer?.wakeStatus ?? null,
      version: timer?.version ?? 0,
      dueAt: timer?.dueAt ?? null
    }
  if ((timer?.version ?? 0) !== input.expectedVersion) throw new ConflictException('follow_up_version_changed')
  const now = new Date()
  if (input.action === 'set') {
    const due = new Date(input.dueAt ?? '')
    if (!Number.isFinite(due.getTime()) || due <= now) throw new BadRequestException('future_deadline_required')
    const conversationId = timer?.conversationId ?? scope.conversationId ?? origin.conversation
    const threadId = timer ? timer.threadId : (scope.threadId ?? null)
    if (!conversationId) throw new BadRequestException('follow_up_conversation_required')
    if (c.status === 'completed' || latest?.source !== origin.source || timer?.state === 'answered')
      throw new ConflictException('follow_up_no_longer_applicable')
    return tx.save(QuoteFollowUp, {
      riskId: input.riskId,
      caseId: input.caseId,
      binding: route.binding,
      bindingRevision: route.revision,
      quoteSource: origin.source,
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
