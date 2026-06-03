import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { SalesOntologyEvidence } from '../types.js'

@Entity('sales_ontology_perception_result')
@Index(['tenantId', 'organizationId', 'assistantId', 'entityTypeCode', 'entityExternalKey'])
@Index(['tenantId', 'organizationId', 'assistantId', 'runId'])
export class SalesOntologyPerceptionResult {
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
  runId?: string

  @Index()
  @Column({ type: 'varchar' })
  entityTypeCode?: string

  @Index()
  @Column({ type: 'varchar' })
  entityExternalKey?: string

  @Column({ type: 'varchar', nullable: true })
  entityName?: string

  @Column({ type: 'varchar', nullable: true })
  entityObjectType?: string

  @Column({ type: 'varchar', nullable: true })
  state?: string

  @Column({ type: 'float', nullable: true })
  riskScore?: number

  @Column({ type: 'float', nullable: true })
  churnProbability?: number

  @Column({ type: 'float', nullable: true })
  loyaltyScore?: number

  @Column({ type: 'jsonb', nullable: true })
  anomalies?: Record<string, unknown>[]

  @Column({ type: 'jsonb', nullable: true })
  patterns?: Record<string, unknown>[]

  @Column({ type: 'jsonb', nullable: true })
  alerts?: Record<string, unknown>[]

  @Column({ type: 'jsonb', nullable: true })
  attribution?: Record<string, unknown>

  @Column({ type: 'jsonb', nullable: true })
  evidence?: SalesOntologyEvidence[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
