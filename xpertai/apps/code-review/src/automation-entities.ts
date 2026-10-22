import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, CreateDateColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import type { PolicySettings, RunStatus } from './automation-domain.js'
import { NAMESPACE } from './domain.js'

@Entity(pluginArtifactTableName(NAMESPACE, 'repository'))
@Index(['installationId', 'repositoryId'], { unique: true })
@Index(['tenantId', 'organizationId', 'assistantId'])
export class ReviewRepository {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar' }) assistantId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) installationId!: string
  @Column({ type: 'varchar' }) repositoryId!: string
  @Column({ type: 'uuid', nullable: true }) githubIntegrationId!: string | null
  @Column({ type: 'varchar', nullable: true }) githubAppId!: string | null
  @Column({ type: 'varchar' }) owner!: string
  @Column({ type: 'varchar' }) repository!: string
  @Column({ type: 'jsonb' }) settings!: PolicySettings
  @Column({ type: 'int', default: 1 }) revision!: number
  @Column({ type: 'varchar', nullable: true }) errorCode!: string | null
  @Column({ type: 'timestamptz', nullable: true }) lastEventAt!: Date | null
  @Column({ type: 'timestamptz', nullable: true }) confirmedAt!: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}

@Entity(pluginArtifactTableName(NAMESPACE, 'run'))
@Index(['repositoryPolicyId', 'operationKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'assistantId', 'createdAt'])
export class ReviewRun {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) assistantId!: string
  @Column({ type: 'uuid' }) repositoryPolicyId!: string
  @Column({ type: 'varchar' }) operationKey!: string
  @Column({ type: 'int' }) number!: number
  @Column({ type: 'varchar' }) headSha!: string
  @Column({ type: 'varchar' }) title!: string
  @Column({ type: 'varchar' }) trigger!: string
  @Column({ type: 'varchar' }) status!: RunStatus
  @Column({ type: 'varchar', nullable: true }) reason!: string | null
  @Column({ type: 'int' }) policyRevision!: number
  @Column({ type: 'jsonb' }) settings!: PolicySettings
  @Column({ type: 'timestamptz' }) notBefore!: Date
  @Column({ type: 'uuid', nullable: true }) reviewId!: string | null
  @Column({ type: 'uuid', nullable: true }) pipelineInstanceId!: string | null
  @Column({ type: 'uuid', nullable: true }) pipelineRoundId!: string | null
  @Column({ type: 'varchar', nullable: true }) jobId!: string | null
  @Column({ type: 'varchar', nullable: true }) publicationUrl!: string | null
  @Column({ type: 'timestamptz', nullable: true }) finishedAt!: Date | null
  @Column({ type: 'timestamptz', nullable: true }) startedAt!: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}

@Entity(pluginArtifactTableName(NAMESPACE, 'delivery'))
@Index(['deliveryId'], { unique: true })
export class ReviewDelivery {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) deliveryId!: string
  @Column({ type: 'varchar' }) event!: string
  @Column({ type: 'varchar' }) digest!: string
  @Column({ type: 'varchar', nullable: true }) tenantId!: string | null
  @Column({ type: 'varchar', nullable: true }) organizationId!: string | null
  @Column({ type: 'uuid', nullable: true }) runId!: string | null
  @Column({ type: 'varchar' }) status!: 'received' | 'processed'
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}
