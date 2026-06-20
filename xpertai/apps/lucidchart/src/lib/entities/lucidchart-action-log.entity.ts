import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { LucidchartActionType, LucidchartActorType } from '../types.js'

@Entity('plugin_lucidchart_action_log')
@Index(['tenantId', 'organizationId', 'documentId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
export class LucidchartActionLog {
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
  documentId?: string

  @Column({ type: 'varchar', nullable: true })
  versionId?: string

  @Column({ type: 'varchar' })
  action!: LucidchartActionType

  @Column({ type: 'varchar', default: 'system' })
  actorType?: LucidchartActorType

  @Column({ type: 'varchar', nullable: true })
  actorId?: string

  @Column({ type: 'text', nullable: true })
  message?: string

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @Column({ type: 'jsonb', nullable: true })
  snapshot?: unknown

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
