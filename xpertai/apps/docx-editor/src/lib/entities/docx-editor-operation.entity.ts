import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { DocxEditorOperationSource, DocxEditorOperationStatus, DocxEditorToolName } from '../types.js'

@Entity('plugin_docx_editor_operation')
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

  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @Column({ type: 'varchar' })
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
