import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { SalesOntologyEvidence, SalesOntologyPriority, SalesOntologySuggestionStatus } from '../types.js'

@Entity('plugin_sales_ontology_suggestion')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'assistantId', 'priority'])
export class SalesOntologySuggestion {
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

  @Column({ type: 'varchar', nullable: true })
  type?: string

  @Index()
  @Column({ type: 'varchar', default: 'medium' })
  priority?: SalesOntologyPriority

  @Column({ type: 'varchar' })
  title?: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'jsonb', nullable: true })
  targetEntities?: Array<Record<string, unknown>>

  @Column({ type: 'jsonb', nullable: true })
  reasoningChain?: Array<Record<string, unknown>>

  @Column({ type: 'jsonb', nullable: true })
  suggestedActions?: Array<Record<string, unknown>>

  @Column({ type: 'jsonb', nullable: true })
  expectedImpact?: Record<string, unknown>

  @Index()
  @Column({ type: 'varchar', default: 'active' })
  status?: SalesOntologySuggestionStatus

  @Column({ type: 'float', nullable: true })
  confidence?: number

  @Column({ type: 'timestamptz', nullable: true })
  validUntil?: Date

  @Column({ type: 'jsonb', nullable: true })
  evidence?: SalesOntologyEvidence[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
