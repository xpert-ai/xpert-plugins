import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  SupportTicketCategory,
  SupportTicketChannel,
  SupportTicketEvent,
  SupportTicketPriority,
  SupportTicketSourceType,
  SupportTicketStatus
} from '../types'

@Entity('plugin_support_ticket')
@Index(['tenantId', 'organizationId', 'status'])
@Index(['tenantId', 'organizationId', 'createdAt'])
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  /** Client generated idempotency key. One submission never produces two tickets. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  requestId?: string

  @Index()
  @Column({ type: 'varchar' })
  ticketNo?: string

  @Index()
  @Column({ type: 'varchar', default: 'processing' })
  status?: SupportTicketStatus

  @Column({ type: 'varchar', default: 'workbench_form' })
  sourceType?: SupportTicketSourceType

  @Column({ type: 'varchar' })
  customerName?: string

  @Column({ type: 'varchar', default: 'email' })
  channel?: SupportTicketChannel

  @Column({ type: 'text' })
  originalMessage?: string

  @Column({ type: 'varchar', nullable: true })
  aiCategory?: SupportTicketCategory

  @Column({ type: 'varchar', nullable: true })
  aiPriority?: SupportTicketPriority

  @Column({ type: 'text', nullable: true })
  aiPriorityReason?: string

  @Column({ type: 'text', nullable: true })
  aiDraftReply?: string

  @Column({ type: 'float', nullable: true })
  aiConfidence?: number

  @Column({ type: 'jsonb', nullable: true })
  aiMissingInfo?: string[]

  @Column({ type: 'jsonb', nullable: true })
  aiRawResult?: unknown

  @Column({ type: 'timestamptz', nullable: true })
  aiProcessedAt?: Date

  @Column({ type: 'varchar', nullable: true })
  confirmedCategory?: SupportTicketCategory

  @Column({ type: 'varchar', nullable: true })
  confirmedPriority?: SupportTicketPriority

  @Column({ type: 'text', nullable: true })
  confirmedReply?: string

  @Column({ type: 'text', nullable: true })
  reviewerNote?: string

  @Column({ type: 'varchar', nullable: true })
  reviewedById?: string

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date

  @Column({ type: 'text', nullable: true })
  failureReason?: string

  @Column({ type: 'varchar', nullable: true })
  failureCode?: string

  @Column({ type: 'timestamptz', nullable: true })
  lastAttemptAt?: Date

  @Column({ type: 'int', default: 0 })
  attemptCount?: number

  /** Optimistic lock. Every accepted mutation increments it. */
  @Column({ type: 'int', default: 1 })
  revision?: number

  @Column({ type: 'jsonb', default: () => "'[]'" })
  events?: SupportTicketEvent[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
