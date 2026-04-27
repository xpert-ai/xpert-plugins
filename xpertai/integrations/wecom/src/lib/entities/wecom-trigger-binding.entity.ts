import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

@Entity(WeComTriggerBindingEntity.tableName)
@Index('plugin_wecom_trigger_binding_integration_id_uq', ['integrationId'], { unique: true })
@Index('plugin_wecom_trigger_binding_tenant_org_idx', ['tenantId', 'organizationId'])
export class WeComTriggerBindingEntity {
  static readonly tableName = 'plugin_wecom_trigger_binding'

  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 36 })
  integrationId: string

  @Column({ length: 36 })
  xpertId: string

  @Column({ type: 'integer', default: 3600 })
  sessionTimeoutSeconds: number

  @Column({ type: 'integer', default: 5 })
  summaryWindowSeconds: number

  @Column({ nullable: true, length: 36 })
  tenantId?: string

  @Column({ nullable: true, length: 36 })
  organizationId?: string

  @Column({ nullable: true, length: 36 })
  createdById?: string

  @Column({ nullable: true, length: 36 })
  updatedById?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
