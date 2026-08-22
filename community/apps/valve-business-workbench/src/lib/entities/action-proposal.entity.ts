import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { VALVE_ARTIFACT_NAMESPACE } from '../constants'
import type { ValveJsonObject, ValveProposalKind, ValveProposalStatus } from '../types'

@Entity(pluginArtifactTableName(VALVE_ARTIFACT_NAMESPACE, 'action_proposal'))
@Index(['tenantId', 'organizationId', 'operationId'], { unique: true })
@Index(['tenantId', 'organizationId', 'resourceId', 'entityId', 'status'])
export class ValveActionProposal {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) operationId!: string
  @Column({ type: 'varchar' }) requestHash!: string
  @Column({ type: 'varchar' }) resourceId!: string
  @Column({ type: 'varchar' }) snapshotId!: string
  @Column({ type: 'varchar' }) graphVersion!: string
  @Column({ type: 'varchar', nullable: true }) partitionKey!: string | null
  @Column({ type: 'varchar' }) entityId!: string
  @Column({ type: 'varchar' }) entityTypeCode!: string
  @Column({ type: 'varchar' }) externalKey!: string
  @Column({ type: 'varchar' }) entityLabel!: string
  @Column({ type: 'varchar' }) kind!: ValveProposalKind
  @Column({ type: 'varchar', nullable: true }) actionTypeCode!: string | null
  @Column({ type: 'varchar' }) title!: string
  @Column({ type: 'text' }) summary!: string
  @Column({ type: 'jsonb', default: () => "'[]'" }) expectedEffects!: string[]
  @Column({ type: 'jsonb', default: () => "'{}'" }) evidence!: ValveJsonObject
  @Column({ type: 'varchar' }) status!: ValveProposalStatus
  @Column({ type: 'text', nullable: true }) reviewComment!: string | null
  @Column({ type: 'text', nullable: true }) outcome!: string | null
  @Column({ type: 'varchar', nullable: true }) createdBy!: string | null
  @Column({ type: 'varchar', nullable: true }) reviewedBy!: string | null
  @Column({ type: 'varchar', nullable: true }) completedBy!: string | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
