import { ConflictException, ForbiddenException } from '@nestjs/common'
import {
  Column,
  CreateDateColumn,
  Entity,
  EntityManager,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn
} from 'typeorm'
import { agentEventDecisionSchema, pluginAgentEventSchema } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { QuoteEventFact, digestSnapshot } from './event-journal.js'
import type { ProcurementScope } from './types.js'

/** Version 1 journal snapshot of one supplier quotation revision, including the previous delivery commitment. */
export const quoteFact = z
  .object({
    caseId: z.string().uuid(),
    series: z.string().uuid(),
    quote: z.string().uuid(),
    revision: z.number().int().positive(),
    digest: z.string(),
    date: z.string().nullable(),
    previous: z.object({ revision: z.number(), date: z.string().nullable() }).nullable(),
    documentId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
    extraction: z.unknown()
  })
  .strict()

/** Immutable due occurrence. The timer version identifies this wake and quoteSource identifies its quote revision. */
export const timerFact = z
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

/** A reminder published to the case owner’s workbench for one risk and quote revision. */
@Entity('plugin_procurement_delivery_check')
@Index(['tenantId', 'organizationId', 'caseId', 'riskId', 'series', 'revision', 'actionKind'], { unique: true })
export class DeliveryCheck {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column('uuid') tenantId!: string
  @Column('uuid') organizationId!: string
  @Column('uuid') caseId!: string
  @Column('uuid') riskId!: string
  @Column('uuid') series!: string
  @Column('integer') revision!: number
  @Column('varchar') actionKind!: 'publish_delivery_check'
  @Column('uuid') publishedFor!: string
  @CreateDateColumn({ type: 'timestamptz' }) publishedAt!: Date
}

/** Associates each due receipt with its published reminder. Multiple receipts can reference the same reminder. */
@Entity('plugin_procurement_delivery_check_receipt')
export class DeliveryCheckReceipt {
  @PrimaryColumn('uuid') receiptId!: string
  @Column('uuid') checkId!: string
  @ManyToOne(() => DeliveryCheck, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'checkId' })
  check!: DeliveryCheck
}

/** Journal evidence for the quote that created a risk and the newest potentially relevant revision. */
export interface RiskQuoteFacts {
  origin: Pick<QuoteEventFact, 'source' | 'event' | 'snapshot'>
  latest: RiskQuoteFacts['origin'] | null
}

/** A later revision supersedes the origin only when both facts can be verified for the same series. */
export type QuoteVersionStatus = 'current' | 'superseded' | 'unverified'

/** Shared relation for workbench reads and transactional tool commands. Callers filter by binding and risk. */
export const riskQuoteFactsSql = `
  SELECT f.binding, f.seq, f.decision->>'operationKey' AS operation_key, f.decision->'resultRef'->>'key' AS risk_key,
    f.snapshot->>'series' AS series, f.snapshot->>'revision' AS revision,
    jsonb_build_object('source', f.source, 'event', f.event, 'snapshot', f.snapshot) AS origin, to_jsonb(latest) AS latest
  FROM plugin_procurement_event_fact f
  LEFT JOIN LATERAL (
    SELECT newer.source, newer.event, newer.snapshot FROM plugin_procurement_event_fact newer
    WHERE newer.binding=f.binding AND newer.event->>'type'='procurement.quote.revised'
      AND (newer.snapshot->>'series'=f.snapshot->>'series' OR newer.snapshot->>'series' IS NULL)
    ORDER BY newer.seq DESC LIMIT 1
  ) latest ON true
  WHERE f.event->>'type'='procurement.quote.revised' AND f.decision->>'status'='handled'
    AND f.decision->'resultRef'->>'kind'='procurement-risk'`

function verifiedQuote(row: RiskQuoteFacts['origin'] | null | undefined, caseId: string) {
  if (!row) return null
  const event = pluginAgentEventSchema.safeParse(row.event)
  const fact = quoteFact.safeParse(row.snapshot)
  if (!event.success || !fact.success) return null
  const envelope = event.data
  const snapshot = fact.data
  if (
    envelope.type !== 'procurement.quote.revised' ||
    envelope.schemaVersion !== 1 ||
    envelope.subject.kind !== 'comparison-case' ||
    envelope.subject.key !== caseId ||
    snapshot.caseId !== caseId ||
    envelope.sourceEventId !== row.source ||
    envelope.fact.key !== row.source ||
    envelope.fact.revision !== String(snapshot.revision) ||
    envelope.fact.sha256 !== digestSnapshot(row.snapshot)
  )
    return null
  return snapshot
}

