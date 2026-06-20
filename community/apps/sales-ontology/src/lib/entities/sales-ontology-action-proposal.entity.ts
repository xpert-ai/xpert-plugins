import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  SalesOntologyActionProposalStatus,
  SalesOntologyEvidence,
  SalesOntologyPriority
} from '../types.js'

@Entity('plugin_sales_ontology_action_proposal')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'assistantId', 'entityTypeCode', 'entityExternalKey'])
export class SalesOntologyActionProposal {
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
  assistantId?: string

  @Column({ type: 'varchar' })
  title?: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Index()
  @Column({ type: 'varchar' })
  actionType?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  entityTypeCode?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  entityExternalKey?: string

  @Column({ type: 'varchar', nullable: true })
  entityName?: string

  @Column({ type: 'varchar', nullable: true })
  entityObjectType?: string

  @Column({ type: 'varchar', default: 'medium' })
  priority?: SalesOntologyPriority

  @Column({ type: 'float', nullable: true })
  confidence?: number

  @Index()
  @Column({ type: 'varchar', default: 'pending' })
  status?: SalesOntologyActionProposalStatus

  @Column({ type: 'varchar', nullable: true })
  proposedBy?: string

  @Column({ type: 'jsonb', nullable: true })
  reasoningChain?: Array<Record<string, unknown>>

  @Column({ type: 'jsonb', nullable: true })
  actionDefinition?: Record<string, unknown>

  @Column({ type: 'jsonb', nullable: true })
  executionLogs?: Array<Record<string, unknown>>

  @Column({ type: 'text', nullable: true })
  reviewComment?: string

  @Column({ type: 'varchar', nullable: true })
  approvedBy?: string

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @Column({ type: 'jsonb', nullable: true })
  evidence?: SalesOntologyEvidence[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
