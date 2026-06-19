import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { OfficeDocumentStatus, OfficeDocumentType } from '../types.js'

@Entity('plugin_office_editor_document')
@Index(['tenantId', 'organizationId', 'projectId', 'documentType', 'status'])
@Index(['tenantId', 'organizationId', 'assistantId', 'documentType', 'status'])
@Index(['tenantId', 'organizationId', 'updatedAt'])
export class OfficeDocument {
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
  createdById?: string

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @Column({ type: 'varchar' })
  documentType!: OfficeDocumentType

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'varchar', default: 'draft' })
  status?: OfficeDocumentStatus

  @Column({ type: 'varchar', nullable: true })
  currentSnapshotId?: string

  @Column({ type: 'int', default: 0 })
  currentVersionNumber?: number

  @Column({ type: 'text', nullable: true })
  yjsStateBase64?: string

  @Column({ type: 'text', nullable: true })
  yjsStateVectorBase64?: string

  @Column({ type: 'varchar', nullable: true })
  lastEditedById?: string

  @Column({ type: 'timestamptz', nullable: true })
  lastEditedAt?: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
