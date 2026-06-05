import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ProcurementComparisonStatus, ProcurementFieldConflict } from '../types.js'

@Entity('procurement_comparison_case')
@Index(['tenantId', 'organizationId', 'projectId'])
@Index(['tenantId', 'organizationId', 'purchaseNo'])
export class ProcurementComparisonCase {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar', nullable: true })
  xpertId?: string

  @Column({ type: 'varchar', nullable: true })
  agentKey?: string

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'varchar' })
  purchaseNo!: string

  @Column({ type: 'varchar', nullable: true })
  applicant?: string

  @Column({ type: 'varchar', nullable: true })
  department?: string

  @Column({ type: 'varchar', nullable: true })
  budgetAmount?: string

  @Column({ type: 'varchar', nullable: true })
  expectedDeliveryDate?: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'varchar', default: 'draft' })
  status?: ProcurementComparisonStatus

  @Column({ type: 'json', nullable: true })
  fieldConflicts?: ProcurementFieldConflict[]

  @Column({ type: 'text', nullable: true })
  recommendationSummary?: string

  @Column({ type: 'varchar', nullable: true })
  recommendedSupplier?: string

  @Column({ type: 'int', default: 0 })
  supplierCount?: number

  @Column({ type: 'int', default: 0 })
  riskCount?: number

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
