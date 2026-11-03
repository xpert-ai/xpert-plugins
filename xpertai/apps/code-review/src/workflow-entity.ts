import { Column, Entity, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { NAMESPACE } from './domain.js'
import type { WorkflowRef, WorkflowEvidence, WorkflowResult } from './workflow-contract.js'
import type { PolicySettings } from './automation-contract.js'

@Entity(pluginArtifactTableName(NAMESPACE, 'workflow_diagnosis'))
@Index(['repositoryPolicyId', 'operationKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'assistantId', 'userId'])
export class WorkflowDiagnosis {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) assistantId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'uuid' }) repositoryPolicyId!: string
  @Column({ type: 'varchar' }) operationKey!: string
  @Column({ type: 'int' }) policyRevision!: number
  @Column({ type: 'jsonb' }) settings!: PolicySettings
  @Column({ type: 'jsonb' }) ref!: WorkflowRef
  @Column({ type: 'varchar', default: 'queued' }) status!: 'queued' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled' | 'superseded'
  @Column({ type: 'varchar', nullable: true }) reason!: string | null
  @Column({ type: 'jsonb', nullable: true }) evidence!: WorkflowEvidence | null
  @Column({ type: 'jsonb', nullable: true }) result!: WorkflowResult | null
  @Column({ type: 'varchar', nullable: true }) executionId!: string | null
  @Column({ type: 'varchar', nullable: true }) conversationId!: string | null
  @Column({ type: 'varchar', nullable: true }) taskId!: string | null
  @Column({ type: 'varchar', nullable: true }) threadId!: string | null
  @Column({ type: 'timestamptz', nullable: true }) startedAt!: Date | null
  @Column({ type: 'timestamptz', nullable: true }) finishedAt!: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
