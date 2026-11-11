import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_ARTIFACT_NAMESPACE } from './constants'
import type { Batch, ChangeType, Evidence, ProposalDecision, ReplyStatus } from './types'

abstract class ScopedRecord {
  @PrimaryColumn({ type: 'varchar', length: 64 }) id!: string
  @Column({ type: 'varchar', nullable: true }) tenantId!: string | null
  @Column({ type: 'varchar', nullable: true }) organizationId!: string | null
}

@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'order_line'))
@Index(['tenantId', 'organizationId'])
@Index(['tenantId', 'organizationId', 'poNumber', 'lineNo'], { unique: true })
export class OrderLine extends ScopedRecord {
  @Column({ type: 'varchar' }) poNumber!: string
  @Column({ type: 'int' }) lineNo!: number
  @Column({ type: 'varchar' }) supplierName!: string
  @Column({ type: 'varchar' }) materialCode!: string
  @Column({ type: 'varchar' }) materialName!: string
  @Column({ type: 'double precision' }) quantity!: number
  @Column({ type: 'varchar' }) unit!: string
  @Column({ type: 'varchar', length: 10 }) originalDate!: string
  @Column({ type: 'varchar', length: 10 }) promisedDate!: string
  @Column({ type: 'int', default: 0 }) revision!: number
  @Column({ type: 'varchar', nullable: true }) lastAppliedProposalId!: string | null
}

@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'reply'))
@Index(['tenantId', 'organizationId'])
@Index(['tenantId', 'organizationId', 'contentHash'], { unique: true })
export class SupplierReply extends ScopedRecord {
  @Column({ type: 'text' }) rawText!: string
  @Column({ type: 'varchar', length: 64 }) contentHash!: string
  @Column({ type: 'varchar' }) status!: ReplyStatus
  @Column({ type: 'int', default: 0 }) parseAttempt!: number
  @Column({ type: 'varchar', nullable: true }) parseRequestedAt!: string | null
  @Column({ type: 'varchar', nullable: true }) failureCode!: string | null
  @Column({ type: 'text', nullable: true }) failureMessage!: string | null
  @Column({ type: 'varchar' }) createdBy!: string
  @Column({ type: 'varchar' }) createdAt!: string
  @Column({ type: 'varchar' }) updatedAt!: string
  @Column({ type: 'varchar', nullable: true }) confirmedBy!: string | null
  @Column({ type: 'varchar', nullable: true }) confirmedByName!: string | null
  @Column({ type: 'varchar', nullable: true }) confirmedAt!: string | null
  @Column({ type: 'text', nullable: true }) summary!: string | null
  // A durable claim freezes review while a partially completed confirmation is resumed.
  @Column({ type: 'varchar', nullable: true }) confirmationStartedAt!: string | null
  @Column({ type: 'varchar', nullable: true }) confirmationActorId!: string | null
  @Column({ type: 'varchar', nullable: true }) confirmationActorName!: string | null
  @Column({ type: 'int', default: 0 }) revision!: number
}

@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'proposal'))
@Index(['tenantId', 'organizationId'])
@Index(['replyId', 'orderLineId'], { unique: true })
export class ChangeProposal extends ScopedRecord {
  @Column({ type: 'varchar' }) replyId!: string
  @Column({ type: 'varchar' }) orderLineId!: string
  @Column({ type: 'int' }) orderLineRevision!: number
  // Preserve the pre-change date even if execution stops between order update and log insert.
  @Column({ type: 'varchar', length: 10 }) orderLineDate!: string
  @Column({ type: 'int' }) parseAttempt!: number
  @Column({ type: 'varchar' }) changeType!: ChangeType
  @Column({ type: 'varchar', nullable: true }) proposedDate!: string | null
  @Column({ type: 'double precision', nullable: true }) proposedQuantity!: number | null
  @Column({ type: 'simple-json' }) batches!: Batch[]
  @Column({ type: 'text', nullable: true }) reason!: string | null
  @Column({ type: 'simple-json' }) evidence!: Evidence[]
  @Column({ type: 'double precision' }) confidence!: number
  @Column({ type: 'varchar' }) decision!: ProposalDecision
  @Column({ type: 'varchar', nullable: true }) finalDate!: string | null
  @Column({ type: 'double precision', nullable: true }) finalQuantity!: number | null
  @Column({ type: 'varchar', default: 'draft' }) confirmationState!: 'draft' | 'applying' | 'confirmed'
  @Column({ type: 'int', default: 0 }) revision!: number
}

@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'change_log'))
@Index(['tenantId', 'organizationId'])
@Index(['tenantId', 'organizationId', 'proposalId'], { unique: true })
export class DeliveryChangeLog extends ScopedRecord {
  @Column({ type: 'varchar' }) orderLineId!: string
  @Column({ type: 'varchar' }) proposalId!: string
  @Column({ type: 'varchar' }) replyId!: string
  @Column({ type: 'varchar', length: 10 }) oldDate!: string
  @Column({ type: 'varchar', length: 10 }) newDate!: string
  @Column({ type: 'varchar', nullable: true }) aiDate!: string | null
  @Column({ type: 'simple-json' }) batches!: Batch[]
  @Column({ type: 'varchar' }) confirmedBy!: string
  @Column({ type: 'varchar', nullable: true }) confirmedByName!: string | null
  @Column({ type: 'varchar' }) confirmedAt!: string
}

export const ENTITIES = [OrderLine, SupplierReply, ChangeProposal, DeliveryChangeLog]
