import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm'
import type {
  OfficeCliDocumentFormat,
  OfficeCliDocumentStatus,
  OfficeCliWorkspaceCatalog
} from '../types.js'
import { officeCliTable } from '../constants.js'

@Entity(officeCliTable('document'))
@Unique('plugin_office_cli_document_id_project_uq', ['id', 'projectId'])
@ForeignKey('xpert_project', ['projectId'], ['id'], {
  name: 'plugin_office_cli_document_project_fk',
  onDelete: 'CASCADE'
})
@Index(['tenantId', 'organizationId', 'projectId', 'format', 'status'])
@Index(['tenantId', 'organizationId', 'assistantId', 'format', 'status'])
@Index(['tenantId', 'organizationId', 'updatedAt'])
export class OfficeCliDocument {
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
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar' })
  format!: OfficeCliDocumentFormat

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'varchar', default: 'draft' })
  status?: OfficeCliDocumentStatus

  @Column({ type: 'varchar' })
  fileName!: string

  @Column({ type: 'varchar' })
  mimeType!: string

  @Column({ type: 'int', default: 0 })
  size?: number

  @Column({ type: 'text', nullable: true })
  workspaceFilePath?: string

  @Column({ type: 'text', nullable: true })
  workspaceFileUrl?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceCatalog?: OfficeCliWorkspaceCatalog

  @Column({ type: 'varchar', nullable: true })
  workspaceScopeId?: string

  @Column({ type: 'varchar', nullable: true })
  currentVersionId?: string

  @Column({ type: 'int', default: 0 })
  currentVersionNumber?: number

  @Column({ type: 'varchar', nullable: true })
  lastCommand?: string

  @Column({ type: 'varchar', nullable: true })
  lastEditedById?: string

  @Column({ type: 'timestamptz', nullable: true })
  lastEditedAt?: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
