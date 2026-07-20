import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { wechatTable } from '../constants.js'

export type WechatMessageFileStatus = 'pending' | 'processing' | 'ready' | 'failed'

const WECHAT_MESSAGE_FILE_TABLE = wechatTable('message_file')

@Entity(wechatTable('message_file'))
@Index(`${WECHAT_MESSAGE_FILE_TABLE}_log_idx`, ['messageLogId'])
@Index(`${WECHAT_MESSAGE_FILE_TABLE}_conversation_idx`, ['conversationId'])
@Index(`${WECHAT_MESSAGE_FILE_TABLE}_asset_idx`, ['fileAssetId'])
@Index(`${WECHAT_MESSAGE_FILE_TABLE}_history_idx`, ['conversationUserKey', 'xpertId', 'createdAt'])
@Index(`${WECHAT_MESSAGE_FILE_TABLE}_tenant_org_idx`, ['tenantId', 'organizationId'])
export class WechatMessageFileEntity {
  static readonly tableName = WECHAT_MESSAGE_FILE_TABLE

  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 36 })
  messageLogId: string

  @Column({ length: 36 })
  integrationId: string

  @Column({ nullable: true, length: 512 })
  conversationUserKey?: string

  @Column({ nullable: true, length: 36 })
  conversationId?: string

  @Column({ nullable: true, length: 36 })
  xpertId?: string

  @Column({ nullable: true, length: 128 })
  messageId?: string

  @Column({ nullable: true, length: 36 })
  fileAssetId?: string

  @Column({ nullable: true, length: 36 })
  fileId?: string

  @Column({ nullable: true, length: 1024 })
  workspacePath?: string

  @Column({ nullable: true, length: 1024 })
  filePath?: string

  @Column({ nullable: true, length: 2048 })
  fileUrl?: string

  @Column({ nullable: true, length: 255 })
  originalName?: string

  @Column({ nullable: true, length: 255 })
  mimeType?: string

  @Column({ type: 'integer', nullable: true })
  size?: number

  @Column({ nullable: true, length: 24, default: 'pending' })
  status: WechatMessageFileStatus

  @Column({ nullable: true, length: 512 })
  error?: string

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
