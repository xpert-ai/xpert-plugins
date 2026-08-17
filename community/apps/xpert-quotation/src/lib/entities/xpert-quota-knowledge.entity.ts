import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { WorkspaceFileCatalog } from '@xpert-ai/plugin-sdk'
import { xpertQuotationTable } from '../constants.js'

export type XpertQuotaSourceVersionStatus = 'draft' | 'ready_for_review' | 'active' | 'superseded' | 'failed'
export type XpertQuotaIngestionStatus = 'queued' | 'running' | 'ready_for_review' | 'failed' | 'cancelled'
export type XpertQuotaReviewStatus = 'unreviewed' | 'approved' | 'rejected'
export type XpertQuotaReviewDecision = 'approve' | 'reject'
export type XpertQuotaSyncStatus = 'pending' | 'synced' | 'failed' | 'deleted'
export type XpertQuotaKnowledgeSyncJobStatus = 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled'

@Entity(xpertQuotationTable('knowledge_source'))
@Index(['tenantId', 'scopeKey', 'updatedAt'])
@Index(['tenantId', 'scopeKey', 'sourceKey'], { unique: true })
export class XpertQuotaKnowledgeSource {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', length: 128 }) scopeKey!: string
  @Column({ type: 'varchar', length: 128 }) sourceKey!: string
  @Column({ type: 'varchar', length: 260 }) displayName!: string
  @Column({ type: 'varchar', length: 80, default: 'quota_pdf' }) kind!: string
  @Column({ type: 'uuid', nullable: true }) activeVersionId?: string | null
  @Column({ type: 'int', default: 0 }) currentVersionNumber!: number
  @Column({ type: 'int', default: 1 }) revision!: number
  @Column({ type: 'varchar', nullable: true }) createdById?: string | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}

@Entity(xpertQuotationTable('knowledge_source_version'))
@Index(['tenantId', 'scopeKey', 'sourceId', 'versionNumber'], { unique: true })
@Index(['tenantId', 'scopeKey', 'sha256'])
@Index(['tenantId', 'scopeKey', 'status', 'updatedAt'])
export class XpertQuotaKnowledgeSourceVersion {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', length: 128 }) scopeKey!: string
  @Column({ type: 'uuid' }) sourceId!: string
  @Column({ type: 'int' }) versionNumber!: number
  @Column({ type: 'varchar', length: 260 }) originalFileName!: string
  @Column({ type: 'varchar', length: 160 }) mimeType!: string
  @Column({ type: 'int' }) size!: number
  @Column({ type: 'varchar', length: 64 }) sha256!: string
  @Column({ type: 'varchar', length: 40 }) parserVersion!: string
  @Column({ type: 'varchar', length: 32 }) workspaceCatalog!: WorkspaceFileCatalog
  @Column({ type: 'varchar' }) workspaceScopeId!: string
  @Column({ type: 'text' }) workspaceFilePath!: string
  @Column({ type: 'text', nullable: true }) workspacePath?: string | null
  @Column({ type: 'varchar', default: 'draft' }) status!: XpertQuotaSourceVersionStatus
  @Column({ type: 'int', default: 0 }) pageCount!: number
  @Column({ type: 'int', default: 0 }) quotaItemCount!: number
  @Column({ type: 'int', default: 0 }) resourceCount!: number
  @Column({ type: 'int', default: 0 }) warningCount!: number
  @Column({ type: 'int', default: 0 }) readyCount!: number
  @Column({ type: 'int', default: 0 }) reviewRequiredCount!: number
  @Column({ type: 'jsonb', default: () => "'[]'" }) warnings!: Array<Record<string, unknown>>
  @Column({ type: 'int', default: 1 }) revision!: number
  @Column({ type: 'timestamptz', nullable: true }) publishedAt?: Date | null
  @Column({ type: 'varchar', nullable: true }) publishedById?: string | null
  @Column({ type: 'varchar', nullable: true }) createdById?: string | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}

