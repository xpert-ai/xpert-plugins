import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import type {
  PickupValidationResult,
  PickupVehicleSnapshot,
  VehiclePickupRejectionSource,
  VehiclePickupStatus
} from '../types'
import type { VehiclePickupRequestLog } from './vehicle-pickup-request-log.entity'

@Entity('plugin_vehicle_pickup_request')
@Index(['tenantId', 'organizationId', 'status', 'createdAt'])
@Index(['tenantId', 'organizationId', 'requestNo'])
@Index(['tenantId', 'organizationId', 'applicantId', 'requestFingerprint'])
export class VehiclePickupRequest {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar' })
  requestNo?: string

  @Index()
  @Column({ type: 'varchar', default: 'applied' })
  status?: VehiclePickupStatus

  @Index()
  @Column({ type: 'varchar' })
  storeId?: string

  @Column({ type: 'varchar' })
  applicantId?: string

  @Column({ type: 'varchar', nullable: true })
  applicantName?: string

  @Column({ type: 'jsonb' })
  vehicles?: PickupVehicleSnapshot[]

  @Column({ type: 'text', nullable: true })
  sourceText?: string

  @Column({ type: 'varchar' })
  requestFingerprint?: string

  @Column({ type: 'varchar', nullable: true })
  approverId?: string

  @Column({ type: 'varchar', nullable: true })
  approverName?: string

  @Column({ type: 'text', nullable: true })
  approvalReason?: string

  @Column({ type: 'varchar', nullable: true })
  rejectionSource?: VehiclePickupRejectionSource

  @Column({ type: 'jsonb', nullable: true })
  validationSnapshot?: PickupValidationResult

  @Column({ type: 'timestamptz', nullable: true })
  validatedAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt?: Date

  @Column({ type: 'text', nullable: true })
  cancelReason?: string

  @Column({ type: 'varchar', nullable: true })
  carrierId?: string

  @Column({ type: 'int', default: 0 })
  executionAttempts?: number

  @Column({ type: 'timestamptz', nullable: true })
  executedAt?: Date

  @Column({ type: 'text', nullable: true })
  executionFailureReason?: string

  @Column({ type: 'int', default: 1 })
  version?: number

  @OneToMany('VehiclePickupRequestLog', (log: VehiclePickupRequestLog) => log.request)
  logs?: VehiclePickupRequestLog[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
