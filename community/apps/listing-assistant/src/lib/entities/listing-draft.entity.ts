import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { LISTING_DRAFT_TABLE } from '../constants.js'
import type { ListingFieldFlags } from '../types.js'

@Entity(LISTING_DRAFT_TABLE)
@Index(['taskId'], { unique: true })
@Index(['tenantId', 'organizationId'])
export class ListingDraft {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'uuid' })
  taskId!: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  title?: string | null

  @Column({ type: 'text', nullable: true })
  description?: string | null

  @Column({ type: 'varchar', nullable: true })
  price?: string | null

  @Column({ type: 'varchar', nullable: true })
  currency?: string | null

  @Column({ type: 'varchar', nullable: true })
  category?: string | null

  @Column({ type: 'jsonb', nullable: true })
  attributes?: Record<string, string | number | null> | null

  @Column({ type: 'jsonb', nullable: true })
  fieldFlags?: ListingFieldFlags | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
