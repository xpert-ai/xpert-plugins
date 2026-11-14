import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { ECN_ASSESSMENT_TABLE } from '../constants'
import type { EcnAssessmentStatus, EcnChangeType, EcnRiskLevel } from '../types'
import type { EcnAssessmentLogEntity } from './ecn-assessment-log.entity'

@Entity(ECN_ASSESSMENT_TABLE)
@Index(['tenantId', 'organizationId', 'status'])
@Index(['tenantId', 'organizationId', 'changeNo'], { unique: true })
@Index(['tenantId', 'organizationId', 'materialNo'])
export class EcnAssessmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  /** Engineering change request number, unique per tenant/organization. */
  @Column({ type: 'varchar' })
  changeNo?: string

  @Column({ type: 'varchar' })
  materialNo?: string

  @Column({ type: 'varchar', nullable: true })
  materialName?: string

  @Column({ type: 'varchar', default: 'other' })
  changeType?: EcnChangeType

  @Column({ type: 'text' })
  changeDescription?: string

  @Column({ type: 'text', nullable: true })
  changeReason?: string

  @Column({ type: 'varchar', nullable: true })
  expectedEffectDate?: string

  @Index()
  @Column({ type: 'varchar', default: 'draft' })
  status?: EcnAssessmentStatus

  @Column({ type: 'text', nullable: true })
  aiSummary?: string

  @Column({ type: 'varchar', nullable: true })
  aiRiskLevel?: EcnRiskLevel

  @Column({ type: 'text', nullable: true })
  lastError?: string

  @Column({ type: 'int', default: 0 })
  retryCount?: number

  @Column({ type: 'varchar', nullable: true })
  confirmedById?: string

  @Column({ type: 'varchar', nullable: true })
  confirmedByName?: string

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt?: Date

  @Column({ type: 'varchar', nullable: true })
  closedReason?: string

  @Column({ type: 'varchar', nullable: true })
  lastOperatorName?: string

  @OneToMany('EcnAssessmentLogEntity', (log: EcnAssessmentLogEntity) => log.assessment)
  logs?: EcnAssessmentLogEntity[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
