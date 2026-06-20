import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { CrmFieldOption, CrmFieldType } from '../types'

@Entity('plugin_crm_field_definition')
@Index(['tenantId', 'organizationId', 'objectKey', 'fieldKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'objectKey', 'displayOrder'])
export class CrmFieldDefinition {
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

  @Index()
  @Column({ type: 'varchar' })
  fieldKey?: string

  @Column({ type: 'varchar' })
  type?: CrmFieldType

  @Column({ type: 'varchar' })
  label?: string

  @Column({ type: 'boolean', default: false })
  required?: boolean

  @Column({ type: 'boolean', default: false })
  isUnique?: boolean

  @Column({ type: 'jsonb', nullable: true })
  defaultValue?: unknown

  @Column({ type: 'jsonb', nullable: true })
  options?: CrmFieldOption[]

  @Column({ type: 'varchar', nullable: true })
  relationObjectKey?: string

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
