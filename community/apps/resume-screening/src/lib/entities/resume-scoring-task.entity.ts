import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_ARTIFACT_NAMESPACE } from '../constants.js'
import type { ResumeEvidence } from '../types.js'

export interface ScoringTaskItem {
  candidateId: string
  evidence: ResumeEvidence
  scoreRevision: number
}

@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'scoring_task'))
@Index(['tenantId', 'organizationId', 'screeningId'])
export class ResumeScoringTask {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Column({ type: 'varchar' }) screeningId!: string
  @Column({ type: 'json' }) items!: ScoringTaskItem[]
  @Column({ type: 'boolean', default: false }) replaceReviewed!: boolean
  @CreateDateColumn() createdAt?: Date
}
