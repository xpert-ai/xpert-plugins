import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CanvasJsonObject, CanvasSnapshotData, CanvasVersionSource, CanvasWorkspaceCatalog } from '../types.js'

@Entity('plugin_canvas_document_version')
@Index(['tenantId', 'organizationId', 'documentId', 'versionNumber'])
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
export class CanvasDocumentVersion {
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
  sourceType?: CanvasVersionSource

  @Column({ type: 'jsonb', nullable: true })
  snapshot?: CanvasSnapshotData | null

  @Column({ type: 'jsonb', nullable: true })
  viewState?: CanvasJsonObject | null

  @Column({ type: 'jsonb', nullable: true })
  selectionSummary?: CanvasJsonObject | null

  @Column({ type: 'text', nullable: true })
  snapshotImagePath?: string

  @Column({ type: 'text', nullable: true })
  snapshotImageUrl?: string

  @Column({ type: 'varchar', nullable: true })
  snapshotImageMimeType?: string

  @Column({ type: 'int', nullable: true })
  snapshotImageSize?: number

  @Column({ type: 'varchar', nullable: true })
  snapshotImageChecksum?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceCatalog?: CanvasWorkspaceCatalog

  @Column({ type: 'varchar', nullable: true })
  workspaceScopeId?: string

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
