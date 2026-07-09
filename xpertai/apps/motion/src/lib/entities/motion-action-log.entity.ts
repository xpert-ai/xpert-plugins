import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { MotionActionType, MotionActorType, MotionJsonValue } from '../types.js'

@Entity('plugin_motion_action_log')
@Index(['tenantId', 'organizationId', 'motionProjectId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
export class MotionActionLog {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @Column({ type: 'varchar', nullable: true })
  motionProjectId?: string

  @Column({ type: 'varchar', nullable: true })
  versionId?: string

  @Column({ type: 'varchar' })
  action!: MotionActionType

  @Column({ type: 'varchar', default: 'system' })
  actorType?: MotionActorType

  @Column({ type: 'varchar', nullable: true })
  actorId?: string

  @Column({ type: 'text', nullable: true })
  message?: string

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @Column({ type: 'jsonb', nullable: true })
  snapshot?: MotionJsonValue

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
