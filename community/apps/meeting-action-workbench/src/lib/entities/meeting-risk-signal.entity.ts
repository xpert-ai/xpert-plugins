import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { MEETING_ARTIFACT_NAMESPACE } from '../constants'
import type { RiskReviewStatus, RiskSeverity, RiskSource, RiskType } from '../types'

@Entity(pluginArtifactTableName(MEETING_ARTIFACT_NAMESPACE, 'risk_signal'))
@Index(['tenantId', 'organizationId', 'reviewId', 'signalKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'reviewStatus', 'severity', 'updatedAt'])
export class MeetingRiskSignal {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar', nullable: true }) tenantId!: string | null
  @Column({ type: 'varchar', nullable: true }) organizationId!: string | null
  @Column({ type: 'uuid' }) reviewId!: string
  @Column({ type: 'varchar', length: 100 }) signalKey!: string
  @Column({ type: 'varchar', length: 16, default: 'agent' }) source!: RiskSource
  @Column({ type: 'varchar', length: 40 }) riskType!: RiskType
  @Column({ type: 'varchar', length: 16 }) severity!: RiskSeverity
  @Column({ type: 'varchar', length: 200 }) title!: string
  @Column({ type: 'text' }) rationale!: string
  @Column({ type: 'text' }) evidenceQuote!: string
  @Column({ type: 'text' }) recommendation!: string
  @Column({ type: 'uuid', nullable: true }) meetingId!: string | null
  @Column({ type: 'uuid', nullable: true }) actionItemId!: string | null
  @Column({ type: 'double precision' }) confidence!: number
  @Column({ type: 'varchar', length: 20, default: 'open' }) reviewStatus!: RiskReviewStatus
  @Column({ type: 'varchar', nullable: true }) reviewedById!: string | null
  @Column({ type: 'timestamptz', nullable: true }) reviewedAt!: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
