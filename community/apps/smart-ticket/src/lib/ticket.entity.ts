import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import type { TicketCategory, TicketPriority, TicketSentiment, TicketStatus } from './domain/contracts.js'

export abstract class OwnedRecord {
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) xpertId!: string
}

@Entity('plugin_smart_ticket_record')
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId'])
@Index(['status'])
export class TicketRecord extends OwnedRecord {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  @Column({ type: 'varchar', length: 255 })
  title!: string

  @Column({ type: 'text' })
  rawContent!: string

  @Column({ type: 'varchar', length: 64 })
  category!: TicketCategory

  @Column({ type: 'varchar', length: 16 })
  priority!: TicketPriority

  @Column({ type: 'varchar', length: 32 })
  sentiment!: TicketSentiment

  @Column({ type: 'text' })
  summary!: string

  @Column({ type: 'text' })
  suggestedReply!: string

  @Column({ type: 'varchar', length: 32, default: 'pending_review' })
  status!: TicketStatus

  @Column({ type: 'varchar', length: 64, nullable: true })
  failureCode!: string | null

  @Column({ type: 'int', default: 0 })
  retryCount!: number

  @Column({ type: 'int', default: 1 })
  revision!: number

  @Column({ type: 'varchar', length: 64 })
  createdAt!: string

  @Column({ type: 'varchar', length: 64 })
  updatedAt!: string
}
