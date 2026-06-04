import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity('sales_ontology_decision_effect')
@Index(['tenantId', 'organizationId', 'assistantId', 'decisionId'])
export class SalesOntologyDecisionEffect {
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

  @Index()
  @Column({ type: 'varchar' })
  decisionId?: string

  @Column({ type: 'varchar', nullable: true })
  decisionType?: string

  @Column({ type: 'varchar' })
  metricName?: string

  @Column({ type: 'float', nullable: true })
  expectedValue?: number

  @Column({ type: 'float', nullable: true })
  actualValue?: number

  @Column({ type: 'varchar', nullable: true })
  unit?: string

  @Column({ type: 'varchar', default: 'unknown' })
  status?: string

  @Column({ type: 'jsonb', nullable: true })
  evidence?: Record<string, unknown>

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
