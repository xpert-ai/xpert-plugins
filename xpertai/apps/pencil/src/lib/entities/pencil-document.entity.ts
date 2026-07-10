import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  PencilDocumentKind,
  PencilDocumentStatus,
  PencilGraphSnapshot,
  PencilJsonObject,
  PencilWorkspaceCatalog
} from '../types.js'

/** Mutable document aggregate; immutable checkpoints live in PencilDocumentVersion. */
@Entity('plugin_pencil_document')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'projectId', 'status'])
@Index(['tenantId', 'organizationId', 'kind', 'updatedAt'])
export class PencilDocument {
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

  @Column({ type: 'varchar', default: 'design' })
  kind?: PencilDocumentKind

  @Column({ type: 'varchar', default: 'draft' })
  status?: PencilDocumentStatus

  @Column({ type: 'jsonb', nullable: true })
  tags?: string[]

  @Column({ type: 'varchar', nullable: true })
  source?: string

  @Column({ type: 'varchar', nullable: true })
  sourceFormat?: string

  @Column({ type: 'varchar', nullable: true })
  currentVersionId?: string

  @Column({ type: 'int', default: 0 })
  currentVersionNumber?: number

  @Column({ type: 'jsonb', nullable: true })
  /** Latest editable graph, which may be newer than currentVersionId. */
  workingGraph?: PencilGraphSnapshot | null

  @Column({ type: 'jsonb', nullable: true })
  workingViewState?: PencilJsonObject | null

  @Column({ type: 'jsonb', nullable: true })
  workingSelectionSummary?: PencilJsonObject | null

  @Column({ type: 'jsonb', nullable: true, select: false })
  /** Raw JSON boundary; PencilService validates it before exposing a typed render draft. */
  pendingRenderDraft?: unknown

  @Column({ type: 'timestamptz', nullable: true })
  workingUpdatedAt?: Date

  @Column({ type: 'varchar', nullable: true })
  workingBaseVersionId?: string

  @Column({ type: 'int', default: 0 })
  /** Monotonic token used to reject stale Workbench saves. */
  workingCopyRevision?: number

  @Column({ type: 'varchar', length: 64, nullable: true })
  /** Stable SHA-256 of the canonical graph snapshot. */
  graphChecksum?: string

  @Column({ type: 'text', nullable: true })
  previewImagePath?: string

  @Column({ type: 'text', nullable: true })
  previewImageUrl?: string

  @Column({ type: 'varchar', nullable: true })
  previewImageMimeType?: string

  @Column({ type: 'int', nullable: true })
  previewImageSize?: number

  @Column({ type: 'varchar', nullable: true })
  previewImageChecksum?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceCatalog?: PencilWorkspaceCatalog

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
