import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'
import { ARTIFACT_NAMESPACE, type Draft, type Review, type TicketStatus } from './domain.js'

@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, 'ticket'))
@Index(['tenantId', 'organizationId', 'ownerId', 'createdAt', 'id'])
export class Ticket {
  @PrimaryColumn('uuid')
  declare id: string

  @Column('uuid')
  declare tenantId: string

  @Column('uuid')
  declare organizationId: string

  @Column('uuid')
  declare ownerId: string

  @Column('varchar', { length: 160 })
  declare title: string

  @Column('text')
  declare description: string

  @Column('varchar', { length: 12, default: 'new' })
  declare status: TicketStatus

  @Column('int', { default: 0 })
  declare revision: number

  @Column('jsonb', { nullable: true })
  declare draft: Draft | null

  @Column('jsonb', { nullable: true })
  declare review: Review | null

  @CreateDateColumn()
  declare createdAt: Date

  @Column('timestamptz', { nullable: true })
  declare reviewedAt: Date | null
}
