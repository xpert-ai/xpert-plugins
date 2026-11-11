import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * 已确认的线索记录。
 *
 * 保存到平台数据库（Postgres），刷新页面或重启平台后仍可查询，
 * 满足「结果保存与恢复」要求。
 */
@Entity('plugin_lead_parser_lead')
@Index(['tenantId', 'organizationId', 'createdAt'])
export class LeadRecord {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  createdBy?: string | null

  /**
   * 幂等键：同一租户下、内容完全相同的线索只落一条。
   * 前端重试保存时命中该键，直接返回已有记录，避免重复写入。
   */
  @Index({ unique: true })
  @Column({ type: 'varchar' })
  dedupeKey?: string

  @Column({ type: 'text' })
  sourceText?: string

  @Column({ type: 'varchar', nullable: true })
  contactName?: string | null

  @Column({ type: 'varchar', nullable: true })
  companyName?: string | null

  @Column({ type: 'text', nullable: true })
  intent?: string | null

  /** 预算，单位：万元 */
  @Column({ type: 'int', nullable: true })
  budget?: number | null

  /** 解析所用模型，便于审计 */
  @Column({ type: 'varchar', nullable: true })
  model?: string | null

  @Column({ type: 'varchar', default: 'confirmed' })
  status?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
