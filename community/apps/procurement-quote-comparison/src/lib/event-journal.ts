import { Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'
import * as sdk from '@xpert-ai/plugin-sdk'
import type { EventDecision, PluginAgentEvent } from '@xpert-ai/plugin-sdk'

// An older SDK keeps the plugin on its existing ingestion path.
export const eventSource = (key: string): ClassDecorator => sdk.AgentEventSourceStrategy?.(key) ?? (() => {})
export const journal = sdk.PluginEventJournal ? new sdk.PluginEventJournal('plugin_procurement_event') : undefined

@Entity('plugin_procurement_event_route')
@Index(['tenant', 'org', 'ref'], { unique: true })
export class QuoteEventRoute {
  @PrimaryColumn('uuid') binding!: string
  @Column('uuid') tenant!: string
  @Column('uuid') org!: string
  @Column('varchar') ref!: string
  @Column('integer') revision!: number
  @Column('boolean') enabled!: boolean
}

/** Immutable source snapshot and its durable inbox receipt and handling decision, scoped to a binding. */
@Entity('plugin_procurement_event_fact')
@Index(['binding', 'receipt'], { where: '"receipt" IS NOT NULL' })
@Index(['binding', 'source'], { unique: true })
@Index(['binding', 'seq'])
export class QuoteEventFact {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) seq!: string
  @Index({ unique: true }) @Column('uuid') id!: string
  @Column('uuid') binding!: string
  @Column('varchar') source!: string
  @Column('jsonb') event!: PluginAgentEvent
  @Column('jsonb') snapshot!: unknown
  @Column('uuid', { nullable: true }) receipt!: string | null
  @Column('varchar', { nullable: true }) error!: string | null
  @Column('jsonb', { nullable: true }) decision!: EventDecision | null
  @Column('bigint', { nullable: true }) fence!: string | null
}

// A second document can confirm an existing revision without producing a new fact.
@Entity('plugin_procurement_event_parse')
export class QuoteEventParse {
  @PrimaryColumn('uuid') binding!: string
  @PrimaryColumn('uuid') documentId!: string
  @PrimaryColumn('varchar', { length: 64 }) digest!: string
}

export const digestSnapshot = (value: unknown) => sdk.agentEventDigest(value)
