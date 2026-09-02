import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryGeneratedColumn } from 'typeorm'
import { officeEditorTable } from '../constants.js'
import type { OfficeFileVersionSource, OfficeWorkspaceCatalog } from '../types.js'
import { OfficeDocument } from './office-document.entity.js'

@Entity(officeEditorTable('file_version'))
@ForeignKey(() => OfficeDocument, ['documentId'], ['id'], {
  name: 'plugin_office_editor_file_version_parent_fk',
  onDelete: 'CASCADE'
})
@ForeignKey(() => OfficeDocument, ['documentId', 'projectId'], ['id', 'projectId'], {
  name: 'plugin_office_editor_file_version_parent_project_fk',
  onDelete: 'CASCADE'
})
@Index(['tenantId', 'organizationId', 'documentId', 'versionNumber'])
@Index(['documentId', 'versionNumber'], { unique: true })
@Index(['tenantId', 'organizationId', 'documentId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'documentId', 'checksum'])
export class OfficeFileVersion {
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

  @Column({ type: 'uuid' })
  documentId!: string

  @Column({ type: 'int' })
  versionNumber!: number

  @Column({ type: 'varchar', default: 'workbench' })
  source?: OfficeFileVersionSource

  @Column({ type: 'text' })
  workspaceFilePath!: string

  @Column({ type: 'text', nullable: true })
  workspaceFileUrl?: string

  @Column({ type: 'varchar' })
  workspaceCatalog!: OfficeWorkspaceCatalog

  @Column({ type: 'varchar' })
  workspaceScopeId!: string

  @Column({ type: 'varchar' })
  fileName!: string

  @Column({ type: 'varchar' })
  mimeType!: string

  @Column({ type: 'int' })
  size!: number

  @Column({ type: 'varchar' })
  checksum!: string

  @Column({ type: 'varchar', nullable: true })
  sourceVersionId?: string

  @Column({ type: 'varchar', nullable: true })
  operationId?: string

  @Column({ type: 'text', nullable: true })
  changeSummary?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
