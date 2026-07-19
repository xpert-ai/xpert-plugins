import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { CutAnalysisExecutionMode, CutAnalysisJobStatus, CutAnalysisJobType, CutJsonValue } from '../types.js'

@Entity('plugin_cut_analysis_job')
@Index(['tenantId', 'organizationId', 'cutProjectId', 'type', 'status', 'createdAt'])
@Index(['tenantId', 'organizationId', 'cutProjectId', 'idempotencyKey'])
export class CutAnalysisJob {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string | null

  @Column({ type: 'varchar', nullable: true })
  platformProjectId?: string | null

  @Column({ type: 'varchar' })
  cutProjectId!: string

  @Column({ type: 'varchar' })
  type!: CutAnalysisJobType

  @Column({ type: 'varchar' })
  executionMode!: CutAnalysisExecutionMode

  @Column({ type: 'varchar', default: 'queued' })
  status!: CutAnalysisJobStatus

  @Column({ type: 'int', default: 0 })
  progress!: number

  @Column({ type: 'int' })
  inputRevision!: number

  @Column({ type: 'varchar', nullable: true })
  mediaAssetId?: string | null

  @Column({ type: 'varchar', nullable: true })
  language?: string | null

  @Column({ type: 'varchar', nullable: true })
  model?: string | null

  @Column({ type: 'varchar', nullable: true })
  idempotencyKey?: string | null

  @Column({ type: 'varchar', nullable: true })
  queueJobId?: string | null

  @Column({ type: 'boolean', default: false })
  cancellationRequested!: boolean

  @Column({ type: 'varchar', nullable: true })
  resultTranscriptId?: string | null

  @Column({ type: 'varchar', nullable: true })
  resultExportId?: string | null

  @Column({ type: 'varchar', nullable: true })
  sandboxJobId?: string | null

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null

  @Column({ type: 'jsonb', nullable: true })
  metadata?: CutJsonValue | null

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
