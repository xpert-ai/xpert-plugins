import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { StoryActorType, StoryProjectAction } from '../types.js'
import { storyStudioTable } from '../story-studio-artifact-namespace.js'

@Entity(storyStudioTable('action_log'))
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
@Index(['tenantId', 'scopeKey', 'operationId'], { unique: true })
export class StoryActionLog {
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

  @Column({ type: 'uuid' })
  projectId!: string

  @Column({ type: 'varchar', length: 128 })
  operationId!: string

  @Column({ type: 'varchar', length: 64 })
  operationFingerprint!: string

  @Column({ type: 'varchar' })
  action!: StoryProjectAction

  @Column({ type: 'varchar', default: 'system' })
  actorType!: StoryActorType

  @Column({ type: 'varchar', nullable: true })
  actorId?: string | null

  @Column({ type: 'varchar', length: 240 })
  changeSummary!: string

  @Column({ type: 'int', nullable: true })
  previousRevision?: number | null

  @Column({ type: 'int' })
  resultingRevision!: number

  @Column({ type: 'jsonb', nullable: true })
  changedFields?: string[] | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  failureCode?: string | null

  @Column({ type: 'boolean', nullable: true })
  recoverable?: boolean | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date
}
