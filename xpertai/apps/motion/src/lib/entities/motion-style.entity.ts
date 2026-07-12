import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { MotionJsonObject, MotionSurface } from '../types.js'

@Entity('plugin_motion_style')
@Index(['tenantId', 'organizationId', 'motionProjectId', 'updatedAt'])
@Index(['tenantId', 'organizationId', 'assistantId', 'name'])
export class MotionStyle {
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
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  motionProjectId?: string

  @Column({ type: 'varchar' })
  name!: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'varchar', nullable: true })
  surface?: MotionSurface

  @Column({ type: 'jsonb' })
  style!: MotionJsonObject

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
