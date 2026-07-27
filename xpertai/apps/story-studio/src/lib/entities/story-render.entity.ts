import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { StoryJsonObject, StoryRenderQuality, StoryRenderStatus } from '../production-types.js'
import { storyStudioTable } from '../story-studio-artifact-namespace.js'

@Entity(storyStudioTable('render'))
@Index(['tenantId', 'scopeKey', 'projectId', 'createdAt'])
@Index(['tenantId', 'scopeKey', 'operationId'], { unique: true })
export class StoryRender {
  @PrimaryGeneratedColumn('uuid')
  id!: string
  @Index()
  @Column({ type: 'varchar' })
  tenantId!: string
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null
  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string | null
  @Column({ type: 'varchar', nullable: true })
  hostProjectId?: string | null
  @Column({ type: 'varchar', length: 64 })
  scopeKey!: string
  @Index()
  @Column({ type: 'uuid' })
  projectId!: string
  @Column({ type: 'int' })
  sourceRevision!: number
  @Column({ type: 'varchar', length: 128 })
  operationId!: string
  @Column({ type: 'varchar', length: 64 })
  inputChecksum!: string
  @Column({ type: 'varchar', default: 'queued' })
  status!: StoryRenderStatus
  @Column({ type: 'int', default: 0 })
  progress!: number
  @Column({ type: 'varchar', default: 'queued' })
  stage!: string
  @Column({ type: 'varchar', default: 'standard' })
  quality!: StoryRenderQuality
  @Column({ type: 'int', default: 24 })
  fps!: number
  @Column({ type: 'varchar', length: 240 })
  fileName!: string
  @Column({ type: 'varchar', nullable: true })
  queueJobId?: string | null
  @Column({ type: 'varchar', nullable: true })
  sandboxJobId?: string | null
  @Column({ type: 'text', nullable: true })
  filePath?: string | null
  @Column({ type: 'jsonb', nullable: true })
  fileReference?: StoryJsonObject | null
  @Column({ type: 'text', nullable: true })
  fileUrl?: string | null
  @Column({ type: 'varchar', nullable: true })
  artifactId?: string | null
  @Column({ type: 'varchar', nullable: true })
  artifactVersionId?: string | null
  @Column({ type: 'varchar', default: 'video/mp4' })
  mimeType!: string
  @Column({ type: 'int', nullable: true })
  size?: number | null
  @Column({ type: 'varchar', length: 64, nullable: true })
  checksum?: string | null
  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null
  @Column({ type: 'jsonb', nullable: true })
  report?: StoryJsonObject | null
  @Column({ type: 'varchar', length: 240 })
  changeSummary!: string
  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null
}
