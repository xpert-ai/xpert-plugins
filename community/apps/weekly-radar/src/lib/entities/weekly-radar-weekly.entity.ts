import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { WEEKLY_RADAR_ARTIFACT_NAMESPACE } from '../constants'

@Entity(pluginArtifactTableName(WEEKLY_RADAR_ARTIFACT_NAMESPACE, 'weekly'))
@Index(['tenantId', 'organizationId', 'weekKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'status', 'updatedAt'])
export class WeeklyRadarWeekly {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId!: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId!: string | null

  @Column({ type: 'varchar' })
  weekKey!: string

  /** Assistant-written highlights. Numbers and risk rows are always server computed. */
  @Column({ type: 'text', nullable: true })
  highlights?: string | null

  /** Assistant-written next actions. */
  @Column({ type: 'text', nullable: true })
  nextActions?: string | null

  /** Server-computed metrics snapshot. */
  @Column({ type: 'jsonb', nullable: true })
  metrics?: Record<string, unknown> | null

  /** Server-computed risk snapshot produced by the rule engine. */
  @Column({ type: 'jsonb', nullable: true })
  riskSnapshot?: Record<string, unknown>[] | null

  @Column({ type: 'varchar' })
  status!: string

  @Column({ type: 'timestamptz', nullable: true })
  generatedAt?: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
