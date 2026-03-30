import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from 'typeorm'

@Entity(LarkConversationBindingEntity.tableName)
@Index('plugin_lark_conversation_binding_user_key_xpert_idx', ['conversationUserKey', 'xpertId'])
@Index('plugin_lark_conversation_binding_scope_key_xpert_uq', ['scopeKey', 'xpertId'], {
	unique: true
})
@Index('plugin_lark_conversation_binding_user_id_idx', ['userId'])
@Index('plugin_lark_conversation_binding_principal_key_idx', ['principalKey'])
@Index('plugin_lark_conversation_binding_tenant_org_idx', ['tenantId', 'organizationId'])
export class LarkConversationBindingEntity {
	static readonly tableName = 'plugin_lark_conversation_binding'

	@PrimaryGeneratedColumn('uuid')
	id: string

	@Column({ nullable: true, length: 128 })
	userId?: string

	@Column({ nullable: true, length: 64 })
	integrationId?: string

	@Column({ nullable: true, length: 255 })
	principalKey?: string

	@Column({ nullable: true, length: 255 })
	scopeKey?: string

	@Column({ nullable: true, length: 32 })
	chatType?: string

	@Column({ nullable: true, length: 128 })
	chatId?: string

	@Column({ nullable: true, length: 128 })
	senderOpenId?: string

	@Column({ nullable: true, length: 255 })
	conversationUserKey?: string

	@Column({ length: 36 })
	xpertId: string

	@Column({ length: 36 })
	conversationId: string

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
