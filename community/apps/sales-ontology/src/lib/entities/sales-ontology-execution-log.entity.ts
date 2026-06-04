import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity('sales_ontology_execution_log')
@Index(['tenantId', 'organizationId', 'assistantId', 'proposalId'])
export class SalesOntologyExecutionLog {
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
  @Column({ type: 'varchar', nullable: true })
  proposalId?: string

  @Column({ type: 'varchar', nullable: true })
  actionName?: string

  @Column({ type: 'varchar', nullable: true })
  toolName?: string

  @Column({ type: 'jsonb', nullable: true })
  parameters?: Record<string, unknown>

  @Column({ type: 'varchar', default: 'completed' })
  status?: string

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, unknown>

  @Column({ type: 'varchar', nullable: true })
  userId?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
