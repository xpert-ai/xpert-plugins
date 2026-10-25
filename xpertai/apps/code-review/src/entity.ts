import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, CreateDateColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { NAMESPACE, type ReviewRef, type Snapshot, type Finding } from './domain.js'

@Entity(pluginArtifactTableName(NAMESPACE, 'review'))
@Index(['tenantId', 'organizationId', 'userId', 'assistantId'])
export class Review {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) assistantId!: string
  @Column({ type: 'uuid', nullable: true }) automationPolicyId!: string | null
  @Column({ type: 'boolean', default: false }) projectShared!: boolean
  @Column({ type: 'uuid', nullable: true }) pipelineProjectId!: string | null
  @Column({ type: 'uuid', nullable: true }) pipelineRootReviewId!: string | null
  @Index({ unique: true })
  @Column({ type: 'uuid', nullable: true }) pipelineOperationId!: string | null
  @Column({ type: 'jsonb', nullable: true }) pipelineDispatch!: { kind: 'start' } | { kind: 'next'; instanceId: string } | null
  @Column({ type: 'jsonb', nullable: true }) pipelineContext!: import('./pipeline/contract.js').ReviewAgentContext | null
  @Column({ type: 'jsonb', nullable: true }) pipelineInput!: import('@xpert-ai/contracts').ProjectPipelineWorkContext | null
  @Index({ unique: true })
  @Column({ type: 'uuid', nullable: true }) automationRunId!: string | null
  @Column({ type: 'jsonb' }) ref!: ReviewRef
  @Column({ type: 'jsonb' }) snapshot!: Snapshot
  @Column({ type: 'jsonb', nullable: true, select: false }) localSources!: import('./local-git.js').LocalGitSources | null
  @Column({ type: 'varchar', default: 'public' }) access!: 'public' | 'connected'
  @Column({ type: 'varchar', default: 'ready' }) status!: 'ready' | 'running' | 'reviewed' | 'failed' | 'cancelled' | 'submitting' | 'submitted' | 'submission_unknown'
  @Column({ type: 'boolean', default: false }) pinned!: boolean
  @Column({ type: 'jsonb', default: [] }) viewed!: string[]
  @Column({ type: 'jsonb', default: [] }) findings!: Finding[]
  @Column({ type: 'text', default: '' }) summary!: string
  @Column({ type: 'text', default: '' }) instructions!: string
  @Column({ type: 'varchar', nullable: true }) executionId!: string | null
  @Column({ type: 'varchar', nullable: true }) taskId!: string | null
  @Column({ type: 'varchar', nullable: true }) threadId!: string | null
  @Column({ type: 'varchar', nullable: true }) conversationId!: string | null
  @Column({ type: 'varchar', nullable: true }) errorCode!: string | null
  @Column({ type: 'varchar', nullable: true }) submissionUrl!: string | null
  @Column({ type: 'int', default: 1 }) revision!: number
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
