import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { ECN_IMPACT_ITEM_TABLE } from '../constants'
import type { EcnImpactDomain, EcnImpactItemStatus, EcnRiskLevel } from '../types'

@Entity(ECN_IMPACT_ITEM_TABLE)
@Index(['tenantId', 'organizationId', 'assessmentId', 'status'])
@Index(['tenantId', 'organizationId', 'assessmentId', 'domain'])
/** Idempotency: one AI impact finding per (assessment, impactKey). */
@Index(['tenantId', 'organizationId', 'assessmentId', 'impactKey'], { unique: true })
export class EcnImpactItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Index()
  @Column({ type: 'varchar' })
  assessmentId?: string

  /** Stable business identity of the finding, e.g. `bom:FP-200:P-1003`. */
  @Column({ type: 'varchar' })
  impactKey?: string

  @Column({ type: 'varchar' })
  domain?: EcnImpactDomain

  @Column({ type: 'varchar' })
  targetNo?: string

  @Column({ type: 'varchar', nullable: true })
  targetName?: string

  /** Evidence chain, e.g. `EA-200 > A-210 > P-1003`. */
  @Column({ type: 'varchar', nullable: true })
  relationPath?: string

  @Column({ type: 'text' })
  impactDescription?: string

  @Column({ type: 'text', nullable: true })
  suggestedAction?: string

  @Column({ type: 'varchar', nullable: true })
  riskLevel?: EcnRiskLevel

  @Column({ type: 'float', nullable: true })
  confidence?: number

  @Column({ type: 'jsonb', nullable: true })
  evidence?: Record<string, unknown>

  @Index()
  @Column({ type: 'varchar', default: 'pending' })
  status?: EcnImpactItemStatus

  @Column({ type: 'text', nullable: true })
  reviewNote?: string

  @Column({ type: 'varchar', nullable: true })
  reviewedById?: string

  @Column({ type: 'varchar', nullable: true })
  reviewedByName?: string

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