/** An unidentifiable newer series may belong to this risk. Only a verified current revision permits a new publication. */
export function resolveRiskQuote(facts: RiskQuoteFacts | undefined, caseId: string) {
  const expected = verifiedQuote(facts?.origin, caseId)
  const current = verifiedQuote(facts?.latest, caseId)
  let status: QuoteVersionStatus = 'unverified'
  if (facts?.latest && expected && current && expected.series === current.series)
    status = facts.origin.source === facts.latest.source ? 'current' : 'superseded'
  return { expected, current, status }
}

/** Historical publication remains visible to its recipient even if the latest revision cannot be verified. */
export function workbenchPublication(
  version: QuoteVersionStatus,
  deliveryCheckVersion: number | null | undefined,
  hasReminder: boolean,
  visibleReminderId: string | null
) {
  if (visibleReminderId) return 'published'
  if (hasReminder || version === 'unverified' || deliveryCheckVersion !== 1) return 'unknown'
  return 'unpublished'
}

export async function verifiedDeadline(
  tx: EntityManager,
  scope: ProcurementScope,
  route: { binding: string; revision: number },
  caseId: string,
  riskId: string,
  quoteSource?: string
) {
  if (!scope.eventReceiptId || !scope.assistantId || !scope.conversationId)
    throw new ForbiddenException('follow_up_event_required')
  const row = await tx.findOneBy(QuoteEventFact, { binding: route.binding, receipt: scope.eventReceiptId })
  const event = pluginAgentEventSchema.safeParse(row?.event)
  const fact = timerFact.safeParse(row?.snapshot)
  const outcome = agentEventDecisionSchema.safeParse(row?.decision)
  if (!row || !event.success || !fact.success || !outcome.success)
    throw new ForbiddenException('follow_up_event_mismatch')
  const envelope = event.data
  const snapshot = fact.data
  const result = outcome.data
  if (
    envelope.type !== 'procurement.follow_up.due' ||
    envelope.schemaVersion !== 1 ||
    envelope.bindingRevision !== route.revision ||
    envelope.subject.kind !== 'comparison-case' ||
    envelope.subject.key !== caseId ||
    envelope.sourceEventId !== row.source ||
    envelope.fact.key !== riskId ||
    envelope.fact.revision !== String(snapshot.version) ||
    envelope.fact.sha256 !== digestSnapshot(row.snapshot) ||
    result.status !== 'handled' ||
    result.operationKey !== row.source ||
    result.resultRef?.kind !== 'procurement-follow-up' ||
    result.resultRef.key !== riskId ||
    snapshot.caseId !== caseId ||
    snapshot.riskId !== riskId ||
    (quoteSource !== undefined && snapshot.quoteSource !== quoteSource) ||
    snapshot.conversationId !== scope.conversationId ||
    (snapshot.threadId && snapshot.threadId !== scope.threadId)
  )
    throw new ForbiddenException('follow_up_event_mismatch')
  return snapshot
}

/** Business identity shared by all attempts to publish the same reminder, including across workers and bindings. */
export type CheckKey = Pick<
  DeliveryCheck,
  'tenantId' | 'organizationId' | 'caseId' | 'riskId' | 'series' | 'revision' | 'actionKind'
>

export async function publishDeliveryCheck(tx: EntityManager, key: CheckKey, userId: string, receiptId: string) {
  // The caller holds the case lock. The unique index also protects writers on other instances.
  const inserted = await tx
    .createQueryBuilder()
    .insert()
    .into(DeliveryCheck)
    .values({ ...key, publishedFor: userId })
    .orIgnore()
    .returning('id')
    .execute()
  const check = await tx.findOneByOrFail(DeliveryCheck, key)
  if (check.publishedFor !== userId) throw new ConflictException('delivery_check_audience_changed')
  await linkCheckReceipt(tx, receiptId, check.id)
  return {
    status: inserted.raw.length ? 'published' : 'already_published',
    reminderId: check.id,
    quoteRevision: key.revision
  }
}

export async function linkCheckReceipt(tx: EntityManager, receiptId: string, checkId: string) {
  await tx.createQueryBuilder().insert().into(DeliveryCheckReceipt).values({ receiptId, checkId }).orIgnore().execute()
  const link = await tx.findOneByOrFail(DeliveryCheckReceipt, { receiptId })
  if (link.checkId !== checkId) throw new ConflictException('follow_up_result_mismatch')
}
