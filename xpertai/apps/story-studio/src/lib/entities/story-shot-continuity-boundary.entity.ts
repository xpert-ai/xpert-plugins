import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import type { StoryShotTransition } from '../production-types.js'
import type {
  StoryContinuityPreparationStatus,
  StoryVideoGenerationContinuitySnapshot
} from '../story-video-generation.types.js'
import { storyStudioTable } from '../story-studio-artifact-namespace.js'

@Entity(storyStudioTable('shot_continuity_boundary'))
@Index(['tenantId', 'scopeKey', 'projectId', 'fromShotId', 'toShotId'], { unique: true })
@Index(['tenantId', 'scopeKey', 'projectId', 'status', 'updatedAt'])
export class StoryShotContinuityBoundary {
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

  @Column({ type: 'varchar', length: 160 })
  fromSceneId!: string

  @Column({ type: 'varchar', length: 160 })
  fromShotId!: string

  @Column({ type: 'varchar', length: 160 })
  toSceneId!: string

  @Column({ type: 'varchar', length: 160 })
  toShotId!: string

  @Column({ type: 'varchar', length: 40 })
  transition!: StoryShotTransition

  @Column({ type: 'varchar', length: 160, nullable: true })
  sourceCandidateId?: string | null

  @Column({ type: 'varchar', length: 64 })
  sourceFingerprint!: string

  @Column({ type: 'varchar', length: 32 })
  status!: StoryContinuityPreparationStatus

  @Column({ type: 'jsonb' })
  snapshot!: StoryVideoGenerationContinuitySnapshot

  @Column({ type: 'jsonb', nullable: true })
  sourceFrameFile?: WorkspacePortableFileReference | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  failureCode?: string | null

  @Column({ type: 'text', nullable: true })
  failureMessage?: string | null

  @Column({ type: 'uuid', nullable: true })
  sandboxJobId?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
