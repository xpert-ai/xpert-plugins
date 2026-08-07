import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { StoryAspectRatio, StoryProductionFormat, StoryProjectStatus } from '../types.js'
import { storyStudioTable } from '../story-studio-artifact-namespace.js'
import type { StoryVideoGeneratorFamily } from '../story-video-generation.platform.js'

@Entity(storyStudioTable('project'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'status', 'updatedAt'])
@Index(['tenantId', 'organizationId', 'hostProjectId', 'status', 'updatedAt'])
@Index(['tenantId', 'scopeKey', 'creationOperationId'], { unique: true })
export class StoryProject {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Index()
  @Column({ type: 'varchar' })
  tenantId!: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string | null

  @Column({ type: 'varchar', nullable: true })
  hostProjectId?: string | null

  @Column({ type: 'varchar', length: 64 })
  scopeKey!: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string | null

  @Column({ type: 'varchar', length: 128 })
  creationOperationId!: string

  @Column({ type: 'varchar', length: 64 })
  creationFingerprint!: string

  @Column({ type: 'varchar', length: 160 })
  title!: string

  @Column({ type: 'text', nullable: true })
  description?: string | null

  @Column({ type: 'text', nullable: true })
  premise?: string | null

  @Column({ type: 'varchar', default: 'vertical_short' })
  productionFormat!: StoryProductionFormat

  @Column({ type: 'varchar', default: '9:16' })
  aspectRatio!: StoryAspectRatio

  @Column({ type: 'int', nullable: true })
  targetDurationSeconds?: number | null

  @Column({ type: 'varchar', default: 'draft' })
  status!: StoryProjectStatus

  @Column({ type: 'int', default: 1 })
  revision!: number

  @Column({ type: 'jsonb', nullable: true })
  tags?: string[] | null

  @Column({ type: 'int', default: 0 })
  sourceCount!: number

  @Column({ type: 'int', default: 0 })
  eventCount!: number

  @Column({ type: 'int', default: 0 })
  episodeCount!: number

  @Column({ type: 'int', default: 0 })
  assetCount!: number

  @Column({ type: 'int', default: 0 })
  shotCount!: number

  @Column({ type: 'int', default: 0 })
  candidateCount!: number

  @Column({ type: 'uuid', nullable: true })
  preferredVideoGeneratorToolsetId?: string | null

  @Column({ type: 'varchar', length: 20, nullable: true })
  preferredVideoGeneratorFamily?: StoryVideoGeneratorFamily | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  failureCode?: string | null

  @Column({ type: 'text', nullable: true })
  failureMessage?: string | null

  @Column({ type: 'boolean', nullable: true })
  failureRecoverable?: boolean | null

  @Column({ type: 'varchar', nullable: true })
  lastEditedById?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  lastEditedAt?: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
