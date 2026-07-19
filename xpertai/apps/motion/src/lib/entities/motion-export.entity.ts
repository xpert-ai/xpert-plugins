import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { MotionExportKind, MotionJsonObject, MotionRenderStatus, MotionWorkspaceCatalog } from '../types.js'

@Entity('plugin_motion_export')
@Index(['tenantId', 'organizationId', 'motionProjectId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
export class MotionExport {
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

  @Column({ type: 'varchar', nullable: true })
  versionId?: string

  @Column({ type: 'varchar' })
  kind!: MotionExportKind

  @Column({ type: 'varchar', default: 'succeeded' })
  status?: MotionRenderStatus

  @Column({ type: 'varchar', nullable: true })
  backend?: 'browser' | 'hyperframes' | null

  @Column({ type: 'int', default: 100 })
  progress?: number

  @Column({ type: 'varchar', nullable: true })
  stage?: string | null

  @Column({ type: 'varchar', nullable: true })
  jobId?: string | null

  @Column({ type: 'varchar', nullable: true })
  sandboxJobId?: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  inputChecksum?: string | null

  @Column({ type: 'text', nullable: true })
  filePath?: string

  @Column({ type: 'jsonb', nullable: true })
  fileReference?: MotionJsonObject | null

  @Column({ type: 'text', nullable: true })
  fileUrl?: string

  @Column({ type: 'varchar', nullable: true })
  mimeType?: string

  @Column({ type: 'int', nullable: true })
  size?: number

  @Column({ type: 'varchar', length: 64, nullable: true })
  checksum?: string

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null

  @Column({ type: 'jsonb', nullable: true })
  report?: MotionJsonObject | null

  @Column({ type: 'varchar', nullable: true })
  workspaceCatalog?: MotionWorkspaceCatalog

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

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null
}
