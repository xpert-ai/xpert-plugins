import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  SmartMaintenanceServiceDataImportMode,
  SmartMaintenanceServiceDataPayload,
  SmartMaintenanceServiceDataSummary
} from '../types'

@Entity('smart_maintenance_service_data')
@Index(['tenantId', 'organizationId', 'importedAt'])
export class SmartMaintenanceServiceData {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @Column({ type: 'varchar', nullable: true })
  importedById?: string

  @Column({ type: 'varchar', nullable: true })
  fileName?: string

  @Column({ type: 'varchar', default: 'replace' })
  importMode?: SmartMaintenanceServiceDataImportMode

  @Column({ type: 'jsonb' })
  serviceData?: SmartMaintenanceServiceDataPayload

  @Column({ type: 'jsonb' })
  summary?: SmartMaintenanceServiceDataSummary

  @Column({ type: 'timestamptz' })
  importedAt?: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
