import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { RESUME_CANDIDATE_TABLE } from '../constants.js'
import type { PrescreenFinding, ResumeDegreeLevel } from '../types.js'

@Entity(RESUME_CANDIDATE_TABLE)
@Index(['tenantId', 'organizationId', 'screeningId'])
export class ResumeCandidate {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar' })
  screeningId!: string

  /** Display name supplied by HR. Demo data is fictional. */
  @Column({ type: 'varchar' })
  name!: string

  @Column({ type: 'int' })
  yearsOfExperience!: number

  @Column({ type: 'varchar' })
  degree!: ResumeDegreeLevel

  /** Skills claimed in the resume. Stored as JSON array. */
  @Column({ type: 'json' })
  skills!: string[]

  /** Plain-text resume content supplied by HR. */
  @Column({ type: 'text' })
  resumeText!: string

  /** Deterministic prescreen findings (R-01..R-03) with rule codes and evidence. */
  @Column({ type: 'json', nullable: true })
  prescreenFindings?: PrescreenFinding[]

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
