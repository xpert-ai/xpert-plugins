import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { SalesOntologyRunStatus, SalesOntologyRunType, SalesOntologyEvidence } from '../types.js'

@Entity('sales_ontology_decision_run')
@Index(['tenantId', 'organizationId', 'assistantId', 'runType'])
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
export class SalesOntologyDecisionRun {
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
  runType?: SalesOntologyRunType

  @Index()
  @Column({ type: 'varchar', default: 'completed' })
  status?: SalesOntologyRunStatus

  @Column({ type: 'jsonb', nullable: true })
  input?: Record<string, unknown>

  @Column({ type: 'jsonb', nullable: true })
  output?: Record<string, unknown>

  @Column({ type: 'jsonb', nullable: true })
  evidence?: SalesOntologyEvidence[]

  @Column({ type: 'float', nullable: true })
  confidence?: number

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