@Entity(xpertQuotationTable('ingestion_job'))
@Index(['tenantId', 'scopeKey', 'sourceVersionId'], { unique: true })
@Index(['tenantId', 'scopeKey', 'status', 'updatedAt'])
export class XpertQuotaIngestionJob {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', length: 128 }) scopeKey!: string
  @Column({ type: 'uuid' }) sourceId!: string
  @Column({ type: 'uuid' }) sourceVersionId!: string
  @Column({ type: 'varchar', length: 160, unique: true }) queueJobId!: string
  @Column({ type: 'varchar', default: 'queued' }) status!: XpertQuotaIngestionStatus
  @Column({ type: 'varchar', length: 80, default: 'queued' }) stage!: string
  @Column({ type: 'int', default: 0 }) progress!: number
  @Column({ type: 'int', default: 0 }) currentPage!: number
  @Column({ type: 'int', default: 0 }) totalPages!: number
  @Column({ type: 'int', default: 0 }) itemCount!: number
  @Column({ type: 'int', default: 0 }) resourceCount!: number
  @Column({ type: 'int', default: 0 }) warningCount!: number
  @Column({ type: 'varchar', length: 100, nullable: true }) errorCode?: string | null
  @Column({ type: 'text', nullable: true }) errorMessage?: string | null
  @Column({ type: 'int', default: 0 }) attempt!: number
  @Column({ type: 'timestamptz', nullable: true }) startedAt?: Date | null
  @Column({ type: 'timestamptz', nullable: true }) finishedAt?: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}

@Entity(xpertQuotationTable('quota_item'))
@Index(['tenantId', 'scopeKey', 'sourceVersionId', 'quotaCode'], { unique: true })
@Index(['tenantId', 'scopeKey', 'sourceVersionId', 'reviewStatus', 'ingestionReady'])
@Index(['tenantId', 'scopeKey', 'quotaCode'])
export class XpertQuotaItem {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', length: 128 }) scopeKey!: string
  @Column({ type: 'uuid' }) sourceId!: string
  @Column({ type: 'uuid' }) sourceVersionId!: string
  @Column({ type: 'varchar', length: 40 }) quotaCode!: string
  @Column({ type: 'varchar', length: 500 }) quotaName!: string
  @Column({ type: 'varchar', length: 80 }) quotaUnit!: string
  @Column({ type: 'varchar', length: 500, nullable: true }) chapter?: string | null
  @Column({ type: 'varchar', length: 80, nullable: true }) sectionCode?: string | null
  @Column({ type: 'varchar', length: 500, nullable: true }) sectionTitle?: string | null
  @Column({ type: 'jsonb', default: () => "'[]'" }) workContents!: string[]
  @Column({ type: 'jsonb', default: () => "'[]'" }) adjustments!: string[]
  @Column({ type: 'jsonb', default: () => "'[]'" }) formulas!: string[]
  @Column({ type: 'varchar', default: 'unreviewed' }) reviewStatus!: XpertQuotaReviewStatus
  @Column({ type: 'boolean', default: false }) ingestionReady!: boolean
  @Column({ type: 'varchar', length: 64 }) contentHash!: string
  @Column({ type: 'int', default: 1 }) revision!: number
  @Column({ type: 'timestamptz', nullable: true }) reviewedAt?: Date | null
  @Column({ type: 'varchar', nullable: true }) reviewedById?: string | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}

@Entity(xpertQuotationTable('quota_resource'))
@Index(['tenantId', 'scopeKey', 'quotaItemId', 'position'], { unique: true })
@Index(['tenantId', 'scopeKey', 'sourceVersionId', 'resourceCode'])
export class XpertQuotaResource {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', length: 128 }) scopeKey!: string
  @Column({ type: 'uuid' }) sourceVersionId!: string
  @Column({ type: 'uuid' }) quotaItemId!: string
  @Column({ type: 'int' }) position!: number
  @Column({ type: 'varchar', length: 40 }) category!: string
  @Column({ type: 'varchar', length: 80 }) resourceCode!: string
  @Column({ type: 'varchar', length: 500 }) resourceName!: string
  @Column({ type: 'varchar', length: 80 }) unit!: string
  @Column({ type: 'numeric', precision: 24, scale: 8, nullable: true }) consumption?: string | null
  @Column({ type: 'varchar', length: 120 }) originalConsumption!: string
  @Column({ type: 'varchar', length: 40, default: 'quantity' }) consumptionKind!: string
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}

