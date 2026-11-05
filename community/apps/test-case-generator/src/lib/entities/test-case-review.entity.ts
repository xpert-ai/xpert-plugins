import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { TestCaseProjectEntity } from './test-case-project.entity'

@Entity('plugin_test_case_review')
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
export class TestCaseReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Index()
  @Column({ type: 'varchar' })
  projectId?: string

  @ManyToOne('TestCaseProjectEntity', undefined, {
    onDelete: 'CASCADE'
  })
  project?: TestCaseProjectEntity

  @Column({ type: 'text' })
  requirementText?: string

  @Column({ type: 'integer', default: 0 })
  totalPoints?: number

  @Column({ type: 'integer', default: 0 })
  coveredPoints?: number

  @Column({ type: 'integer', default: 0 })
  coverageScore?: number

  @Column({ type: 'jsonb', nullable: true })
  requirementPoints?: Array<{
    point: string
    covered: boolean
    relatedCaseNames: string[]
  }>

  @Column({ type: 'jsonb', nullable: true })
  issues?: Array<{
    type: 'duplicate' | 'missing' | 'priority' | 'other'
    description: string
    caseNames?: string[]
    suggestion?: string
  }>

  @Column({ type: 'jsonb', nullable: true })
  suggestedCases?: Array<{
    name: string
    precondition: string
    steps: string[]
    expectedResult: string
    priority: string
  }>

  @Column({ type: 'text', nullable: true })
  summary?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
