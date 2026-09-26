/**
 * 简历筛选候选人实体
 *
 * 存储 AI 抽取的候选人档案、匹配评分与人工评审结论，
 * 是筛选工作台列表/详情与助手工具查询的核心数据载体；
 * 状态机取值复用 ../types 的 ResumeScreenCandidateStatus。
 */
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ResumeScreenCandidateStatus } from '../types'

// 复合索引一：按租户/组织/助手/状态过滤各评审看板列表
// 复合索引二：按职位维度查看某 JD 下候选人并按创建时间排序
@Entity('plugin_resume_screen_candidate')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'jobId', 'status', 'createdAt'])
export class ResumeScreenCandidate {
  // 主键由数据库生成 UUID，实体侧声明为可选
  @PrimaryGeneratedColumn('uuid')
  id?: string

  // 多租户隔离维度
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  // 录入来源会话，用于在会话内回显候选人
  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  // 创建人仅作追溯用途
  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  // 归属职位，按职位查列表的高频条件，建索引
  @Index()
  @Column({ type: 'varchar' })
  jobId?: string

  // 简历原文指纹：批量录入时据此去重（跳过已存在简历），建索引
  @Index()
  @Column({ type: 'varchar' })
  dedupeKey?: string

  // 状态机当前态，看板过滤的高频条件，建索引
  @Index()
  @Column({ type: 'varchar' })
  status?: ResumeScreenCandidateStatus

  // 简历原文用 text 存储，作为抽取与追溯依据
  @Column({ type: 'text' })
  sourceText?: string

  // 以下为 AI 抽取/人工修正的档案字段，均允许为空（抽取失败不阻断入库）
  @Column({ type: 'varchar', nullable: true })
  name?: string

  @Column({ type: 'varchar', nullable: true })
  yearsOfExperience?: string

  @Column({ type: 'varchar', nullable: true })
  education?: string

  @Column({ type: 'varchar', nullable: true })
  currentCompany?: string

  // 技能列表用 jsonb 存储，保持数组语义
  @Column({ type: 'jsonb', nullable: true })
  skills?: string[]

  @Column({ type: 'text', nullable: true })
  summary?: string

  // 匹配分 0-100，可为空表示尚未评分
  @Column({ type: 'int', nullable: true })
  matchScore?: number

  @Column({ type: 'text', nullable: true })
  matchReason?: string

  // 命中点/风险点由 AI 抽取，jsonb 存储字符串数组
  @Column({ type: 'jsonb', nullable: true })
  hitPoints?: string[]

  @Column({ type: 'jsonb', nullable: true })
  riskPoints?: string[]

  // 记录被人工修正过的字段名，避免 AI 重跑覆盖人工改动
  @Column({ type: 'jsonb', nullable: true })
  humanEditedFields?: string[]

  // 解析重试次数，用于限制失败重试上限
  @Column({ type: 'int', default: 0 })
  attemptCount?: number

  // 解析/评审流转失败原因，仅 failed 等异常态下有值
  @Column({ type: 'text', nullable: true })
  failureReason?: string

  // 评审人与评审时间：接受/搁置/淘汰终态流转时写入
  @Column({ type: 'varchar', nullable: true })
  reviewedById?: string

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date

  // 乐观并发版本号，编辑与评审动作递增
  @Column({ type: 'int', default: 1 })
  revision?: number

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
