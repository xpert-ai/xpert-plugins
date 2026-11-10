import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { OntoAgentAnswerStatus } from '../types.js'
import type { RetrievalSummary } from '../vendor/pipeline-types.js'

/** 一次 AI 回答及其版本证据；人工确认/拒绝形成业务闭环，刷新后可恢复。 */
@Entity('plugin_ontoagent_answer_record')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
export class OntoAgentAnswerRecord {
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

  @Column({ type: 'text' })
  question?: string

  @Column({ type: 'text' })
  answer?: string

  @Index()
  @Column({ type: 'varchar', default: 'proposed' })
  status?: OntoAgentAnswerStatus

  @Column({ type: 'varchar', nullable: true })
  mirrorVersion?: string

  @Column({ type: 'varchar', nullable: true })
  sourceDigest?: string

  @Column({ type: 'boolean', default: false })
  stale?: boolean

  @Column({ type: 'jsonb', nullable: true })
  retrieval?: RetrievalSummary

  @Column({ type: 'text', nullable: true })
  reviewComment?: string

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
