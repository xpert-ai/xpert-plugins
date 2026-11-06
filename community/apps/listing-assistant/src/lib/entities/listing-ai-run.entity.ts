import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { LISTING_AI_RUN_TABLE } from '../constants.js'

export type ListingAiRunStatus = 'running' | 'succeeded' | 'failed'

@Entity(LISTING_AI_RUN_TABLE)
@Index(['taskId', 'attempt'], { unique: true })
@Index(['taskId', 'status'])
export class ListingAiRun {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'uuid' })
  taskId!: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'int' })
  attempt!: number

  @Column({ type: 'varchar', default: 'running' })
  status!: ListingAiRunStatus

  @Column({ type: 'varchar', nullable: true })
  model?: string | null

  @Column({ type: 'text', nullable: true })
  rawOutput?: string | null

  @Column({ type: 'varchar', nullable: true })
  errorCode?: string | null

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null

  @Column({ type: 'timestamptz' })
  startedAt!: Date

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt?: Date | null
}
