import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { SalesOntologyPriority } from '../types.js'

@Entity('sales_ontology_reminder')
@Index(['tenantId', 'organizationId', 'assistantId', 'userId'])
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
export class SalesOntologyReminder {
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
  userId?: string

  @Column({ type: 'varchar', default: 'follow_up' })
  reminderType?: string

  @Column({ type: 'varchar' })
  title?: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'timestamptz', nullable: true })
  dueDate?: Date

  @Column({ type: 'varchar', default: 'medium' })
  priority?: SalesOntologyPriority

  @Column({ type: 'varchar', default: 'active' })
  status?: string

  @Column({ type: 'varchar', nullable: true })
  entityExternalKey?: string

  @Column({ type: 'varchar', nullable: true })
  entityTypeCode?: string

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown>

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
