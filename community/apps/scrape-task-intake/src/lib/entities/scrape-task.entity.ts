import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  ScrapeDataFieldSpec,
  ScrapeTaskCrawlFrequency,
  ScrapeTaskDeliveryFormat,
  ScrapeTaskPagesScope,
  ScrapeTaskPriority,
  ScrapeTaskSourceType,
  ScrapeTaskStatus,
  ScrapeTaskSupplementDraft
} from '../types'
import type { ScrapeTaskLog } from './scrape-task-log.entity'

@Entity('plugin_scrape_task_intake_task')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'assistantId', 'taskNo'])
@Index(['tenantId', 'organizationId', 'targetSite', 'status'])
export class ScrapeTask {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @Index()
  @Column({ type: 'varchar' })
  taskNo?: string

  @Index()
  @Column({ type: 'varchar', default: 'pending_confirmation' })
  status?: ScrapeTaskStatus

  @Column({ type: 'varchar', nullable: true })
  sourceType?: ScrapeTaskSourceType

  @Column({ type: 'varchar', nullable: true })
  title?: string

  @Column({ type: 'text' })
  originalContent?: string

  @Column({ type: 'varchar', nullable: true })
  requesterName?: string

  @Column({ type: 'varchar', nullable: true })
  requesterDepartment?: string

  @Column({ type: 'varchar', nullable: true })
  requesterContact?: string

  @Column({ type: 'varchar', nullable: true })
  targetUrl?: string

  @Column({ type: 'varchar', nullable: true })
  targetSite?: string

  @Column({ type: 'varchar', nullable: true })
  pagesScope?: ScrapeTaskPagesScope

  @Column({ type: 'jsonb', nullable: true })
  dataFields?: ScrapeDataFieldSpec[]

  @Column({ type: 'varchar', nullable: true })
  crawlFrequency?: ScrapeTaskCrawlFrequency

  @Column({ type: 'varchar', nullable: true })
  deliveryFormat?: ScrapeTaskDeliveryFormat

  @Column({ type: 'varchar', nullable: true })
  estimatedVolume?: string

  @Column({ type: 'boolean', nullable: true })
  authRequired?: boolean

  @Column({ type: 'varchar', nullable: true })
  priority?: ScrapeTaskPriority

  @Column({ type: 'text', nullable: true })
  antiBotNotes?: string

  @Column({ type: 'text', nullable: true })
  complianceNotes?: string

  @Column({ type: 'jsonb', nullable: true })
  completenessTips?: string[]

  @Column({ type: 'float', nullable: true })
  aiConfidence?: number

  @Column({ type: 'jsonb', nullable: true })
  aiRawResult?: unknown

  @Column({ type: 'varchar', nullable: true })
  confirmedTitle?: string

  @Column({ type: 'varchar', nullable: true })
  confirmedTargetUrl?: string

  @Column({ type: 'varchar', nullable: true })
  confirmedTargetSite?: string

  @Column({ type: 'varchar', nullable: true })
  confirmedPagesScope?: ScrapeTaskPagesScope

  @Column({ type: 'jsonb', nullable: true })
  confirmedDataFields?: ScrapeDataFieldSpec[]

  @Column({ type: 'varchar', nullable: true })
  confirmedCrawlFrequency?: ScrapeTaskCrawlFrequency

  @Column({ type: 'varchar', nullable: true })
  confirmedDeliveryFormat?: ScrapeTaskDeliveryFormat

  @Column({ type: 'varchar', nullable: true })
  confirmedPriority?: ScrapeTaskPriority

  @Column({ type: 'varchar', nullable: true })
  assigneeName?: string

  @Column({ type: 'jsonb', nullable: true })
  aiSupplementDraft?: ScrapeTaskSupplementDraft | null

  @Column({ type: 'timestamptz', nullable: true })
  aiSupplementDraftedAt?: Date | null

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date

  @Column({ type: 'text', nullable: true })
  completedSummary?: string

  @Column({ type: 'varchar', nullable: true })
  lastOperatorId?: string

  @Column({ type: 'varchar', nullable: true })
  lastOperatorName?: string

  @Column({ type: 'timestamptz', nullable: true })
  lastOperatedAt?: Date

  @OneToMany('ScrapeTaskLog', (log: ScrapeTaskLog) => log.task)
  logs?: ScrapeTaskLog[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
