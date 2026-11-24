import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { namespace } from '../constants'
import type { AnalysisFailure, AnalysisInput, AnalysisResult, AnalysisState } from '../../shared/analysis'

@Entity(pluginArtifactTableName(namespace, 'attempt'))
@Index(['tenantId', 'organizationId', 'ownerId', 'recordId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'ownerId', 'recordId', 'requestId'], { unique: true })
export class AnalysisAttempt {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'uuid' }) tenantId!: string
  @Column({ type: 'uuid' }) organizationId!: string
  @Column({ type: 'uuid' }) ownerId!: string
  @Column({ type: 'uuid' }) recordId!: string
  @Column({ type: 'uuid' }) requestId!: string
  @Column({ type: 'uuid' }) assistantId!: string
  @Column({ type: 'uuid' }) workspaceId!: string
  @Column({ type: 'integer' }) sourceRevision!: number
  @Column({ type: 'jsonb' }) input!: AnalysisInput
  @Column({ type: 'varchar' }) status!: AnalysisState['status']
  @Column({ type: 'varchar', nullable: true }) jobId!: string | null
  @Column({ type: 'varchar', nullable: true }) errorCode!: AnalysisFailure | null
  @Column({ type: 'jsonb', nullable: true }) result!: AnalysisResult | null
  @Column({ type: 'timestamptz', nullable: true }) startedAt!: Date | null
  @Column({ type: 'timestamptz', nullable: true }) completedAt!: Date | null
  @Column({ type: 'timestamptz' }) deadlineAt!: Date
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}
