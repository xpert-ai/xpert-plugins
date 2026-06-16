import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { WechatPersonalChatFilterMode, WechatPersonalGroupTriggerMode } from '../types.js'

@Entity(WechatPersonalTriggerBindingEntity.tableName)
@Index('plugin_wechat_personal_trigger_binding_integration_uq', ['integrationId'], { unique: true })
@Index('plugin_wechat_personal_trigger_binding_tenant_org_idx', ['tenantId', 'organizationId'])
export class WechatPersonalTriggerBindingEntity {
  static readonly tableName = 'plugin_wechat_personal_trigger_binding'

  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 36 })
  integrationId: string

  @Column({ length: 36 })
  xpertId: string

  @Column({ type: 'integer', default: 3600 })
  sessionTimeoutSeconds: number

  @Column({ type: 'integer', default: 0 })
  summaryWindowSeconds: number

  @Column({ type: 'integer', default: 20 })
  historyContextLimit: number

  @Column({ type: 'boolean', default: true })
  ignoreSelfMessages: boolean

  @Column({ type: 'varchar', length: 32, default: 'all' })
  chatFilterMode: WechatPersonalChatFilterMode

  @Column({ type: 'simple-array', nullable: true })
  allowedContactIds?: string[]

  @Column({ type: 'simple-array', nullable: true })
  blockedContactIds?: string[]

  @Column({ type: 'simple-array', nullable: true })
  allowedGroupIds?: string[]

  @Column({ type: 'simple-array', nullable: true })
  blockedGroupIds?: string[]

  @Column({ type: 'simple-array', nullable: true })
  allowedSenderIds?: string[]

  @Column({ type: 'simple-array', nullable: true })
  blockedSenderIds?: string[]

  @Column({ type: 'varchar', length: 32, default: 'mention_or_keywords' })
  groupTriggerMode: WechatPersonalGroupTriggerMode

  @Column({ type: 'simple-array', nullable: true })
  groupKeywords?: string[]

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
