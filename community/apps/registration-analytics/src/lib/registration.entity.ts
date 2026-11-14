import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_registration_record')
@Index(['tenantId', 'organizationId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'activityId'])
export class RegistrationRecord {
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
  activityId?: string

  @Column({ type: 'varchar' })
  activityName?: string

  @Column({ type: 'varchar' })
  name?: string

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null

  @Column({ type: 'varchar', nullable: true })
  email?: string | null

  @Column({ type: 'varchar', nullable: true })
  city?: string | null

  @Column({ type: 'varchar', nullable: true })
  channel?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  registerTime?: Date | null

  @Column({ type: 'varchar', nullable: true })
  status?: string | null

  @Column({ type: 'numeric', nullable: true })
  fee?: number | string | null

  @Column({ type: 'text', nullable: true })
  note?: string | null

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
