import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity('plugin_sales_ontology_memory')
@Index(['tenantId', 'organizationId', 'assistantId', 'memoryType'])
export class SalesOntologyMemory {
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

  @Column({ type: 'varchar', default: 'episodic' })
  memoryType?: string

  @Column({ type: 'text' })
  contentText?: string

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>

  @Column({ type: 'float', nullable: true })
  confidence?: number

  @Column({ type: 'varchar', nullable: true })
  sourceRunId?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
