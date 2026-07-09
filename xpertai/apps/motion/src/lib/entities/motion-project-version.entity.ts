import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type {
  MotionJsonObject,
  MotionSurface,
  MotionVersionSource,
  MotionVideoComposition,
  MotionWorkspaceCatalog
} from '../types.js'

@Entity('plugin_motion_project_version')
@Index(['tenantId', 'organizationId', 'motionProjectId', 'versionNumber'])
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
export class MotionProjectVersion {
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
  motionProjectId!: string

  @Column({ type: 'int' })
  versionNumber!: number

  @Column({ type: 'varchar', default: 'workbench' })
  sourceType?: MotionVersionSource

  @Column({ type: 'varchar', default: 'web' })
  surface?: MotionSurface

  @Column({ type: 'text', nullable: true })
  html?: string | null

  @Column({ type: 'jsonb', nullable: true })
  videoComposition?: MotionVideoComposition | null

  @Column({ type: 'jsonb', nullable: true })
  selectedRecipeIds?: string[]

  @Column({ type: 'jsonb', nullable: true })
  selectionSummary?: MotionJsonObject | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  artifactChecksum?: string

  @Column({ type: 'text', nullable: true })
  changeSummary?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceCatalog?: MotionWorkspaceCatalog

  @Column({ type: 'varchar', nullable: true })
  workspaceScopeId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
