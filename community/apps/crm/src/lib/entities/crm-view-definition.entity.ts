import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_crm_view_definition')
@Index(['tenantId', 'organizationId', 'objectKey', 'viewKey'], { unique: true })
export class CrmViewDefinition {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Index()
  @Column({ type: 'varchar' })
  objectKey?: string

  @Column({ type: 'varchar' })
  viewKey?: string

  @Column({ type: 'varchar' })
  name?: string

  @Column({ type: 'jsonb', nullable: true })
  columns?: string[]

  @Column({ type: 'jsonb', nullable: true })
  filters?: Array<Record<string, unknown>>

  @Column({ type: 'jsonb', nullable: true })
  sorts?: Array<Record<string, unknown>>

  @Column({ type: 'varchar', default: 'workspace' })
  visibility?: 'workspace' | 'private' | 'system'

  @Column({ type: 'boolean', default: true })
  isDefault?: boolean

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
