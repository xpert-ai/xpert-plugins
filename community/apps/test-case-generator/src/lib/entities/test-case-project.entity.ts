import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { TestCaseGranularity } from '../types'
import type { TestCaseEntity } from './test-case.entity'

@Entity('plugin_test_case_project')
@Index(['tenantId', 'organizationId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'createdBy', 'createdAt'])
export class TestCaseProjectEntity {
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
  createdBy?: string

  @Column({ type: 'text' })
  requirementText?: string

  @Column({ type: 'varchar', default: 'basic' })
  granularity?: TestCaseGranularity

  @OneToMany('TestCaseEntity', (testCase: TestCaseEntity) => testCase.project, {
    cascade: true
  })
  testCases?: TestCaseEntity[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
