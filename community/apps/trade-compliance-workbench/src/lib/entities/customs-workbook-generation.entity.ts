import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_trade_compliance_customs_workbook')
@Index(['tenantId', 'organizationId', 'invoiceNo'])
@Index(['tenantId', 'organizationId', 'status'])
export class CustomsWorkbookGeneration {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar', nullable: true })
  sourceFileName?: string

  @Column({ type: 'varchar', nullable: true })
  invoiceNo?: string

  @Column({ type: 'varchar', nullable: true })
  contractNo?: string

  @Column({ type: 'varchar' })
  fileName!: string

  @Column({ type: 'varchar', default: 'generated' })
  status?: string

  @Column({ type: 'jsonb', nullable: true })
  sheetNames?: string[]

  @Column({ type: 'jsonb', nullable: true })
  workbookData?: Record<string, unknown>

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
