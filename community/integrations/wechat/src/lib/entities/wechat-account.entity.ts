import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { wechatTable } from '../constants.js'

const WECHAT_ACCOUNT_TABLE = wechatTable('account')

@Entity(wechatTable('account'))
@Index(`${WECHAT_ACCOUNT_TABLE}_integration_uuid_uq`, ['integrationId', 'uuid'], { unique: true })
@Index(`${WECHAT_ACCOUNT_TABLE}_tenant_org_idx`, ['tenantId', 'organizationId'])
export class WechatAccountEntity {
  static readonly tableName = WECHAT_ACCOUNT_TABLE

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
