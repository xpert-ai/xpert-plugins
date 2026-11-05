import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ProcurementDocumentExtractionStatus, ProcurementDocumentRole, ProcurementDocumentStatus } from '../types.js'

@Entity('plugin_procurement_source_document')
@Index(['tenantId', 'organizationId', 'projectId', 'caseId'])
export class ProcurementSourceDocument {
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

  @Column({ type: 'varchar' })
  role!: ProcurementDocumentRole

  @Column({ type: 'varchar', nullable: true })
  supplierQuoteId?: string

  @Column({ type: 'varchar', nullable: true })
  supplierName?: string

  @Column({ type: 'varchar' })
  name!: string

  @Column({ type: 'varchar', nullable: true })
  fileAssetId?: string

  @Column({ type: 'varchar', nullable: true })
  fileId?: string

  @Column({ type: 'varchar', nullable: true })
  storageFileId?: string

  @Column({ type: 'varchar', nullable: true })
  mimeType?: string

  @Column({ type: 'int', nullable: true })
  size?: number

  @Column({ type: 'varchar', nullable: true })
  extractionStatus?: ProcurementDocumentExtractionStatus

  @Column({ type: 'text', nullable: true })
  extractedContent?: string

  @Column({ type: 'text', nullable: true })
  extractionErrorMessage?: string

  @Column({ type: 'varchar', default: 'uploaded' })
  status?: ProcurementDocumentStatus

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
