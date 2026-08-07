import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import type { StoryVideoGeneratorFamily } from '../story-video-generation.platform.js'
import type {
  StoryVideoGenerationRequestSnapshot,
  StoryVideoGenerationStatus
} from '../story-video-generation.types.js'
import { storyStudioTable } from '../story-studio-artifact-namespace.js'

@Entity(storyStudioTable('video_generation_task'))
@Index(['tenantId', 'scopeKey', 'operationId', 'takeIndex'], { unique: true })
@Index(['tenantId', 'scopeKey', 'projectId', 'status', 'updatedAt'])
@Index(['tenantId', 'scopeKey', 'providerTaskId'])
export class StoryVideoGenerationTask {
  @PrimaryGeneratedColumn('uuid')
  id!: string

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

  @Column({ type: 'uuid' })
  projectId!: string

  @Column({ type: 'int' })
  sourceProjectRevision!: number

  @Column({ type: 'int' })
  sourceDocumentRevision!: number

  @Column({ type: 'varchar', length: 160 })
  sceneId!: string

  @Column({ type: 'varchar', length: 160 })
  shotId!: string

  @Column({ type: 'varchar', length: 128 })
  operationId!: string

  @Column({ type: 'varchar', length: 128 })
  requestGroupId!: string

  @Column({ type: 'int' })
  takeIndex!: number

  @Column({ type: 'varchar', length: 20 })
  generatorFamily!: StoryVideoGeneratorFamily

  @Column({ type: 'uuid' })
  toolsetId!: string

  @Column({ type: 'varchar', length: 160 })
  generatorName!: string

  @Column({ type: 'jsonb' })
  request!: StoryVideoGenerationRequestSnapshot

  @Column({ type: 'varchar', length: 64 })
  requestFingerprint!: string

  @Column({ type: 'varchar', length: 64 })
  sourceFingerprint!: string

  @Column({ type: 'varchar', length: 240, nullable: true })
  providerTaskId?: string | null

  @Column({ type: 'varchar', length: 80, nullable: true })
  providerStatus?: string | null

  @Column({ type: 'varchar', length: 32, default: 'queued' })
  status!: StoryVideoGenerationStatus

  @Column({ type: 'varchar', length: 80, default: 'queued' })
  stage!: string

  @Column({ type: 'int', default: 0 })
  progress!: number

  @Column({ type: 'varchar', length: 240, nullable: true })
  queueJobId?: string | null

  @Column({ type: 'int', default: 0 })
  pollSequence!: number

  @Column({ type: 'int', default: 0 })
  queryFailureCount!: number

  @Column({ type: 'timestamptz', nullable: true })
  nextPollAt?: Date | null

  @Column({ type: 'jsonb', nullable: true })
  outputFile?: WorkspacePortableFileReference | null

  @Column({ type: 'varchar', length: 160, nullable: true })
  resultCandidateId?: string | null

  @Column({ type: 'uuid', nullable: true })
  retryOfTaskId?: string | null

  @Column({ type: 'boolean', default: false })
  cancellationRequested!: boolean

  @Column({ type: 'boolean', default: false })
  upstreamMayContinue!: boolean

  @Column({ type: 'varchar', length: 100, nullable: true })
  failureCode?: string | null

  @Column({ type: 'text', nullable: true })
  failureMessage?: string | null

  @Column({ type: 'boolean', default: false })
  recoverable!: boolean

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt?: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
