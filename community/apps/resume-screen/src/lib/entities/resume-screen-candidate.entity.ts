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
// 复合索引三：预览/重新解析时按职位定位同一份文件（fileHash 精确匹配）
@Entity('plugin_resume_screen_candidate')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
@Index(['tenantId', 'organizationId', 'jobId', 'status', 'createdAt'])
@Index(['jobId', 'fileHash'])
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

  // 简历内容指纹：v5 起 dedupeKey = sha256(jobId|fileHash)，即「同一职位下同一份文件只有一行」
  @Index()
  @Column({ type: 'varchar' })
  dedupeKey?: string

  // 状态机当前态，看板过滤的高频条件，建索引
  @Index()
  @Column({ type: 'varchar' })
  status?: ResumeScreenCandidateStatus

  // 上传通道来源文件名（粘贴/助手录入为空），解析失败行在工作台按文件溯源
  @Column({ type: 'varchar', nullable: true })
  sourceFileName?: string

  // 原始简历文件四列（v5，spec §3.3）：字节落插件 fileStorageDir，库内只存相对 key 与指纹。
  // 全部 nullable——v5 之前的存量行没有文件，前端据 hasFile=false 禁用预览与重新解析（§6.4）。
  @Column({ type: 'varchar', length: 512, nullable: true })
  filePath?: string | null

  // 字节数：上限 10MB（RESUME_FILE_MAX_BYTES），int4 足够，刻意不用 bigint
  @Column({ type: 'int', nullable: true })
  fileSize?: number | null

  // 文件内容 sha256（64 位十六进制），dedupeKey 的组成因子，也是重复上传判定依据
  @Column({ type: 'varchar', length: 64, nullable: true })
  fileHash?: string | null

  // 落盘时判定的 mime（预览分支与界面文件态展示用）
  @Column({ type: 'varchar', length: 128, nullable: true })
  fileMime?: string | null

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
