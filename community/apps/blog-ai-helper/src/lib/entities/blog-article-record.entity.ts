import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { BlogArticleRecordStatus } from '../types.js'
import { BLOG_ARTICLE_RECORD_TABLE } from '../tables.js'

@Entity(BLOG_ARTICLE_RECORD_TABLE)
@Index(['tenantId', 'organizationId', 'projectId'])
@Index(['tenantId', 'organizationId', 'createdAt'])
export class BlogArticleRecord {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar', nullable: true })
  xpertId?: string

  @Column({ type: 'varchar', nullable: true })
  agentKey?: string

  @Column({ type: 'varchar', default: '未命名文章' })
  title!: string

  @Column({ type: 'text' })
  content!: string

  @Column({ type: 'text', nullable: true })
  summary?: string

  @Column({ type: 'json', nullable: true })
  tags?: string[]

  @Column({ type: 'json', nullable: true })
  titleSuggestions?: string[]

  @Column({ type: 'varchar', default: 'draft' })
  status?: BlogArticleRecordStatus

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
