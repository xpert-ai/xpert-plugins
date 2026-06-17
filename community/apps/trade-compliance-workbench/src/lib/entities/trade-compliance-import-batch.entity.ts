import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ImportBatchType } from '../types.js'

@Entity('plugin_trade_compliance_import_batch')
@Index(['tenantId', 'organizationId', 'assistantId', 'type'])
@Index(['tenantId', 'organizationId', 'status'])
export class TradeComplianceImportBatch {
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

  @Column({ type: 'varchar' })
  type!: ImportBatchType

  @Column({ type: 'varchar', default: 'pending_review' })
  status?: string

  @Column({ type: 'varchar', nullable: true })
  sourceFileName?: string

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
