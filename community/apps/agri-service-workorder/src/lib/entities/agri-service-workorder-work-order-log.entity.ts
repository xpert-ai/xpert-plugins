import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { AgriServiceLogAction } from '../types'
import type { AgriServiceWorkOrder } from './agri-service-workorder-work-order.entity'

@Entity('plugin_agri_service_workorder_work_order_log')
@Index(['tenantId', 'organizationId', 'workOrderId', 'createdAt'])
export class AgriServiceWorkOrderLog {
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

  @ManyToOne('AgriServiceWorkOrder', (workOrder: AgriServiceWorkOrder) => workOrder.logs, {
    onDelete: 'CASCADE'
  })
  workOrder?: AgriServiceWorkOrder

  @Column({ type: 'varchar' })
  action?: AgriServiceLogAction

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
