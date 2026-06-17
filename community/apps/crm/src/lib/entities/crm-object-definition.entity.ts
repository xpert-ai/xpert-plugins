import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_crm_object_definition')
@Index(['tenantId', 'organizationId', 'objectKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'isActive', 'displayOrder'])
export class CrmObjectDefinition {
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
  label?: string

  @Column({ type: 'varchar' })
  pluralLabel?: string

  @Column({ type: 'varchar', nullable: true })
  icon?: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'boolean', default: true })
  isSystem?: boolean

  @Column({ type: 'boolean', default: true })
  isActive?: boolean

  @Column({ type: 'int', default: 0 })
  displayOrder?: number

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
