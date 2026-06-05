import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ProcurementMatchStatus } from '../types.js'

@Entity('procurement_item_match')
@Index(['tenantId', 'organizationId', 'projectId', 'caseId'])
export class ProcurementItemMatch {
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
  requirementItemId?: string

  @Column({ type: 'uuid', nullable: true })
  quoteItemId?: string

  @Column({ type: 'uuid', nullable: true })
  supplierQuoteId?: string

  @Column({ type: 'varchar' })
  status!: ProcurementMatchStatus

  @Column({ type: 'float', nullable: true })
  confidence?: number

  @Column({ type: 'text', nullable: true })
  explanation?: string

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
