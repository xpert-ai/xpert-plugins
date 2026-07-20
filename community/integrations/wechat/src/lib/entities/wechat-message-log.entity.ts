import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { wechatTable } from '../constants.js'

export type WechatMessageDirection = 'inbound' | 'outbound' | 'system'
export type WechatMessageLogStatus =
  | 'received'
  | 'dispatched'
  | 'history_only'
  | 'queued'
  | 'deferred'
  | 'sending'
  | 'sent'
  | 'skipped'
  | 'failed'
  | 'paused'
  | 'cancelled'
  | 'context_reset'

const WECHAT_MESSAGE_LOG_TABLE = wechatTable('message_log')

@Entity(wechatTable('message_log'))
@Index(`${WECHAT_MESSAGE_LOG_TABLE}_message_idx`, ['integrationId', 'messageId', 'direction'])
@Index(`${WECHAT_MESSAGE_LOG_TABLE}_tenant_org_idx`, ['tenantId', 'organizationId'])
@Index(`${WECHAT_MESSAGE_LOG_TABLE}_integration_created_idx`, ['integrationId', 'createdAt'])
export class WechatMessageLogEntity {
  static readonly tableName = WECHAT_MESSAGE_LOG_TABLE

  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 36 })
  integrationId: string

  @Column({ length: 128 })
  uuid: string

  @Column({ nullable: true, length: 128 })
  ownerWxid?: string

  @Column({ length: 255 })
  contactId: string

  @Column({ nullable: true, length: 255 })
  senderId?: string

  @Column({ nullable: true, length: 255 })
  senderName?: string

  @Column({ nullable: true, length: 64 })
  messageId?: string

  @Column({ nullable: true, length: 128 })
  queueJobId?: string

  @Column({ nullable: true, length: 32 })
  chatType?: 'private' | 'group'

  @Column({ type: 'boolean', default: false })
  isSelf: boolean

  @Column({ length: 16 })
  direction: WechatMessageDirection

  @Column({ length: 24 })
  status: WechatMessageLogStatus

  @Column({ type: 'text', nullable: true })
  content?: string

  @Column({ type: 'text', nullable: true })
  payloadSummary?: string

  @Column({ nullable: true, length: 512 })
  error?: string

  @Column({ nullable: true, length: 36 })
  xpertId?: string

  @Column({ nullable: true, length: 36 })
  conversationId?: string

  @Column({ nullable: true, length: 512 })
  conversationUserKey?: string

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  sentAt?: Date

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
