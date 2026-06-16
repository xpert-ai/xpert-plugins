import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_docx_editor_snapshot')
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

  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @Column({ type: 'varchar' })
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
