import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  AgriServiceServiceDataImportMode,
  AgriServiceServiceDataPayload,
  AgriServiceServiceDataSummary
} from '../types'

@Entity('plugin_agri_service_workorder_service_data')
@Index(['tenantId', 'organizationId', 'importedAt'])
export class AgriServiceServiceData {
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
  importMode?: AgriServiceServiceDataImportMode

  @Column({ type: 'jsonb' })
  serviceData?: AgriServiceServiceDataPayload

  @Column({ type: 'jsonb' })
  summary?: AgriServiceServiceDataSummary

  @Column({ type: 'timestamptz' })
  importedAt?: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
