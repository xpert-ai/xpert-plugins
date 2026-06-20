import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { DocxEditorVersionSource, DocxEditorWorkspaceCatalog } from '../types.js'

@Entity('plugin_docx_editor_version')
@Index(['tenantId', 'organizationId', 'documentId', 'versionNumber'])
@Index(['tenantId', 'organizationId', 'documentId', 'createdAt'])
export class DocxEditorVersion {
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

  @Column({ type: 'varchar' })
  documentId!: string

  @Column({ type: 'int' })
  versionNumber!: number

  @Column({ type: 'varchar', default: 'workbench' })
  source?: DocxEditorVersionSource

  @Column({ type: 'text', nullable: true })
  workspaceFilePath?: string

  @Column({ type: 'text', nullable: true })
  workspaceFileUrl?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceCatalog?: DocxEditorWorkspaceCatalog

  @Column({ type: 'varchar', nullable: true })
  workspaceScopeId?: string

  @Column({ type: 'varchar', nullable: true })
  mimeType?: string

  @Column({ type: 'int' })
  size!: number

  @Column({ type: 'varchar', nullable: true })
  checksum?: string

  @Column({ type: 'text', nullable: true })
  changeSummary?: string

  @Column({ type: 'varchar', nullable: true })
  operationId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
