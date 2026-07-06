import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { OfficeAuditOperationType, OfficeOperationSource, OfficeOperationStatus } from '../types.js'
import { officeEditorTable } from '../constants.js'

@Entity(officeEditorTable('operation'))
@Index(['tenantId', 'organizationId', 'documentId', 'status'])
@Index(['tenantId', 'organizationId', 'documentId', 'createdAt'])
export class OfficeOperation {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @Column({ type: 'varchar', nullable: true })
  documentId?: string

  @Column({ type: 'varchar', nullable: true })
  snapshotId?: string

  @Column({ type: 'varchar' })
  operationType!: OfficeAuditOperationType

  @Column({ type: 'varchar', default: 'agent' })
  source?: OfficeOperationSource

  @Column({ type: 'varchar', default: 'queued' })
  status?: OfficeOperationStatus

  @Column({ type: 'json', nullable: true })
  input?: unknown

  @Column({ type: 'json', nullable: true })
  result?: unknown

  @Column({ type: 'text', nullable: true })
  reviewNote?: string

  @Column({ type: 'float', nullable: true })
  confidence?: number

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
