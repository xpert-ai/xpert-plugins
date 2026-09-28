import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { ScrapeTaskLogAction } from '../types'
import type { ScrapeTask } from './scrape-task.entity'

@Entity('plugin_scrape_task_intake_task_log')
@Index(['tenantId', 'organizationId', 'taskId'])
export class ScrapeTaskLog {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  taskId?: string

  @ManyToOne('ScrapeTask', (task: ScrapeTask) => task.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task?: ScrapeTask

  @Column({ type: 'varchar' })
  action?: ScrapeTaskLogAction

  @Column({ type: 'varchar', nullable: true })
  operatorId?: string

  @Column({ type: 'varchar', nullable: true })
  operatorName?: string

  @Column({ type: 'jsonb', nullable: true })
  detail?: unknown

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
