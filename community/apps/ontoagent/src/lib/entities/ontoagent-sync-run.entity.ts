import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { OntoAgentSyncRunStatus } from '../types.js'

/** 一次 Auto 同步运行记录（含 offline/sync_unstable/failed；重试不覆盖历史）。 */
@Entity('plugin_ontoagent_sync_run')
@Index(['tenantId', 'organizationId', 'status'])
export class OntoAgentSyncRun {
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

  @Column({ type: 'varchar', default: 'manual' })
  triggerType?: 'manual' | 'scheduled'

  @Index()
  @Column({ type: 'varchar' })
  status?: OntoAgentSyncRunStatus

  @Column({ type: 'varchar', nullable: true })
  mirrorVersion?: string

  @Column({ type: 'varchar', nullable: true })
  sourceDigest?: string

  @Column({ type: 'int', nullable: true })
  assertionCount?: number

  @Column({ type: 'jsonb', nullable: true })
  excluded?: unknown[]

  @Column({ type: 'jsonb', nullable: true })
  unsupported?: unknown[]

  @Column({ type: 'int', nullable: true })
  attempts?: number

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
