import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm'
import { RESUME_SCORE_TABLE } from '../constants.js'
import type { ResumeDecision, ScoreDimensionInput } from '../types.js'

@Entity(RESUME_SCORE_TABLE)
@Index(['tenantId', 'organizationId', 'screeningId'])
@Unique(['screeningId', 'candidateId'])
@Unique(['operationId'])
export class ResumeScore {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar' })
  screeningId!: string

  @Column({ type: 'varchar' })
  candidateId!: string

  /** Idempotency key for the score operation. A retry with the same key returns the stored receipt. */
  @Column({ type: 'varchar', nullable: true })
  operationId?: string

  /** Five dimensions, each 0-20, with a one-sentence reason. Stored as JSON. */
  @Column({ type: 'json' })
  dimensions!: ScoreDimensionInput[]

  /** Sum of the five dimension scores, 0-100. Computed by the service, never trusted from the model. */
  @Column({ type: 'int' })
  totalScore!: number

  /** Human-adjusted total. Null until a human overrides the AI total. */
  @Column({ type: 'int', nullable: true })
  adjustedTotal?: number | null

  @Column({ type: 'varchar', nullable: true })
  decision?: ResumeDecision | null

  @Column({ type: 'varchar', nullable: true })
  note?: string | null

  @Column({ type: 'varchar', nullable: true })
  decidedById?: string | null

  /** Optimistic-concurrency revision. Incremented on every confirm. */
  @Column({ type: 'int', default: 1 })
  revision?: number

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
