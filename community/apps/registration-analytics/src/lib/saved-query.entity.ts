import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { RegistrationQueryCondition } from './types'

@Entity('plugin_registration_saved_query')
@Index(['tenantId', 'organizationId', 'createdAt'])
export class SavedQuery {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar' })
  name?: string

  @Column({ type: 'text' })
  question?: string

  @Column({ type: 'jsonb' })
  condition?: RegistrationQueryCondition

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
