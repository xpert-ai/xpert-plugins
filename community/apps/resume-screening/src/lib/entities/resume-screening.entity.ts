import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { RESUME_SCREENING_TABLE } from '../constants.js'
import type { ResumeDegreeLevel, ResumeScreeningStatus } from '../types.js'

@Entity(RESUME_SCREENING_TABLE)
@Index(['tenantId', 'organizationId'])
@Index(['tenantId', 'organizationId', 'status'])
export class ResumeScreening {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar', nullable: true })
  xpertId?: string

  @Column({ type: 'varchar', nullable: true })
  agentKey?: string

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'varchar' })
  jobTitle!: string

  /** Full JD text (responsibilities + requirements). Stored as evidence for scoring. */
  @Column({ type: 'text' })
  jdText!: string

  @Column({ type: 'int' })
  minYears!: number

  @Column({ type: 'varchar' })
  minDegree!: ResumeDegreeLevel

  /** Required skills from the JD. Stored as JSON array. */
  @Column({ type: 'json' })
  requiredSkills!: string[]

  @Column({ type: 'varchar', default: 'draft' })
  status?: ResumeScreeningStatus

  @Column({ type: 'int', default: 0 })
  candidateCount?: number

  /** Sealed atomically before accepting the first candidate; never reopened. */
  @Column({ type: 'boolean', default: false })
  criteriaLocked?: boolean

  @Column({ type: 'int', default: 1 })
  editRevision?: number

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
