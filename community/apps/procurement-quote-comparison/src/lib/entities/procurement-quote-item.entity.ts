import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('procurement_quote_item')
@Index(['tenantId', 'organizationId', 'projectId', 'caseId'])
export class ProcurementQuoteItem {
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

  @Column({ type: 'uuid' })
  supplierQuoteId!: string

  @Column({ type: 'uuid', nullable: true })
  requirementItemId?: string

  @Column({ type: 'varchar' })
  productName!: string

  @Column({ type: 'varchar', nullable: true })
  brand?: string

  @Column({ type: 'varchar', nullable: true })
  model?: string

  @Column({ type: 'text', nullable: true })
  specification?: string

  @Column({ type: 'float', nullable: true })
  quantity?: number

  @Column({ type: 'varchar', nullable: true })
  unit?: string

  @Column({ type: 'varchar', nullable: true })
  unitPrice?: string

  @Column({ type: 'varchar', nullable: true })
  totalPrice?: string

  @Column({ type: 'boolean', nullable: true })
  taxIncluded?: boolean

  @Column({ type: 'varchar', nullable: true })
  taxRate?: string

  @Column({ type: 'varchar', nullable: true })
  deliveryTime?: string

  @Column({ type: 'varchar', nullable: true })
  paymentTerms?: string

  @Column({ type: 'varchar', nullable: true })
  warranty?: string

  @Column({ type: 'text', nullable: true })
  remarks?: string

  @Column({ type: 'text', nullable: true })
  rawText?: string

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
