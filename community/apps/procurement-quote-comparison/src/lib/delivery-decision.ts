import type { AgentEventContext, AgentEventDelivery } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import type { quoteFact } from './delivery-check.js'
import { ForbiddenException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { EntityManager, In, IsNull } from 'typeorm'
import { humanDecisionInputSchema, type HumanDecisionInput, type HumanDecisionResult } from '@xpert-ai/plugin-sdk'
import { ProcurementComparisonCase, ProcurementRiskItem, ProcurementSupplierQuote } from './entities/index.js'
import { DelayDecision, DelayDecisionInput } from './entities/delay-decision.entity.js'
import { digestSnapshot, journal, QuoteEventFact } from './event-journal.js'
import { riskQuoteFactsSql, resolveRiskQuote, type RiskQuoteFacts } from './delivery-check.js'
import { QuoteFollowUp } from './quote-follow-up.js'
import type { ProcurementScope } from './types.js'

export const delayDecided = 'procurement.delivery_delay.decided'
export const delayKind = 'procurement.delivery_delay_decision'
const delayOptions = [
  { key: 'accept_delay', state: 'accepted', replyCommand: '接受本次延期' },
  { key: 'reject_delay', state: 'renegotiate', replyCommand: '不接受本次延期' }
] as const

const require = createRequire(import.meta.url)
const en: Record<string, string> = require('../../remote/locales/en.json')
const zh: Record<string, string> = require('../../remote/locales/zh-Hans.json')
export const delayChoices = delayOptions.map(({ key, replyCommand }) => ({
  key, replyCommand, label: { en_US: en[key], zh_Hans: zh[key] }
}))

/** The case lock orders capture and projection. A late projection never reopens an obsolete quote. */
export async function requestDelayDecision(
  tx: EntityManager,
  ctx: AgentEventContext,
  delivery: AgentEventDelivery,
  riskId: string,
  quote: z.infer<typeof quoteFact>,
  originalDate: string,
  revisedDate: string,
  threadId: string | null
) {
  const [latest] = await tx.query(
    `SELECT source FROM plugin_procurement_event_fact WHERE binding=$1 AND event->>'type'=$2 AND snapshot->>'series'=$3
      ORDER BY seq DESC LIMIT 1`,
    [ctx.bindingId, delivery.event.type, quote.series]
  )
  if (latest?.source !== delivery.event.sourceEventId) return
  const previous = await tx.findOne(DelayDecision, {
    where: { caseId: quote.caseId, series: quote.series },
    order: { revision: 'DESC' }
  })
  const supplier = await tx.findOneByOrFail(ProcurementSupplierQuote, { id: quote.quote, caseId: quote.caseId })
  await tx.insert(DelayDecision, {
    tenantId: ctx.tenantId,
    organizationId: ctx.organizationId,
    caseId: quote.caseId,
    riskId,
    series: quote.series,
    revision: quote.revision,
    buyerId: ctx.userId,
    binding: ctx.bindingId,
    bindingRevision: ctx.bindingRevision,
    supplier: supplier.supplierName,
    originalDate,
    revisedDate,
    replaces: previous?.id ?? null,
    conversationId: quote.conversationId ?? null,
    threadId
  })
}

export async function buyerCase(tx: EntityManager, s: ProcurementScope, caseId: string) {
  if (!s.tenantId || !s.organizationId || !s.workspaceId || !s.userId) return null
  return tx.findOne(ProcurementComparisonCase, {
    where: {
      id: caseId,
      tenantId: s.tenantId,
      organizationId: s.organizationId,
      workspaceId: s.workspaceId,
      projectId: s.projectId ?? IsNull(),
      createdById: s.userId,
      ...(s.assistantId ? { xpertId: s.assistantId } : {})
    },
    lock: { mode: 'pessimistic_write' }
  })
}

export async function configureDecisions(tx: EntityManager, scope: ProcurementScope, caseId: string, enabled: boolean) {
  const c = await buyerCase(tx, scope, caseId)
  if (!c || c.status === 'completed') throw new ForbiddenException('case_access_changed')
  await tx.update(ProcurementComparisonCase, caseId, { delayDecisionsEnabled: enabled })
  if (!enabled)
    await tx.update(DelayDecision, { caseId, state: 'pending' }, { state: 'closed', version: () => 'version + 1' })
}

/** A decision wake reports the committed choice for its own receipt in the buyer's original conversation. */
export async function decisionWakeReply(tx: EntityManager, scope: ProcurementScope, receipt: string, locale: string) {
  const fact = await tx.findOneBy(QuoteEventFact, { receipt })
  if (fact?.event.type !== delayDecided) return null
  const result = fact.decision
  const caseId = fact.event.subject.key
  if (result?.status !== 'handled' || result.resultRef.kind !== 'procurement-decision' ||
      !scope.assistantId || !scope.conversationId || !(await buyerCase(tx, scope, caseId))) {
    throw new ForbiddenException('decision_wake_access_changed')
  }
  const route = await journal!.route(tx, { tenantId: scope.tenantId, organizationId: scope.organizationId!, ref: caseId })
  const row = await tx.findOneBy(DelayDecision, {
    id: result.resultRef.key, caseId, binding: fact.binding, buyerId: scope.userId!,
    conversationId: scope.conversationId
  })
  if (!route?.enabled || route.binding !== fact.binding || route.revision !== fact.event.bindingRevision ||
      !row?.decisionId || row.bindingRevision !== route.revision || row.decidedBy !== scope.userId ||
      (row.threadId !== null && row.threadId !== scope.threadId) ||
      fact.source !== 'decision/' + row.decisionId || fact.event.fact.revision !== String(row.revision) ||
      (row.state !== 'accepted' && row.state !== 'renegotiate')) {
    throw new ForbiddenException('decision_wake_access_changed')
  }
  const accepted = row.state === 'accepted'
  if (locale.toLowerCase().startsWith('zh')) {
    const quote = `${row.supplier}报价修订 ${row.revision}`
    return accepted
      ? `采购人已接受${quote}的延期，确认交期为 ${row.revisedDate}。`
      : `采购人未接受${quote}提出的 ${row.revisedDate} 交期，本次延期需重新协商。`
  }
  const quote = `quote revision ${row.revision} from ${row.supplier}`
  return accepted
    ? `The buyer accepted the delay for ${quote}. The confirmed delivery date is ${row.revisedDate}.`
    : `The buyer declined the proposed delivery date of ${row.revisedDate} for ${quote}. The delay requires renegotiation.`
}

export async function decideDelay(
  tx: EntityManager,
  s: ProcurementScope,
  caseId: string,
  raw: HumanDecisionInput,
  origin: 'workbench' | 'lark',
  binding?: { bindingId: string; bindingRevision: number }
): Promise<HumanDecisionResult> {
  const input = humanDecisionInputSchema.parse(raw)
  const c = await buyerCase(tx, s, caseId)
  if (!c || !journal || !z.string().uuid().safeParse(input.requestId).success) return { status: 'forbidden' }
  const request = await tx.findOne(DelayDecision, {
    where: { id: input.requestId, caseId, tenantId: s.tenantId, organizationId: s.organizationId!, buyerId: s.userId! },
    lock: { mode: 'pessimistic_write' }
  })
  if (!request) return { status: 'forbidden' }
  const route = await journal.route(tx, { tenantId: s.tenantId, organizationId: s.organizationId!, ref: caseId })
  if (
    !route?.enabled ||
    request.binding !== route.binding ||
    request.bindingRevision !== route.revision ||
    (binding && (route.binding !== binding.bindingId || route.revision !== binding.bindingRevision))
  )
    return { status: 'forbidden' }
  const auditKey = { tenantId: s.tenantId, organizationId: s.organizationId!, origin, commandId: input.commandId }
  // Serializes accidental input ID reuse even across two different cases.
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(auditKey)])
  const old = await tx.findOneBy(DelayDecisionInput, auditKey)
  const digest = digestSnapshot(input)
  if (old && old.digest !== digest) return { status: 'conflicting_choice' }
  if (!c.delayDecisionsEnabled || c.status === 'completed') return { status: 'closed' }
  if (old) return old.result
  const result = await apply()
  await tx.insert(DelayDecisionInput, { ...auditKey, requestId: request.id, digest, result })
  return result

  async function apply(): Promise<HumanDecisionResult> {
    const row = request!
    if (row.state === 'closed') return { status: 'closed' }
    if (row.state === 'superseded' || input.sourceRevision !== String(row.revision) || input.requestVersion !== 1)
      return { status: 'stale' }
    const risk = await tx.findOneBy(ProcurementRiskItem, {
      id: row.riskId,
      caseId,
      tenantId: row.tenantId,
      organizationId: row.organizationId
    })
    const option = delayOptions.find(({ key }) => key === input.choice)
    if (risk?.type !== 'delivery_delay' || !option) return { status: 'forbidden' }
    const wanted = option.state
    if (row.decisionId)
      return { status: row.state === wanted ? 'already_recorded' : 'conflicting_choice', decisionId: row.decisionId }
    const [facts] = await tx.query<RiskQuoteFacts[]>(
      `SELECT origin,latest FROM (${riskQuoteFactsSql}) q
      WHERE binding=$1 AND operation_key=$2 AND risk_key=$3`,
      [row.binding, risk.eventOperationKey, risk.id]
    )
    const quote = resolveRiskQuote(facts, caseId)
    if (
      quote.status !== 'current' ||
      quote.current?.revision !== row.revision ||
      quote.current.series !== row.series ||
      quote.current.date !== row.revisedDate ||
      risk.status !== 'pending' ||
      row.version !== input.requestVersion
    )
      return { status: 'stale' }
    const decisionId = randomUUID(),
      decidedAt = new Date()
    await tx.update(DelayDecision, row.id, {
      state: wanted,
      decisionId,
      decidedBy: s.userId,
      decidedAt,
      version: row.version + 1
    })
    await tx.update(
      QuoteFollowUp,
      { binding: row.binding, riskId: row.riskId, state: In(['waiting', 'captured', 'fired']) },
      { state: 'cancelled', version: () => 'version + 1' }
    )
    const source = 'decision/' + decisionId
    await journal!.capture(
      tx,
      route!,
      {
        sourceEventId: source,
        type: delayDecided,
        schemaVersion: 1,
        occurredAt: decidedAt.toISOString(),
        subject: { kind: 'comparison-case', key: caseId }
      },
      {
        caseId,
        requestId: row.id,
        decisionId,
        state: wanted,
        conversationId: row.conversationId,
        threadId: row.threadId
      },
      source,
      String(row.revision)
    )
    return { status: 'recorded', decisionId }
  }
}
