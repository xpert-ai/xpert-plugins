import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { CanvasDocumentKind, CanvasDocumentStatus, CanvasJsonObject, CanvasSnapshotData, CanvasWorkspaceCatalog } from '../types.js'
import { canvasTable } from '../canvas-artifact-namespace.js'

@Entity(canvasTable('document'))
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'projectId', 'status'])
@Index(['tenantId', 'organizationId', 'kind', 'updatedAt'])
export class CanvasDocument {
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

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'varchar', default: 'canvas' })
  kind?: CanvasDocumentKind

  @Column({ type: 'varchar', default: 'draft' })
  status?: CanvasDocumentStatus

  @Column({ type: 'jsonb', nullable: true })
  tags?: string[]

  @Column({ type: 'varchar', nullable: true })
  source?: string

  @Column({ type: 'varchar', nullable: true })
  currentVersionId?: string

  @Column({ type: 'int', default: 0 })
  currentVersionNumber?: number

  @Column({ type: 'jsonb', nullable: true })
  autosaveSnapshot?: CanvasSnapshotData | null

  @Column({ type: 'jsonb', nullable: true })
  autosaveViewState?: CanvasJsonObject | null

  @Column({ type: 'jsonb', nullable: true })
  autosaveSelectionSummary?: CanvasJsonObject | null

  @Column({ type: 'timestamptz', nullable: true })
  autosaveUpdatedAt?: Date

  @Column({ type: 'varchar', nullable: true })
  autosaveBaseVersionId?: string

  @Column({ type: 'int', default: 0 })
  workingCopyRevision?: number

  @Column({ type: 'varchar', length: 64, nullable: true })
  snapshotChecksum?: string

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

  @Column({ type: 'varchar', nullable: true })
  lastEditedById?: string

  @Column({ type: 'timestamptz', nullable: true })
  lastEditedAt?: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
