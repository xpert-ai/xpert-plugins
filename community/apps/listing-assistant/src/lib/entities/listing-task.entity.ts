import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { LISTING_TASK_TABLE } from '../constants.js'
import type { ListingTaskStatus } from '../types.js'

@Entity(LISTING_TASK_TABLE)
@Index(['tenantId', 'organizationId', 'status'])
export class ListingTask {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar', nullable: true })
  xpertId?: string | null

  @Column({ type: 'text' })
  sourceText!: string

  @Column({ type: 'varchar', default: 'draft' })
  status!: ListingTaskStatus

  @Column({ type: 'int', default: 0 })
  attemptCount!: number

  @Column({ type: 'varchar', nullable: true })
  lastErrorCode?: string | null

  @Column({ type: 'text', nullable: true })
  lastErrorMessage?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  parsedAt?: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  savedAt?: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
