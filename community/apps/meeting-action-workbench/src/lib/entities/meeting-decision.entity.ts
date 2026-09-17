import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { MEETING_ARTIFACT_NAMESPACE } from '../constants'
import type { ReviewStatus } from '../types'

@Entity(pluginArtifactTableName(MEETING_ARTIFACT_NAMESPACE, 'decision'))
@Index(['tenantId', 'organizationId', 'meetingId', 'itemKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'meetingId', 'sortOrder'])
export class MeetingDecision {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar', nullable: true }) tenantId!: string | null
  @Column({ type: 'varchar', nullable: true }) organizationId!: string | null
  @Column({ type: 'uuid' }) meetingId!: string
  @Column({ type: 'varchar', length: 80 }) itemKey!: string
  @Column({ type: 'text' }) statement!: string
  @Column({ type: 'text' }) evidenceQuote!: string
  @Column({ type: 'double precision' }) confidence!: number
  @Column({ type: 'varchar', length: 24, default: 'pending' }) reviewStatus!: ReviewStatus
  @Column({ type: 'integer', default: 0 }) sortOrder!: number
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
