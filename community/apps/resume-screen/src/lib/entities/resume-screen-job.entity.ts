/**
 * 简历筛选职位（JD）实体
 *
 * 存储职位描述原文与指纹（jdHash），是候选人归属与匹配评分的业务锚点；
 * 表名带 plugin_resume_screen_ 前缀以满足插件实体命名隔离规范。
 */
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

// 复合索引服务于工作台按租户/组织/助手维度过滤职位列表的高频查询
@Entity('plugin_resume_screen_job')
@Index(['tenantId', 'organizationId', 'assistantId'])
export class ResumeScreenJob {
  // 主键由数据库生成 UUID，实体侧声明为可选
  @PrimaryGeneratedColumn('uuid')
  id?: string

  // 以下三个为多租户隔离维度，均建独立索引便于跨维度检索
  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  // 创建人仅作追溯用途，不做独立索引
  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  // 职位标题高频展示与检索，建索引
  @Index()
  @Column({ type: 'varchar' })
  title?: string

  // JD 原文用 text 存储，避免长度截断
  @Column({ type: 'text' })
  jdText?: string

  // JD 归一化指纹：同文 JD 去重判断依赖此列，建索引
  @Index()
  @Column({ type: 'varchar' })
  jdHash?: string

  // 乐观并发版本号，JD 编辑时递增
  @Column({ type: 'int', default: 1 })
  revision?: number

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
