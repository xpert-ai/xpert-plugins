import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { MEETING_ARTIFACT_NAMESPACE } from '../constants'
import type { ExecutionReviewStatus } from '../types'

@Entity(pluginArtifactTableName(MEETING_ARTIFACT_NAMESPACE, 'execution_review'))
@Index(['tenantId', 'organizationId', 'updatedAt'])
@Index(['tenantId', 'organizationId', 'status', 'updatedAt'])
export class MeetingExecutionReview {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar', nullable: true }) tenantId!: string | null
  @Column({ type: 'varchar', nullable: true }) organizationId!: string | null
  @Column({ type: 'varchar', length: 24 }) status!: ExecutionReviewStatus
  @Column({ type: 'integer', default: 1 }) revision!: number
  @Column({ type: 'varchar', length: 32, default: 'open_actions' }) focus!: string
  @Column({ type: 'text', nullable: true }) summary!: string | null
  @Column({ type: 'text', nullable: true }) followUpBrief!: string | null
  @Column({ type: 'integer', default: 0 }) riskCount!: number
  @Column({ type: 'varchar', length: 80, nullable: true }) errorCode!: string | null
  @Column({ type: 'text', nullable: true }) errorMessage!: string | null
  @Column({ type: 'varchar', nullable: true }) createdById!: string | null
  @Column({ type: 'varchar', nullable: true }) assistantId!: string | null
  @Column({ type: 'varchar', nullable: true }) conversationId!: string | null
  @Column({ type: 'timestamptz', nullable: true }) completedAt!: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
