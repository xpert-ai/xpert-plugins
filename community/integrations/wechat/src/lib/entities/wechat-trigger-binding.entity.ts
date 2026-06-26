import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  WechatChatFilterMode,
  WechatGroupTriggerOverride,
  WechatGroupTriggerMode,
  WechatSelfMessagePolicy
} from '../types.js'

@Entity(WechatTriggerBindingEntity.tableName)
@Index('plugin_wechat_trigger_binding_integration_uq', ['integrationId'], { unique: true })
@Index('plugin_wechat_trigger_binding_tenant_org_idx', ['tenantId', 'organizationId'])
export class WechatTriggerBindingEntity {
  static readonly tableName = 'plugin_wechat_trigger_binding'

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

  @Column({ type: 'integer', default: 3600 })
  historyContextWindowSeconds: number

  @Column({ type: 'boolean', default: true })
  ignoreSelfMessages: boolean

  @Column({ type: 'varchar', length: 32, default: 'history_only' })
  selfMessagePolicy: WechatSelfMessagePolicy

  @Column({ type: 'varchar', length: 32, default: 'all' })
  chatFilterMode: WechatChatFilterMode

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

  @Column({ type: 'simple-array', nullable: true })
  allowedKeywords?: string[]

  @Column({ type: 'varchar', length: 32, default: 'mention_or_keywords' })
  groupTriggerMode: WechatGroupTriggerMode

  @Column({ type: 'simple-array', nullable: true })
  groupKeywords?: string[]

  @Column({ type: 'simple-array', nullable: true })
  mentionFallbackNames?: string[]

  @Column({ type: 'jsonb', nullable: true })
  groupTriggerOverrides?: WechatGroupTriggerOverride[]

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
