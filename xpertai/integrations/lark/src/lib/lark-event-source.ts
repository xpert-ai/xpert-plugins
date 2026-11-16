import { LessThanOrEqual, type QueryDeepPartialEntity } from 'typeorm'
import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import {
  type AgentEventContext,
  type AgentEventPublisher,
  type AgentEventDelivery,
  type EventDecision,
  type PluginAgentEventSource,
  runWithRequestContext
} from '@xpert-ai/plugin-sdk'
import { eventSource, journal, LarkEventRoute } from './event-journal.js'
import { LarkChannelStrategy } from './lark-channel.strategy.js'
import { LarkConversationService } from './conversation.service.js'
import { LarkInboundIdentityService } from './lark-inbound-identity.service.js'

import { LarkEventCardAccess } from './lark-event-card-access.service.js'
import { translate } from './i18n.js'
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
    private readonly cards: LarkEventCardAccess
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
       WHERE binding=$1 AND revision=$2 AND state IN ('started','dispatching') AND "updatedAt"<now()-interval '5 minutes'`,
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
    if (!options?.includeConversation || decision?.status !== 'handled' || decision.resultRef?.kind !== 'lark-dispatch')
      return null
    await this.bound(ctx)
    const dispatch = await this.ingress.bindings.manager.findOne(LarkEventDispatch, {
      where: {
        id: decision.resultRef.key,
        binding: ctx.bindingId,
        revision: event.bindingRevision,
        operation: decision.operationKey,
        state: 'submitted'
      },
      select: { conversationId: true, handoffRunId: true, kind: true, snapshot: true }
    })
    if (!dispatch || event.subject.kind !== 'lark-chat') return null
    const access = dispatch.kind === 'card' ? await this.cards.resolve(ctx, dispatch.snapshot) : null
    if (dispatch.kind === 'card' && access?.chatId !== event.subject.key) return null
    const chat =
      access?.binding ??
      (await this.conversation.getLatestConversationBindingByChatId(ctx.sourceBindingRef, event.subject.key))
    if (!chat?.scopeKey || chat.organizationId !== ctx.organizationId || chat.xpertId !== ctx.xpertId) return null
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
          select: { conversationId: true, status: true, scopeKey: true, chatId: true, messageId: true }
        })
      : null
    if (
      callback &&
      (callback.scopeKey !== chat.scopeKey ||
        (callback.chatId && callback.chatId !== event.subject.key) ||
        (dispatch.conversationId && callback.conversationId && dispatch.conversationId !== callback.conversationId))
    )
      return null
    const delivery =
      callback?.status === 'failed'
        ? 'failed'
        : callback?.status === 'sent' && callback.chatId === event.subject.key && callback.messageId
        ? 'sent'
        : 'unknown'
    const fields = [
      {
        label: { en_US: 'Outbound delivery', zh_Hans: '出站投递' },
        value: translate('integration.Lark.Delivery_' + delivery, { defaultValue: delivery })
      }
    ]
    if (callback && callback.status !== 'sent') return { title: event.subject.key, fields }
    const conversationId = callback?.conversationId ?? dispatch.conversationId
    return { title: event.subject.key, fields, ...(conversationId ? { conversation: { conversationId } } : {}) }
  }
  async handle(ctx: AgentEventContext, delivery: AgentEventDelivery): Promise<EventDecision> {
    await this.bound(ctx)
    return this.ingress.bindings.manager.transaction((tx) =>
      journal!.decide(tx, ctx, delivery, async (snapshot) => {
        const isCard = delivery.event.type === 'lark.card.action'
        const operation = isCard ? 'card/' + card.parse(snapshot).context.open_message_id : delivery.event.sourceEventId
        const store = tx.getRepository(LarkEventDispatch)
        // One immutable dispatch intent per source message or original interactive card.
        if (isCard && !(await this.cards.resolve(ctx, snapshot)))
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
  private updatePending(
    scanned: LarkEventRoute,
    id: string,
    update: Pick<QueryDeepPartialEntity<LarkEventDispatch>, 'state' | 'attempts' | 'due'>
  ) {
    return this.ingress.bindings.manager.transaction(async (tx) => {
      // Share configure()'s transaction lock until the intent transition commits.
      const route = await journal!.route(tx, {
        tenantId: scanned.tenant,
        organizationId: scanned.org,
        ref: scanned.ref
      })
      // A fresh worker can drain already-owned intents after a capture-only rollback.
      if (
        !route ||
        route.binding !== scanned.binding ||
        route.revision !== scanned.revision ||
        route.enabled !== scanned.enabled
      )
        return false
      const result = await tx.update(
        LarkEventDispatch,
        { id, binding: route.binding, revision: route.revision, state: 'pending' },
        update
      )
      return !!result.affected
    })
  }
  private async deliver(ctx: AgentEventContext, intent: LarkEventDispatch, scannedRoute: LarkEventRoute) {
    const db = this.ingress.bindings.manager
    const access = intent.kind === 'card' ? await this.cards.resolve(ctx, intent.snapshot) : null
    if (intent.kind === 'card' && !access) {
      await this.updatePending(scannedRoute, intent.id, { state: 'blocked' })
      return
    }
    const integration = access?.integration ?? (await this.identity.findIntegration(ctx.sourceBindingRef))
    if (!integration || integration.tenantId !== ctx.tenantId || integration.organizationId !== ctx.organizationId)
      throw new ForbiddenException()
    const eventCtx = {
      integration,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      eventDispatchRefs: [
        {
          id: intent.id,
          binding: intent.binding,
          revision: intent.revision,
          xpertId: ctx.xpertId,
          ownerId: ctx.userId
        }
      ]
    }
    const user =
      access?.actor ??
      (
        await this.identity.resolveInboundIdentityForEvent(integration, {
          event_type: 'im.message.receive_v1',
          event: intent.snapshot
        })
      ).requestUser
    await new Promise<void>((resolve, reject) =>
      runWithRequestContext(
        {
          user,
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
                  isBotMentioned: this.channel.isBotMentioned(message, (await this.channel.getBotInfo(integration)).id)
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
          work().then(resolve, reject)
        }
      )
    )
  }
}
