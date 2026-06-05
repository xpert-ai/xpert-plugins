import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ProcurementRiskSeverity } from '../types.js'

@Entity('procurement_risk_item')
@Index(['tenantId', 'organizationId', 'projectId', 'caseId'])
export class ProcurementRiskItem {
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

  @Column({ type: 'uuid' })
  caseId!: string

  @Column({ type: 'uuid', nullable: true })
  supplierQuoteId?: string

  @Column({ type: 'uuid', nullable: true })
  requirementItemId?: string

  @Column({ type: 'uuid', nullable: true })
  quoteItemId?: string

  @Column({ type: 'varchar' })
  type!: string

  @Column({ type: 'varchar' })
  severity!: ProcurementRiskSeverity

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'text' })
  description!: string

  @Column({ type: 'text', nullable: true })
  suggestion?: string

  @Column({ type: 'varchar', default: 'pending' })
  status?: string

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
