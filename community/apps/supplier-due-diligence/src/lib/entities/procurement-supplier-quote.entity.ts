import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_procurement_supplier_quote')
@Index(['tenantId', 'organizationId', 'projectId', 'caseId'])
export class ProcurementSupplierQuote {
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
  documentId?: string

  @Column({ type: 'varchar' })
  supplierName!: string

  @Column({ type: 'varchar', nullable: true })
  supplierContact?: string

  @Column({ type: 'boolean', nullable: true })
  taxIncluded?: boolean

  @Column({ type: 'varchar', nullable: true })
  deliveryTime?: string

  @Column({ type: 'varchar', nullable: true })
  paymentTerms?: string

  @Column({ type: 'varchar', nullable: true })
  warranty?: string

  @Column({ type: 'text', nullable: true })
  remarks?: string

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
