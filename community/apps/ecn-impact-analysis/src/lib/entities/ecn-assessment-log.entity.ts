import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, JoinColumn } from 'typeorm'
import { ECN_ASSESSMENT_LOG_TABLE } from '../constants'
import type { EcnAssessmentEntity } from './ecn-assessment.entity'

@Entity(ECN_ASSESSMENT_LOG_TABLE)
@Index(['tenantId', 'organizationId', 'assessmentId', 'createdAt'])
export class EcnAssessmentLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar' })
  assessmentId?: string

  /** ai_analysis_started | ai_analysis_saved | item_accepted | item_rejected | confirmed | closed | retry | failed */
  @Column({ type: 'varchar' })
  type?: string

  @Column({ type: 'text', nullable: true })
  detail?: string

  @Column({ type: 'varchar', nullable: true })
  operatorName?: string

  @ManyToOne('EcnAssessmentEntity', (assessment: EcnAssessmentEntity) => assessment.logs, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'assessmentId' })
  assessment?: EcnAssessmentEntity

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
