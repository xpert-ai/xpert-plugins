import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { DocxEditorDocument } from './docx-editor-document.entity.js'

@Entity('plugin_docx_editor_snapshot')
@ForeignKey(() => DocxEditorDocument, ['documentId'], ['id'], {
  name: 'plugin_docx_editor_snapshot_parent_fk',
  onDelete: 'CASCADE'
})
@ForeignKey(() => DocxEditorDocument, ['documentId', 'projectId'], ['id', 'projectId'], {
  name: 'plugin_docx_editor_snapshot_parent_project_fk',
  onDelete: 'CASCADE'
})
@Index(['tenantId', 'organizationId', 'documentId', 'updatedAt'])
export class DocxEditorSnapshot {
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

  @Column({ type: 'varchar', nullable: true })
  versionId?: string

  @Column({ type: 'text', nullable: true })
  contentText?: string

  @Column({ type: 'int', default: 0 })
  paragraphCount?: number

  @Column({ type: 'int', default: 0 })
  totalPages?: number

  @Column({ type: 'int', default: 0 })
  currentPage?: number

  @Column({ type: 'json', nullable: true })
  selection?: unknown

  @Column({ type: 'json', nullable: true })
  comments?: unknown

  @Column({ type: 'json', nullable: true })
  changes?: unknown

  @Column({ type: 'json', nullable: true })
  pages?: unknown

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
