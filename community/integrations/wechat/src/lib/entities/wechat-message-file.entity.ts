import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

export type WechatMessageFileStatus = 'pending' | 'processing' | 'ready' | 'failed'

@Entity(WechatMessageFileEntity.tableName)
@Index('plugin_wechat_message_file_log_idx', ['messageLogId'])
@Index('plugin_wechat_message_file_conversation_idx', ['conversationId'])
@Index('plugin_wechat_message_file_asset_idx', ['fileAssetId'])
@Index('plugin_wechat_message_file_history_idx', ['conversationUserKey', 'xpertId', 'createdAt'])
@Index('plugin_wechat_message_file_tenant_org_idx', ['tenantId', 'organizationId'])
export class WechatMessageFileEntity {
  static readonly tableName = 'plugin_wechat_message_file'

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
