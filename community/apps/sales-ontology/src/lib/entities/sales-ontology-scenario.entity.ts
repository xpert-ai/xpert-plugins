import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('sales_ontology_scenario')
@Index(['tenantId', 'organizationId', 'assistantId', 'category'])
export class SalesOntologyScenario {
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

  @Column({ type: 'varchar', default: 'forecast' })
  scenarioType?: string

  @Column({ type: 'varchar' })
  name?: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'varchar', nullable: true })
  category?: string

  @Column({ type: 'float', nullable: true })
  targetValue?: number

  @Column({ type: 'float', nullable: true })
  baselineForecastValue?: number

  @Column({ type: 'float', nullable: true })
  forecastValue?: number

  @Column({ type: 'float', nullable: true })
  achievementRate?: number

  @Column({ type: 'varchar', nullable: true })
  riskLevel?: string

  @Column({ type: 'float', nullable: true })
  delta?: number

  @Column({ type: 'jsonb', nullable: true })
  parameters?: Array<Record<string, unknown>>

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, unknown>

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
