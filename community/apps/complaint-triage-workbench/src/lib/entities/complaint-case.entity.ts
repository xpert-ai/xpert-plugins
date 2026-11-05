import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm'
import type { ComplaintStatus, ComplaintTriageResult } from '../domain/complaint.types.js'
import { complaintTable } from '../artifact-namespace.js'

@Entity(complaintTable('case'))
@Index(['tenantId', 'organizationId', 'status', 'updatedAt'])
@Index(['scopeKey', 'updatedAt'])
export class ComplaintCaseEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', length: 220 })
  scopeKey!: string

  @Column({ type: 'varchar' })
  createdById!: string

  @Column({ type: 'varchar', length: 160 })
  customerName!: string

  @Column({ type: 'varchar', length: 160, nullable: true })
  customerReference?: string | null

  @Column({ type: 'text' })
  complaintContent!: string

  @Column({ type: 'varchar', length: 32 })
  status!: ComplaintStatus

  @Column({ type: 'jsonb', nullable: true })
  aiOriginalResult?: ComplaintTriageResult | null

  @Column({ type: 'jsonb', nullable: true })
  humanDraftResult?: ComplaintTriageResult | null

  @Column({ type: 'jsonb', nullable: true })
  humanConfirmedResult?: ComplaintTriageResult | null

  @Column({ type: 'uuid', nullable: true })
  attemptId?: string | null

  @Column({ type: 'int', default: 0 })
  attemptCount!: number

  @Column({ type: 'varchar', nullable: true })
  assistantTaskId?: string | null

  @Column({ type: 'varchar', nullable: true })
  executionId?: string | null

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  threadId?: string | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  errorCode?: string | null

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt?: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
