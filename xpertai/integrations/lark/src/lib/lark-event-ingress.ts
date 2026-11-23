import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { IIntegration } from '@xpert-ai/contracts'
import { Repository, Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { z } from 'zod/v3'
import { LarkTriggerBindingEntity } from './entities/lark-trigger-binding.entity.js'
import { journal } from './event-journal.js'
import { unwrapLarkEventPayload } from './lark-message-semantics.js'
import type { TIntegrationLarkOptions } from './types.js'

const text = z.string().min(1).max(256)
const id = z.object({ open_id: text, union_id: text.nullish(), user_id: text.nullish() })
export const msg = z.object({
  sender: z.object({ sender_id: id, sender_type: z.string().nullish() }),
  message: z.object({
    message_id: text,
    chat_id: text,
    chat_type: text,
    message_type: text,
    content: z.string().max(32000),
    create_time: z.string().nullish(),
    root_id: text.nullish(),
    parent_id: text.nullish(),
    thread_id: text.nullish(),
    mentions: z
      .array(
        z.object({
          key: text,
          id: z.object({ open_id: text.nullish(), union_id: text.nullish(), user_id: text.nullish() }),
          name: z.string().nullish(),
          tenant_key: text.nullish(),
        }),
      )
      .max(100)
      .optional(),
  }),
})
export const decisionButton = z.object({
  action: z.literal('human_decision'), interactionId: z.string().uuid(), choice: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)
}).strict()
const cardValue = z.union([text, decisionButton, z.object({ action: text.refine(value => value !== 'human_decision') })])
export const card = z.object({
  operator: id,
  context: z.object({ open_chat_id: text, open_message_id: text }),
  action: z.object({ tag: text, value: cardValue.nullish(), option: cardValue.nullish() })
    .refine((action) => action.value != null || action.option != null),
})

@Entity('plugin_lark_event_dispatch')
@Index(['binding', 'operation'], { unique: true })
@Index(['binding', 'revision', 'state', 'due'])
export class LarkEventDispatch {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column('uuid') binding!: string
  @Column('integer') revision!: number
  @Column('varchar') operation!: string
  @Column('varchar') kind!: string
  @Column('jsonb') snapshot!: unknown
  @Column('varchar', { default: 'pending' }) state!: string
  @Column('integer', { default: 0 }) attempts!: number
  @Column('timestamptz', { default: () => 'CURRENT_TIMESTAMP' }) due!: Date
  @Column('varchar', { nullable: true }) handoffRunId!: string | null
  @Column('varchar', { nullable: true }) conversationId!: string | null
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}

@Injectable()
export class LarkEventIngress {
  constructor(@InjectRepository(LarkTriggerBindingEntity) readonly bindings: Repository<LarkTriggerBindingEntity>) {}
  async capture(
    integration: IIntegration<TIntegrationLarkOptions>,
    kind: 'message' | 'card',
    raw: unknown,
    eventId?: string,
    verifiedDecisionChannel = false,
  ) {
    if (!journal || !integration.tenantId || !integration.organizationId) return false
    return this.bindings.manager.transaction(async (tx) => {
      const route = await journal.route(tx, {
        tenantId: integration.tenantId,
        organizationId: integration.organizationId,
        ref: integration.id,
      })
      if (!route) return false
      const payload = unwrapLarkEventPayload(raw)
      // After rollback, only duplicates of previously host-owned callbacks stay on this path.
      if (!route.enabled) {
        const source = kind + '/' + (kind === 'message' ? payload?.message?.message_id : eventId)
        const [owned] = await tx.query('SELECT 1 FROM plugin_lark_event_fact WHERE binding=$1 AND source=$2', [
          route.binding,
          source,
        ])
        return !!owned
      }
      const m = kind === 'message' ? msg.parse(payload) : null
      const c = kind === 'card' ? card.parse(payload) : null
      const sourceId = kind + '/' + (m?.message.message_id ?? text.parse(eventId))
      const chat = m?.message.chat_id ?? c.context.open_chat_id
      const decisionCandidate = !!m?.message.parent_id || decisionButton.safeParse(c?.action.value).success
      const snapshot = verifiedDecisionChannel && decisionCandidate ? {...(m ?? c), verifiedDecisionChannel:true} : m ?? c
      const type = kind === 'message' ? 'lark.message.received' : 'lark.card.action'
      return journal.capture(
        tx,
        route,
        {
          sourceEventId: sourceId,
          occurredAt: new Date().toISOString(),
          type,
          schemaVersion: 1,
          subject: { kind: 'lark-chat', key: chat },
        },
        snapshot,
        sourceId,
        '1',
      )
    })
  }
}
