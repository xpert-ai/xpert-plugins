import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  SmartMaintenanceProcessingResult,
  SmartMaintenanceServiceType,
  SmartMaintenanceSimilarWorkOrderSummary,
  SmartMaintenanceSourceType,
  SmartMaintenanceSupplementDraft,
  SmartMaintenanceUrgency,
  SmartMaintenanceWorkOrderStatus
} from '../types'
import type { SmartMaintenanceWorkOrderLog } from './smart-maintenance-work-order-log.entity'

@Entity('plugin_smart_maintenance_work_order')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'assistantId', 'workOrderNo'])
@Index(['tenantId', 'organizationId', 'deviceType', 'location', 'createdAt'])
export class SmartMaintenanceWorkOrder {
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

  @Index()
  @Column({ type: 'varchar' })
  workOrderNo?: string

  @Index()
  @Column({ type: 'varchar', default: 'pending_confirmation' })
  status?: SmartMaintenanceWorkOrderStatus

  @Column({ type: 'varchar', nullable: true })
  sourceType?: SmartMaintenanceSourceType

  @Column({ type: 'varchar', nullable: true })
  customerName?: string

  @Column({ type: 'varchar', nullable: true })
  projectName?: string

  @Column({ type: 'varchar', nullable: true })
  siteName?: string

  @Column({ type: 'varchar', nullable: true })
  reporterName?: string

  @Column({ type: 'varchar', nullable: true })
  reporterDepartment?: string

  @Column({ type: 'varchar', nullable: true })
  reporterContact?: string

  @Column({ type: 'varchar', nullable: true })
  title?: string

  @Column({ type: 'text' })
  originalContent?: string

  @Column({ type: 'varchar', nullable: true })
  deviceType?: string

  @Column({ type: 'varchar', nullable: true })
  deviceName?: string

  @Column({ type: 'varchar', nullable: true })
  deviceNo?: string

  @Column({ type: 'varchar', nullable: true })
  faultCategory?: string

  @Column({ type: 'varchar', nullable: true })
  faultPhenomenon?: string

  @Column({ type: 'varchar', nullable: true })
  faultCode?: string

  @Column({ type: 'varchar', nullable: true })
  location?: string

  @Column({ type: 'varchar', nullable: true })
  impactScope?: string

  @Column({ type: 'varchar', nullable: true })
  urgency?: SmartMaintenanceUrgency

  @Column({ type: 'varchar', nullable: true })
  serviceType?: SmartMaintenanceServiceType

  @Column({ type: 'boolean', nullable: true })
  needOnsite?: boolean

  @Column({ type: 'text', nullable: true })
  aiDiagnosis?: string

  @Column({ type: 'jsonb', nullable: true })
  possibleCauses?: string[]

  @Column({ type: 'text', nullable: true })
  suggestedAction?: string

  @Column({ type: 'jsonb', nullable: true })
  completenessTips?: string[]

  @Column({ type: 'float', nullable: true })
  aiConfidence?: number

  @Column({ type: 'jsonb', nullable: true })
  aiRawResult?: unknown

  @Column({ type: 'varchar', nullable: true })
  recommendedDepartment?: string

  @Column({ type: 'varchar', nullable: true })
  recommendedRole?: string

  @Column({ type: 'text', nullable: true })
  recommendedDispatchAdvice?: string

  @Column({ type: 'jsonb', nullable: true })
  suggestedParts?: string[]

  @Column({ type: 'varchar', nullable: true })
  confirmedDepartment?: string

  @Column({ type: 'varchar', nullable: true })
  confirmedRole?: string

  @Column({ type: 'text', nullable: true })
  confirmedDispatchAdvice?: string

  @Column({ type: 'jsonb', nullable: true })
  confirmedParts?: string[]

  @Column({ type: 'text', nullable: true })
  processingRemark?: string

  @Column({ type: 'jsonb', nullable: true })
  aiSupplementDraft?: SmartMaintenanceSupplementDraft | null

  @Column({ type: 'timestamptz', nullable: true })
  aiSupplementDraftedAt?: Date | null

  @Column({ type: 'boolean', nullable: true })
  hasMultipleIssues?: boolean

  @Column({ type: 'text', nullable: true })
  multipleIssueTip?: string

  @Column({ type: 'jsonb', nullable: true })
  similarWorkOrders?: SmartMaintenanceSimilarWorkOrderSummary[]

  @Column({ type: 'timestamptz', nullable: true })
  processingStartedAt?: Date

  @Column({ type: 'varchar', nullable: true })
  processingResult?: SmartMaintenanceProcessingResult

  @Column({ type: 'text', nullable: true })
  processingSummary?: string

  @Column({ type: 'timestamptz', nullable: true })
  processedAt?: Date

  @Column({ type: 'int', nullable: true })
  processingDurationMinutes?: number

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt?: Date

  @Column({ type: 'varchar', nullable: true })
  lastOperatorId?: string

  @Column({ type: 'varchar', nullable: true })
  lastOperatorName?: string

  @Column({ type: 'timestamptz', nullable: true })
  lastOperatedAt?: Date

  @OneToMany('SmartMaintenanceWorkOrderLog', (log: SmartMaintenanceWorkOrderLog) => log.workOrder)
  logs?: SmartMaintenanceWorkOrderLog[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
