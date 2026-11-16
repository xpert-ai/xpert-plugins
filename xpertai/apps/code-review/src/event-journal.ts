import { Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'
import * as sdk from '@xpert-ai/plugin-sdk'
import type { EventDecision, PluginAgentEvent } from '@xpert-ai/plugin-sdk'

export const digestSnapshot = (value: unknown) => sdk.agentEventDigest(value)

// An older SDK keeps the plugin on its existing ingestion path.
export const eventSource = (key: string): ClassDecorator => sdk.AgentEventSourceStrategy?.(key) ?? (() => {})
export const journal = sdk.PluginEventJournal ? new sdk.PluginEventJournal('plugin_code_review_event') : undefined

@Entity('plugin_code_review_event_route')
@Index('plugin_code_review_event_origin', ['tenant', 'org', 'ref'], { unique: true })
export class ReviewEventRoute {
  @PrimaryColumn('uuid') binding!: string
  @Column('uuid') tenant!: string
  @Column('uuid') org!: string
  @Column('varchar') ref!: string
  @Column('integer') revision!: number
  @Column('boolean') enabled!: boolean
}

@Entity('plugin_code_review_event_fact')
@Index('plugin_code_review_event_identity', ['binding', 'source'], { unique: true })
@Index('plugin_code_review_event_order', ['binding', 'seq'])
export class ReviewEventFact {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) seq!: string
  @Index('plugin_code_review_event_fact_id', { unique: true }) @Column('uuid') id!: string
  @Column('uuid') binding!: string
  @Column('varchar') source!: string
  @Column('jsonb') event!: PluginAgentEvent
  @Column('jsonb') snapshot!: unknown
  @Column('uuid', { nullable: true }) receipt!: string | null
  @Column('varchar', { nullable: true }) error!: string | null
  @Column('jsonb', { nullable: true }) decision!: EventDecision | null
  @Column('bigint', { nullable: true }) fence!: string | null
}
