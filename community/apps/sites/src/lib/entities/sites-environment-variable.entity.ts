import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_sites_environment_variable')
@Index(['tenantId', 'organizationId', 'assistantId', 'projectId'])
@Index(['tenantId', 'organizationId', 'projectId', 'key'])
export class SitesEnvironmentVariable {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Index()
  @Column({ type: 'varchar' })
  projectId?: string

  @Column({ type: 'varchar' })
  key?: string

  @Column({ type: 'text', nullable: true })
  value?: string

  @Column({ type: 'boolean', default: false })
  secret?: boolean

  @Column({ type: 'text', nullable: true })
  description?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
