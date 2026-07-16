import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

export type LarkMessageDirection = 'inbound' | 'outbound' | 'system'

export type LarkMessageLogStatus =
  | 'received'
  | 'history_only'
  | 'queued'
  | 'dispatched'
  | 'sent'
  | 'failed'
  | 'context_reset'

export type LarkMessageChatType = 'p2p' | 'group'

@Entity(LarkMessageLogEntity.tableName)
@Index('plugin_lark_message_log_message_uq', ['integrationId', 'direction', 'messageId'], {
  unique: true
})
@Index('plugin_lark_message_log_run_uq', ['integrationId', 'direction', 'runId'], {
  unique: true
})
@Index('plugin_lark_message_log_history_idx', [
  'tenantId',
  'organizationId',
  'integrationId',
  'scopeKey',
  'xpertId',
  'createdAt',
  'id'
])
@Index('plugin_lark_message_log_integration_created_idx', ['integrationId', 'createdAt', 'id'])
@Index('plugin_lark_message_log_integration_message_created_idx', ['integrationId', 'messageCreatedAt', 'id'])
@Index('plugin_lark_message_log_integration_direction_idx', ['integrationId', 'direction', 'id'])
@Index('plugin_lark_message_log_integration_status_idx', ['integrationId', 'status', 'id'])
@Index('plugin_lark_message_log_integration_sender_idx', ['integrationId', 'senderName', 'id'])
@Index('plugin_lark_message_log_integration_mentioned_idx', ['integrationId', 'botMentioned', 'id'])
@Index('plugin_lark_message_log_scope_status_created_idx', [
  'integrationId',
  'scopeKey',
  'xpertId',
  'direction',
  'status',
  'createdAt',
  'id'
])
@Index('plugin_lark_message_log_admin_status_created_idx', [
  'integrationId',
  'direction',
  'status',
  'createdAt',
  'id'
])
export class LarkMessageLogEntity {
  static readonly tableName = 'plugin_lark_message_log'

  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 36 })
  integrationId: string

  @Column({ nullable: true, length: 128 })
  messageId?: string | null

  @Column({ nullable: true, length: 128 })
  runId?: string | null

  @Column({ length: 512 })
  scopeKey: string

  @Column({ nullable: true, length: 36 })
  xpertId?: string | null

  @Column({ nullable: true, length: 36 })
  conversationId?: string | null

  @Column({ nullable: true, length: 16 })
  chatType?: LarkMessageChatType | null

  @Column({ nullable: true, length: 128 })
  chatId?: string | null

  @Column({ nullable: true, length: 128 })
  senderOpenId?: string | null

  @Column({ nullable: true, length: 255 })
  senderName?: string | null

  @Column({ nullable: true, length: 32 })
  messageType?: string | null

  @Column({ type: 'boolean', default: false })
  botMentioned: boolean

  @Column({ length: 16 })
  direction: LarkMessageDirection

  @Column({ length: 24 })
  status: LarkMessageLogStatus

  @Column({ type: 'text', nullable: true })
  content?: string | null

  @Column({ nullable: true, length: 1024 })
  error?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  messageCreatedAt?: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  sentAt?: Date | null

  @Column({ nullable: true, length: 36 })
  tenantId?: string | null

  @Column({ nullable: true, length: 36 })
  organizationId?: string | null

  @Column({ nullable: true, length: 36 })
  createdById?: string | null

  @Column({ nullable: true, length: 36 })
  updatedById?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
