import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { SmartMaintenanceLogAction } from '../types'
import type { SmartMaintenanceWorkOrder } from './smart-maintenance-work-order.entity'

@Entity('plugin_smart_maintenance_work_order_log')
@Index(['tenantId', 'organizationId', 'workOrderId', 'createdAt'])
export class SmartMaintenanceWorkOrderLog {
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
  workOrderId?: string

  @ManyToOne('SmartMaintenanceWorkOrder', (workOrder: SmartMaintenanceWorkOrder) => workOrder.logs, {
    onDelete: 'CASCADE'
  })
  workOrder?: SmartMaintenanceWorkOrder

  @Column({ type: 'varchar' })
  action?: SmartMaintenanceLogAction

  @Column({ type: 'varchar', nullable: true })
  operatorId?: string

  @Column({ type: 'varchar', nullable: true })
  operatorName?: string

  @Column({ type: 'text', nullable: true })
  reason?: string

  @Column({ type: 'text', nullable: true })
  remark?: string

  @Column({ type: 'jsonb', nullable: true })
  changedFields?: Array<{ field: string; before?: unknown; after?: unknown }>

  @Column({ type: 'jsonb', nullable: true })
  snapshot?: unknown

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
