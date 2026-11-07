import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  SqlReviewFindingCategory,
  SqlReviewFindingDecision,
  SqlReviewFindingSource,
  SqlReviewSeverity
} from '../types'
import type { SqlReviewCase } from './sql-review-case.entity'

@Entity('plugin_sql_review_finding')
@Index(['caseId', 'seq'])
export class SqlReviewFinding {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar' })
  caseId?: string

  @Column({ type: 'int' })
  seq?: number

  @Column({ type: 'varchar', default: 'rule' })
  source?: SqlReviewFindingSource

  @Column({ type: 'varchar', nullable: true })
  ruleId?: string

  @Column({ type: 'varchar' })
  category?: SqlReviewFindingCategory

  @Column({ type: 'varchar' })
  severity?: SqlReviewSeverity

  @Column({ type: 'varchar', nullable: true })
  location?: string

  @Column({ type: 'text', nullable: true })
  originalText?: string

  @Column({ type: 'text', nullable: true })
  explanation?: string

  @Column({ type: 'text', nullable: true })
  suggestion?: string

  @Index()
  @Column({ type: 'varchar', default: 'pending' })
  decision?: SqlReviewFindingDecision

  @Column({ type: 'varchar', nullable: true })
  decidedById?: string

  @Column({ type: 'timestamp', nullable: true })
  decidedAt?: Date

  @Column({ type: 'text', nullable: true })
  decisionComment?: string

  @ManyToOne('SqlReviewCase', 'findings', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'caseId' })
  case?: SqlReviewCase

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
