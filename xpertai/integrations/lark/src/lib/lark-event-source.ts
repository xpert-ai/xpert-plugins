import { LessThanOrEqual, type QueryDeepPartialEntity } from 'typeorm'
import type { IIntegration } from '@xpert-ai/contracts'
import { Inject, Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { z } from 'zod/v3'
import {
  type AgentEventContext,
  type AgentEventPublisher,
  type AgentEventDelivery,
  type EventDecision,
  type PluginAgentEventSource,
  type PluginContext,
  IntegrationPermissionService,
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  runWithRequestContext
} from '@xpert-ai/plugin-sdk'
import { eventSource, journal, LarkEventRoute } from './event-journal.js'
import { LARK_PLUGIN_CONTEXT } from './tokens.js'
import { LarkChannelStrategy } from './lark-channel.strategy.js'
import { LarkConversationService } from './conversation.service.js'
import { LarkInboundIdentityService } from './lark-inbound-identity.service.js'
import type { TIntegrationLarkOptions } from './types.js'

import { larkEventDispatch } from './handoff/lark-event-dispatch-context.js'
import { LarkMessageLogEntity } from './entities/lark-message-log.entity.js'
import { LarkEventDispatch, LarkEventIngress, card } from './lark-event-ingress.js'
const key = 'lark.inbound'

const category = {
  key: 'lark',
  label: { en_US: 'Feishu messages', zh_Hans: '飞书消息' },
  icon: { type: 'font', value: 'send' }
} as const

@Injectable()
@eventSource(key)
export class LarkEventSource implements PluginAgentEventSource {
  readonly key = key
  readonly protocolVersion = 1
  readonly eventTypes = [
    {
      type: 'lark.message.received',
      schemaVersion: 1,
      display: {
        category,
        label: { en_US: 'Incoming message', zh_Hans: '飞书入站消息' },
        icon: { type: 'font', value: 'message-square' }
      }
    },
    {
      type: 'lark.card.action',
      schemaVersion: 1,
      display: {
        category,
        label: { en_US: 'Card action', zh_Hans: '卡片操作' },
        icon: { type: 'font', value: 'mouse-pointer' }
      }
    }
  ] as const
  constructor(
    private readonly ingress: LarkEventIngress,
    private readonly channel: LarkChannelStrategy,
    private readonly conversation: LarkConversationService,
    private readonly identity: LarkInboundIdentityService,
    @Inject(LARK_PLUGIN_CONTEXT) private readonly plugin: PluginContext
  ) {}
  private async bound(ctx: AgentEventContext) {
    const row = await this.ingress.bindings.findOneBy({
      integrationId: ctx.sourceBindingRef,
      xpertId: ctx.xpertId,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId
    })
    if (!row || row.config?.enabled === false || row.createdById !== ctx.userId)
      throw new ForbiddenException('lark_binding_changed')
    return row
  }
  async configure(ctx: AgentEventContext, enabled: boolean) {
    await this.bound(ctx)
    await this.ingress.bindings.manager.transaction((tx) => journal!.configure(tx, ctx, enabled))
  }
  async drain(ctx: AgentEventContext, publisher: AgentEventPublisher, limit: number) {
    await this.bound(ctx)
    const db = this.ingress.bindings.manager
    const result = await journal!.drain(db, ctx, publisher, limit)
    // An interrupted network call may already have reached Lark. Preserve it for reconciliation.
    await db.query(
      `UPDATE plugin_lark_event_dispatch SET state='outcome_unknown', "updatedAt"=now()
       WHERE binding=$1 AND revision=$2 AND state='started' AND "updatedAt"<now()-interval '5 minutes'`,
      [ctx.bindingId, ctx.bindingRevision]
    )
    const route = await db.findOneBy(LarkEventRoute, {
      binding: ctx.bindingId,
      revision: ctx.bindingRevision,
      tenant: ctx.tenantId,
      org: ctx.organizationId,
      ref: ctx.sourceBindingRef
    })
    if (!route) return result
    const intents = await db.find(LarkEventDispatch, {
      where: {
        binding: ctx.bindingId,
        revision: ctx.bindingRevision,
        state: 'pending',
        due: LessThanOrEqual(new Date())
      },
      order: { due: 'ASC', id: 'ASC' },
      take: limit
    })
    for (const intent of intents) {
      ctx.signal.throwIfAborted()
      try {
        await this.deliver(ctx, intent, route)
      } catch (error) {
        // Before claiming 'started' there is no external send to reconcile.
        const denied = error instanceof ForbiddenException || error instanceof UnauthorizedException
        await this.updatePending(route, intent.id, {
          attempts: () => 'attempts+1',
          state: denied ? 'blocked' : () => "CASE WHEN attempts>=9 THEN 'blocked' ELSE 'pending' END",
          due: () => "now()+least(300,5*power(2,least(attempts,6)))*interval '1 second'"
        })
      }
    }
    return result
  }
  async describe(
    ctx: AgentEventContext,
    event: AgentEventDelivery['event'],
    decision: EventDecision | null,
    options?: { includeConversation: boolean }
  ) {
    if (!options?.includeConversation || decision?.status !== 'handled' || decision.resultRef?.kind !== 'lark-dispatch') return null
    await this.bound(ctx)
    const dispatch = await this.ingress.bindings.manager.findOne(LarkEventDispatch, {
      where: {
        id: decision.resultRef.key,
        binding: ctx.bindingId,
        revision: event.bindingRevision,
        operation: decision.operationKey,
        state: 'submitted'
      },
      select: { conversationId: true, handoffRunId: true }
    })
    if (!dispatch) return null
    // New chats get a conversation ID in the callback; resumed chats already have it at dispatch.
    const callback = dispatch.handoffRunId
      ? await this.ingress.bindings.manager.findOne(LarkMessageLogEntity, {
          where: {
            tenantId: ctx.tenantId,
            organizationId: ctx.organizationId,
            integrationId: ctx.sourceBindingRef,
            xpertId: ctx.xpertId,
            direction: 'outbound',
            runId: dispatch.handoffRunId
          },
          select: { conversationId: true, status: true }
        })
      : null
    if (callback && callback.status !== 'sent') return null
    const conversationId = callback?.conversationId ?? dispatch.conversationId
    return conversationId ? { title: event.subject.key, conversation: { conversationId } } : null
  }
  async handle(ctx: AgentEventContext, delivery: AgentEventDelivery): Promise<EventDecision> {
    await this.bound(ctx)
    return this.ingress.bindings.manager.transaction((tx) =>
      journal!.decide(tx, ctx, delivery, async (snapshot) => {
        const isCard = delivery.event.type === 'lark.card.action'
        const operation = isCard ? 'card/' + card.parse(snapshot).context.open_message_id : delivery.event.sourceEventId
        const store = tx.getRepository(LarkEventDispatch)
        // One immutable dispatch intent per source message or original interactive card.
        if (isCard && !(await this.authorizedCard(ctx, card.parse(snapshot))))
          return { status: 'blocked', reasonCode: 'card_access_changed' }
        const current = await store.findOneBy({ binding: ctx.bindingId, operation })
        if (current)
          return { status: 'handled', operationKey: operation, resultRef: { kind: 'lark-dispatch', key: current.id } }
        const intent = await store.save(
          store.create({
            binding: ctx.bindingId,
            revision: ctx.bindingRevision,
            operation,
            kind: isCard ? 'card' : 'message',
            snapshot,
            state: 'pending'
          })
        )
        return { status: 'handled', operationKey: operation, resultRef: { kind: 'lark-dispatch', key: intent.id } }
      })
    )
  }
  private integration(ctx: AgentEventContext) {
    return this.plugin
      .resolve<IntegrationPermissionService>(INTEGRATION_PERMISSION_SERVICE_TOKEN)
      .read<IIntegration<TIntegrationLarkOptions>>(ctx.sourceBindingRef, { relations: ['tenant'] })
  }
  private async authorizedCard(ctx: AgentEventContext, c: z.infer<typeof card>) {
    const integration = await this.integration(ctx)
    if (!integration || integration.tenantId !== ctx.tenantId || integration.organizationId !== ctx.organizationId)
      return false
    // Authorization of an existing card only consults an existing account mapping.
    const actor = await this.identity.resolveInboundIdentityForEvent(
      { ...integration, options: { ...integration.options, userProvision: undefined } },
      { event_type: 'card.action.trigger', event: c }
    )
    if (!actor.mappedUser || actor.mappedUser.id !== ctx.userId) return false
    const binding = await this.conversation.getLatestConversationBindingByChatId(integration.id, c.context.open_chat_id)
    if (
      !binding ||
      binding.xpertId !== ctx.xpertId ||
      binding.organizationId !== ctx.organizationId ||
      !binding.scopeKey
    )
      return false
    const active = await this.conversation.getActiveMessage(binding.scopeKey, ctx.xpertId)
    return !!active && active.thirdPartyMessage?.messageId === c.context.open_message_id
  }
  private updatePending(
    scanned: LarkEventRoute,
    id: string,
    update: Pick<QueryDeepPartialEntity<LarkEventDispatch>, 'state' | 'attempts' | 'due'>
  ) {
    return this.ingress.bindings.manager.transaction(async (tx) => {
      // Share configure()'s transaction lock until the intent transition commits.
      const route = await journal!.route(tx, { tenantId: scanned.tenant, organizationId: scanned.org, ref: scanned.ref })
      // A fresh worker can drain already-owned intents after a capture-only rollback.
      if (!route || route.binding !== scanned.binding || route.revision !== scanned.revision || route.enabled !== scanned.enabled)
        return false
      const result = await tx.update(LarkEventDispatch, { id, binding: route.binding, revision: route.revision, state: 'pending' }, update)
      return !!result.affected
    })
  }
  private async deliver(ctx: AgentEventContext, intent: LarkEventDispatch, scannedRoute: LarkEventRoute) {
    const db = this.ingress.bindings.manager
    const integration = await this.integration(ctx)
    if (!integration || integration.tenantId !== ctx.tenantId || integration.organizationId !== ctx.organizationId)
      throw new ForbiddenException()
    const eventCtx = { integration, tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    const actor = await this.identity.resolveInboundIdentityForEvent(integration, {
      event_type: intent.kind === 'card' ? 'card.action.trigger' : 'im.message.receive_v1',
      event: intent.snapshot
    })
    if (intent.kind === 'card' && !(await this.authorizedCard(ctx, card.parse(intent.snapshot)))) {
      await this.updatePending(scannedRoute, intent.id, { state: 'blocked' })
      return
    }
    await new Promise<void>((resolve, reject) =>
      runWithRequestContext(
        {
          user: actor.requestUser,
          headers: {
            'organization-id': ctx.organizationId,
            'tenant-id': ctx.tenantId
          }
        },
        {},
        () => {
          const work = async () => {
            await this.bound(ctx)
            let dispatch: () => Promise<unknown>
            if (intent.kind === 'card') {
              const action = this.channel.parseCardAction(intent.snapshot, eventCtx)
              if (!action) throw new Error('invalid_card')
              dispatch = () => this.conversation.handleCardAction(action, eventCtx)
            } else {
              const message = this.channel.parseInboundMessage(intent.snapshot, eventCtx)
              if (!message) throw new Error('invalid_message')
              if (message.chatType === 'group')
                Object.assign(message, {
                  isBotMentioned: this.channel.isBotMentioned(
                    message,
                    (await this.channel.getBotInfo(integration)).id
                  )
                })
              dispatch = () => this.conversation.handleMessage(message, eventCtx)
            }
            ctx.signal.throwIfAborted()
            if (!(await this.updatePending(scannedRoute, intent.id, { state: 'started' }))) return
            try {
              await dispatch()
              await db.update(LarkEventDispatch, { id: intent.id, state: 'started' }, { state: 'submitted' })
            } catch {
              await db.update(LarkEventDispatch, { id: intent.id, state: 'started' }, { state: 'outcome_unknown' })
            }
          }
          larkEventDispatch
            .run(
              {
                integrationId: integration.id,
                xpertId: ctx.xpertId,
                runId: 'lark-chat-event-' + intent.id,
                record: async (handoffRunId, conversationId) => {
                  const saved = await db.update(
                    LarkEventDispatch,
                    { id: intent.id, state: 'started' },
                    { handoffRunId, conversationId: conversationId ?? null }
                  )
                  if (!saved.affected) throw new Error('lark_intent_expired')
                }
              },
              work
            )
            .then(resolve, reject)
        }
      )
    )
  }
}
