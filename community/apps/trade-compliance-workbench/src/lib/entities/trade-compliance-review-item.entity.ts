import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ReviewItemType, ReviewStatus } from '../types.js'

@Entity('plugin_trade_compliance_review_item')
@Index(['tenantId', 'organizationId', 'batchId'])
@Index(['tenantId', 'organizationId', 'reviewStatus'])
export class TradeComplianceReviewItem {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar' })
  batchId!: string

  @Column({ type: 'varchar' })
  type!: ReviewItemType

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'varchar', default: 'pending' })
  reviewStatus?: ReviewStatus

  @Column({ type: 'jsonb', nullable: true })
  extractedData?: Record<string, unknown>

  @Column({ type: 'jsonb', nullable: true })
  defaultData?: Record<string, unknown>

  @Column({ type: 'jsonb', nullable: true })
  confirmedData?: Record<string, unknown>

  @Column({ type: 'jsonb', nullable: true })
  fields?: Array<Record<string, unknown>>

  @Column({ type: 'float', nullable: true })
  confidence?: number

  @Column({ type: 'text', nullable: true })
  sourceLocation?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
