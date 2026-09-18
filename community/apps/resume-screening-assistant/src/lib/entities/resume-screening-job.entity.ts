import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ResumeScreeningJobStatus } from '../types.js'

@Entity('plugin_resume_screening_job')
@Index(['tenantId', 'organizationId', 'projectId'])
export class ResumeScreeningJob {
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

  @Column({ type: 'varchar', nullable: true })
  xpertId?: string | null

  @Column({ type: 'varchar', nullable: true })
  agentKey?: string | null

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'text' })
  jd!: string

  @Column({ type: 'json', nullable: true })
  mustHaveSkills?: string[]

  @Column({ type: 'json', nullable: true })
  niceToHaveSkills?: string[]

  @Column({ type: 'int', nullable: true })
  minYearsExperience?: number

  @Column({ type: 'text', nullable: true })
  screeningNotes?: string | null

  @Column({ type: 'varchar', default: 'draft' })
  status?: ResumeScreeningJobStatus

  @Column({ type: 'int', default: 0 })
  candidateCount?: number

  @Column({ type: 'int', default: 0 })
  completedCount?: number

  @Column({ type: 'int', default: 0 })
  failedCount?: number

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
