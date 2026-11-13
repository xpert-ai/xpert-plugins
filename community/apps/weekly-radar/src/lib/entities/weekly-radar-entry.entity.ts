import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { WEEKLY_RADAR_ARTIFACT_NAMESPACE } from '../constants'

@Entity(pluginArtifactTableName(WEEKLY_RADAR_ARTIFACT_NAMESPACE, 'entry'))
@Index(['tenantId', 'organizationId', 'operationId'], { unique: true })
@Index(['tenantId', 'organizationId', 'weekKey', 'status'])
@Index(['tenantId', 'organizationId', 'weekKey', 'updatedAt'])
export class WeeklyRadarEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId!: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId!: string | null

  /** Idempotency key of the operation that created this entry. Unique per scope. */
  @Column({ type: 'varchar' })
  operationId!: string

  /** Hash of the create payload, used to detect conflicting retries. */
  @Column({ type: 'varchar', nullable: true })
  requestHash?: string | null

  /** ISO week key, for example 2026-W45. */
  @Column({ type: 'varchar' })
  weekKey!: string

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'varchar' })
  status!: string

  @Column({ type: 'varchar', nullable: true })
  owner?: string | null

  @Column({ type: 'date', nullable: true })
  dueDate?: string | null

  /** Where the fact came from: file name, assistant conversation, tool call, and so on. */
  @Column({ type: 'varchar', nullable: true })
  evidenceRef?: string | null

  /** Original excerpt kept as the evidence of the captured fact. */
  @Column({ type: 'text', nullable: true })
  evidenceQuote?: string | null

  @Column({ type: 'text', nullable: true })
  note?: string | null

  /** Last time the entry state changed. Drives the ageing rules. */
  @Column({ type: 'timestamptz' })
  lastTouchedAt!: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
