import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from 'typeorm'
import type { TLarkTriggerConfig } from '../workflow/lark-trigger.types.js'

@Entity(LarkTriggerBindingEntity.tableName)
@Index('plugin_lark_trigger_binding_integration_id_uq', ['integrationId'], { unique: true })
@Index('plugin_lark_trigger_binding_tenant_org_idx', ['tenantId', 'organizationId'])
export class LarkTriggerBindingEntity {
	static readonly tableName = 'plugin_lark_trigger_binding'

	@PrimaryGeneratedColumn('uuid')
	id: string

	@Column({ length: 36 })
	integrationId: string

	@Column({ length: 36 })
	xpertId: string

	@Column({ type: 'simple-json', nullable: true })
	config?: TLarkTriggerConfig

	@Column({ nullable: true, type: 'text' })
	ownerOpenId?: string | null

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
