import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  SmartTicketCategory,
  SmartTicketSourceType,
  SmartTicketStatus,
  SmartTicketTeam,
  SmartTicketUrgency
} from '../types'

@Entity('plugin_smart_ticket')
@Index(['tenantId', 'organizationId', 'status'])
@Index(['tenantId', 'organizationId', 'ticketNo'])
@Index(['tenantId', 'organizationId', 'idempotencyKey'])
export class SmartTicket {
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

  @Index()
  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @Index()
  @Column({ type: 'varchar' })
  ticketNo?: string

  /** Hash of conversation + original content, used to keep AI retry idempotent. */
  @Index()
  @Column({ type: 'varchar' })
  idempotencyKey?: string

  @Index()
  @Column({ type: 'varchar', default: 'pending_confirmation' })
  status?: SmartTicketStatus

  @Column({ type: 'varchar', nullable: true })
  sourceType?: SmartTicketSourceType

  @Column({ type: 'varchar', nullable: true })
  title?: string

  @Column({ type: 'text' })
  originalContent?: string

  @Column({ type: 'varchar', nullable: true })
  customerName?: string

  @Column({ type: 'varchar', nullable: true })
  customerContact?: string

  @Column({ type: 'varchar', nullable: true })
  channel?: string

  @Column({ type: 'varchar', nullable: true })
  category?: SmartTicketCategory

  @Column({ type: 'varchar', nullable: true })
  urgency?: SmartTicketUrgency

  @Column({ type: 'text', nullable: true })
  aiSummary?: string

  @Column({ type: 'varchar', nullable: true })
  aiSuggestedTeam?: SmartTicketTeam

  @Column({ type: 'varchar', nullable: true })
  aiSuggestedOwner?: string

  @Column({ type: 'text', nullable: true })
  aiDispatchAdvice?: string

  @Column({ type: 'float', nullable: true })
  aiConfidence?: number

  @Column({ type: 'simple-json', nullable: true })
  completenessTips?: string[]

  @Column({ type: 'simple-json', nullable: true })
  aiRawResult?: unknown

  @Column({ type: 'varchar', nullable: true })
  confirmedTeam?: SmartTicketTeam

  @Column({ type: 'varchar', nullable: true })
  confirmedOwner?: string

  @Column({ type: 'text', nullable: true })
  dispatchRemark?: string

  @Column({ type: 'text', nullable: true })
  resolutionSummary?: string

  @Column({ type: 'text', nullable: true })
  rejectReason?: string

  @Column({ type: 'int', default: 0 })
  retryCount?: number

  @Column({ type: 'timestamp', nullable: true })
  dispatchedAt?: Date

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt?: Date

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
