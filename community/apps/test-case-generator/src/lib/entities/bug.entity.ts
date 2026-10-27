import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { BugSeverity, BugStatus } from '../types'
import type { TestCaseProjectEntity } from './test-case-project.entity'

@Entity('plugin_bug')
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
export class BugEntity {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @ManyToOne('TestCaseProjectEntity', undefined, {
    onDelete: 'SET NULL'
  })
  project?: TestCaseProjectEntity

  @Column({ type: 'varchar' })
  title?: string

  @Column({ type: 'text' })
  description?: string

  @Column({ type: 'varchar', default: 'major' })
  severity?: BugSeverity

  @Column({ type: 'varchar', default: 'open' })
  status?: BugStatus

  @Column({ type: 'text', nullable: true })
  rootCause?: string

  @Column({ type: 'jsonb', nullable: true })
  regressionCases?: Array<{
    name: string
    precondition: string
    steps: string[]
    expectedResult: string
    priority: string
  }>

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
