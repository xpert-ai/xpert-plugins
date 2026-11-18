import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  SqlReviewCaseStatus,
  SqlReviewDialect,
  SqlReviewSourceType
} from '../types'
import type { SqlReviewFinding } from './sql-review-finding.entity'

@Entity('plugin_sql_review_case')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'assistantId', 'caseNo'])
export class SqlReviewCase {
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
  caseNo?: string

  @Column({ type: 'varchar', nullable: true })
  title?: string

  @Index()
  @Column({ type: 'varchar', default: 'draft' })
  status?: SqlReviewCaseStatus

  @Column({ type: 'varchar', nullable: true })
  sourceType?: SqlReviewSourceType

  @Column({ type: 'varchar', default: 'postgresql' })
  dbDialect?: SqlReviewDialect

  @Column({ type: 'text' })
  sqlText?: string

  @Column({ type: 'text', nullable: true })
  ddlContext?: string

  @Column({ type: 'text', nullable: true })
  summary?: string

  @Column({ type: 'float', nullable: true })
  confidence?: number

  @Column({ type: 'varchar', nullable: true })
  modelUsed?: string

  @Column({ type: 'int', default: 0 })
  retryCount?: number

  @Column({ type: 'text', nullable: true })
  lastError?: string

  @Column({ type: 'varchar', nullable: true })
  confirmedById?: string

  @OneToMany('SqlReviewFinding', 'case')
  findings?: SqlReviewFinding[]

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
