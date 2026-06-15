import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity(WechatPersonalAccountEntity.tableName)
@Index('plugin_wechat_personal_account_integration_uuid_uq', ['integrationId', 'uuid'], { unique: true })
@Index('plugin_wechat_personal_account_tenant_org_idx', ['tenantId', 'organizationId'])
export class WechatPersonalAccountEntity {
  static readonly tableName = 'plugin_wechat_personal_account'

  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 36 })
  integrationId: string

  @Column({ length: 128 })
  uuid: string

  @Column({ nullable: true, length: 128 })
  ownerWxid?: string

  @Column({ nullable: true, length: 128 })
  displayName?: string

  @Column({ length: 32, default: 'unknown' })
  status: 'online' | 'offline' | 'unknown' | 'disabled' | 'error'

  @Column({ type: 'boolean', default: true })
  enabled: boolean

  @Column({ type: 'timestamptz', nullable: true })
  lastCallbackAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  lastSendAt?: Date

  @Column({ nullable: true, length: 512 })
  lastError?: string

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
