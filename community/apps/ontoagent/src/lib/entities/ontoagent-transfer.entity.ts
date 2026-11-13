import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

export type OntoAgentTransferStatus = 'received' | 'processing' | 'done' | 'rejected' | 'conflict'

/**
 * 只读 Packet 转交的运输层记录（ADR-0012 协议在本插件的落点）。
 *
 * 协议本身（createTransfer / validateTransferEnvelope / receiveTransfer）在 vendor core 中；
 * 本实体只承载运输与恢复语义：幂等去重、转交链深度、attempt/generation 围栏、回执。
 * 不写本体：接收方只能读取 packet，任何本体变更仍走 gate。
 */
@Entity('plugin_ontoagent_transfer')
@Index(['tenantId', 'organizationId', 'transferId'], { unique: true })
@Index(['tenantId', 'organizationId', 'status'])
export class OntoAgentTransfer {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  /** 协议层的 transferId（发送方生成；同一 id 重放视为幂等） */
  @Index()
  @Column({ type: 'varchar' })
  transferId?: string

  @Column({ type: 'varchar', default: 'transfer' })
  kind?: 'transfer' | 'return' | 'proposal'

  @Column({ type: 'varchar', nullable: true })
  taskId?: string

  @Column({ type: 'varchar', nullable: true })
  operationId?: string

  @Index()
  @Column({ type: 'varchar' })
  status?: OntoAgentTransferStatus

  /** 发送方切片时的本体版本；接收方据此判定 baseVersion 是否已过期 */
  @Column({ type: 'varchar', nullable: true })
  baseVersion?: string

  /** 规范化 packet 的摘要：同内容重复转交可识别（防循环放大） */
  @Index()
  @Column({ type: 'varchar' })
  packetHash?: string

  @Column({ type: 'varchar' })
  sender?: string

  @Column({ type: 'varchar' })
  recipient?: string

  @Column({ type: 'varchar', nullable: true })
  rootId?: string

  @Column({ type: 'varchar', nullable: true })
  parentId?: string

  @Column({ type: 'int', default: 0 })
  depth?: number

  /** 领取次数与代次：旧 attempt 不得提交（防重复投递与崩溃后误写） */
  @Column({ type: 'int', default: 0 })
  attempt?: number

  @Column({ type: 'int', default: 0 })
  generation?: number

  /** 完整协议 envelope（OntologyTransfer），接收方只读消费 */
  @Column({ type: 'jsonb' })
  packet?: unknown

  @Column({ type: 'jsonb', nullable: true })
  receipt?: unknown

  @Column({ type: 'text', nullable: true })
  reason?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
