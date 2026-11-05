import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { InvoiceComplianceCheck } from '../types.js'

@Entity('plugin_invoice_reimbursement_record')
@Index(['tenantId', 'organizationId', 'status'])
@Index(['tenantId', 'organizationId', 'invoiceNumber'])
export class InvoiceRecord {
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

  @Column({ type: 'varchar', length: 128, nullable: true })
  invoiceCode?: string

  @Column({ type: 'varchar', length: 128 })
  invoiceNumber!: string

  @Column({ type: 'varchar', length: 32 })
  issueDate!: string

  @Column({ type: 'varchar', length: 255 })
  buyerName!: string

  @Column({ type: 'varchar', length: 64 })
  buyerTaxNo!: string

  @Column({ type: 'varchar', length: 255 })
  sellerName!: string

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  pretaxAmount!: number

  @Column({ type: 'varchar', length: 16, default: '6%' })
  taxRate!: string

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount!: number

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount!: number

  @Column({ type: 'varchar', length: 64, default: '差旅交通' })
  category!: string

  @Column({ type: 'varchar', length: 64, default: '研发中心' })
  department?: string

  @Column({ type: 'text', nullable: true })
  remark?: string

  @Column({ type: 'text', nullable: true })
  rawText?: string

  @Column({ type: 'simple-json', nullable: true })
  compliance?: InvoiceComplianceCheck

  @Column({ type: 'varchar', length: 32, default: 'CONFIRMED' })
  status!: string

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
