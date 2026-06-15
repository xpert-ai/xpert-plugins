import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity(WechatPersonalConversationBindingEntity.tableName)
@Index('plugin_wechat_personal_conversation_binding_user_key_xpert_uq', ['conversationUserKey', 'xpertId'], {
  unique: true
})
@Index('plugin_wechat_personal_conversation_binding_tenant_org_idx', ['tenantId', 'organizationId'])
export class WechatPersonalConversationBindingEntity {
  static readonly tableName = 'plugin_wechat_personal_conversation_binding'

  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 512 })
  conversationUserKey: string

  @Column({ length: 36 })
  xpertId: string

  @Column({ length: 36 })
  conversationId: string

  @Column({ type: 'timestamptz', nullable: true })
  lastActiveAt?: Date

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
