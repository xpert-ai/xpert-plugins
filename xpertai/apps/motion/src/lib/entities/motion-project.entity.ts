import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  MotionJsonObject,
  MotionProjectStatus,
  MotionSurface,
  MotionVideoEngine,
  MotionVideoComposition,
  MotionWorkspaceCatalog
} from '../types.js'

@Entity('plugin_motion_project')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'projectId', 'status'])
@Index(['tenantId', 'organizationId', 'surface', 'updatedAt'])
export class MotionProject {
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
  brief?: string

  @Column({ type: 'varchar', default: 'web' })
  surface?: MotionSurface

  @Column({ type: 'varchar', default: 'draft' })
  status?: MotionProjectStatus

  @Column({ type: 'varchar', nullable: true })
  designSystemId?: string

  @Column({ type: 'varchar', nullable: true })
  motionProfile?: string

  @Column({ type: 'jsonb', nullable: true })
  selectedRecipeIds?: string[]

  @Column({ type: 'text', nullable: true })
  workingHtml?: string | null

  @Column({ type: 'jsonb', nullable: true })
  videoComposition?: MotionVideoComposition | null

  /** Null means a pre-HyperFrames row and is migrated as legacy_canvas at the service boundary. */
  @Column({ type: 'varchar', nullable: true })
  videoEngine?: MotionVideoEngine | null

  @Column({ type: 'text', nullable: true })
  hyperframesHtml?: string | null

  @Column({ type: 'jsonb', nullable: true })
  componentSelection?: MotionJsonObject | null

  @Column({ type: 'jsonb', nullable: true })
  layerSelection?: MotionJsonObject | null

  @Column({ type: 'varchar', nullable: true })
  currentVersionId?: string

  @Column({ type: 'int', default: 0 })
  currentVersionNumber?: number

  @Column({ type: 'int', default: 0 })
  workingCopyRevision?: number

  @Column({ type: 'varchar', length: 64, nullable: true })
  artifactChecksum?: string

  @Column({ type: 'text', nullable: true })
  lastExportPath?: string

  @Column({ type: 'varchar', nullable: true })
  lastExportKind?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceCatalog?: MotionWorkspaceCatalog

  @Column({ type: 'varchar', nullable: true })
  workspaceScopeId?: string

  @Column({ type: 'text', nullable: true })
  failureReason?: string

  @Column({ type: 'varchar', nullable: true })
  lastEditedById?: string

  @Column({ type: 'timestamptz', nullable: true })
  lastEditedAt?: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
