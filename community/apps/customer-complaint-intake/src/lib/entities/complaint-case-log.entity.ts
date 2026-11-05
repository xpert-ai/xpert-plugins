import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { ComplaintLogAction } from '../types'
import type { ComplaintCase } from './complaint-case.entity'

@Entity('plugin_customer_complaint_case_log')
@Index(['tenantId', 'organizationId', 'caseId', 'createdAt'])
export class ComplaintCaseLog {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Index()
  @Column({ type: 'varchar' })
  caseId?: string

  @ManyToOne('ComplaintCase', (complaintCase: ComplaintCase) => complaintCase.logs, { onDelete: 'CASCADE' })
  complaintCase?: ComplaintCase

  @Column({ type: 'varchar' })
  action?: ComplaintLogAction

  @Column({ type: 'varchar', nullable: true })
  operatorId?: string

  @Column({ type: 'text', nullable: true })
  message?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
