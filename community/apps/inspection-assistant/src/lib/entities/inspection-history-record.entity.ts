import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/** 历史处理方案库：作为 AI 检索（RAG）的知识源，由种子数据 + 已确认工单沉淀而来 */
@Entity('plugin_inspection_history_record')
@Index('idx_inspection_history_scope', ['tenantId', 'organizationId', 'workspaceId'])
@Index('idx_inspection_history_device', ['tenantId', 'deviceType'])
export class InspectionHistoryRecord {
  @PrimaryColumn('varchar', { length: 36 })
  id: string

  @Index('idx_inspection_history_tenant')
  @Column('varchar', { length: 64 })
  tenantId: string

  @Column('varchar', { length: 64, nullable: true })
  organizationId: string | null

  @Column('varchar', { length: 64, nullable: true })
  workspaceId: string | null

  @Column('varchar', { length: 64 })
  deviceType: string

  @Column('varchar', { length: 64 })
  faultCategory: string

  @Column('varchar', { length: 255 })
  faultKeywords: string

  @Column('text')
  description: string

  @Column('text')
  resolution: string

  @Column('varchar', { length: 255, nullable: true })
  effectiveness: string | null

  @Column('varchar', { length: 64, nullable: true })
  sourceCaseNo: string | null

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
