import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from 'typeorm'

@Entity(DingTalkTriggerBindingEntity.tableName)
@Index('plugin_dingtalk_trigger_binding_integration_id_uq', ['integrationId'], { unique: true })
@Index('plugin_dingtalk_trigger_binding_tenant_org_idx', ['tenantId', 'organizationId'])
export class DingTalkTriggerBindingEntity {
	static readonly tableName = 'plugin_dingtalk_trigger_binding'

	@PrimaryGeneratedColumn('uuid')
	id: string

	@Column({ length: 36 })
	integrationId: string

	@Column({ length: 36 })
	xpertId: string

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
