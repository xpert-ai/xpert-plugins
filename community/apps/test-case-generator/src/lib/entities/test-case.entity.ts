import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { TestCasePriority } from '../types'
import type { TestCaseProjectEntity } from './test-case-project.entity'

@Entity('plugin_test_case')
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'priority', 'createdAt'])
export class TestCaseEntity {
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

  @ManyToOne('TestCaseProjectEntity', (project: TestCaseProjectEntity) => project.testCases, {
    onDelete: 'CASCADE'
  })
  project?: TestCaseProjectEntity

  @Column({ type: 'varchar' })
  name?: string

  @Column({ type: 'text', nullable: true })
  precondition?: string

  @Column({ type: 'jsonb', nullable: true })
  steps?: string[]

  @Column({ type: 'text', nullable: true })
  expectedResult?: string

  @Index()
  @Column({ type: 'varchar', default: 'P1' })
  priority?: TestCasePriority

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