@Entity(xpertQuotationTable('quota_evidence'))
@Index(['tenantId', 'scopeKey', 'quotaItemId'], { unique: true })
export class XpertQuotaEvidence {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', length: 128 }) scopeKey!: string
  @Column({ type: 'uuid' }) sourceVersionId!: string
  @Column({ type: 'uuid' }) quotaItemId!: string
  @Column({ type: 'jsonb', default: () => "'[]'" }) pdfPages!: number[]
  @Column({ type: 'jsonb', default: () => "'[]'" }) printedPages!: string[]
  @Column({ type: 'text' }) excerpt!: string
  @Column({ type: 'varchar', length: 64 }) sourceSha256!: string
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}

@Entity(xpertQuotationTable('quota_review'))
@Index(['tenantId', 'scopeKey', 'quotaItemId', 'createdAt'])
export class XpertQuotaReview {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', length: 128 }) scopeKey!: string
  @Column({ type: 'uuid' }) sourceVersionId!: string
  @Column({ type: 'uuid' }) quotaItemId!: string
  @Column({ type: 'varchar' }) decision!: XpertQuotaReviewDecision
  @Column({ type: 'text' }) comment!: string
  @Column({ type: 'int' }) baseRevision!: number
  @Column({ type: 'int' }) resultingRevision!: number
  @Column({ type: 'varchar', nullable: true }) reviewerId?: string | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}

@Entity(xpertQuotationTable('knowledge_sync'))
@Index(['tenantId', 'scopeKey', 'sourceVersionId', 'quotaItemId', 'knowledgebaseId'], { unique: true })
@Index(['tenantId', 'scopeKey', 'knowledgebaseId', 'status'])
export class XpertQuotaKnowledgeSync {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', length: 128 }) scopeKey!: string
  @Column({ type: 'uuid' }) sourceVersionId!: string
  @Column({ type: 'uuid' }) quotaItemId!: string
  @Column({ type: 'varchar' }) knowledgebaseId!: string
  @Column({ type: 'varchar', length: 500 }) writeKey!: string
  @Column({ type: 'varchar', nullable: true }) chunkId?: string | null
  @Column({ type: 'varchar', length: 64 }) contentHash!: string
  @Column({ type: 'varchar', default: 'pending' }) status!: XpertQuotaSyncStatus
  @Column({ type: 'text', nullable: true }) errorMessage?: string | null
  @Column({ type: 'timestamptz', nullable: true }) syncedAt?: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}

@Entity(xpertQuotationTable('knowledge_sync_job'))
@Index(['tenantId', 'scopeKey', 'sourceVersionId', 'knowledgebaseId', 'updatedAt'])
@Index(['tenantId', 'scopeKey', 'status', 'updatedAt'])
export class XpertQuotaKnowledgeSyncJob {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', length: 128 }) scopeKey!: string
  @Column({ type: 'uuid' }) sourceVersionId!: string
  @Column({ type: 'varchar' }) knowledgebaseId!: string
  @Column({ type: 'varchar', length: 160, unique: true }) queueJobId!: string
  @Column({ type: 'varchar', default: 'queued' }) status!: XpertQuotaKnowledgeSyncJobStatus
  @Column({ type: 'varchar', length: 80, default: 'queued' }) stage!: string
  @Column({ type: 'int', default: 0 }) progress!: number
  @Column({ type: 'int', default: 0 }) total!: number
  @Column({ type: 'int', default: 0 }) processed!: number
  @Column({ type: 'int', default: 0 }) synced!: number
  @Column({ type: 'int', default: 0 }) skipped!: number
  @Column({ type: 'int', default: 0 }) failed!: number
  @Column({ type: 'int', default: 0 }) attempt!: number
  @Column({ type: 'varchar', length: 100, nullable: true }) errorCode?: string | null
  @Column({ type: 'text', nullable: true }) errorMessage?: string | null
  @Column({ type: 'varchar', nullable: true }) createdById?: string | null
  @Column({ type: 'timestamptz', nullable: true }) startedAt?: Date | null
  @Column({ type: 'timestamptz', nullable: true }) finishedAt?: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
