import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type {
  PencilGraphSnapshot,
  PencilJsonObject,
  PencilVersionSource,
  PencilWorkspaceCatalog
} from '../types.js'

/** Immutable, reviewable checkpoint of a document graph and its UI context. */
@Entity('plugin_pencil_document_version')
@Index(['tenantId', 'organizationId', 'documentId', 'versionNumber'])
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
export class PencilDocumentVersion {
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
  sourceType?: PencilVersionSource

  @Column({ type: 'jsonb', nullable: true })
  graphSnapshot?: PencilGraphSnapshot | null

  @Column({ type: 'jsonb', nullable: true })
  viewState?: PencilJsonObject | null

  @Column({ type: 'jsonb', nullable: true })
  selectionSummary?: PencilJsonObject | null

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
