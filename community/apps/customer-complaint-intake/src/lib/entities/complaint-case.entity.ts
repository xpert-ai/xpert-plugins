import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ComplaintCaseLog } from './complaint-case-log.entity'
import type { ComplaintCategory, ComplaintStatus, ComplaintUrgency } from '../types'

@Entity('plugin_customer_complaint_case')
@Index(['tenantId', 'organizationId', 'status', 'updatedAt'])
@Index(['tenantId', 'organizationId', 'caseNo'])
export class ComplaintCase {
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

  @Column({ type: 'varchar' })
  caseNo?: string

  @Column({ type: 'varchar', default: 'draft' })
  status?: ComplaintStatus

  @Column({ type: 'text' })
  rawText?: string

  @Column({ type: 'varchar', nullable: true })
  category?: ComplaintCategory

  @Column({ type: 'varchar', nullable: true })
  urgency?: ComplaintUrgency

  @Column({ type: 'text', nullable: true })
  customerDemand?: string

  @Column({ type: 'jsonb', nullable: true })
  missingFields?: string[]

  @Column({ type: 'text', nullable: true })
  suggestedReply?: string

  @Column({ type: 'boolean', default: false })
  escalationSuggested?: boolean

  @Column({ type: 'text', nullable: true })
  escalationReason?: string

  @Column({ type: 'varchar', nullable: true })
  orderNo?: string

  @Column({ type: 'varchar', nullable: true })
  contact?: string

  @Column({ type: 'jsonb', nullable: true })
  validationErrors?: string[]

  @Column({ type: 'text', nullable: true })
  failureReason?: string

  @Column({ type: 'int', default: 0 })
  confirmedCount?: number

  @Column({ type: 'text', nullable: true })
  returnReason?: string

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt?: Date

  @Column({ type: 'varchar', nullable: true })
  confirmedById?: string

  @OneToMany('ComplaintCaseLog', (log: ComplaintCaseLog) => log.complaintCase)
  logs?: ComplaintCaseLog[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
