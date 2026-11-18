import type { AgentEventContext, AgentOutputReference, AgentOutputSource } from '@xpert-ai/plugin-sdk'
import { IsNull, LessThanOrEqual, Not, Repository } from 'typeorm'
import { DeliveryCheck, resolveRiskQuote, riskQuoteFactsSql, type RiskQuoteFacts } from './delivery-check.js'
import { ProcurementComparisonCase, ProcurementRiskItem } from './entities/index.js'
import { QuoteFollowUp } from './quote-follow-up.js'

const kind = 'procurement.delivery_check'
export function deliveryCheckOutput(cases: Repository<ProcurementComparisonCase>): AgentOutputSource {
  const checks = () => cases.manager.getRepository(DeliveryCheck)
  const scope = (c: AgentEventContext) => ({
    tenantId: c.tenantId,
    organizationId: c.organizationId,
    caseId: c.sourceBindingRef,
    publishedFor: c.userId,
    outputBinding: c.bindingId,
    outputRevision: c.bindingRevision
  })
  const reference = (row: DeliveryCheck): AgentOutputReference => ({
    schemaVersion: 1,
    kind,
    key: row.id,
    revision: String(row.revision),
    recipientId: row.publishedFor,
    publishedAt: row.publishedAt.toISOString()
  })
  return {
    kinds: [{ key: kind, label: { en_US: 'Delivery check', zh_Hans: '采购交期提醒' } }],
    async listPending(c, limit) {
      return (
        await checks().find({
          where: { ...scope(c), outputMessageId: IsNull(), outputAvailableAt: LessThanOrEqual(new Date()) },
          order: { publishedAt: 'ASC', id: 'ASC' },
          take: limit
        })
      ).map(reference)
    },
    async acknowledge(c, ref, messageId) {
      const where = { ...scope(c), id: ref.key, revision: Number(ref.revision) }
      const updated = await checks().update({ ...where, outputMessageId: IsNull() }, { outputMessageId: messageId })
      if (!updated.affected && !(await checks().existsBy({ ...where, outputMessageId: messageId })))
        return 'conflict'
    },
    async defer(c, ref, retryAt) {
      await checks().update(
        { ...scope(c), id: ref.key, revision: Number(ref.revision), outputMessageId: IsNull(),
          outputAvailableAt: retryAt ? LessThanOrEqual(new Date()) : Not(IsNull()) },
        { outputAvailableAt: retryAt ? new Date(retryAt) : null }
      )
    },
    async resolveForRecipient(c, ref) {
      if (ref.kind !== kind || ref.recipientId !== c.userId) return { status: 'forbidden' }
      const parent = await cases.findOneBy({
        id: c.sourceBindingRef,
        tenantId: c.tenantId,
        organizationId: c.organizationId,
        createdById: c.userId,
        xpertId: c.xpertId,
        workspaceId: c.workspaceId,
        projectId: c.projectId ?? IsNull()
      })
      const row = await checks().findOneBy({ ...scope(c), id: ref.key })
      if (!parent || !row || String(row.revision) !== ref.revision) return { status: 'forbidden' }
      const timer = await cases.manager.findOneBy(QuoteFollowUp, {
        riskId: row.riskId,
        caseId: row.caseId,
        binding: c.bindingId
      })
      const risk = await cases.manager.findOneBy(ProcurementRiskItem, { id: row.riskId, caseId: row.caseId })
      if (!timer || !risk || parent.status === 'completed' || !['waiting', 'captured', 'fired'].includes(timer.state))
        return { status: 'superseded' }
      const [facts] = await cases.manager.query<RiskQuoteFacts[]>(
        'SELECT q.origin, q.latest FROM (' +
          riskQuoteFactsSql +
          ') q WHERE q.binding=$1 AND q.operation_key=$2 AND q.risk_key=$3',
        [c.bindingId, risk.eventOperationKey, row.riskId]
      )
      const quote = resolveRiskQuote(facts, row.caseId)
      if (quote.status === 'unverified') return { status: 'unavailable' }
      if (quote.status !== 'current' || quote.current?.series !== row.series || quote.current.revision !== row.revision)
        return { status: 'superseded' }
      return {
        status: 'visible',
        title: (parent.title + ' · ' + risk.title).slice(0, 240),
        conversation: { conversationId: timer.conversationId, ...(timer.threadId ? { threadId: timer.threadId } : {}) }
      }
    }
  }
}
