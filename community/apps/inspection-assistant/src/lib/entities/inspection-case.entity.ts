import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { InspectionAiAnalysis, InspectionHistoryReference, InspectionSeverity, InspectionStatus } from '../types.js'

@Entity('plugin_inspection_case')
@Index('idx_inspection_case_scope', ['tenantId', 'organizationId', 'workspaceId', 'projectId'])
@Index('idx_inspection_case_status', ['tenantId', 'status'])
export class InspectionCase {
  @PrimaryColumn('varchar', { length: 36 })
  id: string

  @Index('idx_inspection_case_tenant')
  @Column('varchar', { length: 64 })
  tenantId: string

  @Column('varchar', { length: 64, nullable: true })
  organizationId: string | null

  @Column('varchar', { length: 64, nullable: true })
  workspaceId: string | null

  @Column('varchar', { length: 64, nullable: true })
  projectId: string | null

  @Column('varchar', { length: 64, nullable: true })
  createdById: string | null

  @Index('idx_inspection_case_caseno')
  @Column('varchar', { length: 64, unique: true })
  caseNo: string

  @Column('varchar', { length: 255 })
  title: string

  @Column('varchar', { length: 64, nullable: true })
  deviceType: string | null

  @Column('text')
  faultDescription: string

  @Column('varchar', { length: 16, nullable: true })
  severity: InspectionSeverity | null

  @Column('varchar', { length: 255, nullable: true })
  impact: string | null

  @Column('varchar', { length: 16, default: 'draft' })
  status: InspectionStatus

  @Column('simple-json', { nullable: true })
  aiAnalysis: InspectionAiAnalysis | null

  @Column('text', { nullable: true })
  recommendedAction: string | null

  @Column('simple-json', { nullable: true })
  historyReferences: InspectionHistoryReference[] | null

  @Column('text', { nullable: true })
  failureReason: string | null

  @Column('int', { default: 0 })
  retryCount: number

  @Column('text', { nullable: true })
  resolution: string | null

  @Column('varchar', { length: 64, nullable: true })
  resolvedBy: string | null

  @Column('timestamp', { nullable: true })
  resolvedAt: Date | null

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
