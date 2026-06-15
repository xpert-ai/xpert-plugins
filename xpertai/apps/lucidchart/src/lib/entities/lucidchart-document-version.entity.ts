import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { LucidchartProduct, LucidchartVersionSource } from '../types.js'

@Entity('plugin_lucidchart_document_version')
@Index(['tenantId', 'organizationId', 'documentId', 'versionNumber'])
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
export class LucidchartDocumentVersion {
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

  @Index()
  @Column({ type: 'varchar' })
  documentId!: string

  @Column({ type: 'int' })
  versionNumber!: number

  @Column({ type: 'varchar', default: 'workbench' })
  sourceType?: LucidchartVersionSource

  @Column({ type: 'jsonb', nullable: true })
  standardImport?: Record<string, unknown> | null

  @Column({ type: 'text', nullable: true })
  mermaidSource?: string | null

  @Column({ type: 'varchar', nullable: true })
  product?: LucidchartProduct

  @Column({ type: 'varchar', nullable: true })
  lucidDocumentId?: string | null

  @Column({ type: 'text', nullable: true })
  lucidDocumentUrl?: string | null

  @Column({ type: 'text', nullable: true })
  embedUrl?: string | null

  @Column({ type: 'varchar', nullable: true })
  embedId?: string | null

  @Column({ type: 'text', nullable: true })
  previewUrl?: string | null

  @Column({ type: 'varchar', nullable: true })
  importFileName?: string | null

  @Column({ type: 'text', nullable: true })
  changeSummary?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
