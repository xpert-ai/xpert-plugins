import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { MEETING_ARTIFACT_NAMESPACE } from '../constants'
import type { ActionPriority, ActionStatus, ReviewStatus } from '../types'

@Entity(pluginArtifactTableName(MEETING_ARTIFACT_NAMESPACE, 'action_item'))
@Index(['tenantId', 'organizationId', 'meetingId', 'itemKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'meetingId', 'sortOrder'])
export class MeetingActionItem {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar', nullable: true }) tenantId!: string | null
  @Column({ type: 'varchar', nullable: true }) organizationId!: string | null
  @Column({ type: 'uuid' }) meetingId!: string
  @Column({ type: 'varchar', length: 80 }) itemKey!: string
  @Column({ type: 'text' }) task!: string
  @Column({ type: 'varchar', length: 160, nullable: true }) owner!: string | null
  @Column({ type: 'date', nullable: true }) dueDate!: string | null
  @Column({ type: 'varchar', length: 16 }) priority!: ActionPriority
  @Column({ type: 'varchar', length: 32 }) status!: ActionStatus
  @Column({ type: 'text' }) evidenceQuote!: string
  @Column({ type: 'double precision' }) confidence!: number
  @Column({ type: 'varchar', length: 24, default: 'pending' }) reviewStatus!: ReviewStatus
  @Column({ type: 'integer', default: 0 }) sortOrder!: number
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
