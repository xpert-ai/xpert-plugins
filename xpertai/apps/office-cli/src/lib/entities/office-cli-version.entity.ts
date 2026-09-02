import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryGeneratedColumn } from 'typeorm'
import { officeCliTable } from '../constants.js'
import type { OfficeCliVersionSource, OfficeCliWorkspaceCatalog } from '../types.js'
import { OfficeCliDocument } from './office-cli-document.entity.js'

@Entity(officeCliTable('version'))
@ForeignKey(() => OfficeCliDocument, ['documentId'], ['id'], {
  name: 'plugin_office_cli_version_parent_fk',
  onDelete: 'CASCADE'
})
@ForeignKey(() => OfficeCliDocument, ['documentId', 'projectId'], ['id', 'projectId'], {
  name: 'plugin_office_cli_version_parent_project_fk',
  onDelete: 'CASCADE'
})
@Index(['tenantId', 'organizationId', 'documentId', 'versionNumber'])
@Index(['documentId', 'versionNumber'], { unique: true })
export class OfficeCliVersion {
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

  @Column({ type: 'varchar' })
  source!: OfficeCliVersionSource

  @Column({ type: 'text' })
  workspaceFilePath!: string

  @Column({ type: 'text', nullable: true })
  workspaceFileUrl?: string

  @Column({ type: 'varchar' })
  workspaceCatalog!: OfficeCliWorkspaceCatalog

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
  command?: string

  @Column({ type: 'jsonb', nullable: true })
  commandArgs?: string[]

  @Column({ type: 'varchar', nullable: true })
  sourceVersionId?: string

  @Column({ type: 'text', nullable: true })
  changeSummary?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
