import { Column, Entity, Index, PrimaryColumn, CreateDateColumn, Unique } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import type { ReviewPipelineEvidenceContent, ReviewPipelineDeliveryReceipt } from './contract.js'
import { NAMESPACE } from '../domain.js'

@Entity(pluginArtifactTableName(NAMESPACE, 'pipeline_binding'))
@Index(['tenantId', 'organizationId', 'projectId', 'userId'])
@Index('code_review_pipeline_subject', ['tenantId', 'organizationId', 'projectId', 'sourceKey', 'savedBindingId'], { unique: true })
@Unique('code_review_pipeline_binding_identity', ['id', 'tenantId', 'organizationId', 'projectId', 'userId'])
export class ReviewPipelineBinding {
  @PrimaryColumn({ type: 'uuid' }) id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'uuid' }) projectId!: string
  @Column({ type: 'varchar' }) assistantId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar', nullable: true }) sourceKey!: string | null
  @Column({ type: 'uuid', nullable: true }) savedBindingId!: string | null
  @Column({ type: 'uuid', nullable: true }) currentReviewId!: string | null
  @Column({ type: 'uuid', nullable: true }) instanceId!: string | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}

@Entity(pluginArtifactTableName(NAMESPACE, 'pipeline_evidence'))
@Unique('code_review_pipeline_evidence_operation', ['tenantId', 'organizationId', 'projectId', 'operationId', 'port'])
export class ReviewPipelineEvidence {
  @PrimaryColumn({ type: 'uuid' }) id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'uuid' }) projectId!: string
  @Column({ type: 'uuid' }) reviewId!: string
  @Column({ type: 'uuid' }) operationId!: string
  @Column({ type: 'varchar' }) port!: string
  @Column({ type: 'varchar' }) schemaRef!: string
  @Column({ type: 'varchar' }) digest!: string
  @Column({ type: 'jsonb' }) content!: ReviewPipelineEvidenceContent
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}

@Entity(pluginArtifactTableName(NAMESPACE, 'pipeline_delivery'))
@Unique('code_review_pipeline_delivery_operation', ['tenantId', 'organizationId', 'projectId', 'operationId'])
export class ReviewPipelineDelivery {
  @PrimaryColumn({ type: 'uuid' }) id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'uuid' }) projectId!: string
  @Column({ type: 'uuid' }) reviewId!: string
  @Column({ type: 'uuid' }) operationId!: string
  @Column({ type: 'varchar' }) headSha!: string
  @Column({ type: 'varchar' }) marker!: string
  @Column({ type: 'varchar' }) authorId!: string
  @Column({ type: 'text' }) body!: string
  @Column({ type: 'varchar' }) status!: 'sending' | 'unknown' | 'confirmed'
  @Column({ type: 'jsonb', nullable: true }) receipt!: ReviewPipelineDeliveryReceipt | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}
