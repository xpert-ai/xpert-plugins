import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { SalesOntologyPriority } from '../types.js'

@Entity('sales_ontology_notification')
@Index(['tenantId', 'organizationId', 'assistantId', 'userId'])
@Index(['tenantId', 'organizationId', 'assistantId', 'read'])
export class SalesOntologyNotification {
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

  @Column({ type: 'varchar', default: 'action_notification' })
  type?: string

  @Column({ type: 'varchar' })
  title?: string

  @Column({ type: 'text', nullable: true })
  message?: string

  @Column({ type: 'varchar', default: 'medium' })
  priority?: SalesOntologyPriority

  @Column({ type: 'boolean', default: false })
  read?: boolean

  @Column({ type: 'varchar', nullable: true })
  entityExternalKey?: string

  @Column({ type: 'varchar', nullable: true })
  entityTypeCode?: string

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown>

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
