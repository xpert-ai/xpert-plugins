import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { RFID_ARTIFACT_NAMESPACE } from '../rfid-constants.js'
import type { AiSummary, AnalysisStatus, ExperimentRow, ExperimentStatistics } from '../experiment-contracts.js'

@Entity(`plugin_${RFID_ARTIFACT_NAMESPACE}_analysis`)
@Index(['tenantId', 'organizationId', 'workspaceId', 'projectId', 'createdById'])
@Index(['tenantId', 'importKey'], { unique: true })
export class ExperimentAnalysis {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId!: string | null
  @Column({ type: 'varchar', nullable: true }) workspaceId!: string | null
  @Column({ type: 'varchar', nullable: true }) projectId!: string | null
  @Column({ type: 'varchar' }) createdById!: string
  @Column({ type: 'varchar' }) importKey!: string
  @Column({ type: 'varchar', length: 200 }) name!: string
  @Column({ type: 'varchar', length: 255 }) fileName!: string
  @Column({ type: 'varchar', default: 'DRAFT' }) status!: AnalysisStatus
  @Column({ type: 'json' }) rows!: ExperimentRow[]
  @Column({ type: 'json' }) datasetSummary!: { recordCount: number; conditionCount: number }
  @Column({ type: 'json' }) statistics!: ExperimentStatistics
  @Column({ type: 'json', nullable: true }) aiSummary!: AiSummary | null
  @Column({ type: 'text', nullable: true }) errorMessage!: string | null
  @Column({ type: 'varchar', nullable: true }) attemptId!: string | null
  @Column({ type: 'bigint', nullable: true }) attemptDeadline!: string | null
  @Column({ type: 'varchar', nullable: true }) confirmedAt!: string | null
  @CreateDateColumn() createdAt!: Date
  @UpdateDateColumn() updatedAt!: Date
}
