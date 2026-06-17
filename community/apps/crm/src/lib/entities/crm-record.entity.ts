import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_crm_record')
@Index(['tenantId', 'organizationId', 'objectKey', 'createdAt'])
@Index(['tenantId', 'organizationId', 'objectKey', 'updatedAt'])
export class CrmRecord {
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

  @Column({ type: 'jsonb' })
  values?: Record<string, unknown>

  @Index()
  @Column({ type: 'text', nullable: true })
  searchText?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar', nullable: true })
  updatedById?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt?: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
