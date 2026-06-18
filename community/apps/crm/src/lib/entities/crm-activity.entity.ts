import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CrmActivityType } from '../types'

@Entity('plugin_crm_activity')
@Index(['tenantId', 'organizationId', 'objectKey', 'recordId', 'createdAt'])
export class CrmActivity {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  objectKey?: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  recordId?: string | null

  @Column({ type: 'varchar' })
  type?: CrmActivityType

  @Column({ type: 'varchar', nullable: true })
  actorId?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @Column({ type: 'text', nullable: true })
  summary?: string

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown>

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
