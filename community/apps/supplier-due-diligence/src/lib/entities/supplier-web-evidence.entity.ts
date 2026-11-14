import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { SupplierWebEvidenceKind } from '../types.js'

@Entity('plugin_supplier_due_diligence_web_evidence')
@Index(['tenantId', 'organizationId', 'caseId'])
export class SupplierWebEvidence {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @Column({ type: 'uuid' })
  caseId!: string

  @Column({ type: 'varchar', nullable: true })
  supplierName?: string

  @Column({ type: 'varchar' })
  kind!: SupplierWebEvidenceKind

  @Column({ type: 'varchar', length: 2048 })
  sourceUrl!: string

  @Column({ type: 'varchar', length: 500 })
  title!: string

  @Column({ type: 'text' })
  excerpt!: string

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  confidence!: number

  @Column({ type: 'varchar', default: 'active' })
  status!: 'active' | 'superseded'

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
