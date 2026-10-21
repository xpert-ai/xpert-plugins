import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ContractElements, ContractReviewStatus, ContractType } from '../types.js'

@Entity('plugin_contract_review')
@Index(['tenantId', 'organizationId', 'projectId'])
@Index(['tenantId', 'organizationId', 'createdById'])
export class ContractReview {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar', nullable: true })
  xpertId?: string

  @Column({ type: 'varchar', nullable: true })
  agentKey?: string

  @Column({ type: 'varchar' })
  contractName!: string

  @Column({ type: 'varchar', default: 'sales' })
  contractType?: ContractType

  @Column({ type: 'varchar', nullable: true })
  counterparty?: string

  @Column({ type: 'text' })
  rawText!: string

  @Column({ type: 'varchar', default: 'draft' })
  status?: ContractReviewStatus

  @Column({ type: 'json', nullable: true })
  elements?: ContractElements

  @Column({ type: 'int', nullable: true })
  score?: number

  @Column({ type: 'text', nullable: true })
  summary?: string

  @Column({ type: 'json', nullable: true })
  summaryHighlights?: string[]

  @Column({ type: 'json', nullable: true })
  pendingQuestions?: string[]

  @Column({ type: 'int', default: 0 })
  highRiskCount?: number

  @Column({ type: 'int', default: 0 })
  mediumRiskCount?: number

  @Column({ type: 'int', default: 0 })
  lowRiskCount?: number

  @Column({ type: 'varchar', nullable: true })
  failedStage?: string

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @Column({ type: 'boolean', default: false })
  summarySkipped?: boolean

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
