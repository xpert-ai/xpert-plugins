import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { AutomationFramework } from '../types'
import type { TestCaseProjectEntity } from './test-case-project.entity'

@Entity('plugin_automation_script')
@Index(['tenantId', 'organizationId', 'projectId', 'framework', 'createdAt'])
export class AutomationScriptEntity {
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
    onDelete: 'CASCADE'
  })
  project?: TestCaseProjectEntity

  @Column({ type: 'varchar', nullable: true })
  testCaseId?: string

  @Column({ type: 'varchar', nullable: true })
  testCaseName?: string

  @Column({ type: 'varchar' })
  framework?: AutomationFramework

  @Column({ type: 'varchar', default: 'typescript' })
  language?: string

  @Column({ type: 'varchar' })
  filename?: string

  @Column({ type: 'text' })
  content?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
