import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { ARTIFACT_NAMESPACE } from '../constants.js'
import type {
  AnalysisStatus,
  HumanDecision,
  MatchResult
} from '../types.js'

// Persisted table identity stays stable; changing the namespace requires an explicit migration.
const ANALYSIS_TABLE = 'plugin_resume_match_analysis'
if (ANALYSIS_TABLE !== pluginArtifactTableName(ARTIFACT_NAMESPACE, 'analysis')) {
  throw new Error('Resume-match artifact namespace changed without a table migration.')
}

@Entity(ANALYSIS_TABLE)
@Index(['tenantId', 'organizationId', 'userId', 'updatedAt'])
@Index(['tenantId', 'organizationId', 'status'])
export class ResumeMatchAnalysisEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 64 })
  tenantId!: string

  @Column({ type: 'varchar', length: 64 })
  organizationId!: string

  @Column({ type: 'varchar', length: 64 })
  userId!: string

  @Column({ type: 'varchar', length: 64, nullable: true })
  assistantId?: string | null

  @Column({ type: 'varchar', length: 80 })
  candidateName!: string

  @Column({ type: 'varchar', length: 80, nullable: true })
  candidateTitle?: string | null

  @Column({ type: 'int', nullable: true })
  candidateYears?: number | null

  @Column({ type: 'varchar', length: 40, nullable: true })
  candidateCity?: string | null

  @Column({ type: 'varchar', length: 40, nullable: true })
  candidatePhone?: string | null

  @Column({ type: 'varchar', length: 120, nullable: true })
  candidateEmail?: string | null

  @Column({ type: 'varchar', length: 80 })
  jobTitle!: string

  @Column({ type: 'varchar', length: 80, nullable: true })
  company?: string | null

  @Column({ type: 'varchar', length: 40, nullable: true })
  jobCity?: string | null

  @Column({ type: 'varchar', length: 40, nullable: true })
  salary?: string | null

  @Column({ type: 'text' })
  jobText!: string

  @Column({ type: 'text' })
  resumeText!: string

  @Column({ type: 'varchar', length: 24, default: 'waiting_ai' })
  status!: AnalysisStatus

  @Column({ type: 'int', default: 0 })
  revision!: number

  @Column({ type: 'int', default: 0 })
  attempt!: number

  @Column({ type: 'int', nullable: true })
  score?: number | null

  @Column({ type: 'jsonb', nullable: true })
  result?: MatchResult | null

  @Column({ type: 'varchar', length: 20, nullable: true })
  humanDecision?: HumanDecision | null

  @Column({ type: 'int', nullable: true })
  humanScore?: number | null

  @Column({ type: 'text', nullable: true })
  humanConclusion?: string | null

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
