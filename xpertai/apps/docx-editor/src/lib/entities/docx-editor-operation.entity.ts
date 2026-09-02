import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { DocxEditorOperationSource, DocxEditorOperationStatus, DocxEditorToolName } from '../types.js'
import { DocxEditorDocument } from './docx-editor-document.entity.js'

@Entity('plugin_docx_editor_operation')
@ForeignKey(() => DocxEditorDocument, ['documentId'], ['id'], {
  name: 'plugin_docx_editor_operation_parent_fk',
  onDelete: 'CASCADE'
})
@ForeignKey(() => DocxEditorDocument, ['documentId', 'projectId'], ['id', 'projectId'], {
  name: 'plugin_docx_editor_operation_parent_project_fk',
  onDelete: 'CASCADE'
})
@Index(['tenantId', 'organizationId', 'documentId', 'status'])
@Index(['tenantId', 'organizationId', 'documentId', 'createdAt'])
export class DocxEditorOperation {
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

  @Column({ type: 'varchar' })
  toolName!: DocxEditorToolName

  @Column({ type: 'varchar', default: 'agent' })
  source?: DocxEditorOperationSource

  @Column({ type: 'varchar', default: 'queued' })
  status?: DocxEditorOperationStatus

  @Column({ type: 'json', nullable: true })
  input?: unknown

  @Column({ type: 'json', nullable: true })
  result?: unknown

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
