import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { CandidateScreeningStatus, ExtractedResume, MatchResult, ReviewerDecision } from '../types.js'

@Entity('plugin_resume_screening_candidate')
@Index(['tenantId', 'organizationId', 'projectId'])
@Index(['tenantId', 'organizationId', 'jobId'])
export class ResumeCandidate {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string | null

  @Column({ type: 'varchar', nullable: true })
  projectId?: string | null

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar' })
  jobId!: string

  @Column({ type: 'varchar' })
  sourceName!: string

  @Column({ type: 'text' })
  rawText!: string

  @Column({ type: 'varchar', default: 'pending' })
  status?: CandidateScreeningStatus

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null

  @Column({ type: 'json', nullable: true })
  extracted?: ExtractedResume

  @Column({ type: 'json', nullable: true })
  matchResult?: MatchResult

  @Column({ type: 'varchar', nullable: true })
  reviewerDecision?: ReviewerDecision | null

  @Column({ type: 'int', nullable: true })
  reviewerScore?: number | null

  @Column({ type: 'text', nullable: true })
  reviewerNote?: string | null

  @Column({ type: 'text', nullable: true })
  summaryOverride?: string | null

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
