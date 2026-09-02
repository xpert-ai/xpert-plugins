import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm'
import type { OfficeDocumentStatus, OfficeDocumentType, OfficeWorkspaceCatalog } from '../types.js'
import { officeEditorTable } from '../constants.js'

@Entity(officeEditorTable('document'))
@Unique('plugin_office_editor_document_id_project_uq', ['id', 'projectId'])
@ForeignKey('xpert_project', ['projectId'], ['id'], {
  name: 'plugin_office_editor_document_project_fk',
  onDelete: 'CASCADE'
})
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

  @Column({ type: 'uuid', nullable: true, update: false })
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

  @Column({ type: 'varchar', nullable: true })
  fileName?: string

  @Column({ type: 'varchar', nullable: true })
  mimeType?: string

  @Column({ type: 'int', nullable: true })
  size?: number

  @Column({ type: 'text', nullable: true })
  workspaceFilePath?: string

  @Column({ type: 'text', nullable: true })
  workspaceFileUrl?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceCatalog?: OfficeWorkspaceCatalog

  @Column({ type: 'varchar', nullable: true })
  workspaceScopeId?: string

  @Column({ type: 'varchar', nullable: true })
  currentFileVersionId?: string

  @Column({ type: 'int', default: 0 })
  currentFileVersionNumber?: number

  @Column({ type: 'text', nullable: true })
  yjsStateBase64?: string

  @Column({ type: 'text', nullable: true })
  yjsStateVectorBase64?: string

  @Column({ type: 'int', default: 0 })
  collaborationSequence?: number

  @Column({ type: 'varchar', nullable: true })
  lastEditedById?: string

  @Column({ type: 'timestamptz', nullable: true })
  lastEditedAt?: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
