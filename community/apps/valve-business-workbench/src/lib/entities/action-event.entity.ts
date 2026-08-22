import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { VALVE_ARTIFACT_NAMESPACE } from '../constants'
import type { ValveJsonObject, ValveProposalStatus } from '../types'

@Entity(pluginArtifactTableName(VALVE_ARTIFACT_NAMESPACE, 'action_event'))
@Index(['tenantId', 'organizationId', 'proposalId', 'createdAt'])
export class ValveActionEvent {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'uuid' }) proposalId!: string
  @Column({ type: 'varchar' }) eventType!: string
  @Column({ type: 'varchar', nullable: true }) fromStatus!: ValveProposalStatus | null
  @Column({ type: 'varchar', nullable: true }) toStatus!: ValveProposalStatus | null
  @Column({ type: 'varchar', nullable: true }) actorId!: string | null
  @Column({ type: 'text', nullable: true }) comment!: string | null
  @Column({ type: 'jsonb', nullable: true }) payload!: ValveJsonObject | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}
