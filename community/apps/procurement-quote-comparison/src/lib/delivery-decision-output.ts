import { IsNull, LessThanOrEqual, Repository } from 'typeorm'
import type { AgentEventContext, AgentOutputReference, AgentOutputSource } from '@xpert-ai/plugin-sdk'
import { ProcurementComparisonCase } from './entities/index.js'
import { PROCUREMENT_QUOTE_COMPARISON_PROVIDER_KEY, PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY } from './constants.js'
import { DelayDecision } from './entities/delay-decision.entity.js'
import { buyerCase, decideDelay, delayChoices, delayKind } from './delivery-decision.js'

export function withDecisionOutput(
  cases: Repository<ProcurementComparisonCase>,
  reminders: AgentOutputSource
): AgentOutputSource {
  const requests = cases.manager.getRepository(DelayDecision)
  const scope = (c: AgentEventContext) => ({
    tenantId: c.tenantId,
    organizationId: c.organizationId,
    caseId: c.sourceBindingRef,
    buyerId: c.userId,
    binding: c.bindingId,
    bindingRevision: c.bindingRevision
  })
  const refKey = (c: AgentEventContext, ref: AgentOutputReference) => ({
    ...scope(c),
    id: ref.key,
    revision: Number(ref.revision)
  })
  return {
    kinds: [
      ...reminders.kinds,
      { key: delayKind, label: { en_US: 'Buyer delay decision', zh_Hans: '采购人延期决定' } }
    ],
    async listPending(c, limit) {
      const pending = await requests.find({
        where: { ...scope(c), state: 'pending', outputMessageId: IsNull(), availableAt: LessThanOrEqual(new Date()) },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: limit
      })
      const refs: AgentOutputReference[] = pending.map((r) => ({
        schemaVersion: 1,
        kind: delayKind,
        key: r.id,
        revision: String(r.revision),
        recipientId: r.buyerId,
        publishedAt: r.createdAt.toISOString()
      }))
      return refs.length < limit ? refs.concat(await reminders.listPending(c, limit - refs.length)) : refs
    },
    async acknowledge(c, ref, id) {
      if (ref.kind !== delayKind) return reminders.acknowledge(c, ref, id)
      const key = refKey(c, ref)
      const update = await requests.update({ ...key, outputMessageId: IsNull() }, { outputMessageId: id })
      if (!update.affected && !(await requests.existsBy({ ...key, outputMessageId: id }))) return 'conflict'
    },
    async defer(c, ref, at) {
      if (ref.kind !== delayKind) return reminders.defer(c, ref, at)
      await requests.update(
        { ...refKey(c, ref), outputMessageId: IsNull(), availableAt: LessThanOrEqual(new Date()) },
        { availableAt: at ? new Date(at) : null }
      )
    },
    async resolveForRecipient(c, ref) {
      if (ref.kind !== delayKind) return reminders.resolveForRecipient(c, ref)
      if (ref.recipientId !== c.userId) return { status: 'forbidden' }
      return cases.manager.transaction(async (tx) => {
        const parent = await buyerCase(tx, { ...c, assistantId: c.xpertId }, c.sourceBindingRef)
        if (!parent) return { status: 'forbidden' } as const
        const row = await tx.findOneBy(DelayDecision, refKey(c, ref))
        if (!row || row.state === 'superseded' || row.state === 'closed' ||
          (row.state === 'pending' && (parent.status === 'completed' || !parent.delayDecisionsEnabled)))
          return { status: 'superseded' } as const
        const prior =
          row.replaces &&
          (await tx.findOneBy(DelayDecision, {
            id: row.replaces,
            caseId: row.caseId,
            tenantId: row.tenantId,
            organizationId: row.organizationId,
            buyerId: c.userId,
            series: row.series
          }))
        return {
          status: 'visible',
          title: (parent.title + ' · ' + row.supplier).slice(0, 240),
          workbench: {
            state: row.state === 'pending' ? 'pending' : 'handled',
            title: row.state === 'pending' ? { en_US: 'Confirm supplier delay', zh_Hans: '请确认供应商延期' }
              : row.state === 'accepted' ? { en_US: 'Supplier delay accepted', zh_Hans: '已接受本次延期' }
              : { en_US: 'Supplier delay declined', zh_Hans: '未接受本次延期' },
            openLabel: { en_US: 'Open procurement workbench', zh_Hans: '前往采购工作台' },
            viewKey: PROCUREMENT_QUOTE_COMPARISON_PROVIDER_KEY + '__' + PROCUREMENT_QUOTE_COMPARISON_VIEW_KEY,
            selectionId: row.caseId
          },
          ...(row.conversationId
            ? {
                conversation: {
                  conversationId: row.conversationId,
                  ...(row.threadId ? { threadId: row.threadId } : {})
                }
              }
            : {}),
          fields: [
            {
              label: { en_US: 'Delivery date', zh_Hans: '交期变更' },
              value: row.originalDate + ' → ' + row.revisedDate
            },
            { label: { en_US: 'Quote revision', zh_Hans: '报价修订' }, value: String(row.revision) },
            ...(prior
              ? [
                  {
                    label: { en_US: 'Previously proposed', zh_Hans: '上一版提议' },
                    value: 'v' + prior.revision + ' · ' + prior.revisedDate
                  }
                ]
              : [])
          ],
          ...(row.state === 'pending' ? { decision: {
            type: 'human_decision',
            schemaVersion: 1,
            requestVersion: row.version,
            choices: delayChoices
          } } : {})
        } as const
      })
    },
    submitDecision(c, input, origin) {
      return cases.manager.transaction((tx) =>
        decideDelay(tx, { ...c, assistantId: c.xpertId }, c.sourceBindingRef, input, origin, c)
      )
    }
  }
}
