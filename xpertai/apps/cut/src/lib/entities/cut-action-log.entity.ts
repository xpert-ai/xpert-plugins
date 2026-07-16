import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CutActionType, CutActorType, CutJsonValue } from '../types.js'

@Entity('plugin_cut_action_log')
@Index(['tenantId', 'organizationId', 'cutProjectId', 'createdAt'])
export class CutActionLog {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string | null

  @Column({ type: 'varchar', nullable: true })
  platformProjectId?: string | null

  @Column({ type: 'varchar', nullable: true })
  cutProjectId?: string | null

  @Column({ type: 'varchar' })
  action!: CutActionType

  @Column({ type: 'varchar', default: 'system' })
  actorType!: CutActorType

  @Column({ type: 'varchar', nullable: true })
  actorId?: string | null

  @Column({ type: 'text' })
  message!: string

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null

  @Column({ type: 'jsonb', nullable: true })
  snapshot?: CutJsonValue | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
