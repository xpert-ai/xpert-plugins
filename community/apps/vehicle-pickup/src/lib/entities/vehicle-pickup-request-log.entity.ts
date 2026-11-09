import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { VehiclePickupRole, VehiclePickupStatus } from '../types'
import type { VehiclePickupRequest } from './vehicle-pickup-request.entity'

@Entity('plugin_vehicle_pickup_request_log')
@Index(['tenantId', 'organizationId', 'requestId', 'createdAt'])
export class VehiclePickupRequestLog {
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
  requestId?: string

  @ManyToOne('VehiclePickupRequest', (request: VehiclePickupRequest) => request.logs, {
    onDelete: 'CASCADE'
  })
  request?: VehiclePickupRequest

  @Column({ type: 'varchar' })
  action?: string

  @Column({ type: 'varchar', nullable: true })
  actorId?: string

  @Column({ type: 'varchar', nullable: true })
  actorName?: string

  @Column({ type: 'varchar', nullable: true })
  actorRole?: VehiclePickupRole | 'system'

  @Column({ type: 'varchar', nullable: true })
  fromStatus?: VehiclePickupStatus

  @Column({ type: 'varchar', nullable: true })
  toStatus?: VehiclePickupStatus

  @Column({ type: 'text', nullable: true })
  reason?: string

  @Column({ type: 'jsonb', nullable: true })
  metadata?: unknown

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
