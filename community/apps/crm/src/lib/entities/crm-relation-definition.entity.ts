import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_crm_relation_definition')
@Index(['tenantId', 'organizationId', 'sourceObjectKey', 'sourceFieldKey'], { unique: true })
export class CrmRelationDefinition {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar' })
  sourceObjectKey?: string

  @Column({ type: 'varchar' })
  targetObjectKey?: string

  @Column({ type: 'varchar' })
  relationType?: 'many-to-one' | 'one-to-many' | 'many-to-many'

  @Column({ type: 'varchar' })
  sourceFieldKey?: string

  @Column({ type: 'varchar', nullable: true })
  targetFieldKey?: string

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
