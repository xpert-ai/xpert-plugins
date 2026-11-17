import { Entity, Column, PrimaryColumn, Index, CreateDateColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import type { Order } from './domain.js'
import type { EvolutionPublicationReceipt } from '@xpert-ai/contracts'
import type { StepKey } from './process.js'
@Entity(pluginArtifactTableName('ev_motor', 'orders'))
@Index(['tenantId', 'organizationId', 'ownerId'])
export class MotorOrder {
  @PrimaryColumn('uuid') id!: string
  @Column('uuid') tenantId!: string
  @Column('uuid') organizationId!: string
  @Column('uuid') ownerId!: string
  @Column('uuid') coordinatorId!: string
  @Column('uuid', { unique: true }) projectId!: string
  @Column('jsonb') data!: Order
  @Column('jsonb', { default: {} }) assistants!: Record<string, string>
  @Column('uuid', { nullable: true }) instanceId!: string | null
  @Column('varchar', { nullable: true }) changeId!: string | null
  @Column('jsonb', { nullable: true }) evolutionReceipt!: EvolutionPublicationReceipt | null
  @CreateDateColumn() createdAt!: Date
}
@Entity(pluginArtifactTableName('ev_motor', 'work'))
@Index(['tenantId', 'organizationId', 'caseId'])
export class MotorWork {
  @PrimaryColumn('uuid') id!: string
  @Column('uuid') tenantId!: string
  @Column('uuid') organizationId!: string
  @Column('uuid') caseId!: string
  @Column('varchar') node!: StepKey
  @Column('uuid') assistantId!: string
  @Column('uuid') executionId!: string
  @Column('uuid') conversationId!: string
  @Column('varchar') inputDigest!: string
  @Column('uuid') roundId!: string
  @Column('int') generation!: number
  @Column('text', { nullable: true }) assessment!: string | null
}
