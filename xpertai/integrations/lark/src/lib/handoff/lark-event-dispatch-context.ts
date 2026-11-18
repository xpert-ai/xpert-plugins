import { ForbiddenException } from '@nestjs/common'
import type { LarkEventCardAccess, LarkEventCardTarget } from '../lark-event-card-access.service.js'
import { In, type EntityManager } from 'typeorm'
import { LarkTriggerBindingEntity } from '../entities/lark-trigger-binding.entity.js'
import { journal } from '../event-journal.js'
import { LarkEventDispatch } from '../lark-event-ingress.js'
import type { LarkEventDispatchRef } from '../types.js'

/** Destination and trusted execution scope of the worker handling these persisted intents. */
type DispatchScope = Pick<LarkEventCardTarget, 'chatId' | 'scopeKey'> & {
  integrationId: string
  xpertId: string
  tenantId?: string
  organizationId?: string
}

/** Claim before the first Feishu card or Handoff send. Never repeat a send with an uncertain outcome. */
export async function submitLarkEventHandoff(
  db: EntityManager,
  refs: LarkEventDispatchRef[],
  scope: DispatchScope,
  cards: LarkEventCardAccess,
  send: (runId: string, beforeSend: (responseCardId?: string) => Promise<void>) => Promise<string | undefined>
): Promise<void> {
  const { tenantId, organizationId, integrationId, xpertId } = scope
  if (!tenantId || !organizationId || !refs.length) throw new Error('lark_dispatch_scope_changed')
  const ids = [...new Set(refs.map((ref) => ref.id))].sort()
  const runId = 'lark-chat-event-' + ids[0]
  const owned = await db.transaction(async (tx) => {
    const route = await journal!.route(tx, { tenantId, organizationId, ref: integrationId })
    if (!route || refs.some((ref) => ref.binding !== route.binding || ref.revision !== route.revision))
      throw new Error('lark_dispatch_scope_changed')
    const trigger = await tx.findOneBy(LarkTriggerBindingEntity, { tenantId, organizationId, integrationId, xpertId })
    if (
      !trigger ||
      trigger.config?.enabled === false ||
      refs.some((ref) => ref.xpertId !== xpertId || ref.ownerId !== trigger.createdById)
    )
      throw new Error('lark_dispatch_scope_changed')

    const where = { id: In(ids), binding: route.binding, revision: route.revision }
    const rows = await tx.find(LarkEventDispatch, { where, lock: { mode: 'pessimistic_write' }, order: { id: 'ASC' } })
    if (rows.length !== ids.length) throw new Error('lark_intent_expired')
    if (rows.every((row) => row.handoffRunId === runId && ['dispatching', 'submitted'].includes(row.state))) return null
    if (rows.some((row) => row.state === 'outcome_unknown')) throw new Error('lark_dispatch_outcome_unknown')
    if (rows.some((row) => row.handoffRunId || !['started', 'submitted'].includes(row.state)))
      throw new Error('lark_dispatch_conflict')
    await tx.update(LarkEventDispatch, where, { state: 'dispatching', handoffRunId: runId })
    return { rows, ownerId: trigger.createdById }
  })
  if (!owned) return

  const claimed = { id: In(ids), handoffRunId: runId }
  let sending = false
  const cardRows = owned.rows.filter((row) => row.kind === 'card')
  let accessDenied = false
  const verifyCards = async (responseCardId?: string) => {
    for (const row of cardRows) {
      const access = await cards.resolve(
        {
          tenantId,
          organizationId,
          xpertId,
          sourceBindingRef: integrationId,
          userId: owned.ownerId
        },
        row.snapshot,
        { chatId: scope.chatId, scopeKey: scope.scopeKey, responseCardId }
      )
      if (!access) {
        accessDenied = true
        throw new ForbiddenException('card_access_changed')
      }
    }
  }
  try {
    await verifyCards()
    const conversationId = await send(runId, async (responseCardId) => {
      // A response card posted by this attempt can become active before the Handoff is submitted.
      // Keep checking the actor and target even after that first external send.
      await verifyCards(sending ? responseCardId : undefined)
      sending = true
    })
    // A positive acknowledgement can resolve a slow send already flagged by the sweeper.
    await db.update(LarkEventDispatch, claimed, { state: 'submitted', conversationId: conversationId ?? null })
  } catch (error) {
    if (accessDenied) {
      // The merged payload is inseparable. None of its intents may authorize a later replay.
      await db.update(LarkEventDispatch, claimed, { state: 'blocked', handoffRunId: sending ? runId : null })
    } else if (sending) {
      await db.update(LarkEventDispatch, { ...claimed, state: 'dispatching' }, { state: 'outcome_unknown' })
    } else {
      // No card or Handoff send began. Restore each member of a merged job to its prior state.
      await db.transaction(async (tx) => {
        for (const { id, state } of owned.rows) {
          await tx.update(
            LarkEventDispatch,
            { id, handoffRunId: runId, state: In(['dispatching', 'outcome_unknown']) },
            { state, handoffRunId: null }
          )
        }
      })
    }
    throw error
  }
}
